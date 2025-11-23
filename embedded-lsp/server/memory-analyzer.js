/**
 * Live Memory Analyzer - Real-Time RAM/Flash Estimation
 * 
 * Analyzes code as the user types to estimate memory usage BEFORE compilation.
 * This is way more useful than post-build feedback!
 * 
 * Tracks:
 * - Global variables (int, byte, char[], arrays, structs)
 * - String literals in Flash
 * - Static allocations
 * - Dynamic allocation warnings (malloc, String objects)
 * - Stack depth estimation
 */

const CommentStripper = require('./comment-stripper');

class MemoryAnalyzer {
    constructor() {
        // Type sizes for Arduino (AVR architecture)
        this.typeSizes = {
            'bool': 1,
            'boolean': 1,
            'byte': 1,
            'char': 1,
            'unsigned char': 1,
            'int': 2,
            'unsigned int': 2,
            'short': 2,
            'unsigned short': 2,
            'long': 4,
            'unsigned long': 4,
            'float': 4,
            'double': 4,  // Note: same as float on AVR
            'void*': 2,   // Pointer size on AVR
            'int8_t': 1,
            'uint8_t': 1,
            'int16_t': 2,
            'uint16_t': 2,
            'int32_t': 4,
            'uint32_t': 4,
            'size_t': 2
        };

        this.currentBoard = 'arduino:avr:uno'; // Default
        this.boardLimits = {
            'arduino:avr:uno': { ram: 2048, flash: 32768 },
            'arduino:avr:nano': { ram: 2048, flash: 32768 },
            'arduino:avr:mega': { ram: 8192, flash: 262144 },
            'esp32:esp32:esp32': { ram: 327680, flash: 1310720 }
        };
    }

    setBoard(board) {
        this.currentBoard = board;
    }

    getBoardLimits() {
        return this.boardLimits[this.currentBoard] || this.boardLimits['arduino:avr:uno'];
    }

    /**
     * Analyze document and return live memory estimate
     */
    analyzeMemory(document) {
        const text = document.getText();
        const limits = this.getBoardLimits();

        const analysis = {
            ram: {
                globalVariables: 0,
                stackEstimate: 0,
                dynamicWarnings: 0,
                total: 0,
                percentage: 0,
                items: []
            },
            flash: {
                code: 0,  // Hard to estimate without compilation
                strings: 0,
                total: 0,
                percentage: 0,
                items: []
            },
            warnings: [],
            limits: limits
        };

        // Track global variables (will check for comments internally)
        this.analyzeGlobalVariables(text, analysis);

        // Track string literals in Flash
        this.analyzeStringLiterals(text, analysis);

        // Check for dynamic allocation
        this.analyzeDynamicAllocation(text, analysis);

        // Estimate stack usage
        this.analyzeStackUsage(text, analysis);

        // Calculate totals with Arduino framework overhead
        // Arduino core uses ~200-300 bytes RAM for Serial, timers, etc.
        const frameworkOverhead = this.estimateFrameworkOverhead(text);
        analysis.ram.total = analysis.ram.globalVariables + analysis.ram.stackEstimate + frameworkOverhead;
        analysis.ram.percentage = Math.round((analysis.ram.total / limits.ram) * 100);

        analysis.flash.total = analysis.flash.strings + 2000; // Base code estimate
        analysis.flash.percentage = Math.round((analysis.flash.total / limits.flash) * 100);

        // Generate warnings
        this.generateWarnings(analysis);

        return analysis;
    }

