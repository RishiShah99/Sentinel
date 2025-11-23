/**
 * Hardware Database - The Brain of OrbitIDE's Intelligence
 * 
 * This module maintains comprehensive hardware information for all supported
 * development boards, microcontrollers, and embedded systems.
 */

const fs = require('fs-extra');
const path = require('path');

class HardwareDatabase {
    constructor() {
        this.boards = new Map();
        this.protocols = new Map();
        this.commonLibraries = new Map();
        this.currentBoard = null;
    }
    
    async initialize() {
        const dbPath = path.join(__dirname, '..', 'hardware-db');
        
        // Load board definitions
        await this.loadBoardDefinitions(dbPath);
        
        // Load protocol definitions
        await this.loadProtocolDefinitions(dbPath);
        
        // Load common library definitions
        await this.loadLibraryDefinitions(dbPath);
        
        console.log(`Hardware database initialized: ${this.boards.size} boards, ${this.protocols.size} protocols`);
    }
    
    async loadBoardDefinitions(dbPath) {
        const boardsPath = path.join(dbPath, 'boards');
        
        if (!await fs.pathExists(boardsPath)) {
            console.warn('Boards directory not found, creating with defaults...');
            await this.createDefaultBoards(boardsPath);
        }
        
        const boardFiles = await fs.readdir(boardsPath);
        
        for (const file of boardFiles) {
            if (file.endsWith('.json')) {
                const boardData = await fs.readJSON(path.join(boardsPath, file));
                const boardId = path.basename(file, '.json');
                this.boards.set(boardId, boardData);
            }
        }
    }
    
    async loadProtocolDefinitions(dbPath) {
        const protocolsPath = path.join(dbPath, 'protocols');
        
        if (!await fs.pathExists(protocolsPath)) {
            await this.createDefaultProtocols(protocolsPath);
        }
        
        const protocolFiles = await fs.readdir(protocolsPath);
        
        for (const file of protocolFiles) {
            if (file.endsWith('.json')) {
                const protocolData = await fs.readJSON(path.join(protocolsPath, file));
                const protocolId = path.basename(file, '.json');
                this.protocols.set(protocolId, protocolData);
            }
        }
    }
    
    async loadLibraryDefinitions(dbPath) {
        const librariesPath = path.join(dbPath, 'libraries');
        
        if (!await fs.pathExists(librariesPath)) {
            await this.createDefaultLibraries(librariesPath);
        }
        
        // Load common libraries like Arduino core, Wire, SPI, etc.
        const libraryFiles = await fs.readdir(librariesPath);
        
        for (const file of libraryFiles) {
            if (file.endsWith('.json')) {
                const libraryData = await fs.readJSON(path.join(librariesPath, file));
                const libraryId = path.basename(file, '.json');
                this.commonLibraries.set(libraryId, libraryData);
            }
        }
    }
    
