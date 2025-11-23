# OrbitIDE Hardware Database

The hardware database is the intelligence foundation that powers OrbitIDE's revolutionary Language Server Protocol (LSP) capabilities. Unlike traditional IDEs that only understand code syntax, OrbitIDE understands **hardware constraints, peripheral capabilities, and embedded system limitations at the silicon level**.

## 🚀 What Makes This Revolutionary

Traditional IDEs provide generic C++ completions. OrbitIDE provides **hardware-aware embedded intelligence**:

- **Pin-Level Awareness**: Knows that pin 13 on Arduino Uno is both a digital I/O *and* the built-in LED, that pins 3,5,6,9,10,11 support PWM, and that A4/A5 are I2C-only
- **Protocol Intelligence**: Validates I2C addresses in real-time (warns about reserved 0x00-0x07), suggests device names from address (0x68 = "MPU6050 or DS1307"), checks SPI mode configurations
- **Register-Level Knowledge**: Understands ATmega328P registers (PORTB, PORTC, PORTD bit mappings), ESP32 peripheral registers, timer configurations
- **Constraint Checking**: Warns about 40mA max current per pin, 2KB RAM limits, ESP32 strapping pins (0,2,5,12,15), input-only GPIO (34-39)
- **Device Database**: Knows common I2C devices at every address, their typical configurations, and initialization sequences

## 📁 Directory Structure

```
embedded-lsp/hardware-db/
├── boards/              # Board definitions with complete hardware specifications
│   ├── arduino-uno.json       # ATmega328P: pins, registers, timers, constraints
│   └── esp32-dev.json         # ESP32: GPIO, WiFi, BT, peripherals, warnings
├── protocols/           # Communication protocol specifications
│   ├── i2c.json              # I2C/Wire: addressing, devices, error codes
│   ├── spi.json              # SPI: modes, timing, multi-device management
│   └── uart.json             # Serial: baud rates, config, common devices
└── libraries/           # Arduino library API documentation
    ├── arduino-core.json     # Core functions: pinMode, digitalWrite, analogRead
    ├── Wire.json             # I2C library with complete API
    ├── SPI.json              # SPI library with SPISettings details
    └── WiFi-ESP32.json       # ESP32 WiFi with power management
```

## 🔧 Board Definitions

Board definitions provide comprehensive hardware specifications that enable pin-level code intelligence.

### Arduino Uno (`boards/arduino-uno.json`)

**173 lines** of detailed hardware specifications:

```json
{
  "name": "Arduino Uno",
  "mcu": "ATmega328P",
  "architecture": "avr",
  "pins": {
    "digital": [
      {
        "number": 13,
        "capabilities": ["digital", "pwm", "spi_sck", "led_builtin"],
        "description": "Digital pin 13, PWM, SPI SCK, Built-in LED"
      }
      // ... 13 more digital pins with full capability mapping
    ],
    "analog": [
      {
        "number": "A4",
        "capabilities": ["analog", "digital", "i2c_sda"],
        "adc_channel": 4,
        "description": "Analog input A4, also used for I2C SDA"
      }
      // ... 5 more analog pins
    ]
  },
  "registers": {
    "PORTB": "Digital pins 8-13 (bits 0-5)",
    "PORTC": "Analog pins A0-A5 (bits 0-5)",
    "PORTD": "Digital pins 0-7 (bits 0-7)"
  },
  "timers": {
    "Timer0": "8-bit, used by millis(), affects pins 5, 6",
    "Timer1": "16-bit, high resolution, affects pins 9, 10",
    "Timer2": "8-bit, independent, affects pins 3, 11"
  },
  "constraints": {
    "maxCurrentPerPin": "40mA absolute maximum, 20mA recommended",
    "totalMaxCurrent": "200mA for all I/O pins combined",
    "ram": "2KB SRAM (global variables + stack + heap)",
    "flash": "32KB program memory (0.5KB used by bootloader)"
  }
}
```

**LSP Features Enabled**:
- Suggests PWM-capable pins when user types `analogWrite(`
- Warns when using pin 0/1 (conflicts with Serial)
- Shows register bit mappings for direct port manipulation
- Validates current draw calculations
- Warns about RAM constraints for String operations

### ESP32 DevKit (`boards/esp32-dev.json`)

