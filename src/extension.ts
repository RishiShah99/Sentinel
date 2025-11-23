import * as vscode from 'vscode';
import * as path from 'path';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { SentinelSidebarProvider } from './sidebar-provider';

let client: LanguageClient;
let statusBarBoard: vscode.StatusBarItem;
let statusBarPort: vscode.StatusBarItem;
let statusBarFlash: vscode.StatusBarItem;
let statusBarMemory: vscode.StatusBarItem;
let sidebarProvider: SentinelSidebarProvider;
let floatingRAMPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    createStatusBar(context);
    registerCommands(context);
    startLanguageServer(context);
    registerSidebar(context);
}

function registerSidebar(context: vscode.ExtensionContext) {
    sidebarProvider = new SentinelSidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SentinelSidebarProvider.viewType,
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    
    // Trigger document change when sidebar becomes visible
    sidebarProvider.onVisibilityChange((visible) => {
        if (visible && client) {
            const editor = vscode.window.activeTextEditor;
            if (editor && (editor.document.languageId === 'cpp' || editor.document.languageId === 'c' || editor.document.fileName.endsWith('.ino'))) {
                // Manually trigger LSP analysis by sending didChange notification
                client.sendNotification('textDocument/didChange', {
                    textDocument: {
                        uri: editor.document.uri.toString(),
                        version: editor.document.version
                    },
                    contentChanges: [{
                        text: editor.document.getText()
                    }]
                });
            }
        }
    });
}

function createStatusBar(context: vscode.ExtensionContext) {
    statusBarBoard = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarBoard.command = 'sentinel.selectBoard';
    statusBarBoard.text = '$(circuit-board) Arduino Uno';
    statusBarBoard.tooltip = 'Select Board';
    statusBarBoard.show();
    context.subscriptions.push(statusBarBoard);

    statusBarPort = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    statusBarPort.command = 'sentinel.selectPort';
    statusBarPort.text = '$(plug) Select Port';
    statusBarPort.tooltip = 'Select Serial Port';
    statusBarPort.show();
    context.subscriptions.push(statusBarPort);

    statusBarFlash = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    statusBarFlash.command = 'sentinel.flash';
    statusBarFlash.text = '$(zap) Flash';
    statusBarFlash.tooltip = 'Flash Device';
    statusBarFlash.show();
    context.subscriptions.push(statusBarFlash);

    statusBarMemory = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
    statusBarMemory.text = '$(database) RAM: --';
    statusBarMemory.tooltip = 'Live RAM Estimate (click for details)';
    statusBarMemory.command = 'workbench.view.extension.sentinel-sidebar';
    statusBarMemory.show();
    context.subscriptions.push(statusBarMemory);
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('sentinel.build', () => buildProject()),
        vscode.commands.registerCommand('sentinel.flash', () => flashDevice()),
        vscode.commands.registerCommand('sentinel.selectBoard', () => selectBoard()),
        vscode.commands.registerCommand('sentinel.selectPort', () => selectPort()),
        vscode.commands.registerCommand('sentinel.serialMonitor', () => openSerialMonitor()),
        vscode.commands.registerCommand('sentinel.toggleFloatingRAM', () => toggleFloatingRAM(context))
    );
}

function startLanguageServer(context: vscode.ExtensionContext) {
    const serverModule = context.asAbsolutePath(path.join('embedded-lsp', 'server', 'main.js'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'cpp' },
            { scheme: 'file', language: 'c' },
            { scheme: 'file', language: 'arduino' },
            { scheme: 'file', pattern: '**/*.ino' }
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{ino,cpp,h}')
        }
    };

    client = new LanguageClient(
        'sentinel',
        'Sentinel Language Server',
        serverOptions,
        clientOptions
    );

    client.start();

    // Listen for pin map updates from LSP
    client.start().then(() => {
        client.onNotification('sentinel/pinMap', (params: any) => {
            if (sidebarProvider) {
                sidebarProvider.updatePinMap(params.pinMap, params.uri);
            }
        });

        // Listen for live memory analysis updates from LSP
        client.onNotification('sentinel/memoryAnalysis', (params: any) => {
            if (sidebarProvider) {
                sidebarProvider.updateLiveMemory(params.analysis, params.uri);
            }
            
            // Update status bar with live RAM
            const ramPercent = params.analysis.ram.percentage;
            let ramIcon = '';
            if (ramPercent >= 75) {
                ramIcon = ' 🔥';
            } else if (ramPercent >= 60) {
                ramIcon = ' ⚠️';
            }
            statusBarMemory.text = `$(database) RAM: ${ramPercent}%${ramIcon}`;
            statusBarMemory.tooltip = `Live RAM Estimate: ${ramPercent}%\nClick to see details in sidebar`;
            
            // Update floating RAM widget if visible
            if (floatingRAMPanel) {
                updateFloatingRAM(params.analysis);
            }
        });
    });
}

