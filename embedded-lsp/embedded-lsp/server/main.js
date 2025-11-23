/**
 * OrbitIDE Embedded Language Server
 * 
 * Revolutionary LSP that understands embedded systems at the hardware level.
 * This goes far beyond basic C++ completion - it knows registers, peripherals,
 * timing constraints, and hardware limitations.
 */

const {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    HoverParams,
    Hover,
    MarkupKind
} = require('vscode-languageserver/node');

const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

// Import our embedded-specific modules
const EmbeddedCompletionProvider = require('./completion');
const EmbeddedDiagnosticProvider = require('./diagnostics');
const EmbeddedHoverProvider = require('./hover');
const HardwareDatabase = require('./hardware-db');

class OrbitEmbeddedLanguageServer {
    constructor() {
        // Create LSP connection
        this.connection = createConnection(ProposedFeatures.all);
        this.documents = new TextDocuments(TextDocument);
        
        // Initialize hardware database and providers
        this.hardwareDB = new HardwareDatabase();
        this.completionProvider = new EmbeddedCompletionProvider(this.hardwareDB);
        this.diagnosticProvider = new EmbeddedDiagnosticProvider(this.hardwareDB);
        this.hoverProvider = new EmbeddedHoverProvider(this.hardwareDB);
        
        // Current project settings
        this.settings = {
            boardType: 'arduino-uno',
            enableHardwareValidation: true,
            enableRegisterCompletion: true,
            enableProtocolIntelligence: true,
            maxStackSize: 2048, // bytes
            maxHeapSize: 8192   // bytes
        };
        
        this.setupHandlers();
    }
    
    setupHandlers() {
        // Connection handlers
        this.connection.onInitialize(this.handleInitialize.bind(this));
        this.connection.onInitialized(this.handleInitialized.bind(this));
        
        // Document handlers
        this.documents.onDidChangeContent(this.handleDocumentChange.bind(this));
        this.documents.onDidOpen(this.handleDocumentOpen.bind(this));
        
        // Language feature handlers
        this.connection.onCompletion(this.handleCompletion.bind(this));
        this.connection.onCompletionResolve(this.handleCompletionResolve.bind(this));
        this.connection.onHover(this.handleHover.bind(this));
        
        // Settings handlers
        this.connection.onDidChangeConfiguration(this.handleConfigChange.bind(this));
        
        // Listen for document changes
        this.documents.listen(this.connection);
        this.connection.listen();
    }
    
    async handleInitialize(params) {
        const capabilities = {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            
            // Code completion with embedded hardware awareness
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', '->', '#', '(', ' ']
            },
            
            // Hover information for registers, functions, pins
            hoverProvider: true,
            
            // Real-time diagnostics for hardware constraints
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false
            }
        };
        
        // Load hardware database on initialization
        await this.hardwareDB.initialize();
        
        this.connection.console.log('OrbitIDE Embedded LSP Server initialized');
        return { capabilities };
    }
    
    async handleInitialized() {
        // Register for configuration changes
        this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
        this.connection.console.log('Embedded LSP ready - Hardware intelligence active');
    }
    
    async handleDocumentChange(change) {
        // Real-time diagnostics as user types
        const diagnostics = await this.diagnosticProvider.validateDocument(
            change.document, 
            this.settings
        );
        
        this.connection.sendDiagnostics({
            uri: change.document.uri,
            diagnostics
        });
    }
    
    async handleDocumentOpen(event) {
        this.connection.console.log(`Opened embedded document: ${event.document.uri}`);
        
        // Analyze document for hardware usage patterns
        await this.analyzeHardwareUsage(event.document);
    }
    
    async handleCompletion(textDocumentPosition) {
        const document = this.documents.get(textDocumentPosition.textDocument.uri);
        if (!document) return null;
        
        // Get embedded-specific completions
        const completions = await this.completionProvider.provideCompletions(
            document,
            textDocumentPosition.position,
            this.settings
        );
        
        return {
            isIncomplete: false,
            items: completions
        };
    }
    
    async handleCompletionResolve(item) {
        // Add detailed documentation and examples
        return this.completionProvider.resolveCompletion(item, this.settings);
    }
    
    async handleHover(hoverParams) {
        const document = this.documents.get(hoverParams.textDocument.uri);
        if (!document) return null;
        
        return this.hoverProvider.provideHover(
            document,
            hoverParams.position,
            this.settings
        );
    }
    
    async handleConfigChange(change) {
        if (change.settings.orbitIDE) {
            this.settings = { ...this.settings, ...change.settings.orbitIDE };
            
            // Reload hardware database if board type changed
            if (change.settings.orbitIDE.boardType) {
                await this.hardwareDB.loadBoard(change.settings.orbitIDE.boardType);
                this.connection.console.log(`Switched to ${change.settings.orbitIDE.boardType}`);
            }
        }
        
        // Revalidate all open documents
        this.documents.all().forEach(async (document) => {
            const diagnostics = await this.diagnosticProvider.validateDocument(
                document, 
                this.settings
            );
            
            this.connection.sendDiagnostics({
                uri: document.uri,
                diagnostics
            });
        });
    }
    
    async analyzeHardwareUsage(document) {
        // Analyze the document for hardware usage patterns
        const text = document.getText();
        
        // Extract register accesses, pin usage, protocols, etc.
        const hardwareAnalysis = {
            registers: this.extractRegisterUsage(text),
            pins: this.extractPinUsage(text),
            protocols: this.extractProtocolUsage(text),
            interrupts: this.extractInterruptUsage(text)
        };
        
        this.connection.console.log(`Hardware analysis complete: ${JSON.stringify(hardwareAnalysis, null, 2)}`);
        return hardwareAnalysis;
    }
    
    extractRegisterUsage(text) {
        // Find direct register access patterns
        const registerPattern = /(?:GPIOA|GPIOB|GPIOC|GPIOD|USART1|TIM1|ADC1)->(\w+)/g;
        const matches = [];
        let match;
        
        while ((match = registerPattern.exec(text)) !== null) {
            matches.push({
                register: match[0],
                field: match[1],
                line: text.substring(0, match.index).split('\n').length - 1
            });
        }
        
        return matches;
    }
    
    extractPinUsage(text) {
        // Find pin configuration patterns
        const pinPattern = /pinMode\s*\(\s*(\d+)\s*,\s*(\w+)\s*\)/g;
        const matches = [];
        let match;
        
        while ((match = pinPattern.exec(text)) !== null) {
            matches.push({
                pin: parseInt(match[1]),
                mode: match[2],
                line: text.substring(0, match.index).split('\n').length - 1
            });
        }
        
        return matches;
    }
    
    extractProtocolUsage(text) {
        // Find protocol initialization patterns
        const protocols = [];
        
        if (text.includes('Wire.begin')) {
            protocols.push('i2c');
        }
        if (text.includes('SPI.begin')) {
            protocols.push('spi');
        }
        if (text.includes('Serial.begin')) {
            protocols.push('uart');
        }
        
        return protocols;
    }
    
    extractInterruptUsage(text) {
        // Find interrupt handler patterns
        const interruptPattern = /(?:attachInterrupt|ISR)\s*\(/g;
        const matches = [];
        let match;
        
        while ((match = interruptPattern.exec(text)) !== null) {
            matches.push({
                type: match[0].includes('attachInterrupt') ? 'external' : 'timer',
                line: text.substring(0, match.index).split('\n').length - 1
            });
        }
        
        return matches;
    }
}

// Start the server
const server = new OrbitEmbeddedLanguageServer();