**195 lines** covering ESP32's advanced capabilities:

```json
{
  "name": "ESP32 DevKit",
  "mcu": "ESP32-WROOM-32",
  "cores": 2,
  "cpuFrequency": [80, 160, 240],
  "pins": {
    "gpio": [
      {
        "number": 0,
        "capabilities": ["digital", "adc2_ch1", "touch1", "rtc_gpio11"],
        "strapping": true,
        "bootMode": "Must be HIGH during boot",
        "warnings": ["Strapping pin - use with caution"]
      }
      // ... 25 more GPIO with detailed capabilities
    ],
    "inputOnly": [34, 35, 36, 39],
    "strappingPins": [0, 2, 5, 12, 15]
  },
  "peripherals": {
    "wifi": {
      "standards": ["802.11 b/g/n"],
      "frequency": "2.4 GHz only (no 5GHz)",
      "modes": ["Station", "AP", "Station+AP"]
    },
    "bluetooth": {
      "classic": true,
      "ble": true
    },
    "touch": {
      "channels": 10,
      "pins": [0, 2, 4, 12, 13, 14, 15, 27, 32, 33]
    },
    "dac": {
      "channels": 2,
      "pins": [25, 26],
      "resolution": "8-bit"
    }
  },
  "powerConsumption": {
    "active_wifi": "120-240mA (peak)",
    "light_sleep": "0.8mA",
    "deep_sleep": "10µA"
  }
}
```

