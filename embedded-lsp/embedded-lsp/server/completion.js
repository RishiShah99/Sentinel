/**
 * Embedded Completion Provider - Revolutionary Hardware-Aware Code Completion
 * 
 * This module provides intelligent code completion that understands:
 * - Hardware registers and their bit fields
 * - Pin capabilities and constraints
 * - Protocol-specific functions and parameters
 * - Board-specific optimizations
 */

const { CompletionItem, CompletionItemKind, MarkupKind } = require('vscode-languageserver/node');

class EmbeddedCompletionProvider {
    constructor(hardwareDB) {
        this.hardwareDB = hardwareDB;
        
        // Cache for expensive completions
        this.completionCache = new Map();
    }
    
    async provideCompletions(document, position, settings) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const lineText = this.getLineText(text, offset);
        const wordRange = this.getWordRange(lineText, position.character);
        const context = this.getCompletionContext(text, offset);
        
        let completions = [];
        
        // Hardware register completions (GPIOA->, TIM1->, etc.)
        if (context.isRegisterAccess) {
            completions = await this.getRegisterCompletions(context);
        }
        // Arduino function completions (pinMode, digitalWrite, etc.)
        else if (context.isArduinoFunction) {
            completions = await this.getArduinoFunctionCompletions(context);
        }
        // Protocol completions (Wire., SPI., etc.)
        else if (context.isProtocolAccess) {
            completions = await this.getProtocolCompletions(context);
        }
        // Pin number completions (when expecting pin parameter)
        else if (context.isPinParameter) {
            completions = await this.getPinCompletions(context);
        }
        // Include directive completions
        else if (context.isIncludeDirective) {
            completions = await this.getIncludeCompletions(context);
        }
        // General C++ completions enhanced with embedded knowledge
        else {
            completions = await this.getGeneralCompletions(context, wordRange.word);
        }
        
        // Add embedded-specific snippets and templates
        if (wordRange.word.length >= 2) {
            const snippets = this.getEmbeddedSnippets(wordRange.word, context);
            completions = completions.concat(snippets);
        }
        
