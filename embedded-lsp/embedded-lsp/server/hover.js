/**
 * This module provides detailed hover information for:
 * - Hardware registers with bit-level documentation
 * - Pin functions and capabilities
 * - Protocol specifications and timing
 * - Function signatures with embedded-specific context
 */

const { Hover, MarkupKind } = require('vscode-languageserver/node');

class EmbeddedHoverProvider {
    constructor(hardwareDB) {
        this.hardwareDB = hardwareDB;
    }
    
    async provideHover(document, position, settings) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const wordRange = this.getWordAtPosition(text, offset);
        
        if (!wordRange) return null;
        
        const word = text.substring(wordRange.start, wordRange.end);
        const context = this.getHoverContext(text, offset);
        
        // Try different hover providers in order of priority
        let hover = null;
        
        // Hardware register hover
        if (context.isRegisterAccess) {
            hover = await this.getRegisterHover(word, context);
        }
        // Arduino function hover
        else if (this.isArduinoFunction(word)) {
            hover = await this.getArduinoFunctionHover(word, context);
        }
        // Pin number hover
        else if (this.isPinNumber(word, context)) {
            hover = await this.getPinHover(word, context);
        }
        // Protocol hover (Wire, SPI, etc.)
        else if (this.isProtocolFunction(word, context)) {
            hover = await this.getProtocolHover(word, context);
        }
        // Hardware constant hover
        else if (this.isHardwareConstant(word)) {
            hover = await this.getHardwareConstantHover(word);
        }
        // Data type hover
        else if (this.isEmbeddedDataType(word)) {
            hover = await this.getDataTypeHover(word);
        }
        
        if (hover) {
            hover.range = {
                start: document.positionAt(wordRange.start),
                end: document.positionAt(wordRange.end)
            };
        }
        
