export function renderTerminal(container, socket, server) {
    let inputLocked = true;
    let lineBuffer = '';
    let liveLineEl = null;
    let carriageReturnPending = false;
    let rawDebug = localStorage.getItem('terminal_raw_debug') === 'true';

    const sanitizeOutput = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
            .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    };

    const classifyLine = (line) => {
        if (!line) return 'normal';
        if (/\[NodeHost\]/i.test(line)) return 'system';
        if (/(error|failed|missing script|exited with code|npm\s+error)/i.test(line)) return 'error';
        if (/(install complete|running|success|enabled)/i.test(line)) return 'success';
        return 'normal';
    };

    const parseStartCommand = (raw) => {
        const command = (raw || '').trim();
        if (!command) return { valid: true, startCommand: 'npm start -- index.js' };

        const normalized = command.replace(/\s+/g, ' ');
        const npmStartPattern = /^npm start(?:\s+--)?(?:\s+[A-Za-z0-9_./-]+)?$/i;
        const nodePattern = /^node\s+[A-Za-z0-9_./-]+$/i;

        if (!npmStartPattern.test(normalized) && !nodePattern.test(normalized)) {
            return {
                valid: false,
                error: 'Use either: npm start -- index.js OR node index.js'
            };
        }

        return { valid: true, startCommand: normalized };
    };

    container.innerHTML = `
        <div class="terminal-container">
            <div class="terminal-header">
                <div class="terminal-title">
                    <i class="fas fa-terminal"></i>
                    root@${server.name || 'server'}:~
                </div>
                <div class="terminal-lock-indicator locked" id="term-lock-indicator">
                    <i class="fas fa-lock"></i>
                    <span id="term-lock-text">Input locked (startup)</span>
                </div>
                <div class="terminal-actions">
                    <button class="btn btn-sm btn-success" id="btn-start" title="Start Server">
                        <i class="fas fa-play"></i> <span class="d-none d-md-inline">Start</span>
                    </button>
                    <button class="btn btn-sm btn-warning" id="btn-restart" title="Restart Server">
                        <i class="fas fa-redo"></i> <span class="d-none d-md-inline">Restart</span>
                    </button>
                    <button class="btn btn-sm btn-danger" id="btn-stop" title="Stop Server">
                        <i class="fas fa-stop"></i> <span class="d-none d-md-inline">Stop</span>
                    </button>
                    <button class="btn btn-sm btn-outline" id="btn-clear" title="Clear Console">
                        <i class="fas fa-eraser"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" id="btn-raw" title="Toggle raw stream debug">
                        Raw
                    </button>
                </div>
            </div>
            <div class="terminal-startup-bar">
                <label for="term-start-command">Startup command</label>
                <input type="text" id="term-start-command" class="terminal-startup-input" value="npm start -- index.js" autocomplete="off">
                <span class="terminal-startup-note">Allowed: npm start -- index.js OR node index.js</span>
            </div>
            <div class="terminal-content" id="term-out"></div>
            <div class="terminal-input-hint" id="term-input-hint" style="display:none;color:#888;padding:4px 0 0 8px;font-size:0.95em;">
                App may be waiting for input — type below
            </div>
            <div class="terminal-input-area">
                <span class="prompt-symbol">&gt;</span>
                <input type="text" class="terminal-input" id="term-in" placeholder="Input for your bot (e.g. phone number)" autocomplete="off" disabled>
            </div>
        </div>
    `;

    const termOut = container.querySelector('#term-out');
    const termIn = container.querySelector('#term-in');
    const lockIndicator = container.querySelector('#term-lock-indicator');
    const lockText = container.querySelector('#term-lock-text');
    const startCommandInput = container.querySelector('#term-start-command');
    const rawToggleBtn = container.querySelector('#btn-raw');

    const appendLine = (line) => {
        const trimmedSpinner = line.trim();
        if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/.test(trimmedSpinner)) return;

        const row = document.createElement('div');
        row.className = `terminal-line terminal-line-${classifyLine(line)}`;
        row.textContent = line || ' ';
        termOut.appendChild(row);
    };

    const trimBuffer = () => {
        const maxLines = 800;
        while (termOut.children.length > maxLines) {
            termOut.removeChild(termOut.firstChild);
        }
    };

    const ensureLiveLine = () => {
        if (!liveLineEl) {
            liveLineEl = document.createElement('div');
            liveLineEl.className = 'terminal-line terminal-line-live';
            termOut.appendChild(liveLineEl);
        }
    };

    const updateLiveLine = (text) => {
        ensureLiveLine();
        const lineType = classifyLine(text);
        liveLineEl.className = `terminal-line terminal-line-${lineType} terminal-line-live`;
        liveLineEl.textContent = text || ' ';
    };

    const commitLine = () => {
        if (liveLineEl) {
            const lineType = classifyLine(lineBuffer);
            liveLineEl.className = `terminal-line terminal-line-${lineType}`;
            liveLineEl.textContent = lineBuffer || ' ';
            liveLineEl = null;
        } else {
            appendLine(lineBuffer);
        }
        lineBuffer = '';
    };

    const setInputLockState = (locked, reason = '') => {
        inputLocked = locked;
        termIn.disabled = locked;
        lockIndicator.classList.toggle('locked', locked);
        lockIndicator.classList.toggle('ready', !locked);
        lockText.textContent = locked
            ? (reason || 'Input locked (startup)')
            : 'Interactive input enabled';
        if (!locked) {
            termIn.focus();
        }
    };

    const scrollToBottom = () => {
        termOut.scrollTop = termOut.scrollHeight;
    };

    const outputHandler = (data) => {
        if (rawDebug) {
            appendLine(`[raw] ${JSON.stringify(String(data))}`);
        }

        const clean = sanitizeOutput(data);
        if (!clean) return;

        for (let index = 0; index < clean.length; index += 1) {
            const char = clean[index];

            if (char === '\r') {
                const nextChar = clean[index + 1];
                if (nextChar === '\n') {
                    carriageReturnPending = false;
                    commitLine();
                    index += 1;
                } else {
                    if (lineBuffer) {
                        carriageReturnPending = false;
                        commitLine();
                    } else {
                        carriageReturnPending = true;
                    }
                }
                continue;
            }

            if (char === '\n') {
                carriageReturnPending = false;
                commitLine();
                continue;
            }

            if (carriageReturnPending) {
                lineBuffer = '';
                carriageReturnPending = false;
            }

            lineBuffer += char;
            if (lineBuffer.length > 2000) {
                commitLine();
                continue;
            }

            updateLiveLine(lineBuffer);
        }

        trimBuffer();
        scrollToBottom();
    };

    const gateHandler = (payload) => {
        const locked = Boolean(payload?.locked);
        const reason = payload?.message || (locked ? 'Input locked (startup)' : 'Interactive input enabled');
        setInputLockState(locked, reason);
    };

    const errorHandler = (message) => {
        appendLine(`[error] ${message}`);
        scrollToBottom();
    };

    socket.on('output', outputHandler);
    socket.on('terminal-gate', gateHandler);
    socket.on('error', errorHandler);

    termIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (inputLocked) return;
            const cmd = termIn.value;
            if (!cmd.trim()) return;
            socket.emit('input', cmd + '\n');
            termIn.value = '';
        }
    });

    const startServerWithSafeCommand = () => {
        const parsed = parseStartCommand(startCommandInput.value);
        if (!parsed.valid) {
            alert(parsed.error);
            return;
        }

        setInputLockState(true, 'Running npm install and startup command...');
        socket.emit('start-server', { startCommand: parsed.startCommand });
    };

    container.querySelector('#btn-start').onclick = startServerWithSafeCommand;

    container.querySelector('#btn-restart').onclick = () => {
        socket.emit('stop-server');
        setInputLockState(true, 'Restarting...');
        setTimeout(() => startServerWithSafeCommand(), 1200);
    };

    container.querySelector('#btn-stop').onclick = () => {
        socket.emit('stop-server');
        setInputLockState(true, 'Server stopped');
    };

    container.querySelector('#btn-clear').onclick = () => {
        termOut.innerHTML = '';
        lineBuffer = '';
        liveLineEl = null;
        carriageReturnPending = false;
    };

    const applyRawButtonState = () => {
        rawToggleBtn.textContent = rawDebug ? 'Raw ON' : 'Raw';
        rawToggleBtn.style.borderColor = rawDebug ? 'var(--accent-primary)' : '';
        rawToggleBtn.style.color = rawDebug ? 'var(--accent-primary)' : '';
    };

    rawToggleBtn.onclick = () => {
        rawDebug = !rawDebug;
        localStorage.setItem('terminal_raw_debug', rawDebug ? 'true' : 'false');
        applyRawButtonState();
        appendLine(rawDebug ? '[NodeHost] Raw debug enabled.' : '[NodeHost] Raw debug disabled.');
        scrollToBottom();
    };

    applyRawButtonState();

    container.querySelector('.terminal-container').onclick = (e) => {
        const interactiveTarget = e.target.closest('button, input, textarea, label, a');
        if (interactiveTarget) return;

        const clickedOutputArea = e.target.closest('.terminal-content');
        if (clickedOutputArea) {
            termIn.focus();
        }
    };

    return () => {
        socket.off('output', outputHandler);
        socket.off('terminal-gate', gateHandler);
        socket.off('error', errorHandler);
    };
}