**LSP Features Enabled**:
- Warns about strapping pins that affect boot behavior
- Shows which pins support ADC2 (conflicts with WiFi)
- Identifies input-only GPIO (can't be outputs)
- Suggests appropriate pins for capacitive touch
- Displays power consumption for different modes
- Validates WiFi configuration (2.4GHz only, no 5GHz)

## 📡 Protocol Definitions

Protocol definitions enable intelligent code completion for communication interfaces.

### I2C Protocol (`protocols/i2c.json`)

**122 lines** of I2C intelligence:

```json
{
  "name": "I2C (Inter-Integrated Circuit)",
  "pins": {
    "arduino-uno": {"SDA": "A4", "SCL": "A5"},
    "esp32": {"SDA": 21, "SCL": 22}
  },
  "addressing": {
    "bits": 7,
    "range": "0x08 to 0x77",
    "reserved": {
      "0x00-0x07": "Reserved for special purposes",
      "0x78-0x7F": "10-bit addressing and reserved"
    }
  },
  "commonDevices": [
    {
      "address": "0x68",
      "devices": ["MPU6050", "DS1307", "DS3231"],
      "description": "6-axis motion sensor or RTC"
    },
    {
      "address": "0x76",
      "devices": ["BMP280", "BME280"],
      "description": "Pressure/temperature sensor"
    }
    // ... 12 more common device addresses
  ],
  "errorCodes": {
    "0": "Success",
    "1": "Data too long for buffer",
    "2": "NACK on address (device not found)",
    "3": "NACK on data transmission",
    "4": "Other error",
    "5": "Timeout (ESP32 only)"
  }
}
```

**LSP Features Enabled**:
- Real-time I2C address validation (warns if outside 0x08-0x77)
- Device name suggestions when typing addresses (0x68 → "MPU6050")
- Error code interpretation for `Wire.endTransmission()` return values
- Pull-up resistor requirement warnings
- Clock speed recommendations (100kHz standard, 400kHz fast)

### SPI Protocol (`protocols/spi.json`)

**106 lines** covering SPI configuration:

```json
{
  "modes": {
    "SPI_MODE0": {
      "CPOL": 0,
      "CPHA": 0,
      "description": "Clock idle LOW, data sampled on rising edge (most common)"
    }
    // ... modes 1-3
  },
  "commonDevices": [
    {
      "name": "SD Card",
      "clockSpeed": "4-25 MHz",
      "mode": "SPI_MODE0",
      "notes": "Start at 400kHz during initialization"
    },
    {
      "name": "NRF24L01 Radio",
      "clockSpeed": "0-10 MHz",
      "mode": "SPI_MODE0"
    }
  ],
  "bestPractices": {
    "csManagement": "Always control CS pin manually with digitalWrite",
    "transactions": "Use beginTransaction()/endTransaction() for multi-device setups"
  }
}
```

**LSP Features Enabled**:
- SPI mode suggestions with CPOL/CPHA explanations
- Clock speed recommendations per device type
- CS pin management warnings
- Multi-device configuration patterns

### UART/Serial (`protocols/uart.json`)

**150+ lines** of serial communication intelligence:

```json
{
  "baudRates": {
    "common": [9600, 115200],
    "recommended": {
      "debugging": 115200,
      "gps": 9600,
      "bluetooth": 9600
    }
  },
  "commonDevices": [
    {
      "name": "GPS Module",
      "baudRate": 9600,
      "protocol": "NMEA sentences"
    },
    {
      "name": "Bluetooth HC-05",
      "baudRate": 9600,
      "protocol": "AT commands"
    }
  ],
  "troubleshooting": {
    "garbageCharacters": [
      "Baud rate mismatch",
      "Cable too long for baud rate",
      "Voltage level mismatch (3.3V vs 5V)"
    ]
  }
}
```

## 📚 Library Definitions

Library definitions provide complete API documentation with examples and warnings.

### Arduino Core (`libraries/arduino-core.json`)

Complete documentation for fundamental Arduino functions:

- `pinMode()`, `digitalWrite()`, `digitalRead()`
- `analogRead()`, `analogWrite()` with PWM explanations
- `delay()`, `delayMicroseconds()`, `millis()`, `micros()`
- Constants: `HIGH`, `LOW`, `INPUT`, `OUTPUT`, `INPUT_PULLUP`

Each function includes:
- Full signature with parameter types
- Parameter descriptions
- Return value documentation
- Multiple code examples
- Notes about behavior and limitations
- Warnings about common pitfalls
- Best practice recommendations

**Example**:
```json
{
  "analogWrite": {
    "signature": "void analogWrite(uint8_t pin, int value)",
    "description": "Output PWM signal to a pin",
    "parameters": [
      {"name": "pin", "description": "PWM-capable pin number"},
      {"name": "value", "description": "Duty cycle 0-255"}
    ],
    "examples": [
      "analogWrite(9, 128);  // 50% duty cycle"
    ],
    "notes": [
      "Only works on PWM pins (marked with ~)",
      "Does NOT output actual analog voltage"
    ],
    "warnings": [
      "Not all pins support PWM",
      "Timer conflicts can affect multiple pins"
    ]
  }
}
```

### Wire Library (`libraries/Wire.json`)

**200+ lines** of I2C library documentation:

- Complete function signatures for `begin()`, `beginTransmission()`, `write()`, `read()`, etc.
- Common patterns: write register, read register, multi-byte reads
- Error checking examples
- Buffer size limitations (32 bytes Uno, 128 bytes ESP32)
- Pull-up resistor requirements
- Troubleshooting guide

### WiFi Library ESP32 (`libraries/WiFi-ESP32.json`)

**250+ lines** covering ESP32 WiFi:

- Connection management: `begin()`, `status()`, `disconnect()`
- Network scanning and RSSI interpretation
- Access Point mode configuration
- Static IP vs DHCP setup
- Power management and sleep modes
- Signal strength quality assessment
- Common troubleshooting scenarios

## 🎯 How the LSP Uses This Database

### 1. Code Completion

When you type `Wire.begin(`, the LSP:
1. Loads `Wire.json` library definition
2. Finds all `begin()` function signatures
3. Shows current board's I2C pins from `arduino-uno.json` or `esp32-dev.json`
4. Provides inline documentation and examples

### 2. Real-Time Validation

When you write `Wire.beginTransmission(0x05);`:
1. Checks `i2c.json` for valid address range (0x08-0x77)
2. Sees 0x05 is in reserved range 0x00-0x07
3. Shows warning: "Address 0x05 is reserved, use 0x08-0x77"

### 3. Device Suggestions

When you type `0x68` in I2C context:
1. Looks up address in `i2c.json` common devices
2. Suggests: "0x68: MPU6050 (motion sensor), DS1307 (RTC), DS3231 (RTC)"
3. Offers code snippets for initialization

### 4. Pin Warnings

When you use `pinMode(0, OUTPUT);` on ESP32:
1. Checks `esp32-dev.json` for pin 0 properties
2. Sees `"strapping": true` and boot mode requirement
3. Warns: "GPIO 0 is strapping pin, must be HIGH during boot"

### 5. Constraint Checking

When declaring large arrays on Arduino Uno:
1. Monitors total variable size
2. Compares to 2KB RAM limit from `arduino-uno.json`
3. Warns: "Using 1.8KB of 2KB available RAM"

## 🔄 Extending the Database

### Adding a New Board

Create `embedded-lsp/hardware-db/boards/arduino-mega.json`:

```json
{
  "name": "Arduino Mega 2560",
  "mcu": "ATmega2560",
  "architecture": "avr",
  "flashSize": 262144,
  "ramSize": 8192,
  "pins": {
    "digital": [
      // Define all 54 digital pins
    ],
    "analog": [
      // Define all 16 analog pins
    ]
  },
  "i2c": {"SDA": 20, "SCL": 21},
  "spi": {"MOSI": 51, "MISO": 50, "SCK": 52, "SS": 53},
  "serial": {
    "Serial": {"RX": 0, "TX": 1},
    "Serial1": {"RX": 19, "TX": 18},
    "Serial2": {"RX": 17, "TX": 16},
    "Serial3": {"RX": 15, "TX": 14}
  }
}
```

The LSP automatically loads it on startup!

### Adding a New Library

Create `embedded-lsp/hardware-db/libraries/Servo.json`:

```json
{
  "id": "servo",
  "name": "Servo Library",
  "include": "#include <Servo.h>",
  "functions": {
    "attach": {
      "signature": "uint8_t attach(int pin, int min, int max)",
      "description": "Attach servo to pin",
      "parameters": [
        {"name": "pin", "type": "int", "description": "Digital pin"},
        {"name": "min", "type": "int", "description": "Min pulse width (µs)"},
        {"name": "max", "type": "int", "description": "Max pulse width (µs)"}
      ],
      "examples": [
        "myServo.attach(9);  // Attach to pin 9",
        "myServo.attach(9, 1000, 2000);  // Custom pulse widths"
      ]
    }
  }
}
```

### Adding Protocol Devices

Edit `i2c.json` to add new common devices:

```json
{
  "address": "0x40",
  "devices": ["PCA9685"],
  "description": "16-channel PWM driver",
  "initialization": [
    "Wire.beginTransmission(0x40);",
    "Wire.write(0x00);  // MODE1 register",
    "Wire.write(0x20);  // Enable auto-increment",
    "Wire.endTransmission();"
  ]
}
```

## 📊 Database Statistics

Current hardware database size:

| Category | Files | Lines | Features |
|----------|-------|-------|----------|
| **Boards** | 2 | 368 | 40 pins, 8 peripherals, 20+ constraints |
| **Protocols** | 3 | 378 | 30 devices, 15 error codes, 50+ best practices |
| **Libraries** | 4 | 1,200+ | 50+ functions, 100+ examples, 200+ notes |
| **Total** | 9 | 1,946+ | Complete embedded intelligence |

## 🚀 Revolutionary Features Summary

The hardware database enables OrbitIDE to provide intelligence that no other IDE offers:

1. **Hardware Constraint Awareness**: Knows voltage limits, current limits, RAM/Flash sizes
2. **Pin-Level Intelligence**: Understands every pin's capabilities and limitations
3. **Protocol Validation**: Real-time checking of I2C addresses, SPI modes, baud rates
4. **Device Recognition**: Identifies devices from I2C addresses automatically
5. **Register Knowledge**: Understands microcontroller registers and bit mappings
6. **Power Analysis**: Estimates power consumption for different configurations
7. **Timing Intelligence**: Knows PWM frequencies, timer conflicts, interrupt limitations
8. **Best Practices**: Suggests proper initialization sequences and error handling
9. **Troubleshooting**: Provides context-aware debugging suggestions
10. **Board-Specific Warnings**: ESP32 strapping pins, Arduino Uno RAM limits, etc.

## 📖 Next Steps

- **Test the LSP**: Open an Arduino sketch and start typing `Wire.` to see completions
- **Try Examples**: Open `examples/i2c_multi_sensor_dashboard.ino` to see LSP features
- **Add Your Board**: Create a JSON file for your favorite development board
- **Contribute**: Add library definitions for common Arduino libraries

This hardware database transforms OrbitIDE from a code editor into a **true embedded development assistant** that understands your hardware as deeply as your code! 🎉