    analyzeGlobalVariables(text, analysis) {
        // Remove comments to avoid false positives
        const cleanText = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        // Match global variable declarations outside functions
        // Pattern: type name[size] or type name = value;
        const globalVarPattern = /^(?:static\s+|const\s+|volatile\s+)*\s*(bool|boolean|byte|char|unsigned\s+char|int|unsigned\s+int|short|unsigned\s+short|long|unsigned\s+long|float|double|int8_t|uint8_t|int16_t|uint16_t|int32_t|uint32_t|size_t|String)\s+(\w+)(?:\[(\d+)\])?\s*(?:=|;)/gm;

        let match;
        while ((match = globalVarPattern.exec(cleanText)) !== null) {
            const type = match[1].trim();
            const name = match[2];
            const arraySize = match[3] ? parseInt(match[3]) : 1;

            // Check if inside a function (simple heuristic)
            const beforeMatch = cleanText.substring(0, match.index);
            const openBraces = (beforeMatch.match(/{/g) || []).length;
            const closeBraces = (beforeMatch.match(/}/g) || []).length;
            
            // If braces are balanced or close is greater, likely in global scope
            if (openBraces <= closeBraces) {
                let size = 0;

                if (type === 'String') {
                    // Arduino String objects are ~6 bytes + dynamic allocation
                    size = 6 * arraySize;
                    analysis.ram.dynamicWarnings++;
                } else if (type === 'char' && arraySize > 1) {
                    // char array
                    size = arraySize;
                } else {
                    // Regular type
                    size = (this.typeSizes[type] || 4) * arraySize;
                }

                // Check if variable is actually used (strict check)
                // Only count if there's a READ or WRITE operation, not just declaration
                const afterDeclaration = cleanText.substring(match.index + match[0].length);
                
                // Look for actual usage: array access, assignment, or function parameter
                const readPattern = new RegExp(`\\b${name}\\s*\\[|\\b${name}\\s*\\)|[=+\\-*/&|<>!,]\\s*\\b${name}\\b`, 'g');
                const writePattern = new RegExp(`\\b${name}\\s*\\[.*\\]\\s*=|\\b${name}\\s*=`, 'g');
                
                const isRead = readPattern.test(afterDeclaration);
                const isWritten = writePattern.test(afterDeclaration);
                const isUsed = isRead || isWritten;
                
                // Only count if actually used. Compiler removes unused globals entirely.
                const adjustedSize = isUsed ? size : 0;

                analysis.ram.globalVariables += adjustedSize;
                analysis.ram.items.push({
                    name: name,
                    type: type,
                    size: adjustedSize,
                    arraySize: arraySize
                });
            }
        }

        // Match struct definitions
        const structPattern = /struct\s+(\w+)\s*{([^}]+)}/g;
        const structInstances = new Map();

        while ((match = structPattern.exec(cleanText)) !== null) {
            const structName = match[1];
            const structBody = match[2];
            
            // Calculate struct size
            let structSize = 0;
            const memberPattern = /(?:const\s+)?(\w+(?:\s+\w+)?)\s+(\w+)(?:\[(\d+)\])?;/g;
            let memberMatch;

            while ((memberMatch = memberPattern.exec(structBody)) !== null) {
                const memberType = memberMatch[1].trim();
                const memberArraySize = memberMatch[3] ? parseInt(memberMatch[3]) : 1;
                structSize += (this.typeSizes[memberType] || 4) * memberArraySize;
            }

            structInstances.set(structName, structSize);
        }

