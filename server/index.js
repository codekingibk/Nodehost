require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const dns = require('dns');
const { initSocket } = require('./socket');
const { requireAuth } = require('./middleware/auth'); // Check logic later
const { startMaintenanceScheduler } = require('./services/maintenanceService');

// Fix for Node 17+ IPv6 issues
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Try to force Google DNS if local DNS fails for SRV records
try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
    console.log("Using Google DNS for resolution");
} catch (e) {
    console.log("Could not set custom DNS servers");
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false // Relax for now for scripts/images
})); 
app.use(compression());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Initialize Socket.io
initSocket(server);
startMaintenanceScheduler();

// Database Connection
mongoose.connect(process.env.MONGO_URI, { family: 4 })
.then(() => console.log('MongoDB Connected'))
  .catch(err => {
      console.error('MongoDB Connection Error:', err);
      console.error('If you are seeing "querySrv ECONNREFUSED", check your internet connection or try using a non-SRV connection string.');
      // Don't exit, just log, so server stays up for auth debugging
  });

// Routes
// app.use('/api/auth', require('./routes/auth')); // Webhooks if needed
app.use('/api/users', require('./routes/users'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/admin', require('./routes/admin'));
// app.use('/api/economy', require('./routes/economy'));
app.use('/api/files', require('./routes/files'));

// Health Check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Serve frontend in production
// Serve frontend for all non-API routes (for Render, Vercel, etc)
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
    // If not an API route, serve index.html
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Clerk Key Check:", process.env.CLERK_SECRET_KEY ? "Loaded (Starts with " + process.env.CLERK_SECRET_KEY.substring(0,7) + ")" : "MISSING");
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});

// Create global error handler to prevent crashes
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});