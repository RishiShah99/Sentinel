/**
 * Pin Usage Tracker
 * Tracks all pin usage across the codebase and detects conflicts
 */

const CommentStripper = require('./comment-stripper');

class PinTracker {
    constructor() {
        this.pinMap = new Map(); // pin number -> array of usages
    }

    /**
     * Analyze document and extract all pin usages
     */
    analyzePinUsage(document) {
        const originalText = document.getText();
        // Strip comments to avoid tracking commented-out pins
        const text = CommentStripper.strip(originalText);
        const usages = [];

        // Track pinMode() calls
        const pinModePattern = /pinMode\s*\(\s*(\d+|[A-Z]\d+)\s*,\s*(INPUT|OUTPUT|INPUT_PULLUP)\s*\)/g;
        let match;
        while ((match = pinModePattern.exec(text)) !== null) {
            const pin = this.parsePin(match[1]);
            const line = document.positionAt(match.index).line;
            usages.push({
                pin,
                type: match[2] === 'OUTPUT' ? 'digital-output' : 'digital-input',
                function: 'pinMode',
                line,
                offset: match.index
            });
        }

        // Track digitalWrite() calls
        const digitalWritePattern = /digitalWrite\s*\(\s*(\d+|[A-Z]\d+)\s*,/g;
        while ((match = digitalWritePattern.exec(text)) !== null) {
            const pin = this.parsePin(match[1]);
            const line = document.positionAt(match.index).line;
            usages.push({
                pin,
                type: 'digital-output',
                function: 'digitalWrite',
                line,
                offset: match.index
            });
        }

        // Track analogWrite() calls (PWM)
        const analogWritePattern = /analogWrite\s*\(\s*(\d+|[A-Z]\d+)\s*,/g;
        while ((match = analogWritePattern.exec(text)) !== null) {
            const pin = this.parsePin(match[1]);
            const line = document.positionAt(match.index).line;
            usages.push({
                pin,
                type: 'pwm',
                function: 'analogWrite',
                line,
                offset: match.index
            });
        }

        // Track analogRead() calls
        const analogReadPattern = /analogRead\s*\(\s*([A-Z]?\d+)\s*\)/g;
        while ((match = analogReadPattern.exec(text)) !== null) {
            const pin = this.parsePin(match[1]);
            const line = document.positionAt(match.index).line;
            usages.push({
                pin,
                type: 'analog-input',
                function: 'analogRead',
                line,
                offset: match.index
            });
        }

        // Track attachInterrupt() calls
        const interruptPattern = /attachInterrupt\s*\(\s*digitalPinToInterrupt\s*\(\s*(\d+)\s*\)|attachInterrupt\s*\(\s*(\d+)\s*,/g;
        while ((match = interruptPattern.exec(text)) !== null) {
            const pin = this.parsePin(match[1] || match[2]);
            const line = document.positionAt(match.index).line;
            usages.push({
                pin,
                type: 'interrupt',
                function: 'attachInterrupt',
                line,
                offset: match.index
            });
        }

        // Track Wire (I2C) usage - pins 18/19 (A4/A5 on Uno)
        if (text.includes('Wire.begin()')) {
            const match = text.match(/Wire\.begin\s*\(\s*\)/);
            if (match) {
                const line = document.positionAt(text.indexOf(match[0])).line;
                usages.push(
                    { pin: 18, type: 'i2c-sda', function: 'Wire', line, offset: text.indexOf(match[0]) },
                    { pin: 19, type: 'i2c-scl', function: 'Wire', line, offset: text.indexOf(match[0]) }
                );
            }
        }

        // Track SPI usage - pins 10, 11, 12, 13
        if (text.includes('SPI.begin()')) {
            const match = text.match(/SPI\.begin\s*\(\s*\)/);
            if (match) {
                const line = document.positionAt(text.indexOf(match[0])).line;
                usages.push(
                    { pin: 10, type: 'spi-ss', function: 'SPI', line, offset: text.indexOf(match[0]) },
                    { pin: 11, type: 'spi-mosi', function: 'SPI', line, offset: text.indexOf(match[0]) },
                    { pin: 12, type: 'spi-miso', function: 'SPI', line, offset: text.indexOf(match[0]) },
                    { pin: 13, type: 'spi-sck', function: 'SPI', line, offset: text.indexOf(match[0]) }
                );
            }
        }

        // Track Serial - pins 0, 1
        if (text.match(/Serial\.begin\s*\(/)) {
            const match = text.match(/Serial\.begin\s*\(/);
            if (match) {
                const line = document.positionAt(text.indexOf(match[0])).line;
                usages.push(
                    { pin: 0, type: 'serial-rx', function: 'Serial', line, offset: text.indexOf(match[0]) },
                    { pin: 1, type: 'serial-tx', function: 'Serial', line, offset: text.indexOf(match[0]) }
                );
            }
        }

        return usages;
    }

    /**
     * Parse pin number from string (handles A0-A5, etc.)
     */
    parsePin(pinStr) {
        if (pinStr.startsWith('A')) {
            return 14 + parseInt(pinStr.substring(1)); // A0 = 14, A1 = 15, etc.
        }
        return parseInt(pinStr);
    }

    /**
     * Build pin map from usages
     */
    buildPinMap(usages) {
        this.pinMap.clear();
        
        for (const usage of usages) {
            if (!this.pinMap.has(usage.pin)) {
                this.pinMap.set(usage.pin, []);
            }
            this.pinMap.get(usage.pin).push(usage);
        }

        return this.detectConflicts();
    }

    /**
     * Detect pin conflicts and return annotated map
     */
    detectConflicts() {
        const annotatedMap = [];

        for (const [pin, usages] of this.pinMap.entries()) {
            const types = usages.map(u => u.type);
            let status = 'valid'; // 'valid', 'warning', 'conflict'
            let message = '';

            // Check for conflicts
            if (usages.length > 1) {
                // Multiple digital uses on same pin
                const hasOutput = types.includes('digital-output') || types.includes('pwm');
                const hasInput = types.includes('digital-input') || types.includes('analog-input');
                
                if (hasOutput && hasInput) {
                    status = 'conflict';
                    message = `Pin ${pin} used as both input and output`;
                }
                
                // Interrupt + digital write conflict
                if (types.includes('interrupt') && types.includes('digital-output')) {
                    status = 'conflict';
                    message = `Pin ${pin} used for interrupt and digitalWrite - may cause issues`;
                }

                // I2C/SPI + digital conflict
                if ((types.includes('i2c-sda') || types.includes('i2c-scl') || 
                     types.includes('spi-ss') || types.includes('spi-mosi') || 
                     types.includes('spi-miso') || types.includes('spi-sck')) &&
                    (types.includes('digital-output') || types.includes('digital-input'))) {
                    status = 'conflict';
                    message = `Pin ${pin} used for both protocol (I2C/SPI) and digital I/O`;
                }

                // Serial + digital conflict
                if ((types.includes('serial-rx') || types.includes('serial-tx')) &&
                    (types.includes('digital-output') || types.includes('digital-input'))) {
                    status = 'warning';
                    message = `Pin ${pin} used for both Serial and digital I/O - disable Serial if using pin`;
                }
            }

            annotatedMap.push({
                pin,
                usages,
                status,
                message,
                primaryType: usages[0].type,
                pinLabel: this.getPinLabel(pin)
            });
        }

        return annotatedMap;
    }

    /**
     * Get human-readable pin label
     */
    getPinLabel(pin) {
        const labels = {
            0: 'D0 (RX)',
            1: 'D1 (TX)',
            2: 'D2',
            3: 'D3 (PWM)',
            4: 'D4',
            5: 'D5 (PWM)',
            6: 'D6 (PWM)',
            7: 'D7',
            8: 'D8',
            9: 'D9 (PWM)',
            10: 'D10 (PWM/SS)',
            11: 'D11 (PWM/MOSI)',
            12: 'D12 (MISO)',
            13: 'D13 (SCK)',
            14: 'A0',
            15: 'A1',
            16: 'A2',
            17: 'A3',
            18: 'A4 (SDA)',
            19: 'A5 (SCL)'
        };
        return labels[pin] || `Pin ${pin}`;
    }

    /**
     * Get pin map for client
     */
    getPinMap() {
        const map = [];
        for (const [pin, usages] of this.pinMap.entries()) {
            map.push({
                pin,
                usages,
                label: this.getPinLabel(pin)
            });
        }
        return map;
    }
}

module.exports = PinTracker;
