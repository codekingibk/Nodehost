const pty = require('node-pty');
const path = require('path');
const fs = require('fs').promises;
const { rehydrate, BASE_TMP_DIR } = require('./rehydration');
const Server = require('../models/Server');
const { SERVER_STATUS } = require('../utils/constants');

const hasExpired = (server) => !!(server?.expiresAt && new Date(server.expiresAt).getTime() < Date.now());

// Memory store for active processes
// serverId -> { ptyProcess, socketNamespace? }
const activeProcesses = new Map();

const getProcess = (serverId) => activeProcesses.get(serverId);

const emitGate = (io, serverId, locked, message) => {
    io.to(`server-${serverId}`).emit('terminal-gate', { locked, message });
};

const parseSafeStartCommand = (startCommandRaw) => {
    const raw = (startCommandRaw || '').trim();
    if (!raw) {
        return {
            mode: 'npm',
            args: ['start', '--', 'index.js'],
            display: 'npm start -- index.js',
            entryFile: 'index.js'
        };
    }

    const normalized = raw.replace(/\s+/g, ' ');
    const npmPattern = /^npm start(?:\s+--)?(?:\s+[A-Za-z0-9_./-]+)?$/i;
    const nodePattern = /^node\s+([A-Za-z0-9_./-]+)$/i;

    if (!npmPattern.test(normalized) && !nodePattern.test(normalized)) {
        throw new Error('Invalid startup command. Only npm start (optional entry file) is allowed.');
    }

    if (nodePattern.test(normalized)) {
        const match = normalized.match(nodePattern);
        const entryFile = (match && match[1]) ? match[1].trim() : '';

        if (!entryFile || entryFile.includes('..') || path.isAbsolute(entryFile)) {
            throw new Error('Invalid entry file path.');
        }

        return {
            mode: 'node',
            args: [entryFile],
            display: `node ${entryFile}`,
            entryFile
        };
    }

    const parts = normalized.split(' ');
    let entryFile = null;

    if (parts.length > 2) {
        if (parts[2] === '--') {
            entryFile = parts[3] || null;
        } else {
            entryFile = parts[2] || null;
        }
    }

    if (!entryFile) {
        return { mode: 'npm', args: ['start'], display: 'npm start', entryFile: 'index.js' };
    }

    if (entryFile.includes('..') || path.isAbsolute(entryFile)) {
        throw new Error('Invalid entry file path.');
    }

    return {
        mode: 'npm',
        args: ['start', '--', entryFile],
        display: `npm start -- ${entryFile}`,
        entryFile
    };
};

const hasPackageJson = async (serverDir) => {
    try {
        await fs.access(path.join(serverDir, 'package.json'));
        return true;
    } catch {
        return false;
    }
};

const hasStartScript = async (serverDir) => {
    try {
        const pkgRaw = await fs.readFile(path.join(serverDir, 'package.json'), 'utf8');
        const pkg = JSON.parse(pkgRaw);
        return Boolean(pkg?.scripts?.start && String(pkg.scripts.start).trim());
    } catch {
        return false;
    }
};

const resolveLaunchCommand = async (serverDir, npmCmd, startConfig) => {
    const entryFile = startConfig.entryFile || 'index.js';
    if (startConfig.mode === 'node') {
        const entryPath = path.join(serverDir, entryFile);
        try {
            await fs.access(entryPath);
        } catch {
            throw new Error(`Entry file "${entryFile}" does not exist.`);
        }

        const isWindows = process.platform === 'win32';

        if (isWindows) {
            return {
                cmd: 'cmd.exe',
                args: ['/d', '/s', '/c', 'node', entryFile],
                display: `node ${entryFile}`,
                shouldInstall: false,
                mode: 'node'
            };
        }

        return {
            cmd: process.execPath,
            args: [entryFile],
            display: `node ${entryFile}`,
            shouldInstall: false,
            mode: 'node'
        };
    }

    const packageExists = await hasPackageJson(serverDir);
    if (!packageExists) {
        throw new Error('package.json is required for npm start mode. Use `node <file>` instead.');
    }

    const startScriptExists = await hasStartScript(serverDir);
    if (!startScriptExists) {
        throw new Error('Missing `start` script in package.json. Use `node <file>` or add a start script.');
    }

    return {
        cmd: npmCmd,
        args: startConfig.args,
        display: startConfig.display,
        shouldInstall: true,
        mode: 'npm'
    };
};

const runNpmInstall = (serverDir, io, serverId) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    return new Promise((resolve, reject) => {
        const installProc = pty.spawn(npmCmd, ['install', '--no-progress', '--no-audit', '--no-fund'], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: serverDir,
            env: {
                ...process.env,
                NPM_CONFIG_PROGRESS: 'false'
            }
        });

        installProc.onData((data) => {
            io.to(`server-${serverId}`).emit('output', data);
        });

        installProc.onExit(({ exitCode }) => {
            if (exitCode === 0) {
                resolve();
                return;
            }
            reject(new Error(`npm install failed with exit code ${exitCode}`));
        });
    });
};