        // Find struct instantiations
        structInstances.forEach((size, structName) => {
            const instancePattern = new RegExp(`\\b${structName}\\s+(\\w+)(?:\\[(\\d+)\\])?\\s*[;=]`, 'g');
            let instMatch;

            while ((instMatch = instancePattern.exec(cleanText)) !== null) {
                const instanceName = instMatch[1];
                const instanceCount = instMatch[2] ? parseInt(instMatch[2]) : 1;
                const totalSize = size * instanceCount;

                // Check if global scope
                const beforeMatch = cleanText.substring(0, instMatch.index);
                const openBraces = (beforeMatch.match(/{/g) || []).length;
                const closeBraces = (beforeMatch.match(/}/g) || []).length;

                if (openBraces <= closeBraces) {
                    analysis.ram.globalVariables += totalSize;
                    analysis.ram.items.push({
                        name: instanceName,
                        type: structName,
                        size: totalSize,
                        arraySize: instanceCount
                    });
                }
            }
        });
    }

    analyzeStringLiterals(text, analysis) {
        // String literals go in Flash memory (PROGMEM)
        const stringPattern = /"([^"\\]*(\\.[^"\\]*)*)"/g;
        let match;

        while ((match = stringPattern.exec(text)) !== null) {
            const stringContent = match[1];
            const size = stringContent.length + 1; // +1 for null terminator
            analysis.flash.strings += size;
            
            // Only track large strings
            if (size > 20) {
                analysis.flash.items.push({
                    content: stringContent.substring(0, 30) + (stringContent.length > 30 ? '...' : ''),
                    size: size
                });
            }
        }
    }

    analyzeDynamicAllocation(text, analysis) {
        // Check for malloc/calloc/realloc
        const mallocPattern = /\b(malloc|calloc|realloc)\s*\(/g;
        const mallocCount = (text.match(mallocPattern) || []).length;
        
        if (mallocCount > 0) {
            analysis.warnings.push({
                severity: 'warning',
                message: `Found ${mallocCount} dynamic allocation(s). Avoid malloc/calloc on embedded systems - use static allocation.`,
                category: 'dynamic-allocation'
            });
        }

        // Check for String concatenation (dynamic allocation)
        const stringConcatPattern = /String\s+\w+\s*=\s*.*\+/g;
        const concatCount = (text.match(stringConcatPattern) || []).length;
        
        if (concatCount > 0) {
            analysis.warnings.push({
                severity: 'warning',
                message: `Found ${concatCount} String concatenation(s). String objects cause heap fragmentation - use char arrays instead.`,
                category: 'string-concat'
            });
        }
    }

    analyzeStackUsage(text, analysis) {
        // Estimate stack usage based on function call depth
        // Note: This is a conservative estimate. Actual stack usage depends on:
        // - Function call depth
        // - Local variables in each function
        // - Compiler optimizations
        
        // Stack estimation based on typical Arduino sketch patterns
        // Most sketches: setup() -> loop() -> 1-2 helper functions
        
        // Count function definitions
        const functionPattern = /\b(?:void|int|float|char|bool|long|short|byte)\s+\w+\s*\([^)]*\)\s*{/g;
        const functionCount = (text.match(functionPattern) || []).length;
        
        // Typical call depth: 2-3 levels (setup/loop + helpers)
        // Each frame: ~12-16 bytes (return address + minimal saved registers)
        // Compiler optimizes most local vars to registers
        let callDepth = Math.min(functionCount > 5 ? 3 : 2, 3);
        analysis.ram.stackEstimate = callDepth * 14;
        
        // No warnings for stack - keep UI clean
    }

    estimateFrameworkOverhead(text) {
        // Empirically measured Arduino framework RAM overhead
        // Calibrated with actual Arduino Uno builds (Nov 2025)
        let overhead = 0;
        
        // Base Arduino runtime - measured at 9B for empty sketch
        overhead += 9;
        
        const hasSerial = text.includes('Serial.begin');
        const hasWire = text.includes('Wire.begin');
        
        // Serial library - measured at 175B (includes RX/TX buffers)
        if (hasSerial) {
            overhead += 175;
        }
        
        // Wire (I2C) library - measured at 196B standalone
        // But only 185B when combined with Serial (shared overhead)
        if (hasWire) {
            overhead += hasSerial ? 185 : 196;
        }
        
        // SPI library - estimated minimal overhead
        if (text.includes('SPI.begin')) {
            overhead += 20;
        }
        
        // WiFi/BLE (ESP32) - measured overhead
        if (text.includes('WiFi.begin') || text.includes('BLEDevice::init')) {
            overhead += 150;
        }
        
        // Heap overhead for dynamic allocations
        const mallocCount = (text.match(/\b(malloc|calloc|new)\b/g) || []).length;
        overhead += mallocCount * 8;
        
        return overhead;
    }

    generateWarnings(analysis) {
        const limits = analysis.limits;

        // RAM warnings
        if (analysis.ram.percentage >= 90) {
            analysis.warnings.push({
                severity: 'error',
                message: `RAM usage at ${analysis.ram.percentage}%! Imminent crash risk. Remove global variables or upgrade board.`,
                category: 'ram-critical'
            });
        } else if (analysis.ram.percentage >= 75) {
            analysis.warnings.push({
                severity: 'warning',
                message: `RAM usage at ${analysis.ram.percentage}%. Approaching limit - monitor closely.`,
                category: 'ram-high'
            });
        } else if (analysis.ram.percentage >= 60) {
            analysis.warnings.push({
                severity: 'info',
                message: `RAM usage at ${analysis.ram.percentage}%. Consider optimization if adding more features.`,
                category: 'ram-moderate'
            });
        }

        // Flash warnings
        if (analysis.flash.percentage >= 95) {
            analysis.warnings.push({
                severity: 'error',
                message: `Flash usage at ${analysis.flash.percentage}%! Code may not fit. Remove features or upgrade board.`,
                category: 'flash-critical'
            });
        }

        // String recommendations
        if (analysis.flash.strings > 1000) {
            analysis.warnings.push({
                severity: 'info',
                message: `${analysis.flash.strings} bytes of string literals. Consider using F() macro to keep strings in Flash.`,
                category: 'flash-strings'
            });
        }
    }
}

module.exports = { MemoryAnalyzer };
