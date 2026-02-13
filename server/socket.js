const { Server } = require("socket.io");
const { startServer, stopServer, writeInput, resizeTerminal, installDependencies, isInputEnabled, getProcess } = require("./services/processManager");

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Adjust for production security if needed
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    const { serverId, userId } = socket.handshake.query;

    if (serverId) {
        // Build a room name
        const roomName = `server-${serverId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined ${roomName}`);

        const runningProcess = getProcess(serverId);
        socket.emit('terminal-gate', {
          locked: !runningProcess || !isInputEnabled(serverId),
          message: runningProcess
            ? (isInputEnabled(serverId) ? 'Interactive input enabled' : 'Startup in progress. Input locked.')
            : 'Server not running. Input locked.'
        });

        // Handle terminal input
        socket.on('input', (data) => {
          const result = writeInput(serverId, data);
          if (!result.ok) {
            socket.emit('terminal-gate', {
              locked: true,
              message: result.reason === 'startup-pending'
                ? 'Startup still running. Wait until input is enabled.'
                : 'Input blocked.'
            });
          }
        });

        socket.on('resize', ({ cols, rows }) => {
            resizeTerminal(serverId, cols, rows);
        });
        
        // Commands
        socket.on('start-server', async (payload = {}) => {
             try {
             await startServer(serverId, io, {
               startCommand: payload.startCommand
             });
             } catch (e) {
                 socket.emit('error', e.message);
             }
        });

        socket.on('stop-server', async () => {
            await stopServer(serverId);
          io.to(roomName).emit('terminal-gate', {
            locked: true,
            message: 'Server stopped. Input locked.'
          });
        });

        socket.on('install-dependencies', async () => {
             try {
                await installDependencies(serverId, socket);
             } catch (e) {
                 socket.emit('error', e.message);
             }
        });
    }
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initSocket, getIO };