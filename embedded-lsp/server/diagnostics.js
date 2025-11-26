/**
 * This module provides intelligent diagnostics that catch embedded-specific issues:
 * - Stack overflow risks
 * - Pin conflicts and invalid configurations
 * - Protocol misconfigurations
 * - Hardware constraint violations
 */

const { Diagnostic, DiagnosticSeverity } = require('vscode-languageserver/node');
const CommentStripper = require('./comment-stripper');

class EmbeddedDiagnosticProvider {
    constructor(hardwareDB) {
        this.hardwareDB = hardwareDB;
    }
    
    async validateDocument(document, settings) {
        const text = document.getText();
        const diagnostics = [];
        
        try {
            // Perform various embedded-specific validations
            // Pass text directly - each validator will check for comments internally
            const validations = await Promise.all([
                this.validatePinUsage(text, document).catch(e => { console.error('Pin validation error:', e); return []; }),
                this.validateStackUsage(text, document).catch(e => { console.error('Stack validation error:', e); return []; }),
                this.validateProtocolConfiguration(text, document).catch(e => { console.error('Protocol validation error:', e); return []; }),
                this.validateHardwareConstraints(text, document).catch(e => { console.error('Hardware validation error:', e); return []; }),
                this.validateInterruptUsage(text, document).catch(e => { console.error('Interrupt validation error:', e); return []; }),
                this.validateMemoryAccess(text, document).catch(e => { console.error('Memory validation error:', e); return []; }),
                this.validateSerialBaudRate(text, document).catch(e => { console.error('Baud rate validation error:', e); return []; }),
                this.validateDelayUsage(text, document).catch(e => { console.error('Delay validation error:', e); return []; }),
                this.validateAnalogRead(text, document).catch(e => { console.error('Analog read validation error:', e); return []; }),
                this.validatePWMUsage(text, document).catch(e => { console.error('PWM validation error:', e); return []; }),
                this.validateStringUsage(text, document).catch(e => { console.error('String validation error:', e); return []; }),
                this.validateFloatingPointUsage(text, document).catch(e => { console.error('Float validation error:', e); return []; }),
                this.validateInterruptPins(text, document).catch(e => { console.error('Interrupt pin validation error:', e); return []; }),
                this.validateWireBuffer(text, document).catch(e => { console.error('Wire buffer validation error:', e); return []; }),
                this.validateSerialBuffer(text, document).catch(e => { console.error('Serial buffer validation error:', e); return []; }),
                this.validateMillisOverflow(text, document).catch(e => { console.error('Millis overflow validation error:', e); return []; }),
                this.validatePinModeBeforeUse(text, document).catch(e => { console.error('pinMode validation error:', e); return []; }),
                this.validateProgmemUsage(text, document).catch(e => { console.error('PROGMEM validation error:', e); return []; }),
                this.validateEEPROMWrites(text, document).catch(e => { console.error('EEPROM validation error:', e); return []; }),
                this.validateToneUsage(text, document).catch(e => { console.error('Tone validation error:', e); return []; }),
                this.validateMapFunction(text, document).catch(e => { console.error('Map validation error:', e); return []; }),
                this.validateRandomSeed(text, document).catch(e => { console.error('RandomSeed validation error:', e); return []; }),
                this.validateVoltageLevels(text, document).catch(e => { console.error('Voltage validation error:', e); return []; }),
                this.validateSPISpeed(text, document).catch(e => { console.error('SPI speed validation error:', e); return []; }),
                this.validateWatchdogTimer(text, document).catch(e => { console.error('Watchdog validation error:', e); return []; }),
                this.validateStackOverflow(text, document).catch(e => { console.error('Stack overflow validation error:', e); return []; }),
                this.validateSerialFraming(text, document).catch(e => { console.error('Serial framing validation error:', e); return []; }),
                this.validateTimerPrescaler(text, document).catch(e => { console.error('Timer prescaler validation error:', e); return []; }),
                this.validatePWMFrequency(text, document).catch(e => { console.error('PWM frequency validation error:', e); return []; }),
                this.validateGlobalVariables(text, document).catch(e => { console.error('Global variables validation error:', e); return []; }),
                this.validateISRSafety(text, document).catch(e => { console.error('ISR safety validation error:', e); return []; }),
                this.validateADCReference(text, document).catch(e => { console.error('ADC reference validation error:', e); return []; }),
                // ESP32-specific validations
                this.validateESP32WiFi(text, document).catch(e => { console.error('ESP32 WiFi validation error:', e); return []; }),
                this.validateESP32BLE(text, document).catch(e => { console.error('ESP32 BLE validation error:', e); return []; }),
                this.validateESP32DeepSleep(text, document).catch(e => { console.error('ESP32 Deep Sleep validation error:', e); return []; }),
                this.validateESP32DualCore(text, document).catch(e => { console.error('ESP32 Dual Core validation error:', e); return []; }),
                this.validateESP32PSRAM(text, document).catch(e => { console.error('ESP32 PSRAM validation error:', e); return []; })
            ]);
            
            // Flatten all diagnostics
            validations.forEach(validation => {
                if (validation && Array.isArray(validation)) {
                    diagnostics.push(...validation);
                }
            });
        } catch (error) {
            console.error('Document validation error:', error);
        }
        
        return diagnostics;
    }
    
