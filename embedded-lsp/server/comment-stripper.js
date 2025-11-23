/**
 * Utility to strip C/C++ comments from source code
 * Handles single-line (//) and multi-line (slash-star star-slash) comments
 * Preserves string literals to avoid false positives
 */

class CommentStripper {
    /**
     * Remove all comments from C/C++ source code
     * @param {string} code - The source code
     * @returns {string} - Code with comments removed (replaced with spaces to preserve positions)
     */
    static strip(code) {
        let result = '';
        let i = 0;
        let inString = false;
        let inChar = false;
        let stringChar = '';
        
        while (i < code.length) {
            const char = code[i];
            const next = code[i + 1];
            
            // Handle escape sequences in strings
            if ((inString || inChar) && char === '\\') {
                result += char + (next || '');
                i += 2;
                continue;
            }
            
            // Track string literals
            if (!inChar && char === '"') {
                inString = !inString;
                result += char;
                i++;
                continue;
            }
            
            // Track char literals
            if (!inString && char === "'") {
                inChar = !inChar;
                result += char;
                i++;
                continue;
            }
            
            // Skip comment processing if inside string/char
            if (inString || inChar) {
                result += char;
                i++;
                continue;
            }
            
            // Multi-line comment
            if (char === '/' && next === '*') {
                // Replace with spaces to preserve line/column positions
                result += ' ';
                i += 2;
                
                // Find end of comment
                while (i < code.length) {
                    if (code[i] === '\n') {
                        result += '\n'; // Preserve newlines for line numbers
                    } else {
                        result += ' ';
                    }
                    
                    if (code[i] === '*' && code[i + 1] === '/') {
                        result += ' ';
                        i += 2;
                        break;
                    }
                    i++;
                }
                continue;
            }
            
            // Single-line comment
            if (char === '/' && next === '/') {
                // Replace with spaces until newline
                result += ' ';
                i += 2;
                
                while (i < code.length && code[i] !== '\n') {
                    result += ' ';
                    i++;
                }
                
                // Include the newline
                if (i < code.length && code[i] === '\n') {
                    result += '\n';
                    i++;
                }
                continue;
            }
            
            // Normal character
            result += char;
            i++;
        }
        
        return result;
    }
    
    /**
     * Check if a specific position in the original code is within a comment
     * @param {string} code - The original source code
     * @param {number} position - The character position to check
     * @returns {boolean} - True if position is in a comment
     */
    static isInComment(code, position) {
        let i = 0;
        let inString = false;
        let inChar = false;
        
        while (i < position) {
            const char = code[i];
            const next = code[i + 1];
            
            // Handle escape sequences
            if ((inString || inChar) && char === '\\') {
                i += 2;
                continue;
            }
            
            // Track strings
            if (!inChar && char === '"') {
                inString = !inString;
                i++;
                continue;
            }
            
            // Track chars
            if (!inString && char === "'") {
                inChar = !inChar;
                i++;
                continue;
            }
            
            // Skip if inside string/char
            if (inString || inChar) {
                i++;
                continue;
            }
            
            // Multi-line comment
            if (char === '/' && next === '*') {
                const commentStart = i;
                i += 2;
                
                // Find end of comment
                while (i < code.length) {
                    if (code[i] === '*' && code[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
                
                // Check if position is within this comment
                if (position >= commentStart && position < i) {
                    return true;
                }
                continue;
            }
            
            // Single-line comment
            if (char === '/' && next === '/') {
                const commentStart = i;
                i += 2;
                
                // Find end of line
                while (i < code.length && code[i] !== '\n') {
                    i++;
                }
                
                // Check if position is within this comment
                if (position >= commentStart && position < i) {
                    return true;
                }
                
                if (i < code.length) i++; // Skip newline
                continue;
            }
            
            i++;
        }
        
        return false;
    }
}

module.exports = CommentStripper;