function parseMemoryUsage(output: string, board: string) {
    // Parse Arduino CLI output for memory usage
    // Example: "Sketch uses 7624 bytes (23%) of program storage space. Maximum is 32256 bytes."
    // Example: "Global variables use 587 bytes (28%) of dynamic memory, leaving 1461 bytes for local variables. Maximum is 2048 bytes."
    
    const flashMatch = output.match(/Sketch uses (\d+) bytes \((\d+)%\) of program storage space\. Maximum is (\d+) bytes/);
    const ramMatch = output.match(/Global variables use (\d+) bytes \((\d+)%\) of dynamic memory.*Maximum is (\d+) bytes/);
    
    if (flashMatch && ramMatch) {
        const flashUsed = parseInt(flashMatch[1]);
        const flashPercent = parseInt(flashMatch[2]);
        const flashMax = parseInt(flashMatch[3]);
        
        const ramUsed = parseInt(ramMatch[1]);
        const ramPercent = parseInt(ramMatch[2]);
        const ramMax = parseInt(ramMatch[3]);
        
        // Health bar indicators with emoji
        let healthIcon = '$(database)';
        let flashIcon = '';
        let ramIcon = '';
        
        if (flashPercent >= 90) {
            flashIcon = '🔥';
            healthIcon = '$(alert)';
        } else if (flashPercent >= 70) {
            flashIcon = '⚠️';
        }
        
        if (ramPercent >= 90) {
            ramIcon = '🔥';
            healthIcon = '$(alert)';
        } else if (ramPercent >= 70) {
            ramIcon = '⚠️';
        }
        
        statusBarMemory.text = `${healthIcon} Flash: ${flashPercent}%${flashIcon} | RAM: ${ramPercent}%${ramIcon}`;
        statusBarMemory.tooltip = `Flash: ${flashUsed}/${flashMax} bytes (${flashPercent}%)\nRAM: ${ramUsed}/${ramMax} bytes (${ramPercent}%)\n\nHealth: ${flashPercent >= 90 || ramPercent >= 90 ? '🔥 Critical' : flashPercent >= 70 || ramPercent >= 70 ? '⚠️ Warning' : '✅ Good'}`;
        
        // Update sidebar with memory visualization
        if (sidebarProvider) {
            sidebarProvider.updateMemory(flashPercent, flashUsed, flashMax, ramPercent, ramUsed, ramMax);
        }
        
        // Smart board suggestions based on usage
        suggestBoardUpgrade(flashUsed, ramUsed, flashPercent, ramPercent, board);
    }
}

async function suggestBoardUpgrade(flashUsed: number, ramUsed: number, flashPercent: number, ramPercent: number, currentBoard: string) {
    // Board memory specs
    const boardSpecs = {
        'arduino:avr:uno': { name: 'Arduino Uno', flash: 32256, ram: 2048 },
        'arduino:avr:nano': { name: 'Arduino Nano', flash: 32256, ram: 2048 },
        'arduino:avr:mega': { name: 'Arduino Mega', flash: 253952, ram: 8192 },
        'esp32:esp32:esp32': { name: 'ESP32', flash: 1310720, ram: 327680 }
    };
    
    const currentSpec = boardSpecs[currentBoard as keyof typeof boardSpecs];
    if (!currentSpec) return;
    
    // Critical usage (>90%) - suggest upgrade
    if (flashPercent > 90 || ramPercent > 90) {
        let suggestion = '';
        let suggestedBoard = '';
        
        if (currentBoard.includes('uno') || currentBoard.includes('nano')) {
            suggestion = `Your code uses ${flashUsed} bytes Flash and ${ramUsed} bytes RAM. ${currentSpec.name} is at capacity. Consider upgrading to Arduino Mega (256KB Flash, 8KB RAM) or ESP32 (1.3MB Flash, 320KB RAM).`;
            suggestedBoard = 'arduino:avr:mega';
        } else if (currentBoard.includes('mega')) {
            suggestion = `Your code uses ${flashUsed} bytes Flash and ${ramUsed} bytes RAM. Arduino Mega is at capacity. Consider upgrading to ESP32 (1.3MB Flash, 320KB RAM).`;
            suggestedBoard = 'esp32:esp32:esp32';
        }
        
        if (suggestion) {
            const response = await vscode.window.showWarningMessage(
                suggestion,
                'Switch Board',
                'Optimize Code',
                'Ignore'
            );
            
            if (response === 'Switch Board') {
                await vscode.workspace.getConfiguration('sentinel').update('board', suggestedBoard, true);
                const newBoardName = boardSpecs[suggestedBoard as keyof typeof boardSpecs].name;
                statusBarBoard.text = `$(circuit-board) ${newBoardName}`;
                vscode.window.showInformationMessage(`Switched to ${newBoardName}`);
            } else if (response === 'Optimize Code') {
                vscode.window.showInformationMessage('Tips: Use PROGMEM for constants, reduce String usage, optimize arrays');
            }
        }
    }
}

