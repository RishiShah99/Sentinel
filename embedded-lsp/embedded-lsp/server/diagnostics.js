/**
 * Embedded Diagnostic Provider - Real-Time Hardware Constraint Validation
 * 
 * This module provides intelligent diagnostics that catch embedded-specific issues:
 * - Stack overflow risks
 * - Pin conflicts and invalid configurations
 * - Protocol misconfigurations
 * - Hardware constraint violations
 */

const { Diagnostic, DiagnosticSeverity } = require('vscode-languageserver/node');

class EmbeddedDiagnosticProvider {
    constructor(hardwareDB) {
        this.hardwareDB = hardwareDB;
    }
    
    async validateDocument(document, settings) {
        const text = document.getText();
        const diagnostics = [];
        
        // Perform various embedded-specific validations
        const validations = await Promise.all([
            this.validatePinUsage(text, document),
            this.validateStackUsage(text, document),
            this.validateProtocolConfiguration(text, document),
            this.validateHardwareConstraints(text, document),
            this.validateInterruptUsage(text, document),
            this.validateMemoryAccess(text, document)
        ]);
        
        // Flatten all diagnostics
        validations.forEach(validation => {
            diagnostics.push(...validation);
        });
        
        return diagnostics;
    }
    
    async validatePinUsage(text, document) {
        const diagnostics = [];
        const board = this.hardwareDB.getCurrentBoard();
        
        if (!board) return diagnostics;
        
        const pinUsagePattern = /pinMode\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
        let match;
        
        const usedPins = new Map(); // Track pin configurations
        
        while ((match = pinUsagePattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const mode = match[2];
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            // Validate pin exists
            if (!this.hardwareDB.isPinValid(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Pin ${pin} is not valid for ${board.name}. Valid pins: ${board.pins.digital.join(', ')}`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'invalid-pin'
                });
                continue;
            }
            
            // Check for pin conflicts
            if (usedPins.has(pin)) {
                const previousUsage = usedPins.get(pin);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Pin ${pin} is already configured as ${previousUsage.mode} at line ${previousUsage.line + 1}`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'pin-conflict'
                });
            }
            
            // Validate mode for pin capabilities
            if (mode === 'ANALOG' && !this.hardwareDB.isPinCapable(pin, 'analog')) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Pin ${pin} does not support analog input. Analog pins: ${board.pins.analog?.join(', ') || 'None'}`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'invalid-pin-mode'
                });
            }
            
            // Store pin usage
            usedPins.set(pin, { mode, line });
        }
        
        // Check for digital operations on analog pins
        const digitalWritePattern = /digitalWrite\s*\(\s*(\d+)\s*,/g;
        while ((match = digitalWritePattern.exec(text)) !== null) {
            const pin = parseInt(match[1]);
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            if (!usedPins.has(pin)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Pin ${pin} used without pinMode() configuration. Add pinMode(${pin}, OUTPUT) in setup()`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'missing-pin-mode'
                });
            } else if (usedPins.get(pin).mode === 'INPUT') {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Writing to pin ${pin} configured as INPUT. Consider changing to OUTPUT mode`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'write-to-input-pin'
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
                        source: 'OrbitIDE Embedded LSP',
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
                    source: 'OrbitIDE Embedded LSP',
                    code: 'stack-overflow-risk'
                });
            } else if (totalBytes > board.constraints.maxStackDepth * 0.25) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `Medium-sized array (${totalBytes} bytes) detected. Monitor total stack usage. Available: ~${board.constraints.maxStackDepth} bytes`,
                    source: 'OrbitIDE Embedded LSP',
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
                source: 'OrbitIDE Embedded LSP',
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
        const i2cProtocol = this.hardwareDB.getProtocol('i2c');
        if (!i2cProtocol) return;
        
        // Find I2C address usage
        const addressPattern = /(?:beginTransmission|requestFrom)\s*\(\s*0x([0-9A-Fa-f]+)/g;
        let match;
        
        const usedAddresses = new Set();
        
        while ((match = addressPattern.exec(text)) !== null) {
            const address = parseInt(match[1], 16);
            const line = text.substring(0, match.index).split('\n').length - 1;
            
            // Validate address range
            if (address < 8 || address > 119) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is outside valid range (0x08-0x77)`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'invalid-i2c-address'
                });
                continue;
            }
            
            // Check for reserved addresses
            const reservedAddresses = [0x00, 0x78, 0x79, 0x7A, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F];
            if (reservedAddresses.includes(address)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is reserved`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'reserved-i2c-address'
                });
            }
            
            // Check for address conflicts
            if (usedAddresses.has(address)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `I2C address 0x${address.toString(16).toUpperCase()} is used multiple times. Ensure this is intentional`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'duplicate-i2c-address'
                });
            }
            
            // Suggest known devices for common addresses
            const knownDevice = i2cProtocol.commonAddresses[`0x${address.toString(16)}`];
            if (knownDevice) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: this.getRange(document, line, match.index, match[0].length),
                    message: `I2C address 0x${address.toString(16).toUpperCase()} commonly used by: ${knownDevice}`,
                    source: 'OrbitIDE Embedded LSP',
                    code: 'i2c-device-hint'
                });
            }
            
            usedAddresses.add(address);
        }
        
        // Check if Wire.begin() is called before usage
        const usesWire = /(?:beginTransmission|requestFrom|write|read)/.test(text);
        const hasWireBegin = /Wire\.begin\s*\(/.test(text);
        
        if (usesWire && !hasWireBegin) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: this.getRange(document, 0, 0, 1),
                message: 'Wire functions used without Wire.begin(). Add Wire.begin() in setup()',
                source: 'OrbitIDE Embedded LSP',
                code: 'missing-wire-begin'
            });
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
                source: 'OrbitIDE Embedded LSP',
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
                source: 'OrbitIDE Embedded LSP',
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
                source: 'OrbitIDE Embedded LSP',
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
                    source: 'OrbitIDE Embedded LSP',
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
                    source: 'OrbitIDE Embedded LSP',
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
                    source: 'OrbitIDE Embedded LSP',
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
                    source: 'OrbitIDE Embedded LSP',
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
                source: 'OrbitIDE Embedded LSP',
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
                source: 'OrbitIDE Embedded LSP',
                code: 'dynamic-allocation'
            });
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