const normalizeEnvVars = (envMapOrObject) => {
    const result = {};
    if (!envMapOrObject) return result;

    const entries = envMapOrObject instanceof Map
        ? Array.from(envMapOrObject.entries())
        : Object.entries(envMapOrObject);

    for (const [rawKey, rawValue] of entries) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        result[key] = String(rawValue ?? '');
    }

    return result;
};

const stopServer = async (serverId) => {
    const proc = activeProcesses.get(serverId);
    if (proc && proc.ptyProcess) {
        try {
            proc.ptyProcess.kill();
        } catch (e) {
            console.error(`Failed to kill process for ${serverId}`, e);
        }
        activeProcesses.delete(serverId);
        
        await Server.updateOne({ serverId }, { 
            status: SERVER_STATUS.STOPPED,
            stoppedAt: new Date(),
            pid: null 
        });
    }
};

const installDependencies = async (serverId, socket) => {
    const serverDir = path.join(BASE_TMP_DIR, serverId);
    
    // Notify "Installing"
    await Server.updateOne({ serverId }, { status: SERVER_STATUS.INSTALLING });
    socket.emit('status', SERVER_STATUS.INSTALLING);
    socket.emit('output', '\r\n\x1b[33m> Starting dependency installation...\x1b[0m\r\n');

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: serverDir,
        env: process.env
    });

    // Pipe output
    ptyProcess.onData((data) => {
        socket.emit('output', data);
    });

    // Run install
    const installCmd = process.platform === 'win32' ? 'npm install\r' : 'npm install\n';
    ptyProcess.write(installCmd);

    return new Promise((resolve, reject) => {
        // This is a naive way to detect end of install in a PTY, 
        // usually we'd wait for the process to exit, but we spawned a shell.
        // Better to spawn 'npm' directly for install task?
        // Let's spawn npm distinct from the shell to get exit code easily.
        // But for 'interactive' feel, pty is nice. 
        // Let's stick to spawning a command for install instead of persistent shell.
        
        process.kill(ptyProcess.pid); // Kill the shell we just started to restart as pure command
        
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const installProc = pty.spawn(npmCmd, ['install'], {
            cwd: serverDir,
             env: process.env
        });
        
        installProc.onData(d => socket.emit('output', d));
        
        installProc.onExit(async ({ exitCode }) => {
            if (exitCode === 0) {
                 socket.emit('output', '\r\n\x1b[32m> Installation complete!\x1b[0m\r\n');
                 await Server.updateOne({ serverId }, { status: SERVER_STATUS.STOPPED });
                 socket.emit('status', SERVER_STATUS.STOPPED);
                 resolve();
            } else {
                 socket.emit('output', '\r\n\x1b[31m> Installation failed.\x1b[0m\r\n');
                 await Server.updateOne({ serverId }, { status: SERVER_STATUS.STOPPED }); // Or BROKEN
                 socket.emit('status', SERVER_STATUS.STOPPED);
                 reject(new Error('Install failed'));
            }
        });
    });
};