async function buildProject() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No file open');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const config = vscode.workspace.getConfiguration('sentinel');
    const board = config.get<string>('board', 'arduino:avr:uno');

    const arduinoCliPath = process.platform === 'win32' 
        ? 'C:\\Program Files\\Arduino CLI\\arduino-cli.exe'
        : 'arduino-cli';

    // Show in terminal for user visibility
    const terminal = vscode.window.createTerminal('Sentinel Build');
    terminal.show();
    if (process.platform === 'win32') {
        terminal.sendText(`& "${arduinoCliPath}" compile --fqbn ${board} "${filePath}"`);
    } else {
        terminal.sendText(`"${arduinoCliPath}" compile --fqbn ${board} "${filePath}"`);
    }

    // Run in background to capture memory stats
    const { spawn } = require('child_process');
    const compile = spawn(arduinoCliPath, ['compile', '--fqbn', board, filePath]);
    
    let output = '';
    compile.stdout.on('data', (data: any) => { output += data.toString(); });
    compile.stderr.on('data', (data: any) => { output += data.toString(); });
    compile.on('close', () => {
        parseMemoryUsage(output, board);
    });
}

async function flashDevice() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No file open');
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const config = vscode.workspace.getConfiguration('sentinel');
    const board = config.get<string>('board', 'arduino:avr:uno');
    const port = config.get<string>('port', '');

    if (!port) {
        vscode.window.showErrorMessage('No port selected. Use "Sentinel: Select Port" first.');
        return;
    }

    const arduinoCli = process.platform === 'win32' 
        ? '& "C:\\Program Files\\Arduino CLI\\arduino-cli.exe"'
        : 'arduino-cli';

    const terminal = vscode.window.createTerminal('Sentinel Flash');
    terminal.show();
    terminal.sendText(`${arduinoCli} upload -p ${port} --fqbn ${board} "${filePath}"`);
}