    async validatePinUsage(text, document) {
        const diagnostics = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        // Continue validation even without board info for basic conflict detection
        
        // Match both numeric pins and analog pins (A0-A7)
        const pinUsagePattern = /pinMode\s*\(\s*([A-Z]?\d+)\s*,\s*(\w+)\s*\)/g;
        let match;
        
        const usedPins = new Map(); // Track pin configurations
        const attachInterruptPins = new Set(); // Track interrupt pins
        
        // Check for Wire.begin() usage (A4/A5 on Uno) - skip if in comment
        if (text.includes('Wire.begin')) {
            const wireMatch = text.match(/Wire\.begin/);
            if (wireMatch && !CommentStripper.isInComment(text, text.indexOf(wireMatch[0]))) {
                usedPins.set(18, { mode: 'I2C_SDA', line: -1, func: 'Wire.begin()' });
                usedPins.set(19, { mode: 'I2C_SCL', line: -1, func: 'Wire.begin()' });
            }
        }
        
        while ((match = pinUsagePattern.exec(text)) !== null) {
            // Skip if this match is inside a comment
            if (CommentStripper.isInComment(text, match.index)) {
                continue;
            }
            
            const pinStr = match[1];
            // Convert A0-A7 to numeric (A0=14, A1=15, etc.)
            const pin = pinStr.startsWith('A') ? 14 + parseInt(pinStr.substring(1)) : parseInt(pinStr);
            const mode = match[2];
            const pos = document.positionAt(match.index);
            
            // Validate pin exists (only if board info available)
            if (board && !this.hardwareDB.isPinValid(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Pin ${pin} is not valid for ${board.name}. Valid pins: ${board.pins.digital.join(', ')}`,
                    source: 'Sentinel',
                    code: 'invalid-pin'
                });
                continue;
            }
            
            // Check for pin conflicts
            if (usedPins.has(pin)) {
                const previousUsage = usedPins.get(pin);
                const pinName = pinStr.startsWith('A') ? pinStr : `D${pin}`;
                let message;
                
                if (previousUsage.func) {
                    // Conflict with Wire/SPI
                    message = `Pin ${pinName} (pin ${pin}) conflicts with ${previousUsage.func} which uses this pin for ${previousUsage.mode}`;
                } else {
                    message = `Pin ${pinName} is already configured as ${previousUsage.mode} at line ${previousUsage.line + 1}`;
                }
                
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message,
                    source: 'Sentinel',
                    code: 'pin-conflict'
                });
            }
            
            // Validate mode for pin capabilities (only if board info available)
            if (board && mode === 'ANALOG' && !this.hardwareDB.isPinCapable(pin, 'analog')) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Pin ${pin} does not support analog input. Analog pins: ${board.pins.analog?.join(', ') || 'None'}`,
                    source: 'Sentinel',
                    code: 'invalid-pin-mode'
                });
            }
            
            // Store pin usage
            usedPins.set(pin, { mode, line: pos.line });
        }
        
        // Check for digital operations on analog pins
        const digitalWritePattern = /digitalWrite\s*\(\s*(\d+)\s*,/g;
        while ((match = digitalWritePattern.exec(text)) !== null) {
            // Skip if in comment
            if (CommentStripper.isInComment(text, match.index)) {
                continue;
            }
            
            const pin = parseInt(match[1]);
            const pos = document.positionAt(match.index);
            
            if (!usedPins.has(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Pin ${pin} used without pinMode() configuration. Add pinMode(${pin}, OUTPUT) in setup()`,
                    source: 'Sentinel',
                    code: 'missing-pin-mode'
                });
            } else if (usedPins.get(pin).mode === 'INPUT') {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Writing to pin ${pin} configured as INPUT. Consider changing to OUTPUT mode`,
                    source: 'Sentinel',
                    code: 'write-to-input-pin'
                });
            }
        }
        
