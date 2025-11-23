import * as vscode from 'vscode';

export class SentinelSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sentinel.deviceView';
    private _view?: vscode.WebviewView;
    private _cachedMemory?: { flashPercent: number, flashUsed: number, flashMax: number, ramPercent: number, ramUsed: number, ramMax: number };
    private _cachedPinMap?: any[];
    private _cachedLiveMemory?: any;
    private _cachedFileUri?: string;
    private _onVisibilityChange?: (visible: boolean) => void;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public onVisibilityChange(callback: (visible: boolean) => void) {
        this._onVisibilityChange = callback;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                const currentFileUri = vscode.window.activeTextEditor?.document.uri.toString();
                
                if (this._cachedFileUri !== currentFileUri) {
                    this._cachedPinMap = undefined;
                    this._cachedLiveMemory = undefined;
                }
                
                // Notify extension to trigger re-analysis
                if (this._onVisibilityChange) {
                    this._onVisibilityChange(true);
                }
                
                // Send cached data after a delay (LSP will update it)
                setTimeout(() => this.sendAllCachedData(), 200);
                setTimeout(() => this.sendAllCachedData(), 600);
            }
        });

        // Send all cached data immediately if available AND it's for the current file
        const currentFileUri = vscode.window.activeTextEditor?.document.uri.toString();
        if (this._cachedFileUri === currentFileUri) {
            setTimeout(() => this.sendAllCachedData(), 100);
            setTimeout(() => this.sendAllCachedData(), 500);
            setTimeout(() => this.sendAllCachedData(), 1000);
        } else {
            this._cachedPinMap = undefined;
            this._cachedLiveMemory = undefined;
            // Keep post-build memory cache as it's file-independent
        }

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'build':
                    vscode.commands.executeCommand('sentinel.build');
                    break;
                case 'flash':
                    vscode.commands.executeCommand('sentinel.flash');
                    break;
                case 'selectBoard':
                    vscode.commands.executeCommand('sentinel.selectBoard');
                    break;
                case 'selectPort':
                    vscode.commands.executeCommand('sentinel.selectPort');
                    break;
                case 'serialMonitor':
                    vscode.commands.executeCommand('sentinel.serialMonitor');
                    break;
                case 'toggleFloatingRAM':
                    vscode.commands.executeCommand('sentinel.toggleFloatingRAM');
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const config = vscode.workspace.getConfiguration('sentinel');
        const board = config.get('board', 'arduino:avr:uno');
        const port = config.get('port', 'Not selected');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sentinel Device Control</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    background: transparent;
                    color: #bfbdb6;
                    padding: 16px;
                    font-size: 13px;
                    line-height: 1.5;
                }

                .header {
                    padding: 0 0 16px 0;
                    margin-bottom: 16px;
                    border-bottom: 1px solid rgba(108, 115, 128, 0.2);
                }

                .header h2 {
                    color: #bfbdb6;
                    font-size: 14px;
                    font-weight: 600;
                    letter-spacing: 0;
                    margin-bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 3px 8px;
                    background: rgba(127, 217, 98, 0.15);
                    color: #7fd962;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                }

                .section {
                    margin-bottom: 20px;
                }

                .section-title {
                    font-size: 11px;
                    font-weight: 600;
                    color: #6c7380;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                }

                .selector {
                    background: rgba(191, 189, 182, 0.03);
                    border: 1px solid rgba(108, 115, 128, 0.2);
                    padding: 10px 12px;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .selector:hover {
                    border-color: #e6b450;
                    background: rgba(230, 180, 80, 0.05);
                }

                .selector-label {
                    font-size: 10px;
                    color: #6c7380;
                    margin-bottom: 3px;
                    font-weight: 500;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                }

                .selector-value {
                    font-size: 13px;
                    color: #bfbdb6;
                    font-weight: 400;
                }

                .button {
                    width: 100%;
                    padding: 10px 16px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    letter-spacing: -0.2px;
                    border: 1px solid transparent;
                }

                .button-primary {
                    background: rgba(255, 180, 84, 0.12);
                    color: #ffb454;
                    border-color: rgba(255, 180, 84, 0.25);
                }

                .button-primary:hover {
                    background: rgba(255, 180, 84, 0.18);
                    border-color: #ffb454;
                }

                .button-success {
                    background: rgba(127, 217, 98, 0.12);
                    color: #7fd962;
                    border-color: rgba(127, 217, 98, 0.25);
                }

                .button-success:hover {
                    background: rgba(127, 217, 98, 0.18);
                    border-color: #7fd962;
                }

                .button-secondary {
                    background: rgba(191, 189, 182, 0.05);
                    color: #6c7380;
                    border-color: rgba(108, 115, 128, 0.2);
                }

                .button-secondary:hover {
                    background: rgba(191, 189, 182, 0.08);
                    border-color: rgba(108, 115, 128, 0.3);
                    color: #bfbdb6;
                }

                .button-info {
                    background: rgba(127, 217, 98, 0.1);
                    color: #7fd962;
                    border-color: rgba(127, 217, 98, 0.3);
                }

                .button-info:hover {
                    background: rgba(127, 217, 98, 0.15);
                    border-color: #7fd962;
                }

                .icon {
                    width: 13px;
                    height: 13px;
                    fill: currentColor;
                    opacity: 0.85;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>
                    Sentinel
                    <span class="status-badge">READY</span>
                </h2>
            </div>

            <div class="section">
                <div class="section-title">Device Configuration</div>
                <div class="selector" onclick="selectBoard()">
                    <div>
                        <div class="selector-label">BOARD</div>
                        <div class="selector-value">${board}</div>
                    </div>
                    <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M4 6l4 4 4-4z"/>
                    </svg>
                </div>
                <div class="selector" onclick="selectPort()">
                    <div>
                        <div class="selector-label">PORT</div>
                        <div class="selector-value">${port}</div>
                    </div>
                    <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M4 6l4 4 4-4z"/>
                    </svg>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Build & Deploy</div>
                <button class="button button-primary" onclick="build()">
                    <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M8 1l7 4v6l-7 4-7-4V5l7-4z"/>
                    </svg>
                    Build Project
                </button>
                <button class="button button-success" onclick="flash()">
                    <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M9 1L3 9h4v6l6-8H9V1z"/>
                    </svg>
                    Flash Device
                </button>
            </div>

            <div class="section">
                <div class="section-title">Quick Actions</div>
                <button class="button button-secondary" onclick="openSerialMonitor()">
                    <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" fill="none"/>
                        <path fill="currentColor" d="M4 6h8v1H4zM4 8h6v1H4z"/>
                    </svg>
                    Serial Monitor
                </button>
            </div>

            <div class="section" id="pinMapSection" style="display: none;">
                <div class="section-title">Pin Usage Map</div>
                <div id="pinMapContainer" style="font-size: 11px; line-height: 1.8;"></div>
            </div>

            <div class="section" id="liveMemorySection" style="display: none;">
                <div class="section-title" title="Real-time estimate based on code analysis. Typically accurate within ±5% for used variables.">
                    Live Memory Estimate
                </div>
                <div id="liveMemoryWarnings" style="margin-bottom: 8px;"></div>
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-size: 10px; color: #6c7380;">RAM (Estimate)</span>
                        <span id="liveRamPercent" style="font-size: 11px; font-weight: 600;">--</span>
                    </div>
                    <div style="background: rgba(108, 115, 128, 0.15); height: 5px; border-radius: 3px; overflow: hidden;">
                        <div id="liveRamBar" style="height: 100%; width: 0%; background: #7fd962; transition: width 0.3s ease;"></div>
                    </div>
                    <div id="liveRamDetails" style="font-size: 9px; color: #6c7380; margin-top: 3px;"></div>
                </div>
                <div id="liveMemoryItems" style="font-size: 10px; line-height: 1.6; color: #6c7380;"></div>
            </div>

            <div class="section" id="memorySection" style="display: none;">
                <div class="section-title">Memory Health (Post-Build)</div>
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 10px; color: #6c7380; font-weight: 500;">FLASH</span>
                        <span id="flashPercent" style="font-size: 11px; color: #bfbdb6; font-weight: 600;">--</span>
                    </div>
                    <div style="background: rgba(108, 115, 128, 0.15); height: 6px; border-radius: 3px; overflow: hidden;">
                        <div id="flashBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #ffb454, #f29668); transition: width 0.3s ease, background 0.3s ease;"></div>
                    </div>
                    <div id="flashBytes" style="font-size: 9px; color: #6c7380; margin-top: 2px;">-- / -- bytes</div>
                </div>
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 10px; color: #6c7380; font-weight: 500;">RAM</span>
                        <span id="ramPercent" style="font-size: 11px; color: #bfbdb6; font-weight: 600;">--</span>
                    </div>
                    <div style="background: rgba(108, 115, 128, 0.15); height: 6px; border-radius: 3px; overflow: hidden;">
                        <div id="ramBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #7fd962, #aad94c); transition: width 0.3s ease, background 0.3s ease;"></div>
                    </div>
                    <div id="ramBytes" style="font-size: 9px; color: #6c7380; margin-top: 2px;">-- / -- bytes</div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function selectBoard() {
                    vscode.postMessage({ type: 'selectBoard' });
                }

                function selectPort() {
                    vscode.postMessage({ type: 'selectPort' });
                }

                function build() {
                    vscode.postMessage({ type: 'build' });
                }

                function flash() {
                    vscode.postMessage({ type: 'flash' });
                }

                function openSerialMonitor() {
                    vscode.postMessage({ type: 'serialMonitor' });
                }

                function toggleFloatingRAM() {
                    vscode.postMessage({ type: 'toggleFloatingRAM' });
                }

                // Listen for memory updates
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'memoryUpdate') {
                        const { flashPercent, flashUsed, flashMax, ramPercent, ramUsed, ramMax } = message;
                        
                        // Show memory section
                        document.getElementById('memorySection').style.display = 'block';
                        
                        // Update flash
                        document.getElementById('flashPercent').textContent = flashPercent + '%';
                        document.getElementById('flashBytes').textContent = flashUsed + ' / ' + flashMax + ' bytes';
                        document.getElementById('flashBar').style.width = flashPercent + '%';
                        
                        // Color code flash bar
                        if (flashPercent >= 90) {
                            document.getElementById('flashBar').style.background = 'linear-gradient(90deg, #f26d78, #d95757)';
                            document.getElementById('flashPercent').style.color = '#f26d78';
                        } else if (flashPercent >= 70) {
                            document.getElementById('flashBar').style.background = 'linear-gradient(90deg, #ffb454, #e6b450)';
                            document.getElementById('flashPercent').style.color = '#ffb454';
                        } else {
                            document.getElementById('flashBar').style.background = 'linear-gradient(90deg, #7fd962, #aad94c)';
                            document.getElementById('flashPercent').style.color = '#7fd962';
                        }
                        
                        // Update RAM
                        document.getElementById('ramPercent').textContent = ramPercent + '%';
                        document.getElementById('ramBytes').textContent = ramUsed + ' / ' + ramMax + ' bytes';
                        document.getElementById('ramBar').style.width = ramPercent + '%';
                        
                        // Color code RAM bar
                        if (ramPercent >= 90) {
                            document.getElementById('ramBar').style.background = 'linear-gradient(90deg, #f26d78, #d95757)';
                            document.getElementById('ramPercent').style.color = '#f26d78';
                        } else if (ramPercent >= 70) {
                            document.getElementById('ramBar').style.background = 'linear-gradient(90deg, #ffb454, #e6b450)';
                            document.getElementById('ramPercent').style.color = '#ffb454';
                        } else {
                            document.getElementById('ramBar').style.background = 'linear-gradient(90deg, #7fd962, #aad94c)';
                            document.getElementById('ramPercent').style.color = '#7fd962';
                        }
                    }

                    // Handle pin map updates
                    if (message.type === 'pinMapUpdate') {
                        const { pinMap } = message;
                        const container = document.getElementById('pinMapContainer');
                        
                        if (pinMap && pinMap.length > 0) {
                            document.getElementById('pinMapSection').style.display = 'block';
                            container.innerHTML = '';
                            
                            // Sort pins numerically
                            pinMap.sort((a, b) => a.pin - b.pin);
                            
                            for (const item of pinMap) {
                                const pinDiv = document.createElement('div');
                                pinDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 2px; border-radius: 3px; border-left: 3px solid transparent;';
                                
                                // Color code by status
                                let borderColor = '#7fd962'; // green
                                let bgColor = 'rgba(127, 217, 98, 0.1)';
                                let icon = '✅';
                                
                                if (item.status === 'conflict') {
                                    borderColor = '#f26d78';
                                    bgColor = 'rgba(242, 109, 120, 0.15)';
                                    icon = '🔴';
                                } else if (item.status === 'warning') {
                                    borderColor = '#ffb454';
                                    bgColor = 'rgba(255, 180, 84, 0.15)';
                                    icon = '⚠️';
                                }
                                
                                pinDiv.style.borderLeftColor = borderColor;
                                pinDiv.style.backgroundColor = bgColor;
                                
                                // Pin label
                                const label = document.createElement('span');
                                label.textContent = icon + ' ' + item.pinLabel;
                                label.style.color = '#bfbdb6';
                                label.style.fontWeight = '500';
                                
                                // Usage type
                                const type = document.createElement('span');
                                type.textContent = item.primaryType.replace(/-/g, ' ').toUpperCase();
                                type.style.fontSize = '9px';
                                type.style.color = '#6c7380';
                                type.style.textTransform = 'uppercase';
                                
                                pinDiv.appendChild(label);
                                pinDiv.appendChild(type);
                                
                                // Add tooltip with conflict message
                                if (item.message) {
                                    pinDiv.title = item.message;
                                }
                                
                                container.appendChild(pinDiv);
                            }
                        } else {
                            // Empty pin map - hide the section
                            document.getElementById('pinMapSection').style.display = 'none';
                            container.innerHTML = '';
                        }
                    }

                    // Handle live memory analysis updates
                    if (message.type === 'liveMemoryUpdate') {
                        const { analysis } = message;
                        
                        if (analysis) {
                            document.getElementById('liveMemorySection').style.display = 'block';
                            
                            // Update RAM bar
                            const ramPercent = analysis.ram.percentage;
                            document.getElementById('liveRamPercent').textContent = ramPercent + '%';
                            document.getElementById('liveRamBar').style.width = ramPercent + '%';
                            document.getElementById('liveRamDetails').textContent = 
                                'Globals: ' + analysis.ram.globalVariables + 'B | Stack: ~' + analysis.ram.stackEstimate + 'B | Total: ' + analysis.ram.total + 'B';
                            
                            // Color code
                            const ramBar = document.getElementById('liveRamBar');
                            const ramPercentSpan = document.getElementById('liveRamPercent');
                            if (ramPercent >= 90) {
                                ramBar.style.background = '#f26d78';
                                ramPercentSpan.style.color = '#f26d78';
                            } else if (ramPercent >= 75) {
                                ramBar.style.background = '#ffb454';
                                ramPercentSpan.style.color = '#ffb454';
                            } else if (ramPercent >= 60) {
                                ramBar.style.background = '#e6b450';
                                ramPercentSpan.style.color = '#e6b450';
                            } else {
                                ramBar.style.background = '#7fd962';
                                ramPercentSpan.style.color = '#7fd962';
                            }
                            
                            // Show warnings
                            const warningsDiv = document.getElementById('liveMemoryWarnings');
                            if (analysis.warnings && analysis.warnings.length > 0) {
                                warningsDiv.innerHTML = '';
                                analysis.warnings.forEach(warning => {
                                    const warnDiv = document.createElement('div');
                                    warnDiv.style.cssText = 'padding: 6px 8px; margin-bottom: 4px; border-radius: 3px; font-size: 10px; line-height: 1.4;';
                                    
                                    if (warning.severity === 'error') {
                                        warnDiv.style.background = 'rgba(242, 109, 120, 0.15)';
                                        warnDiv.style.color = '#f26d78';
                                        warnDiv.style.borderLeft = '3px solid #f26d78';
                                        warnDiv.textContent = '🔴 ' + warning.message;
                                    } else if (warning.severity === 'warning') {
                                        warnDiv.style.background = 'rgba(255, 180, 84, 0.15)';
                                        warnDiv.style.color = '#ffb454';
                                        warnDiv.style.borderLeft = '3px solid #ffb454';
                                        warnDiv.textContent = '⚠️ ' + warning.message;
                                    } else {
                                        warnDiv.style.background = 'rgba(153, 173, 255, 0.1)';
                                        warnDiv.style.color = '#99adff';
                                        warnDiv.style.borderLeft = '3px solid #99adff';
                                        warnDiv.textContent = 'ℹ️ ' + warning.message;
                                    }
                                    
                                    warningsDiv.appendChild(warnDiv);
                                });
                            } else {
                                warningsDiv.innerHTML = '';
                            }
                            
                            // Show top memory consumers
                            const itemsDiv = document.getElementById('liveMemoryItems');
                            itemsDiv.innerHTML = ''; // Always clear first
                            
                            if (analysis.ram.items && analysis.ram.items.length > 0) {
                                itemsDiv.innerHTML = '<div style="margin-top: 8px; margin-bottom: 4px; font-size: 9px; color: #6c7380; text-transform: uppercase; letter-spacing: 0.5px;">Top Globals:</div>';
                                
                                // Sort by size, show top 5
                                const topItems = analysis.ram.items.sort((a, b) => b.size - a.size).slice(0, 5);
                                topItems.forEach(item => {
                                    const itemDiv = document.createElement('div');
                                    itemDiv.style.cssText = 'display: flex; justify-content: space-between; padding: 2px 0;';
                                    itemDiv.innerHTML = '<span style="color: #bfbdb6;">' + item.name + 
                                        (item.arraySize > 1 ? '[' + item.arraySize + ']' : '') + 
                                        '</span><span style="color: #6c7380;">' + item.size + 'B</span>';
                                    itemsDiv.appendChild(itemDiv);
                                });
                            }
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }

    public updateBoard(board: string) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public updatePort(port: string) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private sendAllCachedData() {
        if (!this._view) {
            return;
        }

        // Send cached post-build memory
        if (this._cachedMemory) {
            this._view.webview.postMessage({
                type: 'memoryUpdate',
                flashPercent: this._cachedMemory.flashPercent,
                flashUsed: this._cachedMemory.flashUsed,
                flashMax: this._cachedMemory.flashMax,
                ramPercent: this._cachedMemory.ramPercent,
                ramUsed: this._cachedMemory.ramUsed,
                ramMax: this._cachedMemory.ramMax
            });
        }

        // Send cached pin map
        if (this._cachedPinMap) {
            this._view.webview.postMessage({
                type: 'pinMapUpdate',
                pinMap: this._cachedPinMap
            });
        }

        // Send cached live memory
        if (this._cachedLiveMemory) {
            this._view.webview.postMessage({
                type: 'liveMemoryUpdate',
                analysis: this._cachedLiveMemory
            });
        }
    }

    public updateMemory(flashPercent: number, flashUsed: number, flashMax: number, ramPercent: number, ramUsed: number, ramMax: number) {
        // Cache the memory data
        this._cachedMemory = { flashPercent, flashUsed, flashMax, ramPercent, ramUsed, ramMax };
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'memoryUpdate',
                flashPercent,
                flashUsed,
                flashMax,
                ramPercent,
                ramUsed,
                ramMax
            });
        }
    }

    public updatePinMap(pinMap: any[], fileUri?: string) {
        // Cache pin map data (always update, even if empty)
        this._cachedPinMap = pinMap;
        this._cachedFileUri = fileUri;
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'pinMapUpdate',
                pinMap
            });
        }
    }

    public updateLiveMemory(analysis: any, fileUri?: string) {
        // Cache live memory data
        this._cachedLiveMemory = analysis;
        this._cachedFileUri = fileUri;
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'liveMemoryUpdate',
                analysis
            });
        }
    }
}