async function selectBoard() {
    const boards = [
        { label: 'Arduino Uno', fqbn: 'arduino:avr:uno' },
        { label: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' }
    ];

    const selected = await vscode.window.showQuickPick(
        boards.map(b => b.label),
        { placeHolder: 'Select board' }
    );

    if (selected) {
        const board = boards.find(b => b.label === selected);
        if (board) {
            await vscode.workspace.getConfiguration('sentinel').update('board', board.fqbn, true);
            statusBarBoard.text = `$(circuit-board) ${selected}`;
            vscode.window.showInformationMessage(`Board set to ${selected}`);
        }
    }
}

async function selectPort() {
    const { SerialPort } = require('serialport');
    
    try {
        const ports = await SerialPort.list();
        const portNames = ports.map((p: any) => p.path);

        if (portNames.length === 0) {
            vscode.window.showWarningMessage('No serial ports found');
            return;
        }

        const selected = await vscode.window.showQuickPick(portNames, {
            placeHolder: 'Select serial port'
        });

        if (selected) {
            await vscode.workspace.getConfiguration('sentinel').update('port', selected, true);
            statusBarPort.text = `$(plug) ${selected}`;
            vscode.window.showInformationMessage(`Port set to ${selected}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to list ports: ${error}`);
    }
}

let serialMonitorTerminal: vscode.Terminal | undefined;

async function openSerialMonitor() {
    const config = vscode.workspace.getConfiguration('sentinel');
    const port = config.get<string>('port', '');
    const baudRate = config.get<number>('baudRate', 115200);

    if (!port) {
        vscode.window.showErrorMessage('No port selected');
        return;
    }

    if (serialMonitorTerminal) {
        serialMonitorTerminal.dispose();
    }

    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');

    try {
        const serialPort = new SerialPort({ path: port, baudRate: baudRate });
        const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

        serialMonitorTerminal = vscode.window.createTerminal({
            name: `Serial Monitor (${port})`,
            pty: {
                onDidWrite: new vscode.EventEmitter<string>().event,
                open: () => {},
                close: () => {
                    serialPort.close();
                },
                handleInput: (data: string) => {
                    serialPort.write(data);
                }
            }
        });

        const writeEmitter = new vscode.EventEmitter<string>();
        serialMonitorTerminal = vscode.window.createTerminal({
            name: `Serial Monitor (${port} @ ${baudRate})`,
            pty: {
                onDidWrite: writeEmitter.event,
                open: () => {
                    writeEmitter.fire(`\r\n📡 Connected to ${port} @ ${baudRate} baud\r\n\r\n`);
                },
                close: () => {
                    serialPort.close();
                },
                handleInput: (data: string) => {
                    serialPort.write(data);
                }
            }
        });

        parser.on('data', (data: string) => {
            writeEmitter.fire(data + '\r\n');
        });

        serialPort.on('error', (err: Error) => {
            writeEmitter.fire(`\r\n❌ Error: ${err.message}\r\n`);
        });

        serialMonitorTerminal.show();
        vscode.window.showInformationMessage(`Serial monitor opened on ${port}`);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open serial port: ${error}`);
    }
}

function toggleFloatingRAM(context: vscode.ExtensionContext) {
    if (floatingRAMPanel) {
        // Close if already open
        floatingRAMPanel.dispose();
        floatingRAMPanel = undefined;
        vscode.window.showInformationMessage('Floating RAM Monitor closed');
    } else {
        // Create floating panel in bottom-right corner
        floatingRAMPanel = vscode.window.createWebviewPanel(
            'sentinelFloatingRAM',
            '💾 RAM',
            { 
                viewColumn: vscode.ViewColumn.Two, 
                preserveFocus: true 
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        floatingRAMPanel.webview.html = getFloatingRAMHTML();

        floatingRAMPanel.onDidDispose(() => {
            floatingRAMPanel = undefined;
        });
        
        vscode.window.showInformationMessage('Floating RAM Monitor opened - drag tab to reposition');
    }
}

function updateFloatingRAM(analysis: any) {
    if (!floatingRAMPanel) {
        return;
    }

    const ramPercent = analysis.ram.percentage;
    const ramTotal = analysis.ram.total;
    const ramMax = analysis.limits.ram;

    floatingRAMPanel.webview.postMessage({
        type: 'update',
        ramPercent,
        ramTotal,
        ramMax
    });
}

function getFloatingRAMHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            background: transparent;
            color: var(--vscode-editor-foreground);
            padding: 8px;
            overflow: hidden;
        }
        .ram-widget {
            background: var(--vscode-sideBar-background);
            border: 2px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            max-width: 280px;
            backdrop-filter: blur(10px);
        }
        .title {
            font-size: 10px;
            font-weight: 700;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .ram-percent {
            font-size: 48px;
            font-weight: 800;
            margin-bottom: 8px;
            color: #7fd962;
            line-height: 1;
            text-shadow: 0 2px 8px rgba(127, 217, 98, 0.3);
        }
        .ram-percent.warning {
            color: #ffb454;
            text-shadow: 0 2px 8px rgba(255, 180, 84, 0.3);
        }
        .ram-percent.critical {
            color: #f29668;
            text-shadow: 0 2px 8px rgba(242, 150, 104, 0.3);
        }
        .ram-details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
            font-weight: 500;
        }
        .ram-bar {
            height: 8px;
            background: rgba(108, 115, 128, 0.15);
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }
        .ram-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #7fd962, #6bc94a);
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease;
            box-shadow: 0 0 8px rgba(127, 217, 98, 0.4);
        }
        .ram-bar-fill.warning {
            background: linear-gradient(90deg, #ffb454, #f29668);
            box-shadow: 0 0 8px rgba(255, 180, 84, 0.4);
        }
        .ram-bar-fill.critical {
            background: linear-gradient(90deg, #f29668, #e06c75);
            box-shadow: 0 0 8px rgba(242, 150, 104, 0.4);
        }
        .pulse {
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    </style>
</head>
<body>
    <div class="ram-widget">
        <div class="title">
            <span>💾</span>
            <span>LIVE RAM</span>
        </div>
        <div class="ram-percent pulse" id="ramPercent">--</div>
        <div class="ram-details" id="ramDetails">-- / -- bytes</div>
        <div class="ram-bar">
            <div class="ram-bar-fill" id="ramBar" style="width: 0%"></div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                const { ramPercent, ramTotal, ramMax } = message;
                
                const percentEl = document.getElementById('ramPercent');
                const detailsEl = document.getElementById('ramDetails');
                const barEl = document.getElementById('ramBar');
                
                percentEl.textContent = ramPercent + '%';
                detailsEl.textContent = ramTotal + ' / ' + ramMax + ' bytes';
                barEl.style.width = ramPercent + '%';
                
                // Update colors based on usage
                percentEl.className = 'ram-percent pulse';
                barEl.className = 'ram-bar-fill';
                
                if (ramPercent >= 75) {
                    percentEl.classList.add('critical');
                    barEl.classList.add('critical');
                } else if (ramPercent >= 60) {
                    percentEl.classList.add('warning');
                    barEl.classList.add('warning');
                }
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate(): Thenable<void> | undefined {
    if (floatingRAMPanel) {
        floatingRAMPanel.dispose();
    }
    if (!client) {
        return undefined;
    }
    return client.stop();
}