        return completions;
    }
    
    getLineText(text, offset) {
        const lines = text.substring(0, offset).split('\n');
        return lines[lines.length - 1];
    }
    
    getWordRange(lineText, character) {
        const start = Math.max(0, character - 50);
        const end = Math.min(lineText.length, character + 10);
        const segment = lineText.substring(start, end);
        
        // Extract word being typed
        const match = segment.match(/(\w+)$/);
        return {
            word: match ? match[1] : '',
            range: match ? [start + segment.indexOf(match[1]), start + segment.indexOf(match[1]) + match[1].length] : [character, character]
        };
    }
    
    getCompletionContext(text, offset) {
        const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
        const afterCursor = text.substring(offset, Math.min(text.length, offset + 50));
        
        return {
            beforeCursor,
            afterCursor,
            isRegisterAccess: /\w+(->|\.)\s*$/.test(beforeCursor) && this.isHardwareRegister(beforeCursor),
            isArduinoFunction: this.isArduinoFunctionContext(beforeCursor),
            isProtocolAccess: /(Wire|SPI|Serial)\.\s*$/.test(beforeCursor),
            isPinParameter: this.isPinParameterContext(beforeCursor),
            isIncludeDirective: /#include\s*[<"]\s*$/.test(beforeCursor),
            inFunction: this.extractCurrentFunction(text, offset),
            nearbyVariables: this.extractNearbyVariables(text, offset)
        };
    }
    
    isHardwareRegister(text) {
        // Check if this looks like a hardware register access
        const registerPattern = /(GPIOA|GPIOB|GPIOC|GPIOD|PORTA|PORTB|PORTC|PORTD|USART1|TIM1|ADC1|RCC|NVIC)->/;
        return registerPattern.test(text);
    }
    
    isArduinoFunctionContext(text) {
        const functionStarts = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'delay'];
        return functionStarts.some(func => text.endsWith(func + '('));
    }
    
    isPinParameterContext(text) {
        // Check if we're in a pin parameter position
        const pinFunctionPattern = /(pinMode|digitalWrite|digitalRead|analogRead|analogWrite)\s*\(\s*$/;
        return pinFunctionPattern.test(text);
    }
    
    async getRegisterCompletions(context) {
        const board = this.hardwareDB.getCurrentBoard();
        if (!board || !board.registers) return [];
        
        const completions = [];
        
        // Extract register name from context
        const registerMatch = context.beforeCursor.match(/(\w+)->/);
        if (!registerMatch) return [];
        
        const registerName = registerMatch[1];
        const register = board.registers[registerName];
        
        if (register && register.bits) {
            // Add bit field completions
            for (const [bitName, bitPos] of Object.entries(register.bits)) {
                completions.push({
                    label: bitName,
                    kind: CompletionItemKind.Field,
                    detail: `Bit ${bitPos} of ${registerName} (Address: ${register.address})`,
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `**${bitName}** - Bit ${bitPos}\n\n` +
                               `Register: ${registerName} (${register.address})\n\n` +
                               `Usage: \`${registerName}->${bitName} = 1;\``
                    },
                    insertText: bitName
                });
            }
        }
        
        return completions;
    }
    
    async getArduinoFunctionCompletions(context) {
        const library = this.hardwareDB.getLibrary('arduino-core');
        if (!library) return [];
        
        const completions = [];
        
        for (const [funcName, funcDef] of Object.entries(library.functions)) {
            // Smart parameter completion based on function
            if (context.beforeCursor.includes(funcName + '(')) {
                const params = this.getSmartParameterCompletions(funcName, funcDef);
                completions.push(...params);
            } else {
                // Function signature completion
                completions.push({
                    label: funcName,
                    kind: CompletionItemKind.Function,
                    detail: funcDef.signature,
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `**${funcName}**\n\n${funcDef.description}\n\n` +
                               `**Signature:** \`${funcDef.signature}\`\n\n` +
                               (funcDef.constraints ? `**Constraints:** ${funcDef.constraints.join(', ')}` : '')
                    },
                    insertText: funcName
                });
            }
        }
        
        return completions;
    }
    
    getSmartParameterCompletions(funcName, funcDef) {
        const completions = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        if (funcName === 'pinMode' && board) {
            // Add pin number completions for pinMode
            const digitalPins = board.pins.digital || [];
            digitalPins.forEach(pin => {
                const capabilities = this.getPinCapabilities(pin);
                completions.push({
                    label: pin.toString(),
                    kind: CompletionItemKind.Value,
                    detail: `Digital Pin ${pin}${capabilities ? ` (${capabilities.join(', ')})` : ''}`,
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `**Pin ${pin}**\n\n` +
                               `Capabilities: ${capabilities ? capabilities.join(', ') : 'Digital I/O'}\n\n` +
                               `Example: \`pinMode(${pin}, OUTPUT);\``
                    },
                    insertText: pin.toString()
                });
            });
            
            // Add mode completions
            ['INPUT', 'OUTPUT', 'INPUT_PULLUP'].forEach(mode => {
                completions.push({
                    label: mode,
                    kind: CompletionItemKind.Enum,
                    detail: `Pin mode: ${mode}`,
                    insertText: mode
                });
            });
        }
        
        return completions;
    }
    
    getPinCapabilities(pin) {
        const board = this.hardwareDB.getCurrentBoard();
        if (!board) return [];
        
        const capabilities = [];
        
        if (board.pins.pwm && board.pins.pwm.includes(pin)) {
            capabilities.push('PWM');
        }
        if (board.pins.analog && board.pins.analog.includes(pin)) {
            capabilities.push('Analog');
        }
        if (board.pins.interrupts && board.pins.interrupts.includes(pin)) {
            capabilities.push('Interrupt');
        }
        if (board.pins.touch && board.pins.touch.includes(pin)) {
            capabilities.push('Touch');
        }
        
        return capabilities;
    }
    
    async getProtocolCompletions(context) {
        const completions = [];
        
        // Extract protocol name (Wire, SPI, Serial)
        const protocolMatch = context.beforeCursor.match(/(Wire|SPI|Serial)\./);
        if (!protocolMatch) return [];
        
        const protocolName = protocolMatch[1].toLowerCase();
        let protocol = null;
        
        if (protocolName === 'wire') {
            protocol = this.hardwareDB.getProtocol('i2c');
        } else if (protocolName === 'spi') {
            protocol = this.hardwareDB.getProtocol('spi');
        }
        
        if (protocol && protocol.functions) {
            for (const [funcName, funcDef] of Object.entries(protocol.functions)) {
                completions.push({
                    label: funcName,
                    kind: CompletionItemKind.Method,
                    detail: funcDef.signature,
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `**${funcName}**\n\n${funcDef.description}\n\n` +
                               `**Signature:** \`${funcDef.signature}\`\n\n` +
                               (funcDef.returns ? `**Returns:** ${funcDef.returns}\n\n` : '') +
                               this.formatParameters(funcDef.parameters)
                    },
                    insertText: funcName
                });
            }
        }
        
        return completions;
    }
    
    formatParameters(parameters) {
        if (!parameters || parameters.length === 0) return '';
        
        let formatted = '**Parameters:**\n\n';
        parameters.forEach(param => {
            formatted += `- \`${param.name}\` (${param.type}): ${param.description}\n`;
        });
        
        return formatted;
    }
    
    async getPinCompletions(context) {
        const board = this.hardwareDB.getCurrentBoard();
        if (!board) return [];
        
        const completions = [];
        
        // Add all valid pins with their capabilities
        const allPins = [...(board.pins.digital || []), ...(board.pins.analog || [])];
        const uniquePins = [...new Set(allPins)];
        
        uniquePins.forEach(pin => {
            const capabilities = this.getPinCapabilities(pin);
            const isAnalog = board.pins.analog && board.pins.analog.includes(pin);
            
            completions.push({
                label: pin.toString(),
                kind: CompletionItemKind.Value,
                detail: `${isAnalog ? 'Analog' : 'Digital'} Pin ${pin}${capabilities.length ? ` (${capabilities.join(', ')})` : ''}`,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `**Pin ${pin}**\n\n` +
                           `Type: ${isAnalog ? 'Analog' : 'Digital'}\n\n` +
                           `Capabilities: ${capabilities.length ? capabilities.join(', ') : 'Basic I/O'}\n\n` +
                           `Arduino Name: ${isAnalog ? `A${pin - 14}` : pin}`
                },
                insertText: pin.toString(),
                sortText: pin.toString().padStart(3, '0') // Numeric sorting
            });
        });
        
        return completions;
    }
    
    async getIncludeCompletions(context) {
        const completions = [];
        
        // Common embedded headers
        const commonHeaders = [
            { name: 'Arduino.h', desc: 'Core Arduino functions' },
            { name: 'Wire.h', desc: 'I2C communication library' },
            { name: 'SPI.h', desc: 'SPI communication library' },
            { name: 'Servo.h', desc: 'Servo motor control' },
            { name: 'SoftwareSerial.h', desc: 'Software-based serial communication' },
            { name: 'EEPROM.h', desc: 'EEPROM memory access' },
            { name: 'WiFi.h', desc: 'WiFi connectivity (ESP32)' },
            { name: 'BluetoothSerial.h', desc: 'Bluetooth communication (ESP32)' }
        ];
        
        commonHeaders.forEach(header => {
            completions.push({
                label: header.name,
                kind: CompletionItemKind.File,
                detail: header.desc,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `**${header.name}**\n\n${header.desc}\n\n` +
                           `Usage: \`#include <${header.name}>\``
                },
                insertText: header.name
            });
        });
        
        return completions;
    }
    
    async getGeneralCompletions(context, word) {
        const completions = [];
        
        // Add embedded-specific keywords and types
        const embeddedKeywords = [
            { name: 'void', kind: CompletionItemKind.Keyword },
            { name: 'int', kind: CompletionItemKind.Keyword },
            { name: 'uint8_t', kind: CompletionItemKind.Keyword },
            { name: 'uint16_t', kind: CompletionItemKind.Keyword },
            { name: 'uint32_t', kind: CompletionItemKind.Keyword },
            { name: 'bool', kind: CompletionItemKind.Keyword },
            { name: 'byte', kind: CompletionItemKind.Keyword },
            { name: 'word', kind: CompletionItemKind.Keyword },
            { name: 'HIGH', kind: CompletionItemKind.Constant },
            { name: 'LOW', kind: CompletionItemKind.Constant },
            { name: 'INPUT', kind: CompletionItemKind.Constant },
            { name: 'OUTPUT', kind: CompletionItemKind.Constant },
            { name: 'INPUT_PULLUP', kind: CompletionItemKind.Constant }
        ];
        
        embeddedKeywords
            .filter(kw => kw.name.toLowerCase().includes(word.toLowerCase()))
            .forEach(kw => {
                completions.push({
                    label: kw.name,
                    kind: kw.kind,
                    insertText: kw.name
                });
            });
        
        return completions;
    }
    
    getEmbeddedSnippets(word, context) {
        const snippets = [];
        
        // Arduino setup/loop template
        if ('setup'.includes(word.toLowerCase()) || 'loop'.includes(word.toLowerCase())) {
            snippets.push({
                label: 'arduino-template',
                kind: CompletionItemKind.Snippet,
                detail: 'Arduino sketch template',
                documentation: 'Complete Arduino sketch with setup() and loop()',
                insertText: `void setup() {
  // Initialize your code here
  Serial.begin(9600);
  $0
}

void loop() {
  // Main code here
  
}`,
                insertTextFormat: 2 // Snippet format
            });
        }
        
        // I2C communication snippet
        if ('i2c'.includes(word.toLowerCase()) || 'wire'.includes(word.toLowerCase())) {
            snippets.push({
                label: 'i2c-read',
                kind: CompletionItemKind.Snippet,
                detail: 'I2C read operation',
                insertText: `Wire.beginTransmission(0x\${1:48});
Wire.write(0x\${2:00}); // Register address
Wire.endTransmission();
Wire.requestFrom(0x\${1:48}, \${3:1});
if (Wire.available()) {
  uint8_t data = Wire.read();
  \${0}
}`,
                insertTextFormat: 2
            });
        }
        
        return snippets;
    }
    
    extractCurrentFunction(text, offset) {
        // Extract the current function context for better completions
        const beforeOffset = text.substring(0, offset);
        const functionMatch = beforeOffset.match(/(\w+)\s*\([^)]*\)\s*{[^}]*$/);
        return functionMatch ? functionMatch[1] : null;
    }
    
    extractNearbyVariables(text, offset) {
        // Extract local variables for completion
        const beforeOffset = text.substring(Math.max(0, offset - 500), offset);
        const variableMatches = beforeOffset.match(/(?:int|uint8_t|uint16_t|uint32_t|bool|byte|word|float|double|char)\s+(\w+)/g);
        
        if (!variableMatches) return [];
        
        return variableMatches.map(match => {
            const parts = match.split(/\s+/);
            return {
                name: parts[parts.length - 1],
                type: parts[0]
            };
        });
    }
    
    async resolveCompletion(item, settings) {
        // Add additional details, documentation, or examples
        if (item.data && item.data.needsResolution) {
            // Perform expensive operations here if needed
        }
        
        return item;
    }
}

module.exports = EmbeddedCompletionProvider;