        // Check for attachInterrupt conflicts
        const attachInterruptPattern = /attachInterrupt\s*\(\s*digitalPinToInterrupt\s*\(\s*(\d+)\s*\)/g;
        while ((match = attachInterruptPattern.exec(text)) !== null) {
            // Skip if in comment
            if (CommentStripper.isInComment(text, match.index)) {
                continue;
            }
            
            const pin = parseInt(match[1]);
            const pos = document.positionAt(match.index);
            
            if (usedPins.has(pin)) {
                const usage = usedPins.get(pin);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Pin ${pin} conflict: already configured as ${usage.mode} at line ${usage.line + 1}. Cannot use for both interrupt and ${usage.mode}`,
                    source: 'Sentinel',
                    code: 'pin-conflict-interrupt'
                });
            }
        }
        
        // Validate SPI pin conflicts
        await this.validateSPIPinConflicts(text, document, diagnostics, usedPins);
        
        return diagnostics;
    }
    
    async validateSPIPinConflicts(text, document, diagnostics, usedPins) {
        const board = this.hardwareDB.getCurrentBoard();
        if (!board || !board.peripherals.spi) return;
        
        const spiPins = board.peripherals.spi[0]?.pins || [];
        const usesSPI = text.includes('SPI.begin');
        
        if (usesSPI) {
            spiPins.forEach(pin => {
                if (usedPins.has(pin)) {
                    const usage = usedPins.get(pin);
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: this.getRange(document, usage.line, 0, 1),
                        message: `Pin ${pin} is used by SPI interface. Manual pinMode() may conflict with SPI.begin()`,
                        source: 'Sentinel',
                        code: 'spi-pin-conflict'
                    });
                }
            });
        }
    }
    
    async validateStackUsage(text, document) {
        const diagnostics = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        if (!board || !board.constraints) return diagnostics;
        
        // Find large local arrays that could cause stack overflow
        const largeArrayPattern = /(?:char|int|uint8_t|uint16_t|uint32_t|byte)\s+\w+\[\s*(\d+)\s*\]/g;
        let match;
        
        while ((match = largeArrayPattern.exec(text)) !== null) {
            const arraySize = parseInt(match[1]);
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            // Estimate bytes based on type
            let bytesPerElement = 1; // Default for char/byte
            if (match[0].includes('int') && !match[0].includes('uint8_t')) {
                bytesPerElement = match[0].includes('uint16_t') ? 2 : 
                                 match[0].includes('uint32_t') ? 4 : 2; // int is 2 bytes on most microcontrollers
            }
            
            const totalBytes = arraySize * bytesPerElement;
            
            if (totalBytes > board.constraints.maxStackDepth * 0.5) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Large array (${totalBytes} bytes) may cause stack overflow. Consider using dynamic allocation or reducing size. Available stack: ~${board.constraints.maxStackDepth} bytes`,
                    source: 'Sentinel',
                    code: 'stack-overflow-risk'
                });
            } else if (totalBytes > board.constraints.maxStackDepth * 0.25) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Medium-sized array (${totalBytes} bytes) detected. Monitor total stack usage. Available: ~${board.constraints.maxStackDepth} bytes`,
                    source: 'Sentinel',
                    code: 'stack-usage-info'
                });
            }
        }
        
        // Check for recursive functions (potential stack issues)
        const functionPattern = /(\w+)\s*\([^)]*\)\s*{[^}]*\1\s*\(/g;
        while ((match = functionPattern.exec(text)) !== null) {
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: this.getRange(document, line, match.index, match[1].length),
                message: `Potential recursive function '${match[1]}'. Recursion can quickly exhaust stack memory on microcontrollers`,
                source: 'Sentinel',
                code: 'recursion-warning'
            });
        }
        
        return diagnostics;
    }
    
    async validateProtocolConfiguration(text, document) {
        const diagnostics = [];
        
        // Validate I2C addresses
        await this.validateI2CUsage(text, document, diagnostics);
        
        // Validate SPI configuration
        await this.validateSPIUsage(text, document, diagnostics);
        
        // Validate Serial usage
        await this.validateSerialUsage(text, document, diagnostics);
        
        return diagnostics;
    }
    
    async validateI2CUsage(text, document, diagnostics) {
        // Always validate I2C addresses regardless of hardware DB
        // Find I2C address usage
        const addressPattern = /(?:beginTransmission|requestFrom)\s*\(\s*0x([0-9A-Fa-f]+)/g;
        let match;
        
        const usedAddresses = new Set();
        
        while ((match = addressPattern.exec(text)) !== null) {
            // Skip if in comment
            if (CommentStripper.isInComment(text, match.index)) {
                continue;
            }
            
            const address = parseInt(match[1], 16);
            // Calculate position of the hex address within the match
            const hexStart = match[0].indexOf('0x' + match[1]);
            const addressIndex = match.index + hexStart;
            const pos = document.positionAt(addressIndex);
            
            // Check for reserved addresses FIRST (0x00-0x07 and 0x78-0x7F)
            if (address >= 0x00 && address <= 0x07) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + ('0x' + match[1]).length }
                    },
                    message: `I2C address 0x${address.toString(16).toUpperCase().padStart(2, '0')} is reserved. Valid range: 0x08-0x77`,
                    source: 'Sentinel',
                    code: 'reserved-i2c-address'
                });
                continue;
            }
            if (address >= 0x78 && address <= 0x7F) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + ('0x' + match[1]).length }
                    },
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is reserved for 10-bit addressing. Valid range: 0x08-0x77`,
                    source: 'Sentinel',
                    code: 'reserved-i2c-address'
                });
                continue;
            }
            
            // Then check if completely out of range (> 0x7F)
            if (address > 0x7F) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + ('0x' + match[1]).length }
                    },
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is outside valid range (0x00-0x7F). Use 7-bit addresses only (0x08-0x77)`,
                    source: 'Sentinel',
                    code: 'invalid-i2c-address'
                });
                continue;
            }
            
            // Check for address conflicts
            if (usedAddresses.has(address)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + ('0x' + match[1]).length }
                    },
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is used multiple times. Ensure this is intentional`,
                    source: 'Sentinel',
                    code: 'duplicate-i2c-address'
                });
            }
            
            usedAddresses.add(address);
        }
        
        // Check if Wire.begin() is called before usage
        const usesWire = /Wire\.(?:beginTransmission|requestFrom|write|read)/.test(text);
        const hasWireBegin = /Wire\.begin\s*\(/.test(text);
        
        if (usesWire && !hasWireBegin) {
            // Find first Wire usage to position the error
            const wireMatch = text.match(/Wire\.(?:beginTransmission|requestFrom|write|read)/);
            if (wireMatch) {
                const wireIndex = text.indexOf(wireMatch[0]);
                const pos = document.positionAt(wireIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + wireMatch[0].length }
                    },
                    message: 'Wire functions used without Wire.begin(). Add Wire.begin() in setup()',
                    source: 'Sentinel',
                    code: 'missing-wire-begin'
                });
            }
        }
    }
    
    async validateSPIUsage(text, document, diagnostics) {
        const usesSPI = /SPI\.\w+/.test(text);
        const hasSPIBegin = /SPI\.begin\s*\(/.test(text);
        
        if (usesSPI && !hasSPIBegin) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: this.getRange(document, 0, 0, 1),
                message: 'SPI functions used without SPI.begin(). Add SPI.begin() in setup()',
                source: 'Sentinel',
                code: 'missing-spi-begin'
            });
        }
        
        // Check for SPI transactions without proper begin/end
        const hasTransfer = /SPI\.transfer/.test(text);
        const hasTransaction = /SPI\.beginTransaction/.test(text);
        
        if (hasTransfer && !hasTransaction) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: this.getRange(document, 0, 0, 1),
                message: 'SPI.transfer() used without SPI.beginTransaction(). Consider using transactions for reliable communication',
                source: 'Sentinel',
                code: 'missing-spi-transaction'
            });
        }
    }
    
    async validateSerialUsage(text, document, diagnostics) {
        const usesSerial = /Serial\.\w+/.test(text);
        const hasSerialBegin = /Serial\.begin\s*\(/.test(text);
        
        if (usesSerial && !hasSerialBegin) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: this.getRange(document, 0, 0, 1),
                message: 'Serial functions used without Serial.begin(). Add Serial.begin(9600) in setup() for debugging output',
                source: 'Sentinel',
                code: 'missing-serial-begin'
            });
        }
    }
    
    async validateHardwareConstraints(text, document) {
        const diagnostics = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        if (!board || !board.constraints) return diagnostics;
        
        // Check for delay() calls in interrupts (ISR)
        const isrPattern = /(?:ISR|SIGNAL|attachInterrupt)\s*\([^)]*\)[^{]*{([^}]*)}/g;
        let isrMatch;
        
        while ((isrMatch = isrPattern.exec(text)) !== null) {
            const isrBody = isrMatch[1];
            const delayMatch = isrBody.match(/delay\s*\(/);
            
            if (delayMatch) {
                const line = text.substring(0, isrMatch.index).split('\n').length - 1;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: this.getRange(document, line, isrMatch.index, isrMatch[0].length),
                    message: 'delay() should not be used in interrupt handlers. Use non-blocking alternatives',
                    source: 'Sentinel',
                    code: 'delay-in-isr'
                });
            }
            
            // Check for long operations in ISR
            const isrLines = isrBody.split('\n').filter(line => line.trim().length > 0);
            if (isrLines.length > 10) {
                const line = text.substring(0, isrMatch.index).split('\n').length - 1;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, isrMatch.index, isrMatch[0].length),
                    message: `ISR contains ${isrLines.length} lines. Keep interrupt handlers short and fast`,
                    source: 'Sentinel',
                    code: 'long-isr'
                });
            }
        }
        
        // Check for long delay() calls
        const delayPattern = /delay\s*\(\s*(\d+)\s*\)/g;
        let delayMatch;
        
        while ((delayMatch = delayPattern.exec(text)) !== null) {
            const delayTime = parseInt(delayMatch[1]);
            const line = text.substring(0, delayMatch.index).split('\n').length - 1;
            
            if (delayTime > 1000) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: this.getRange(document, line, delayMatch.index, delayMatch[0].length),
                    message: `Long delay (${delayTime}ms) blocks execution. Consider non-blocking alternatives like millis()`,
                    source: 'Sentinel',
                    code: 'long-delay'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateInterruptUsage(text, document) {
        const diagnostics = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        if (!board || !board.pins.interrupts) return diagnostics;
        
        const interruptPattern = /attachInterrupt\s*\(\s*digitalPinToInterrupt\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = interruptPattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            if (!board.pins.interrupts.includes(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Pin ${pin} does not support external interrupts. Available interrupt pins: ${board.pins.interrupts.join(', ')}`,
                    source: 'Sentinel',
                    code: 'invalid-interrupt-pin'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateMemoryAccess(text, document) {
        const diagnostics = [];
        
        // Check for potential buffer overflows
        const bufferPattern = /(?:strcpy|strcat|sprintf|gets)\s*\(/g;
        let match;
        
        while ((match = bufferPattern.exec(text)) !== null) {
            const line = text.substring(0, match.index).split('\n').length - 1;
            const func = match[0].replace('(', '');
            
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: this.getRange(document, line, match.index, match[0].length),
                message: `${func}() can cause buffer overflows. Consider safer alternatives: strncpy(), strncat(), snprintf()`,
                source: 'Sentinel',
                code: 'unsafe-string-function'
            });
        }
        
        // Check for malloc/free usage (unusual in Arduino)
        const mallocPattern = /(?:malloc|free|calloc|realloc)\s*\(/g;
        while ((match = mallocPattern.exec(text)) !== null) {
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: this.getRange(document, line, match.index, match[0].length),
                message: 'Dynamic memory allocation on microcontrollers can cause memory fragmentation. Consider static allocation',
                source: 'Sentinel',
                code: 'dynamic-allocation'
            });
        }
        
        return diagnostics;
    }
    
    async validateSerialBaudRate(text, document) {
        const diagnostics = [];
        const validBaudRates = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 115200, 230400, 460800, 921600];
        const baudPattern = /Serial\.begin\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = baudPattern.exec(text)) !== null) {
            const baudRate = parseInt(match[1]);
            const baudValueIndex = match.index + match[0].indexOf(match[1]);
            const line = document.positionAt(baudValueIndex).line;
            const col = document.positionAt(baudValueIndex).character;
            
            if (!validBaudRates.includes(baudRate)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + match[1].length }
                    },
                    message: `Unusual baud rate ${baudRate}. Standard rates: 9600, 115200, etc.`,
                    source: 'Sentinel',
                    code: 'non-standard-baud'
                });
            }
            
            if (baudRate > 115200) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + match[1].length }
                    },
                    message: `High baud rate ${baudRate} may be unreliable over USB. Consider 115200 or lower`,
                    source: 'Sentinel',
                    code: 'high-baud-rate'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateDelayUsage(text, document) {
        const diagnostics = [];
        const delayPattern = /delay\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        // Check if this is ESP32 code (will have ESP32-specific deep sleep suggestions)
        const isESP32 = text.includes('#include <WiFi.h>') || 
                        text.includes('#include <BLEDevice.h>') ||
                        text.includes('esp_deep_sleep');
        
        while ((match = delayPattern.exec(text)) !== null) {
            const delayMs = parseInt(match[1]);
            const delayValueIndex = match.index + match[0].indexOf(match[1]);
            const line = document.positionAt(delayValueIndex).line;
            const col = document.positionAt(delayValueIndex).character;
            
            // Skip generic Arduino warning for ESP32 (it has its own deep sleep suggestion)
            if (delayMs > 5000 && !isESP32) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line, character: col },
                        end: { line, character: col + match[1].length }
                    },
                    message: `Long delay (${delayMs}ms) blocks all execution. Consider using millis() for non-blocking timing`,
                    source: 'Sentinel',
                    code: 'blocking-delay'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateAnalogRead(text, document) {
        const diagnostics = [];
        const analogPattern = /analogRead\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = analogPattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const pinIndex = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(pinIndex);
            
            if (pin > 7) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `Pin ${pin} may not have ADC. Arduino Uno has A0-A5 (pins 14-19 in code)`,
                    source: 'Sentinel',
                    code: 'invalid-analog-pin'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validatePWMUsage(text, document) {
        const diagnostics = [];
        const pwmPattern = /analogWrite\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
        let match;
        
        while ((match = pwmPattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const valueStr = match[2];
            const value = valueStr === 'HIGH' ? 255 : (valueStr === 'LOW' ? 0 : parseInt(valueStr));
            const pinIndex = match.index + match[0].indexOf(match[1]);
            const valueIndex = match.index + match[0].indexOf(match[2]);
            
            const pwmPins = [3, 5, 6, 9, 10, 11];
            if (!pwmPins.includes(pin)) {
                const pinPos = document.positionAt(pinIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pinPos.line, character: pinPos.character },
                        end: { line: pinPos.line, character: pinPos.character + match[1].length }
                    },
                    message: `Pin ${pin} does not support PWM. Arduino Uno PWM pins: 3, 5, 6, 9, 10, 11`,
                    source: 'Sentinel',
                    code: 'no-pwm-support'
                });
            }
            
            if (!isNaN(value) && value > 255) {
                const valPos = document.positionAt(valueIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: valPos.line, character: valPos.character },
                        end: { line: valPos.line, character: valPos.character + match[2].length }
                    },
                    message: `PWM value ${value} exceeds maximum (0-255)`,
                    source: 'Sentinel',
                    code: 'pwm-value-overflow'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateStringUsage(text, document) {
        const diagnostics = [];
        const stringConcatPattern = /(String\s+\w+\s*=.*?\+|\w+\s*\+=\s*String)/g;
        let match;
        
        while ((match = stringConcatPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 6 }
                },
                message: `String concatenation causes memory fragmentation. Consider using char arrays or F() macro`,
                source: 'Sentinel',
                code: 'string-fragmentation'
            });
        }
        
        return diagnostics;
    }
    
    async validateFloatingPointUsage(text, document) {
        const diagnostics = [];
        const floatPattern = /\b(float|double)\s+\w+/g;
        let match;
        
        while ((match = floatPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + match[1].length }
                },
                message: `Floating point math is slow on 8-bit AVR. Consider fixed-point arithmetic if performance matters`,
                source: 'Sentinel',
                code: 'slow-float'
            });
        }
        
        return diagnostics;
    }
    
    async validateInterruptPins(text, document) {
        const diagnostics = [];
        const attachPattern = /attachInterrupt\s*\(\s*digitalPinToInterrupt\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = attachPattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const pinIndex = match.index + match[0].lastIndexOf(match[1]);
            const pos = document.positionAt(pinIndex);
            
            const interruptPins = [2, 3];
            if (!interruptPins.includes(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `Pin ${pin} does not support external interrupts. Arduino Uno: pins 2 and 3 only`,
                    source: 'Sentinel',
                    code: 'invalid-interrupt-pin'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateWireBuffer(text, document) {
        const diagnostics = [];
        const wireWritePattern = /Wire\.write\s*\([^)]*\)/g;
        let match;
        let writeCount = 0;
        
        while ((match = wireWritePattern.exec(text)) !== null) {
            writeCount++;
            if (writeCount > 32) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 10 }
                    },
                    message: `I2C buffer limited to 32 bytes. Too many Wire.write() calls may overflow`,
                    source: 'Sentinel',
                    code: 'i2c-buffer-overflow'
                });
                break;
            }
        }
        
        return diagnostics;
    }
    
    async validateSerialBuffer(text, document) {
        const diagnostics = [];
        const serialPrintPattern = /Serial\.print(ln)?\s*\(/g;
        let match;
        let printCount = 0;
        
        while ((match = serialPrintPattern.exec(text)) !== null) {
            printCount++;
        }
        
        if (printCount > 20) {
            const firstMatch = serialPrintPattern.exec(text);
            if (firstMatch) {
                const pos = document.positionAt(firstMatch.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 13 }
                    },
                    message: `${printCount} Serial.print() calls detected. Consider reducing debug output or using higher baud rate`,
                    source: 'Sentinel',
                    code: 'excessive-serial'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateMillisOverflow(text, document) {
        const diagnostics = [];
        const millisPattern = /millis\s*\(\s*\)/g;
        let match;
        
        while ((match = millisPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 7 }
                },
                message: `millis() overflows after ~49.7 days. For long-running applications, handle overflow`,
                source: 'Sentinel',
                code: 'millis-overflow'
            });
            break;
        }
        
        return diagnostics;
    }
    
    async validatePinModeBeforeUse(text, document) {
        const diagnostics = [];
        const digitalWritePattern = /digitalWrite\s*\(\s*(\d+)\s*,/g;
        const digitalReadPattern = /digitalRead\s*\(\s*(\d+)\s*\)/g;
        const pinModePattern = /pinMode\s*\(\s*(\d+)\s*,/g;
        
        // Collect all pinMode calls
        const configuredPins = new Set();
        let match;
        
        while ((match = pinModePattern.exec(text)) !== null) {
            configuredPins.add(parseInt(match[1]));
        }
        
        // Check digitalWrite calls
        const digitalWritePattern2 = /digitalWrite\s*\(\s*(\d+)\s*,/g;
        while ((match = digitalWritePattern2.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            if (!configuredPins.has(pin)) {
                const pinIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(pinIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `Pin ${pin} used in digitalWrite() without pinMode(). Add pinMode(${pin}, OUTPUT) in setup()`,
                    source: 'Sentinel',
                    code: 'missing-pinmode'
                });
            }
        }
        
        // Check digitalRead calls
        const digitalReadPattern2 = /digitalRead\s*\(\s*(\d+)\s*\)/g;
        while ((match = digitalReadPattern2.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            if (!configuredPins.has(pin)) {
                const pinIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(pinIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `Pin ${pin} used in digitalRead() without pinMode(). Add pinMode(${pin}, INPUT) in setup()`,
                    source: 'Sentinel',
                    code: 'missing-pinmode'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateProgmemUsage(text, document) {
        const diagnostics = [];
        const largeArrayPattern = /(?:const\s+)?(?:char|byte|int)\s+\w+\[\]\s*=\s*\{[^}]{100,}\}/g;
        let match;
        
        while ((match = largeArrayPattern.exec(text)) !== null) {
            if (!match[0].includes('PROGMEM')) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 10 }
                    },
                    message: `Large array detected. Consider using PROGMEM to store in flash instead of RAM`,
                    source: 'Sentinel',
                    code: 'use-progmem'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateEEPROMWrites(text, document) {
        const diagnostics = [];
        const eepromWritePattern = /EEPROM\.write\s*\(/g;
        let match;
        let writeCount = 0;
        
        while ((match = eepromWritePattern.exec(text)) !== null) {
            writeCount++;
            if (writeCount > 5) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 12 }
                    },
                    message: `Multiple EEPROM.write() detected. EEPROM has ~100k write cycle limit. Use EEPROM.update() to reduce writes`,
                    source: 'Sentinel',
                    code: 'eeprom-wear'
                });
                break;
            }
        }
        
        return diagnostics;
    }
    
    async validateI2CPullups(text, document) {
        // Disabled - too noisy for demo
        // Users already know about I2C pullups
        return [];
    }
    
    async validateToneUsage(text, document) {
        const diagnostics = [];
        const tonePattern = /tone\s*\(\s*(\d+)\s*,/g;
        let match;
        
        while ((match = tonePattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const pinIndex = match.index + match[0].indexOf(match[1]);
            const pos = document.positionAt(pinIndex);
            
            if (pin === 3 || pin === 11) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `tone() on pin ${pin} will disable PWM on pins 3 and 11`,
                    source: 'Sentinel',
                    code: 'tone-pwm-conflict'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateMapFunction(text, document) {
        const diagnostics = [];
        const mapPattern = /map\s*\(\s*\w+\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = mapPattern.exec(text)) !== null) {
            const fromLow = parseInt(match[1]);
            const fromHigh = parseInt(match[2]);
            
            if (fromLow >= fromHigh) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 3 }
                    },
                    message: `map() fromLow (${fromLow}) must be less than fromHigh (${fromHigh})`,
                    source: 'Sentinel',
                    code: 'invalid-map-range'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateRandomSeed(text, document) {
        const diagnostics = [];
        const randomPattern = /\brandom\s*\(/g;
        // Check for randomSeed NOT in comments
        const hasRandomSeed = /^(?!.*\/\/).*randomSeed\s*\(/m.test(text);
        let match;
        

        
        if (!hasRandomSeed && (match = randomPattern.exec(text)) !== null) {

            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 6 }
                },
                message: `random() without randomSeed() produces same sequence. Use randomSeed(analogRead(0)) for variety`,
                source: 'Sentinel',
                code: 'missing-random-seed'
            });

        } else {

        }
        
        return diagnostics;
    }
    
    async validateVoltageLevels(text, document) {
        const diagnostics = [];
        
        if (text.includes('ESP32') || text.includes('esp32')) {
            const digitalWritePattern = /digitalWrite\s*\(\s*(\d+)\s*,\s*HIGH\s*\)/g;
            let match;
            
            while ((match = digitalWritePattern.exec(text)) !== null) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 13 }
                    },
                    message: `ESP32 outputs 3.3V. Ensure connected devices are 3.3V tolerant (not 5V Arduino modules)`,
                    source: 'Sentinel',
                    code: 'voltage-level-warning'
                });
                break;
            }
        }
        
        return diagnostics;
    }
    
    async validateSPISpeed(text, document) {
        const diagnostics = [];
        const spiBeginPattern = /SPI\.beginTransaction\s*\(\s*SPISettings\s*\(\s*(\d+)/g;
        let match;
        
        while ((match = spiBeginPattern.exec(text)) !== null) {
            const speed = parseInt(match[1]);
            if (speed > 8000000) {
                const speedIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(speedIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `SPI speed ${speed}Hz may be too fast. Most Arduino devices support max 8MHz. Check your device specs`,
                    source: 'Sentinel',
                    code: 'spi-speed-warning'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateWatchdogTimer(text, document) {
        const diagnostics = [];
        const wdtPattern = /wdt_enable|wdt_reset/g;
        const hasLongDelay = /delay\s*\(\s*(\d+)\s*\)/.test(text);
        let match;
        
        if ((match = wdtPattern.exec(text)) !== null && hasLongDelay) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 10 }
                },
                message: `Watchdog timer enabled with delay() calls. Ensure wdt_reset() called before timeout or system will reboot`,
                source: 'Sentinel',
                code: 'watchdog-delay'
            });
        }
        
        return diagnostics;
    }
    
    async validateStackOverflow(text, document) {
        const diagnostics = [];
        const recursionPattern = /\b(\w+)\s*\([^)]*\)\s*\{[^}]*\b\1\s*\(/g;
        let match;
        
        while ((match = recursionPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + match[1].length }
                },
                message: `Recursion detected in function '${match[1]}'. Arduino has limited stack (2KB on Uno). Avoid deep recursion`,
                source: 'Sentinel',
                code: 'stack-overflow-risk'
            });
        }
        
        return diagnostics;
    }
    
    async validateSerialFraming(text, document) {
        const diagnostics = [];
        const serialBeginPattern = /Serial\.begin\s*\(\s*\d+\s*,\s*(\w+)\s*\)/g;
        let match;
        
        while ((match = serialBeginPattern.exec(text)) !== null) {
            const config = match[1];
            if (!config.startsWith('SERIAL_')) {
                const configIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(configIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + config.length }
                    },
                    message: `Invalid serial config '${config}'. Use SERIAL_8N1, SERIAL_8E1, etc.`,
                    source: 'Sentinel',
                    code: 'invalid-serial-config'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateTimerPrescaler(text, document) {
        const diagnostics = [];
        const timerPattern = /TCCR\d[AB]/g;
        let match;
        let matchCount = 0;
        
        while ((match = timerPattern.exec(text)) !== null) {
            matchCount++;
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 6 }
                },
                message: `Direct timer register manipulation detected. This will affect millis(), delay(), and PWM. Document this carefully`,
                source: 'Sentinel',
                code: 'timer-register-warning'
            });
        }
        

        return diagnostics;
    }
    
    async validatePWMFrequency(text, document) {
        const diagnostics = [];
        const analogWriteFreqPattern = /analogWriteFreq\s*\(\s*(\d+)\s*\)/g;
        let match;
        
        while ((match = analogWriteFreqPattern.exec(text)) !== null) {
            const freq = parseInt(match[1]);
            if (freq < 100 || freq > 40000) {
                const freqIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(freqIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[1].length }
                    },
                    message: `PWM frequency ${freq}Hz is unusual. Typical range: 500-5000Hz for motors, 20000Hz+ for LED dimming`,
                    source: 'Sentinel',
                    code: 'unusual-pwm-freq'
                });
            }
        }
        
        return diagnostics;
    }
    
    async validateGlobalVariables(text, document) {
        const diagnostics = [];
        // Match variable declarations at global scope (before first function)
        const lines = text.split('\n');
        let globalCount = 0;
        let firstGlobalLine = -1;
        let insideFunction = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detect function start
            if (/^\s*(?:void|int|bool|long|float)\s+\w+\s*\(/.test(line)) {
                insideFunction = true;
            }
            
            // Count global variables before any function
            if (!insideFunction && /^(?:int|long|float|double|char|byte|boolean)\s+/.test(line)) {
                // Count comma-separated variables
                const commas = (line.match(/,/g) || []).length;
                globalCount += commas + 1;
                if (firstGlobalLine === -1) {
                    firstGlobalLine = i;
                }
            }
        }
        

        
        if (globalCount >= 15 && firstGlobalLine >= 0) {

            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: firstGlobalLine, character: 0 },
                    end: { line: firstGlobalLine, character: 3 }
                },
                message: `${globalCount} global variables detected. Arduino Uno has only 2KB RAM. Consider reducing globals`,
                source: 'Sentinel',
                code: 'excessive-globals'
            });
        } else {

        }
        
        return diagnostics;
    }
    
    async validateISRSafety(text, document) {
        const diagnostics = [];
        const attachPattern = /attachInterrupt\s*\(/g;
        // Check for volatile keyword NOT in comments
        const hasVolatile = /^(?!.*\/\/).*\bvolatile\b/m.test(text);
        let match;
        
        // Check if any global variables exist that should be volatile
        const globalVarPattern = /^(?:int|long|byte|bool|boolean)\s+(\w+)/gm;
        const foundGlobals = [];
        let varMatch;
        
        while ((varMatch = globalVarPattern.exec(text)) !== null) {
            const varName = varMatch[1];
            // Make sure it's not inside a function
            const beforeMatch = text.substring(0, varMatch.index);
            const openBraces = (beforeMatch.match(/\{/g) || []).length;
            const closeBraces = (beforeMatch.match(/\}/g) || []).length;
            if (openBraces === closeBraces) {
                foundGlobals.push(varName);
            }
        }
        
        // Warn if we have interrupts and globals but no volatile
        if ((match = attachPattern.exec(text)) !== null && foundGlobals.length > 0 && !hasVolatile) {

            const pos = document.positionAt(match.index);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 15 }
                },
                message: `Interrupt used with global variable '${foundGlobals[0]}'. Mark ISR-accessed variables as 'volatile' to prevent optimization issues`,
                source: 'Sentinel',
                code: 'missing-volatile'
            });

        } else {

        }
        

        return diagnostics;
    }
    
    async validateADCReference(text, document) {
        const diagnostics = [];
        const analogRefPattern = /analogReference\s*\(\s*(\w+)\s*\)/g;
        let match;
        
        while ((match = analogRefPattern.exec(text)) !== null) {
            const ref = match[1];
            if (ref === 'EXTERNAL') {
                const refIndex = match.index + match[0].indexOf(match[1]);
                const pos = document.positionAt(refIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + ref.length }
                    },
                    message: `EXTERNAL ADC reference requires voltage on AREF pin (0-5V). Exceeding 5V will damage Arduino`,
                    source: 'Sentinel',
                    code: 'aref-external-warning'
                });
            }
        }
        
        return diagnostics;
    }

    // ============================================================================
    // ESP32-Specific Validations
    // ============================================================================

    async validateESP32WiFi(text, document) {
        const diagnostics = [];
        
        // Check for WiFi.begin() without credentials
        const wifiBeginPattern = /WiFi\.begin\s*\(\s*\)/g;
        let match;
        
        while ((match = wifiBeginPattern.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + match[0].length }
                },
                message: 'WiFi.begin() requires SSID and password: WiFi.begin(ssid, password)',
                source: 'Sentinel',
                code: 'esp32-wifi-credentials'
            });
        }

        // Check for missing WiFi.h include
        if (text.includes('WiFi.') && !text.includes('#include <WiFi.h>')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: this.getRange(document, 0, 0, 1),
                message: 'Missing #include <WiFi.h> for WiFi functionality',
                source: 'Sentinel',
                code: 'esp32-wifi-include'
            });
        }

        // Warn about WiFi power consumption
        if (text.includes('WiFi.begin(') && !text.includes('WiFi.mode(WIFI_STA)')) {
            const wifiIndex = text.indexOf('WiFi.begin(');
            const pos = document.positionAt(wifiIndex);
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: {
                    start: { line: pos.line, character: pos.character },
                    end: { line: pos.line, character: pos.character + 11 }
                },
                message: 'Consider WiFi.mode(WIFI_STA) to reduce power consumption (disables AP mode)',
                source: 'Sentinel',
                code: 'esp32-wifi-power'
            });
        }

        return diagnostics;
    }

    async validateESP32BLE(text, document) {
        const diagnostics = [];
        
        // Check for BLE + WiFi conflict (high memory usage)
        const hasBLE = text.includes('BLEDevice::') || text.includes('#include <BLEDevice.h>');
        const hasWiFi = text.includes('WiFi.') || text.includes('#include <WiFi.h>');

        if (hasBLE && hasWiFi) {
            // Find BLEDevice::init() call, not the include
            const bleInitPattern = /BLEDevice::init\s*\(/g;
            const match = bleInitPattern.exec(text);
            
            if (match) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: 'Using both BLE and WiFi simultaneously requires significant RAM (>100KB). Monitor memory usage closely.',
                    source: 'Sentinel',
                    code: 'esp32-ble-wifi-conflict'
                });
            }
        }

        // Check for BLE without initialization
        if (text.includes('BLEServer::') && !text.includes('BLEDevice::init(')) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: this.getRange(document, 0, 0, 1),
                message: 'BLE requires initialization with BLEDevice::init("DeviceName") before use',
                source: 'Sentinel',
                code: 'esp32-ble-init'
            });
        }

        return diagnostics;
    }

    async validateESP32DeepSleep(text, document) {
        const diagnostics = [];
        
        // Check for deep sleep configuration
        const deepSleepPattern = /esp_deep_sleep_start\s*\(/g;
        let match;

        while ((match = deepSleepPattern.exec(text)) !== null) {
            // Check if wake-up source is configured
            const beforeSleep = text.substring(0, match.index);
            const hasWakeupConfig = beforeSleep.includes('esp_sleep_enable_') || 
                                   beforeSleep.includes('esp_deep_sleep_enable_');

            if (!hasWakeupConfig) {
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: 'Deep sleep without wake-up source configured. ESP32 will sleep indefinitely. Use esp_sleep_enable_timer_wakeup() or esp_sleep_enable_ext0_wakeup()',
                    source: 'Sentinel',
                    code: 'esp32-deep-sleep-wakeup'
                });
            }
        }

        // Recommend deep sleep for battery applications
        const delayPattern = /delay\(\s*(\d+)\s*\)/g;
        let delayMatch;
        
        while ((delayMatch = delayPattern.exec(text)) !== null) {
            const delayTime = parseInt(delayMatch[1]);
            
            if (delayTime > 5000 && !text.includes('esp_deep_sleep')) { // > 5 seconds
                const pos = document.positionAt(delayMatch.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + delayMatch[0].length }
                    },
                    message: 'Long delay (10000ms) blocks all execution. Consider using esp_deep_sleep() to save power on battery applications.',
                    source: 'Sentinel',
                    code: 'esp32-power-optimization'
                });
            }
        }

        return diagnostics;
    }

    async validateESP32DualCore(text, document) {
        const diagnostics = [];
        
        // Check for xTaskCreatePinnedToCore usage
        const taskCreatePattern = /xTaskCreatePinnedToCore\s*\(/g;
        let match;

        while ((match = taskCreatePattern.exec(text)) !== null) {
            // Extract the task creation call to check core assignment
            const startIndex = match.index;
            let endIndex = startIndex;
            let parenCount = 0;
            
            for (let i = startIndex; i < text.length; i++) {
                if (text[i] === '(') parenCount++;
                if (text[i] === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }

            const taskCall = text.substring(startIndex, endIndex + 1);
            
            // Check if pinning to Core 0 (used by WiFi/BT)
            // xTaskCreatePinnedToCore has 7 parameters, core ID is the last one (index 6)
            // Split by commas and check the last parameter
            const params = taskCall.split(',');
            if (params.length >= 7) {
                const coreParam = params[6].trim();
                // Check if it's 0 (could be "0", "0)", or "0  // comment")
                if (coreParam.match(/^\s*0\s*(?:\/\/.*)?[\)\s]*$/)) {
                    // Find the position of this '0' in the original text
                    // Search backwards from the closing paren to find the last '0'
                    const searchText = taskCall.substring(0, taskCall.lastIndexOf(')'));
                    const lastCommaIndex = searchText.lastIndexOf(',');
                    const afterLastComma = searchText.substring(lastCommaIndex);
                    const zeroMatch = afterLastComma.match(/\b0\b/);
                    
                    if (zeroMatch) {
                        const zeroIndex = startIndex + lastCommaIndex + afterLastComma.indexOf(zeroMatch[0]);
                        const pos = document.positionAt(zeroIndex);
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: {
                                start: { line: pos.line, character: pos.character },
                                end: { line: pos.line, character: pos.character + 1 }
                            },
                            message: 'Task pinned to Core 0. WiFi/Bluetooth also run on Core 0, which may cause performance issues. Consider Core 1 for application tasks.',
                            source: 'Sentinel',
                            code: 'esp32-core0-conflict'
                        });
                    }
                }
            }
        }

        // Check for FreeRTOS without proper includes
        if (text.includes('xTask') && !text.includes('#include <freertos/FreeRTOS.h>')) {
            // Find first xTask usage
            const xTaskMatch = text.match(/xTask\w+/);
            if (xTaskMatch) {
                const xTaskIndex = text.indexOf(xTaskMatch[0]);
                const pos = document.positionAt(xTaskIndex);
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + xTaskMatch[0].length }
                    },
                    message: 'FreeRTOS tasks require #include <freertos/FreeRTOS.h> and #include <freertos/task.h>',
                    source: 'Sentinel',
                    code: 'esp32-freertos-include'
                });
            }
        }

        return diagnostics;
    }

    async validateESP32PSRAM(text, document) {
        const diagnostics = [];
        
        // Check for PSRAM usage
        if (text.includes('ps_malloc') || text.includes('heap_caps_malloc')) {
            if (!text.includes('MALLOC_CAP_SPIRAM') && !text.includes('MALLOC_CAP_8BIT')) {
                const psramIndex = text.indexOf('ps_malloc') !== -1 ? text.indexOf('ps_malloc') : text.indexOf('heap_caps_malloc');
                const pos = document.positionAt(psramIndex);
                
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + 9 }
                    },
                    message: 'Using PSRAM allocation. Ensure PSRAM is enabled in board configuration (Tools > PSRAM: Enabled)',
                    source: 'Sentinel',
                    code: 'esp32-psram-config'
                });
            }
        }

        // Check for large allocations that should use PSRAM
        const mallocPattern = /malloc\s*\(\s*(\d+)\s*\)/g;
        let match;

        while ((match = mallocPattern.exec(text)) !== null) {
            const size = parseInt(match[1]);
            
            if (size > 10000) { // > 10KB
                const pos = document.positionAt(match.index);
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: pos.line, character: pos.character },
                        end: { line: pos.line, character: pos.character + match[0].length }
                    },
                    message: `Large allocation (${size} bytes). Consider using ps_malloc() to allocate in PSRAM instead of limited internal RAM.`,
                    source: 'Sentinel',
                    code: 'esp32-large-malloc'
                });
            }
        }

        return diagnostics;
    }
    
    getRange(document, line, startChar, length) {
        return {
            start: { line, character: startChar },
            end: { line, character: startChar + length }
        };
    }
}

module.exports = EmbeddedDiagnosticProvider;