const startServer = async (serverId, io, options = {}) => {
    // 1. Get DB record
    const server = await Server.findOne({ serverId });
    if (!server) throw new Error('Server not found');

    if (hasExpired(server)) {
        await Server.updateOne({ serverId }, {
            status: SERVER_STATUS.STOPPED,
            stoppedAt: new Date(),
            pid: null
        });
        io.to(`server-${serverId}`).emit('output', `\r\n[NodeHost] Server subscription expired. Please renew to start this instance.\r\n`);
        emitGate(io, serverId, true, 'Server expired. Renew required.');
        throw new Error('Server expired. Renew this server to continue.');
    }

    if (activeProcesses.has(serverId)) {
        return; // Already running
    }

    // 2. Rehydrate
    const fileSystem = server.fileSystem;
    const serverDir = await rehydrate(serverId, fileSystem);

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const startConfig = parseSafeStartCommand(options.startCommand);
        const selectedNodeVersion = String(server.nodeVersion || '18');
        const selectedEnvVars = normalizeEnvVars(server.envVars);
        const hostNodeVersionMajor = String(process.versions?.node || '').split('.')[0] || 'unknown';

    const launchConfig = await resolveLaunchCommand(serverDir, npmCmd, startConfig);

    await Server.updateOne({ serverId }, {
        status: SERVER_STATUS.INSTALLING,
        startedAt: new Date(),
        pid: null
    });
    io.to(`server-${serverId}`).emit('status', SERVER_STATUS.INSTALLING);
    emitGate(io, serverId, true, 'Preparing runtime...');
    io.to(`server-${serverId}`).emit('output', `\r\n[NodeHost] Requested Node.js: ${selectedNodeVersion} | Host runtime: ${hostNodeVersionMajor}\r\n`);
    io.to(`server-${serverId}`).emit('output', `[NodeHost] Loaded ${Object.keys(selectedEnvVars).length} environment variable(s).\r\n`);

    if (launchConfig.shouldInstall) {
        io.to(`server-${serverId}`).emit('output', '[NodeHost] Running npm install...\r\n');
        try {
            await runNpmInstall(serverDir, io, serverId);
            io.to(`server-${serverId}`).emit('output', '[NodeHost] Install complete.\r\n');
        } catch (error) {
            await Server.updateOne({ serverId }, {
                status: SERVER_STATUS.BROKEN,
                stoppedAt: new Date(),
                pid: null
            });
            io.to(`server-${serverId}`).emit('status', SERVER_STATUS.BROKEN);
            emitGate(io, serverId, true, 'Install failed. Input disabled.');
            io.to(`server-${serverId}`).emit('output', `\r\n[NodeHost] ${error.message}\r\n`);
            throw error;
        }
    } else {
        io.to(`server-${serverId}`).emit('output', '[NodeHost] Direct node mode selected. Skipping npm install.\r\n');
    }

    io.to(`server-${serverId}`).emit('output', `[NodeHost] Launching ${launchConfig.display}...\r\n`);
    emitGate(io, serverId, true, 'Starting bot process...');

    // 4. Start process with safe command
    const ptyProcess = pty.spawn(launchConfig.cmd, launchConfig.args, {
        name: launchConfig.mode === 'node' ? 'dumb' : 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: serverDir,
            env: {
                ...process.env,
                ...selectedEnvVars,
                NODE_VERSION_SELECTED: selectedNodeVersion,
                TERM: launchConfig.mode === 'node' ? 'dumb' : (process.env.TERM || 'xterm-color'),
                PORT: '3000'
            } // Mock port for the bot? 
        // Logic Gap: If multiple bots run, they can't bind 3000. 
        // Nodehost runs on process.env.PORT (Render).
        // Bots *cannot* start a web server on a port visible to outside unless we proxy.
        // Spec requirements: "Node.js WhatsApp bots".
        // WhatsApp bots (Baileys/WWeb.js) don't necessarily need a port, they connect OUT to WA.
        // If they validly need a port, it won't be exposed.
    });

    // 5. Update DB
    await Server.updateOne({ serverId }, { 
        status: SERVER_STATUS.RUNNING,
        startedAt: new Date(),
        pid: ptyProcess.pid
    });

    let interactiveReady = false;

    activeProcesses.set(serverId, { ptyProcess, inputEnabled: false });

    const unlockIfSilent = setTimeout(() => {
        if (interactiveReady) return;
        const proc = activeProcesses.get(serverId);
        if (!proc) return;
        proc.inputEnabled = true;
        interactiveReady = true;
        emitGate(io, serverId, false, 'Process started (silent mode). Input enabled.');
        io.to(`server-${serverId}`).emit('output', '[NodeHost] Process is running. No output yet.\r\n');
    }, 1200);

    // 6. Wire up Socket
    ptyProcess.onData((data) => {
        if (!interactiveReady) {
            interactiveReady = true;
            const proc = activeProcesses.get(serverId);
            if (proc) {
                proc.inputEnabled = true;
            }
            emitGate(io, serverId, false, 'Bot is running. Input enabled.');
        }
        io.to(`server-${serverId}`).emit('output', data);
    });

    ptyProcess.onExit(async (code) => {
        clearTimeout(unlockIfSilent);
        console.log(`Server ${serverId} exited with code`, code);
        activeProcesses.delete(serverId);
        await Server.updateOne({ serverId }, { 
            status: code.exitCode === 0 ? SERVER_STATUS.STOPPED : SERVER_STATUS.BROKEN,
            stoppedAt: new Date(),
            pid: null 
        });
        emitGate(io, serverId, true, 'Process exited. Input locked.');
        io.to(`server-${serverId}`).emit('status', code.exitCode === 0 ? SERVER_STATUS.STOPPED : SERVER_STATUS.BROKEN);
        io.to(`server-${serverId}`).emit('output', `\r\nProcess exited with code ${code.exitCode}\r\n`);
    });
    io.to(`server-${serverId}`).emit('status', SERVER_STATUS.RUNNING);
};

const writeInput = (serverId, data) => {
    const proc = activeProcesses.get(serverId);
    if (!proc || !proc.ptyProcess) {
        return { ok: false, reason: 'not-running' };
    }

    if (!proc.inputEnabled) {
        return { ok: false, reason: 'startup-pending' };
    }

    const value = typeof data === 'string' ? data : '';
    if (!value || value.length > 256) {
        return { ok: false, reason: 'invalid-input' };
    }

    const sanitized = value.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    proc.ptyProcess.write(sanitized);
    return { ok: true };
};

const isInputEnabled = (serverId) => {
    const proc = activeProcesses.get(serverId);
    return Boolean(proc && proc.inputEnabled);
};

const lockInput = (serverId) => {
    const proc = activeProcesses.get(serverId);
    if (proc) {
        proc.inputEnabled = false;
    }
};

const resizeTerminal = (serverId, cols, rows) => {
     const proc = activeProcesses.get(serverId);
    if (proc && proc.ptyProcess) {
        proc.ptyProcess.resize(cols, rows);
    }
};

module.exports = {
    startServer,
    stopServer,
    installDependencies,
    writeInput,
    isInputEnabled,
    lockInput,
    resizeTerminal,
    getProcess
};