        return hover;
    }
    
    getWordAtPosition(text, offset) {
        // Find word boundaries around the cursor position
        let start = offset;
        let end = offset;
        
        // Expand backwards
        while (start > 0 && /\w/.test(text[start - 1])) {
            start--;
        }
        
        // Expand forwards
        while (end < text.length && /\w/.test(text[end])) {
            end++;
        }
        
        if (start === end) return null;
        
        return { start, end };
    }
    
    getHoverContext(text, offset) {
        const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
        const afterCursor = text.substring(offset, Math.min(text.length, offset + 50));
        
        return {
            beforeCursor,
            afterCursor,
            isRegisterAccess: /\w+->\s*\w*$/.test(beforeCursor),
            isFunctionCall: /\w+\s*\(\s*[\w,\s]*$/.test(beforeCursor),
            isInPinFunction: /(pinMode|digitalWrite|digitalRead|analogRead)\s*\(\s*\w*$/.test(beforeCursor),
            isProtocolContext: /(Wire|SPI|Serial)\.\w*$/.test(beforeCursor),
            currentFunction: this.extractCurrentFunction(text, offset)
        };
    }
    
    async getRegisterHover(word, context) {
        const board = this.hardwareDB.getCurrentBoard();
        if (!board || !board.registers) return null;
        
        // Extract register name from context
        const registerMatch = context.beforeCursor.match(/(\w+)->/);
        if (!registerMatch) return null;
        
        const registerName = registerMatch[1];
        const register = board.registers[registerName];
        
        if (!register) return null;
        
        if (register.bits && register.bits[word]) {
            const bitPos = register.bits[word];
            
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `## ${word}\n\n` +
                           `**Register:** ${registerName} (${register.address})\n\n` +
                           `**Bit Position:** ${bitPos}\n\n` +
                           `**Binary Mask:** 0b${(1 << bitPos).toString(2).padStart(8, '0')} (0x${(1 << bitPos).toString(16).toUpperCase()})\n\n` +
                           `**Usage Examples:**\n` +
                           `\`\`\`c\n` +
                           `// Set bit\n` +
                           `${registerName} |= (1 << ${bitPos});\n` +
                           `// Clear bit\n` +
                           `${registerName} &= ~(1 << ${bitPos});\n` +
                           `// Toggle bit\n` +
                           `${registerName} ^= (1 << ${bitPos});\n` +
                           `\`\`\`\n\n` +
                           `**Arduino Alternative:** Use digitalWrite() for easier pin control`
                }
            };
        }
        
        return null;
    }
    
    async getArduinoFunctionHover(word, context) {
        const library = this.hardwareDB.getLibrary('arduino-core');
        if (!library || !library.functions[word]) return null;
        
        const func = library.functions[word];
        const board = this.hardwareDB.getCurrentBoard();
        
        let content = `## ${word}\n\n`;
        content += `${func.description}\n\n`;
        content += `**Signature:** \`${func.signature}\`\n\n`;
        
        if (func.parameters && func.parameters.length > 0) {
            content += `**Parameters:**\n\n`;
            func.parameters.forEach(param => {
                content += `- \`${param.name}\` (${param.type}): ${param.description}\n`;
            });
            content += `\n`;
        }
        
        if (func.returns) {
            content += `**Returns:** ${func.returns}\n\n`;
        }
        
        if (func.constraints && func.constraints.length > 0) {
            content += `**Constraints:**\n\n`;
            func.constraints.forEach(constraint => {
                content += `- ${constraint}\n`;
            });
            content += `\n`;
        }
        
        // Add board-specific information
        if (word === 'pinMode' && board) {
            content += `**Available Pins (${board.name}):**\n\n`;
            content += `- Digital: ${board.pins.digital.join(', ')}\n`;
            if (board.pins.analog) {
                content += `- Analog: ${board.pins.analog.map(p => `${p} (A${p-14})`).join(', ')}\n`;
            }
            if (board.pins.pwm) {
                content += `- PWM Capable: ${board.pins.pwm.join(', ')}\n`;
            }
            if (board.pins.interrupts) {
                content += `- Interrupt Capable: ${board.pins.interrupts.join(', ')}\n`;
            }
        }
        
        // Add usage examples
        content += this.getUsageExamples(word, board);
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }
    
    async getPinHover(word, context) {
        const pin = parseInt(word);
        const board = this.hardwareDB.getCurrentBoard();
        
        if (!board || isNaN(pin)) return null;
        
        const capabilities = [];
        const warnings = [];
        
        // Check pin capabilities
        if (board.pins.digital && board.pins.digital.includes(pin)) {
            capabilities.push('Digital I/O');
        }
        
        if (board.pins.analog && board.pins.analog.includes(pin)) {
            capabilities.push('Analog Input');
            const analogName = `A${pin - 14}`;
            capabilities.push(`Arduino Name: ${analogName}`);
        }
        
        if (board.pins.pwm && board.pins.pwm.includes(pin)) {
            capabilities.push('PWM Output (analogWrite)');
        }
        
        if (board.pins.interrupts && board.pins.interrupts.includes(pin)) {
            capabilities.push('External Interrupt (attachInterrupt)');
        }
        
        if (board.pins.touch && board.pins.touch.includes(pin)) {
            capabilities.push('Touch Sensing');
        }
        
        // Check for special functions
        const specialFunctions = this.getSpecialPinFunctions(pin, board);
        if (specialFunctions.length > 0) {
            capabilities.push(...specialFunctions);
        }
        
        // Add warnings for special pins
        if (pin === 0 || pin === 1) {
            warnings.push('Used by USB Serial communication - avoid if using Serial Monitor');
        }
        
        if (pin === 13 && board.name.includes('Arduino')) {
            warnings.push('Connected to built-in LED');
        }
        
        let content = `## Pin ${pin}\n\n`;
        content += `**Board:** ${board.name}\n\n`;
        
        if (capabilities.length > 0) {
            content += `**Capabilities:**\n\n`;
            capabilities.forEach(cap => {
                content += `- ${cap}\n`;
            });
            content += `\n`;
        }
        
        if (warnings.length > 0) {
            content += `**⚠️ Warnings:**\n\n`;
            warnings.forEach(warning => {
                content += `- ${warning}\n`;
            });
            content += `\n`;
        }
        
        // Add usage examples
        content += `**Usage Examples:**\n\n`;
        content += `\`\`\`c\n`;
        content += `// Configure as output\n`;
        content += `pinMode(${pin}, OUTPUT);\n`;
        content += `digitalWrite(${pin}, HIGH);\n\n`;
        
        if (board.pins.pwm && board.pins.pwm.includes(pin)) {
            content += `// PWM output (0-255)\n`;
            content += `analogWrite(${pin}, 128);\n\n`;
        }
        
        if (board.pins.analog && board.pins.analog.includes(pin)) {
            content += `// Read analog value (0-1023)\n`;
            content += `int value = analogRead(${pin});\n\n`;
        }
        
        content += `\`\`\``;
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }
    
    async getProtocolHover(word, context) {
        let protocol = null;
        let protocolName = '';
        
        if (context.isProtocolContext) {
            if (context.beforeCursor.includes('Wire.')) {
                protocol = this.hardwareDB.getProtocol('i2c');
                protocolName = 'I2C';
            } else if (context.beforeCursor.includes('SPI.')) {
                protocol = this.hardwareDB.getProtocol('spi');
                protocolName = 'SPI';
            }
        }
        
        if (!protocol || !protocol.functions[word]) return null;
        
        const func = protocol.functions[word];
        
        let content = `## ${protocolName}.${word}\n\n`;
        content += `${func.description}\n\n`;
        content += `**Signature:** \`${func.signature}\`\n\n`;
        
        if (func.parameters && func.parameters.length > 0) {
            content += `**Parameters:**\n\n`;
            func.parameters.forEach(param => {
                content += `- \`${param.name}\` (${param.type}): ${param.description}\n`;
            });
            content += `\n`;
        }
        
        if (func.returns) {
            content += `**Returns:** ${func.returns}\n\n`;
        }
        
        // Add protocol-specific information
        if (protocolName === 'I2C' && protocol.commonAddresses) {
            content += `**Common I2C Addresses:**\n\n`;
            Object.entries(protocol.commonAddresses).forEach(([addr, device]) => {
                content += `- ${addr}: ${device}\n`;
            });
            content += `\n`;
        }
        
        if (protocolName === 'SPI' && protocol.modes) {
            content += `**SPI Modes:**\n\n`;
            Object.entries(protocol.modes).forEach(([mode, desc]) => {
                content += `- ${mode}: ${desc}\n`;
            });
            content += `\n`;
        }
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }
    
    async getHardwareConstantHover(word) {
        const constants = {
            'HIGH': {
                value: '1',
                description: 'Digital high state (5V on 5V boards, 3.3V on 3.3V boards)',
                usage: 'digitalWrite(pin, HIGH);'
            },
            'LOW': {
                value: '0', 
                description: 'Digital low state (0V)',
                usage: 'digitalWrite(pin, LOW);'
            },
            'INPUT': {
                value: '0',
                description: 'Configure pin as input (high impedance)',
                usage: 'pinMode(pin, INPUT);'
            },
            'OUTPUT': {
                value: '1',
                description: 'Configure pin as output (can source/sink current)',
                usage: 'pinMode(pin, OUTPUT);'
            },
            'INPUT_PULLUP': {
                value: '2',
                description: 'Configure pin as input with internal pullup resistor (~20kΩ)',
                usage: 'pinMode(pin, INPUT_PULLUP);'
            },
            'LED_BUILTIN': {
                value: '13',
                description: 'Pin number for built-in LED (typically pin 13 on Arduino boards)',
                usage: 'digitalWrite(LED_BUILTIN, HIGH);'
            }
        };
        
        const constant = constants[word];
        if (!constant) return null;
        
        let content = `## ${word}\n\n`;
        content += `${constant.description}\n\n`;
        content += `**Value:** \`${constant.value}\`\n\n`;
        content += `**Example:**\n`;
        content += `\`\`\`c\n${constant.usage}\n\`\`\``;
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }
    
    async getDataTypeHover(word) {
        const types = {
            'uint8_t': {
                size: '1 byte',
                range: '0 to 255',
                description: 'Unsigned 8-bit integer',
                alternative: 'byte (Arduino-specific)'
            },
            'uint16_t': {
                size: '2 bytes', 
                range: '0 to 65,535',
                description: 'Unsigned 16-bit integer',
                alternative: 'word (Arduino-specific)'
            },
            'uint32_t': {
                size: '4 bytes',
                range: '0 to 4,294,967,295',
                description: 'Unsigned 32-bit integer',
                alternative: 'unsigned long (Arduino)'
            },
            'int8_t': {
                size: '1 byte',
                range: '-128 to 127',
                description: 'Signed 8-bit integer',
                alternative: 'char'
            },
            'int16_t': {
                size: '2 bytes',
                range: '-32,768 to 32,767', 
                description: 'Signed 16-bit integer',
                alternative: 'int (Arduino)'
            },
            'int32_t': {
                size: '4 bytes',
                range: '-2,147,483,648 to 2,147,483,647',
                description: 'Signed 32-bit integer',
                alternative: 'long (Arduino)'
            },
            'byte': {
                size: '1 byte',
                range: '0 to 255',
                description: 'Arduino-specific unsigned 8-bit integer',
                alternative: 'uint8_t (standard C)'
            },
            'word': {
                size: '2 bytes',
                range: '0 to 65,535',
                description: 'Arduino-specific unsigned 16-bit integer',
                alternative: 'uint16_t (standard C)'
            }
        };
        
        const type = types[word];
        if (!type) return null;
        
        let content = `## ${word}\n\n`;
        content += `${type.description}\n\n`;
        content += `**Size:** ${type.size}\n\n`;
        content += `**Range:** ${type.range}\n\n`;
        if (type.alternative) {
            content += `**Alternative:** ${type.alternative}\n\n`;
        }
        
        content += `**Memory Usage on Microcontrollers:**\n`;
        content += `Choose smaller data types to conserve precious RAM and flash memory.\n\n`;
        
        content += `**Example:**\n`;
        content += `\`\`\`c\n${word} value = 0;\nvalue = 42;\n\`\`\``;
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }
    
    getSpecialPinFunctions(pin, board) {
        const functions = [];
        
        // Check SPI pins
        if (board.peripherals.spi) {
            const spiPins = board.peripherals.spi[0]?.pins;
            if (spiPins && spiPins.includes(pin)) {
                const spiNames = ['SS', 'MOSI', 'MISO', 'SCK'];
                const index = spiPins.indexOf(pin);
                if (index >= 0 && index < spiNames.length) {
                    functions.push(`SPI ${spiNames[index]}`);
                }
            }
        }
        
        // Check I2C pins
        if (board.peripherals.i2c) {
            const i2cPins = board.peripherals.i2c[0]?.pins;
            if (i2cPins && i2cPins.includes(pin)) {
                const i2cNames = ['SDA', 'SCL'];
                const index = i2cPins.indexOf(pin);
                if (index >= 0 && index < i2cNames.length) {
                    functions.push(`I2C ${i2cNames[index]}`);
                }
            }
        }
        
        // Check UART pins
        if (board.peripherals.uart) {
            board.peripherals.uart.forEach((uart, uartIndex) => {
                if (uart.pins.includes(pin)) {
                    const uartNames = ['RX', 'TX'];
                    const index = uart.pins.indexOf(pin);
                    const serialName = uartIndex === 0 ? 'Serial' : `Serial${uartIndex + 1}`;
                    if (index >= 0 && index < uartNames.length) {
                        functions.push(`${serialName} ${uartNames[index]}`);
                    }
                }
            });
        }
        
        return functions;
    }
    
    getUsageExamples(functionName, board) {
        let examples = `\n**Usage Examples:**\n\n`;
        
        switch (functionName) {
            case 'pinMode':
                examples += `\`\`\`c\n`;
                examples += `pinMode(13, OUTPUT);    // Configure LED pin\n`;
                examples += `pinMode(2, INPUT);      // Configure button pin\n`;
                examples += `pinMode(A0, INPUT);     // Configure analog pin\n`;
                examples += `\`\`\``;
                break;
                
            case 'digitalWrite':
                examples += `\`\`\`c\n`;
                examples += `digitalWrite(13, HIGH); // Turn on LED\n`;
                examples += `digitalWrite(13, LOW);  // Turn off LED\n`;
                examples += `\`\`\``;
                break;
                
            case 'analogRead':
                examples += `\`\`\`c\n`;
                examples += `int sensorValue = analogRead(A0);\n`;
                examples += `float voltage = sensorValue * (5.0 / 1023.0);\n`;
                examples += `\`\`\``;
                break;
                
            default:
                return '';
        }
        
        return examples;
    }
    
    isArduinoFunction(word) {
        const arduinoFunctions = [
            'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite',
            'delay', 'delayMicroseconds', 'millis', 'micros', 'map', 'constrain',
            'min', 'max', 'abs', 'pow', 'sqrt', 'sin', 'cos', 'tan'
        ];
        return arduinoFunctions.includes(word);
    }
    
    isPinNumber(word, context) {
        const pin = parseInt(word);
        return !isNaN(pin) && context.isInPinFunction;
    }
    
    isProtocolFunction(word, context) {
        const protocolFunctions = [
            'begin', 'end', 'beginTransmission', 'endTransmission', 'write', 'read',
            'available', 'requestFrom', 'transfer', 'beginTransaction', 'endTransaction'
        ];
        return protocolFunctions.includes(word) && context.isProtocolContext;
    }
    
    isHardwareConstant(word) {
        const constants = [
            'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN',
            'A0', 'A1', 'A2', 'A3', 'A4', 'A5'
        ];
        return constants.includes(word);
    }
    
    isEmbeddedDataType(word) {
        const types = [
            'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t',
            'byte', 'word', 'boolean'
        ];
        return types.includes(word);
    }
    
    extractCurrentFunction(text, offset) {
        const beforeOffset = text.substring(0, offset);
        const functionMatch = beforeOffset.match(/(\w+)\s*\([^)]*\)\s*{[^}]*$/);
        return functionMatch ? functionMatch[1] : null;
    }
}

module.exports = EmbeddedHoverProvider;