    async createDefaultBoards(boardsPath) {
        await fs.ensureDir(boardsPath);
        
        // Arduino Uno definition
        const arduinoUno = {
            "name": "Arduino Uno",
            "mcu": "ATmega328P",
            "architecture": "avr",
            "flashSize": 32768,
            "ramSize": 2048,
            "eepromSize": 1024,
            "clockSpeed": 16000000,
            "pins": {
                "digital": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                "analog": [14, 15, 16, 17, 18, 19], // A0-A5
                "pwm": [3, 5, 6, 9, 10, 11],
                "interrupts": [2, 3]
            },
            "peripherals": {
                "uart": [
                    {"pins": [0, 1], "name": "Serial", "baud": [9600, 115200]}
                ],
                "spi": [
                    {"pins": [10, 11, 12, 13], "name": "SPI"}
                ],
                "i2c": [
                    {"pins": [18, 19], "name": "Wire", "addresses": {"min": 8, "max": 119}}
                ]
            },
            "registers": {
                "PORTB": {
                    "address": "0x25",
                    "bits": {
                        "PB0": 0, "PB1": 1, "PB2": 2, "PB3": 3,
                        "PB4": 4, "PB5": 5
                    }
                },
                "PORTC": {
                    "address": "0x28", 
                    "bits": {
                        "PC0": 0, "PC1": 1, "PC2": 2, "PC3": 3,
                        "PC4": 4, "PC5": 5
                    }
                },
                "PORTD": {
                    "address": "0x2B",
                    "bits": {
                        "PD0": 0, "PD1": 1, "PD2": 2, "PD3": 3,
                        "PD4": 4, "PD5": 5, "PD6": 6, "PD7": 7
                    }
                }
            },
            "constraints": {
                "maxStackDepth": 1500,
                "maxISRTime": 50,
                "maxLoopTime": 16.67
            }
        };
        
        await fs.writeJSON(path.join(boardsPath, 'arduino-uno.json'), arduinoUno, { spaces: 2 });
        
        // ESP32 definition
        const esp32 = {
            "name": "ESP32 DevKit",
            "mcu": "ESP32",
            "architecture": "xtensa",
            "flashSize": 4194304,
            "ramSize": 520192,
            "clockSpeed": 240000000,
            "pins": {
                "digital": [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
                "analog": [32, 33, 34, 35, 36, 39],
                "pwm": [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27],
                "touch": [0, 2, 4, 12, 13, 14, 15, 27, 32, 33]
            },
            "peripherals": {
                "uart": [
                    {"pins": [1, 3], "name": "Serial"},
                    {"pins": [16, 17], "name": "Serial2"}
                ],
                "spi": [
                    {"pins": [18, 19, 23, 5], "name": "SPI"}
                ],
                "i2c": [
                    {"pins": [21, 22], "name": "Wire"}
                ],
                "wifi": {"enabled": true},
                "bluetooth": {"enabled": true}
            },
            "constraints": {
                "maxStackDepth": 8000,
                "maxISRTime": 100,
                "maxLoopTime": 1000
            }
        };
        
        await fs.writeJSON(path.join(boardsPath, 'esp32-devkit.json'), esp32, { spaces: 2 });
    }
    
    async createDefaultProtocols(protocolsPath) {
        await fs.ensureDir(protocolsPath);
        
        // I2C Protocol
        const i2c = {
            "name": "I2C (Inter-Integrated Circuit)",
            "description": "Two-wire serial communication protocol",
            "functions": {
                "begin": {
                    "signature": "Wire.begin()",
                    "description": "Initialize I2C bus as master",
                    "parameters": []
                },
                "beginTransmission": {
                    "signature": "Wire.beginTransmission(address)",
                    "description": "Start I2C transmission to device",
                    "parameters": [
                        {"name": "address", "type": "uint8_t", "description": "7-bit I2C address"}
                    ]
                },
                "write": {
                    "signature": "Wire.write(data)",
                    "description": "Write data to I2C device",
                    "parameters": [
                        {"name": "data", "type": "uint8_t", "description": "Data byte to send"}
                    ]
                },
                "endTransmission": {
                    "signature": "Wire.endTransmission()",
                    "description": "End I2C transmission",
                    "returns": "uint8_t error code (0 = success)"
                }
            },
            "commonAddresses": {
                "0x27": "LCD Display (PCF8574)",
                "0x48": "Temperature Sensor (LM75)",
                "0x50": "EEPROM (24C32)",
                "0x68": "Real-Time Clock (DS1307)"
            },
            "constraints": {
                "maxSpeed": 400000,
                "addressRange": {"min": 8, "max": 119}
            }
        };
        
        await fs.writeJSON(path.join(protocolsPath, 'i2c.json'), i2c, { spaces: 2 });
        
        // SPI Protocol
        const spi = {
            "name": "SPI (Serial Peripheral Interface)",
            "description": "Four-wire serial communication protocol",
            "functions": {
                "begin": {
                    "signature": "SPI.begin()",
                    "description": "Initialize SPI bus",
                    "parameters": []
                },
                "beginTransaction": {
                    "signature": "SPI.beginTransaction(settings)",
                    "description": "Start SPI transaction with specific settings",
                    "parameters": [
                        {"name": "settings", "type": "SPISettings", "description": "SPI configuration"}
                    ]
                },
                "transfer": {
                    "signature": "SPI.transfer(data)",
                    "description": "Transfer data via SPI",
                    "parameters": [
                        {"name": "data", "type": "uint8_t", "description": "Data to send"}
                    ],
                    "returns": "uint8_t received data"
                }
            },
            "modes": {
                "SPI_MODE0": "Clock idle low, data sampled on rising edge",
                "SPI_MODE1": "Clock idle low, data sampled on falling edge", 
                "SPI_MODE2": "Clock idle high, data sampled on falling edge",
                "SPI_MODE3": "Clock idle high, data sampled on rising edge"
            },
            "constraints": {
                "maxSpeed": 8000000,
                "dataOrder": ["MSBFIRST", "LSBFIRST"]
            }
        };
        
        await fs.writeJSON(path.join(protocolsPath, 'spi.json'), spi, { spaces: 2 });
    }
    
    async createDefaultLibraries(librariesPath) {
        await fs.ensureDir(librariesPath);
        
        // Arduino Core Library
        const arduinoCore = {
            "name": "Arduino Core",
            "description": "Core Arduino functions and definitions",
            "functions": {
                "pinMode": {
                    "signature": "void pinMode(uint8_t pin, uint8_t mode)",
                    "description": "Configure pin as input or output",
                    "parameters": [
                        {"name": "pin", "type": "uint8_t", "description": "Pin number"},
                        {"name": "mode", "type": "uint8_t", "description": "INPUT, OUTPUT, or INPUT_PULLUP"}
                    ],
                    "constraints": ["Pin must be valid digital pin"]
                },
                "digitalWrite": {
                    "signature": "void digitalWrite(uint8_t pin, uint8_t value)",
                    "description": "Write HIGH or LOW to digital pin",
                    "parameters": [
                        {"name": "pin", "type": "uint8_t", "description": "Pin number"},
                        {"name": "value", "type": "uint8_t", "description": "HIGH or LOW"}
                    ],
                    "constraints": ["Pin must be configured as OUTPUT"]
                },
                "digitalRead": {
                    "signature": "int digitalRead(uint8_t pin)",
                    "description": "Read value from digital pin",
                    "parameters": [
                        {"name": "pin", "type": "uint8_t", "description": "Pin number"}
                    ],
                    "returns": "HIGH or LOW",
                    "constraints": ["Pin must be configured as INPUT"]
                },
                "analogRead": {
                    "signature": "int analogRead(uint8_t pin)",
                    "description": "Read analog value from pin",
                    "parameters": [
                        {"name": "pin", "type": "uint8_t", "description": "Analog pin number (A0-A5)"}
                    ],
                    "returns": "Value from 0 to 1023",
                    "constraints": ["Pin must be analog-capable"]
                },
                "delay": {
                    "signature": "void delay(unsigned long ms)",
                    "description": "Pause execution for specified milliseconds",
                    "parameters": [
                        {"name": "ms", "type": "unsigned long", "description": "Milliseconds to delay"}
                    ],
                    "constraints": ["Blocks execution - use sparingly in interrupts"]
                }
            },
            "constants": {
                "HIGH": "Digital high state (5V or 3.3V)",
                "LOW": "Digital low state (0V)",
                "INPUT": "Configure pin as input",
                "OUTPUT": "Configure pin as output",
                "INPUT_PULLUP": "Configure pin as input with pullup resistor"
            }
        };
        
        await fs.writeJSON(path.join(librariesPath, 'arduino-core.json'), arduinoCore, { spaces: 2 });
    }
    
    // API Methods
    loadBoard(boardId) {
        this.currentBoard = this.boards.get(boardId);
        return this.currentBoard;
    }
    
    getCurrentBoard() {
        return this.currentBoard;
    }
    
    getBoard(boardId) {
        return this.boards.get(boardId);
    }
    
    getProtocol(protocolId) {
        return this.protocols.get(protocolId);
    }
    
    getLibrary(libraryId) {
        return this.commonLibraries.get(libraryId);
    }
    
    // Hardware validation methods
    isPinValid(pin, type = 'digital') {
        if (!this.currentBoard) return false;
        
        const pins = this.currentBoard.pins[type];
        return pins && pins.includes(pin);
    }
    
    isPinCapable(pin, capability) {
        if (!this.currentBoard) return false;
        
        const pins = this.currentBoard.pins[capability];
        return pins && pins.includes(pin);
    }
    
    getI2CAddressConflicts(address) {
        const i2c = this.protocols.get('i2c');
        if (!i2c) return [];
        
        const conflicts = [];
        for (const [addr, device] of Object.entries(i2c.commonAddresses)) {
            if (parseInt(addr, 16) === address) {
                conflicts.push(device);
            }
        }
        
        return conflicts;
    }
    
    validateConstraints(type, value) {
        if (!this.currentBoard || !this.currentBoard.constraints) return true;
        
        const constraints = this.currentBoard.constraints;
        
        switch (type) {
            case 'stackDepth':
                return value <= constraints.maxStackDepth;
            case 'isrTime':
                return value <= constraints.maxISRTime;
            case 'loopTime':
                return value <= constraints.maxLoopTime;
            default:
                return true;
        }
    }

    /**
     * Get I2C device completions for autocomplete
     */
    getI2CCompletions(prefix = '') {
        const completions = [];
        
        // Common I2C devices database
        const i2cDevices = [
            { address: 0x68, name: 'MPU6050', description: 'Gyroscope + Accelerometer' },
            { address: 0x69, name: 'MPU6050 (ALT)', description: 'Gyroscope + Accelerometer (alternate)' },
            { address: 0x76, name: 'BMP280', description: 'Barometric Pressure Sensor' },
            { address: 0x77, name: 'BMP280/BMP180 (ALT)', description: 'Pressure Sensor (alternate)' },
            { address: 0x3C, name: 'OLED Display', description: 'SSD1306 128x64 OLED' },
            { address: 0x3D, name: 'OLED Display (ALT)', description: 'SSD1306 (alternate)' },
            { address: 0x48, name: 'ADS1115', description: '16-bit ADC' },
            { address: 0x49, name: 'ADS1115 (ALT)', description: '16-bit ADC (alternate)' },
            { address: 0x50, name: 'AT24C32', description: 'EEPROM' },
            { address: 0x27, name: 'LCD Display', description: 'I2C LCD Backpack' },
            { address: 0x20, name: 'MCP23017', description: 'I/O Expander' },
            { address: 0x40, name: 'PCA9685', description: '16-Channel PWM Driver' },
            { address: 0x5A, name: 'MLX90614', description: 'Infrared Thermometer' },
            { address: 0x29, name: 'VL53L0X', description: 'Time-of-Flight Distance Sensor' },
            { address: 0x44, name: 'SHT31', description: 'Temperature + Humidity' },
            { address: 0x1E, name: 'HMC5883L', description: 'Magnetometer (Compass)' },
            { address: 0x1D, name: 'ADXL345', description: 'Accelerometer' },
            { address: 0x53, name: 'ADXL345 (ALT)', description: 'Accelerometer (alternate)' },
            { address: 0x39, name: 'TSL2561', description: 'Light Sensor' },
            { address: 0x23, name: 'BH1750', description: 'Light Sensor' },
            { address: 0x28, name: 'CAP1188', description: 'Capacitive Touch' },
            { address: 0x70, name: 'TCA9548A', description: 'I2C Multiplexer' }
        ];

        i2cDevices.forEach(device => {
            const hexAddr = '0x' + device.address.toString(16).toUpperCase().padStart(2, '0');
            
            // Filter by prefix
            if (!prefix || hexAddr.startsWith(prefix) || device.name.toLowerCase().includes(prefix.toLowerCase())) {
                completions.push({
                    label: hexAddr,
                    kind: 12, // Value
                    detail: device.name,
                    documentation: `${device.description}\nI2C Address: ${hexAddr} (${device.address})`,
                    insertText: hexAddr,
                    sortText: hexAddr
                });
            }
        });

        return completions;
    }

    /**
     * Check for I2C address conflicts
     */
    checkI2CConflicts(addresses) {
        const conflicts = [];
        const addressCount = new Map();

        addresses.forEach(addr => {
            addressCount.set(addr, (addressCount.get(addr) || 0) + 1);
        });

        addressCount.forEach((count, addr) => {
            if (count > 1) {
                conflicts.push({
                    address: addr,
                    count: count,
                    message: `I2C address ${addr} used by ${count} devices - this will cause bus conflicts!`
                });
            }
        });

        return conflicts;
    }
}

module.exports = HardwareDatabase;
