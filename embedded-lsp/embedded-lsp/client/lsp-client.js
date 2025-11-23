/**
 * Monaco Editor LSP Client Integration
 * 
 * This module integrates the embedded LSP server with Monaco Editor
 * to provide revolutionary code intelligence for embedded development.
 */

import * as monaco from 'monaco-editor';
import { MessageConnection, createMessageConnection, BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver-protocol/browser';

class EmbeddedLSPClient {
    constructor() {
        this.connection = null;
        this.isInitialized = false;
        this.diagnosticsHandler = null;
        this.currentEditor = null;
        this.currentBoardType = 'arduino-uno';
    }
    
    async initialize() {
        try {
            // Create connection to LSP server
            await this.connectToLSPServer();
            
            // Register Monaco language features
            this.registerCompletionProvider();
            this.registerHoverProvider();
            this.registerDiagnosticsProvider();
            
            // Set up document synchronization
            this.setupDocumentSync();
            
            console.log('OrbitIDE Embedded LSP Client initialized');
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Failed to initialize Embedded LSP Client:', error);
        }
    }
    
    async connectToLSPServer() {
        // For Electron, we'll use IPC to communicate with the LSP server
        // The main process will spawn the LSP server and handle communication
        
        // Register IPC handlers with main process
        if (window.orbitAPI) {
            this.connection = {
                sendRequest: async (method, params) => {
                    return await window.orbitAPI.sendLSPRequest(method, params);
                },
                sendNotification: (method, params) => {
                    window.orbitAPI.sendLSPNotification(method, params);
                },
                onNotification: (method, handler) => {
                    window.orbitAPI.onLSPNotification(method, handler);
                }
            };
            
            // Initialize the LSP server
            await this.connection.sendRequest('initialize', {
                processId: null,
                rootUri: null,
                capabilities: {
                    textDocument: {
                        completion: {
                            completionItem: {
                                snippetSupport: true,
                                documentationFormat: ['markdown']
                            }
                        },
                        hover: {
                            contentFormat: ['markdown']
                        }
                    }
                }
            });
            
            await this.connection.sendNotification('initialized', {});
        }
    }
    
    registerCompletionProvider() {
        monaco.languages.registerCompletionItemProvider('c', {
            triggerCharacters: ['.', '->', '#', '(', ' '],
            
            provideCompletionItems: async (model, position, context, token) => {
                if (!this.isInitialized) return { suggestions: [] };
                
                try {
                    const documentUri = model.uri.toString();
                    const textDocument = {
                        uri: documentUri,
                        languageId: 'c',
                        version: model.getVersionId(),
                        text: model.getValue()
                    };
                    
                    // Send completion request to LSP server
                    const result = await this.connection.sendRequest('textDocument/completion', {
                        textDocument: { uri: documentUri },
                        position: { line: position.lineNumber - 1, character: position.column - 1 }
                    });
                    
                    if (!result || !result.items) return { suggestions: [] };
                    
                    // Convert LSP completion items to Monaco format
                    const suggestions = result.items.map(item => ({
                        label: item.label,
                        kind: this.convertCompletionItemKind(item.kind),
                        detail: item.detail || '',
                        documentation: item.documentation ? {
                            value: item.documentation.value || item.documentation,
                            isTrusted: true,
                            supportThemeIcons: true
                        } : undefined,
                        insertText: item.insertText || item.label,
                        insertTextRules: item.insertTextFormat === 2 ? 
                            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : 
                            monaco.languages.CompletionItemInsertTextRule.None,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - (context.triggerCharacter ? 1 : 0),
                            endColumn: position.column
                        },
                        sortText: item.sortText || item.label
                    }));
                    
                    return { 
                        suggestions,
                        incomplete: result.isIncomplete || false
                    };
                    
                } catch (error) {
                    console.error('Completion error:', error);
                    return { suggestions: [] };
                }
            }
        });
        
        monaco.languages.registerCompletionItemProvider('cpp', {
            triggerCharacters: ['.', '->', '#', '(', ' '],
            provideCompletionItems: async (model, position, context, token) => {
                // Same as C completion for now
                return this.provideCompletionItems(model, position, context, token);
            }
        });
    }
    
    registerHoverProvider() {
        const hoverProvider = {
            provideHover: async (model, position, token) => {
                if (!this.isInitialized) return null;
                
                try {
                    const documentUri = model.uri.toString();
                    
                    const result = await this.connection.sendRequest('textDocument/hover', {
                        textDocument: { uri: documentUri },
                        position: { line: position.lineNumber - 1, character: position.column - 1 }
                    });
                    
                    if (!result || !result.contents) return null;
                    
                    const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
                    
                    return {
                        contents: contents.map(content => ({
                            value: typeof content === 'string' ? content : content.value,
                            isTrusted: true,
                            supportThemeIcons: true
                        })),
                        range: result.range ? {
                            startLineNumber: result.range.start.line + 1,
                            endLineNumber: result.range.end.line + 1,
                            startColumn: result.range.start.character + 1,
                            endColumn: result.range.end.character + 1
                        } : undefined
                    };
                    
                } catch (error) {
                    console.error('Hover error:', error);
                    return null;
                }
            }
        };
        
        monaco.languages.registerHoverProvider('c', hoverProvider);
        monaco.languages.registerHoverProvider('cpp', hoverProvider);
    }
    
    registerDiagnosticsProvider() {
        // Listen for diagnostics from LSP server
        if (this.connection && this.connection.onNotification) {
            this.connection.onNotification('textDocument/publishDiagnostics', (params) => {
                this.updateDiagnostics(params);
            });
        }
    }
    
    setupDocumentSync() {
        // Track document changes and sync with LSP server
        monaco.editor.onDidCreateModel((model) => {
            if (model.getLanguageId() === 'c' || model.getLanguageId() === 'cpp') {
                this.syncDocument(model, 'opened');
                
                // Listen for changes
                model.onDidChangeContent(() => {
                    this.syncDocument(model, 'changed');
                });
            }
        });
        
        monaco.editor.onWillDisposeModel((model) => {
            if (model.getLanguageId() === 'c' || model.getLanguageId() === 'cpp') {
                this.syncDocument(model, 'closed');
            }
        });
    }
    
    async syncDocument(model, changeType) {
        if (!this.isInitialized || !this.connection) return;
        
        const documentUri = model.uri.toString();
        const textDocument = {
            uri: documentUri,
            languageId: model.getLanguageId(),
            version: model.getVersionId(),
            text: model.getValue()
        };
        
        try {
            switch (changeType) {
                case 'opened':
                    await this.connection.sendNotification('textDocument/didOpen', {
                        textDocument
                    });
                    break;
                    
                case 'changed':
                    await this.connection.sendNotification('textDocument/didChange', {
                        textDocument: { uri: documentUri, version: textDocument.version },
                        contentChanges: [{ text: textDocument.text }]
                    });
                    break;
                    
                case 'closed':
                    await this.connection.sendNotification('textDocument/didClose', {
                        textDocument: { uri: documentUri }
                    });
                    break;
            }
        } catch (error) {
            console.error('Document sync error:', error);
        }
    }
    
    updateDiagnostics(params) {
        const { uri, diagnostics } = params;
        
        // Convert LSP diagnostics to Monaco markers
        const markers = diagnostics.map(diagnostic => ({
            severity: this.convertDiagnosticSeverity(diagnostic.severity),
            startLineNumber: diagnostic.range.start.line + 1,
            startColumn: diagnostic.range.start.character + 1,
            endLineNumber: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1,
            message: diagnostic.message,
            source: diagnostic.source || 'OrbitIDE',
            code: diagnostic.code
        }));
        
        // Find the model for this URI
        const model = monaco.editor.getModels().find(m => m.uri.toString() === uri);
        if (model) {
            monaco.editor.setModelMarkers(model, 'embedded-lsp', markers);
        }
    }
    
    convertCompletionItemKind(lspKind) {
        const kindMap = {
            1: monaco.languages.CompletionItemKind.Text,
            2: monaco.languages.CompletionItemKind.Method,
            3: monaco.languages.CompletionItemKind.Function,
            4: monaco.languages.CompletionItemKind.Constructor,
            5: monaco.languages.CompletionItemKind.Field,
            6: monaco.languages.CompletionItemKind.Variable,
            7: monaco.languages.CompletionItemKind.Class,
            8: monaco.languages.CompletionItemKind.Interface,
            9: monaco.languages.CompletionItemKind.Module,
            10: monaco.languages.CompletionItemKind.Property,
            11: monaco.languages.CompletionItemKind.Unit,
            12: monaco.languages.CompletionItemKind.Value,
            13: monaco.languages.CompletionItemKind.Enum,
            14: monaco.languages.CompletionItemKind.Keyword,
            15: monaco.languages.CompletionItemKind.Snippet,
            16: monaco.languages.CompletionItemKind.Color,
            17: monaco.languages.CompletionItemKind.File,
            18: monaco.languages.CompletionItemKind.Reference
        };
        
        return kindMap[lspKind] || monaco.languages.CompletionItemKind.Text;
    }
    
    convertDiagnosticSeverity(lspSeverity) {
        const severityMap = {
            1: monaco.MarkerSeverity.Error,
            2: monaco.MarkerSeverity.Warning,
            3: monaco.MarkerSeverity.Info,
            4: monaco.MarkerSeverity.Hint
        };
        
        return severityMap[lspSeverity] || monaco.MarkerSeverity.Info;
    }
    
    // Configuration methods
    async setBoardType(boardType) {
        this.currentBoardType = boardType;
        
        if (this.isInitialized && this.connection) {
            await this.connection.sendNotification('workspace/didChangeConfiguration', {
                settings: {
                    orbitIDE: {
                        boardType: boardType
                    }
                }
            });
        }
    }
    
    async updateSettings(settings) {
        if (this.isInitialized && this.connection) {
            await this.connection.sendNotification('workspace/didChangeConfiguration', {
                settings: {
                    orbitIDE: settings
                }
            });
        }
    }
    
    // Utility methods
    setCurrentEditor(editor) {
        this.currentEditor = editor;
    }
    
    getCurrentEditor() {
        return this.currentEditor;
    }
    
    isReady() {
        return this.isInitialized && this.connection;
    }
}

// Export singleton instance
export const embeddedLSPClient = new EmbeddedLSPClient();
export default embeddedLSPClient;
