const express = require('express');
const router = express.Router();
const Server = require('../models/Server');
const { requireAuth } = require('../middleware/auth');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { LIMITS } = require('../utils/constants');
const { BASE_TMP_DIR, encodeKey, decodeKey } = require('../services/rehydration');
const archiver = require('archiver');

const ensureLifecycleFields = (server) => {
    if (!server.expiresAt) {
        const baseDate = server.createdAt ? new Date(server.createdAt) : new Date();
        server.expiresAt = new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000);
        if (!server.renewedAt) server.renewedAt = baseDate;
    }
};

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: LIMITS.MAX_SINGLE_FILE_BYTES } 
});

const isValidPath = (p) => p && !p.includes('..') && !path.isAbsolute(p);

const contentSize = (fileData) => {
    if (!fileData) return 0;
    const value = typeof fileData === 'string' ? fileData : (fileData.content || '');
    return Buffer.byteLength(String(value), 'utf8');
};

const getTotalFileSystemBytes = (fileSystem) => {
    if (!fileSystem || typeof fileSystem.entries !== 'function') return 0;
    let total = 0;
    for (const [, fileData] of fileSystem.entries()) {
        total += contentSize(fileData);
    }
    return total;
};

const getProjectedTotalBytes = (fileSystem, encodedPath, nextContent) => {
    const currentTotal = getTotalFileSystemBytes(fileSystem);
    const existing = fileSystem.get(encodedPath);
    const existingSize = contentSize(existing);
    const nextSize = Buffer.byteLength(String(nextContent || ''), 'utf8');
    return currentTotal - existingSize + nextSize;
};

// 1. LIST FILES (Recursive Tree)
router.get('/:serverId/list', requireAuth, async (req, res) => {
    const { serverId } = req.params;
    
    try {
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        if (!server) return res.status(404).json({ error: 'Server not found' });
        ensureLifecycleFields(server);

        const fileSystem = server.fileSystem || new Map();
        const tree = [];

        // Simple function to add node to tree
        const addNode = (currentLevel, parts, fullPath) => {
            const part = parts.shift();
            // If no more parts, it's the leaf (file)
            if (!part) return;

            let node = currentLevel.find(n => n.name === part);
            
            // If it's the last part, it's a file (based on our map keys being files)
            const isFile = parts.length === 0;

            if (!node) {
                node = {
                    name: part,
                    type: isFile ? 'file' : 'directory',
                    path: isFile ? fullPath : (fullPath.split(part)[0] + part), // approximate dir path
                    children: []
                };
                currentLevel.push(node);
            }

            if (!isFile) {
                addNode(node.children, parts, fullPath);
            }
        };

        // Populate tree
        // Map keys are full paths like "src/index.js"
        if (fileSystem && fileSystem.size > 0) {
            for (const encodedKey of fileSystem.keys()) {
                const filePath = decodeKey(encodedKey);
                const parts = filePath.split('/');
                addNode(tree, parts, filePath);
            }
        }
        
        // Sort function
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });
            nodes.forEach(n => {
                if (n.children && n.children.length > 0) sortNodes(n.children);
            });
        };
        sortNodes(tree);

        res.json(tree);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// 2. GET CONTENT
router.get('/:serverId/content', requireAuth, async (req, res) => {
    const { path: filePath } = req.query; 
    const { serverId } = req.params;

    if (!isValidPath(filePath)) return res.status(400).json({ error: 'Invalid path' });

    const server = await Server.findOne({ serverId, userId: req.auth.userId });
    if (!server) return res.status(404).json({ error: 'Server not found' });

    // Try disk first
    const fullPath = path.join(BASE_TMP_DIR, serverId, filePath);
    
    try {
        const content = await fs.readFile(fullPath, 'utf8');
        res.json({ content });
    } catch (e) {
        // Fallback to DB
        // Encode key before lookup
        const fileData = server.fileSystem.get(encodeKey(filePath));
        if (fileData) {
             const content = typeof fileData === 'string' ? fileData : fileData.content;
             return res.json({ content });
        }
        res.status(404).json({ error: 'File not found' });
    }
});

// 3. SAVE / CREATE FILE
router.post('/:serverId/save', requireAuth, async (req, res) => {
    const { path: filePath, content } = req.body;
    const { serverId } = req.params;

    if (!isValidPath(filePath)) return res.status(400).json({ error: 'Invalid path' });

    try {
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        ensureLifecycleFields(server);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const fileBytes = Buffer.byteLength(String(content || ''), 'utf8');
        if (fileBytes > LIMITS.MAX_SINGLE_FILE_BYTES) {
            return res.status(400).json({
                error: `File too large. Maximum allowed is ${Math.floor(LIMITS.MAX_SINGLE_FILE_BYTES / 1024)} KB.`
            });
        }

        const encodedPath = encodeKey(filePath);
        const projectedTotal = getProjectedTotalBytes(server.fileSystem, encodedPath, content);
        if (projectedTotal > LIMITS.MAX_TOTAL_FILES_BYTES) {
            return res.status(400).json({
                error: `Server storage limit reached. Maximum total is ${Math.floor(LIMITS.MAX_TOTAL_FILES_BYTES / 1024)} KB.`
            });
        }

        // Update DB
        server.fileSystem.set(encodedPath, { content, type: 'file', updatedAt: new Date() });
        server.markModified('fileSystem');
        await server.save();

        // Update Disk
        const fullPath = path.join(BASE_TMP_DIR, serverId, filePath);
        const dir = path.dirname(fullPath);
        
        try {
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, content);
        } catch (err) {
            console.error("Disk write failed (server might be offline)", err.message);
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Save Error:", e);
        res.status(500).json({ error: 'Save failed: ' + e.message });
    }
});

// 4. CREATE DIRECTORY
router.post('/:serverId/create-dir', requireAuth, async (req, res) => {
    const { path: dirPath } = req.body;
    const { serverId } = req.params;

    if (!isValidPath(dirPath)) return res.status(400).json({ error: 'Invalid path' });

    try {
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        ensureLifecycleFields(server);
        
        const keepFile = `${dirPath}/.keep`;
        server.fileSystem.set(encodeKey(keepFile), { content: '', type: 'file', hidden: true });
        server.markModified('fileSystem');
        await server.save();
        
        // Disk
        const fullPath = path.join(BASE_TMP_DIR, serverId, dirPath);
        try {
            await fs.mkdir(fullPath, { recursive: true });
        } catch (e) {}

        res.json({ success: true });
    } catch(e) {
        console.error("Dir Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 5. DELETE
router.delete('/:serverId/delete', requireAuth, async (req, res) => {
    const { path: targetPath } = req.query;
    const { serverId } = req.params;

    if (!isValidPath(targetPath)) return res.status(400).json({ error: 'Invalid path' });

    try {
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        ensureLifecycleFields(server);
        
        // DB Deletion (Handle folder prefix)
        let deleted = false;
        
        const encodedTarget = encodeKey(targetPath);

        // If file, delete directly
        if (server.fileSystem.has(encodedTarget)) {
            server.fileSystem.delete(encodedTarget);
            deleted = true;
        }

        // Check if directory (prefix match)
        // Must check DECODED keys for prefix match
        const folderPrefix = targetPath.endsWith('/') ? targetPath : targetPath + '/';
        const keys = Array.from(server.fileSystem.keys()); 
        
        for (const encodedKey of keys) {
            const filePath = decodeKey(encodedKey);
            if (filePath.startsWith(folderPrefix) || filePath === targetPath) {
                server.fileSystem.delete(encodedKey);
                deleted = true;
            }
        }
        
        if (deleted) {
            server.markModified('fileSystem');
            await server.save();
        }

        // Disk Deletion
        const fullPath = path.join(BASE_TMP_DIR, serverId, targetPath);
        try {
            await fs.rm(fullPath, { recursive: true, force: true });
        } catch (e) {}

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. RENAME / MOVE
router.post('/:serverId/rename', requireAuth, async (req, res) => {
    const { oldPath, newPath } = req.body;
    const { serverId } = req.params;

    if (!isValidPath(oldPath) || !isValidPath(newPath)) return res.status(400).json({ error: 'Invalid path' });

    try {
        const server = await Server.findOne({ serverId, userId: req.auth.userId });

        // Identify keys to move
        const moves = [];
        const keys = Array.from(server.fileSystem.keys());
        
        const encodedOldPath = encodeKey(oldPath);
        const encodedNewPath = encodeKey(newPath);

        // Exact match
        if (server.fileSystem.has(encodedOldPath)) {
            moves.push({ old: encodedOldPath, new: encodedNewPath, data: server.fileSystem.get(encodedOldPath) });
        }

        // Folder Prefix match
        const folderPrefix = oldPath.endsWith('/') ? oldPath : oldPath + '/';
        const newPrefix = newPath.endsWith('/') ? newPath : newPath + '/';

        for (const encodedKey of keys) {
            const filePath = decodeKey(encodedKey);
            if (filePath.startsWith(folderPrefix)) {
                const suffix = filePath.replace(folderPrefix, '');
                // Encode new key
                const newFilePath = newPrefix + suffix;
                moves.push({ old: encodedKey, new: encodeKey(newFilePath), data: server.fileSystem.get(encodedKey) });
            }
        }

        if (moves.length === 0) return res.status(404).json({ error: 'Path not found' });

        // Execute moves in DB
        moves.forEach(m => {
            const data = server.fileSystem.get(m.old); 
            server.fileSystem.delete(m.old);
            server.fileSystem.set(m.new, data);
        });
        
        server.markModified('fileSystem');
        await server.save();

        // Disk Rename
        const oldFullPath = path.join(BASE_TMP_DIR, serverId, oldPath);
        const newFullPath = path.join(BASE_TMP_DIR, serverId, newPath);
        
        try {
            // Ensure parent dir exists
            await fs.mkdir(path.dirname(newFullPath), { recursive: true });
            await fs.rename(oldFullPath, newFullPath);
        } catch (e) {}

        res.json({ success: true });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. DOWNLOAD
router.get('/:serverId/download', requireAuth, async (req, res) => {
    const { path: filePath } = req.query;
    const { serverId } = req.params;
    
    if (!isValidPath(filePath)) return res.status(400).json({ error: 'Invalid path' });
    
    const fullPath = path.join(BASE_TMP_DIR, serverId, filePath);
    try {
        await fs.access(fullPath);
        res.download(fullPath);
    } catch (e) {
        // Fallback DB download
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        // Use encoded key
        const file = server.fileSystem.get(encodeKey(filePath));
        if (file) {
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
            res.send(typeof file === 'string' ? file : file.content);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    }
});

// 8. ARCHIVE (Zip)
router.get('/:serverId/archive', requireAuth, async (req, res) => {
    const { path: targetPath = '' } = req.query; 
    const { serverId } = req.params;

    const fullPath = path.join(BASE_TMP_DIR, serverId, targetPath);
    
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        res.attachment(`${targetPath ? path.basename(targetPath) : 'archive'}.zip`);
        archive.pipe(res);

        // Add files from disk
        // If targetPath is empty, archive everything in server dir
        archive.directory(fullPath, false);
        
        await archive.finalize();

    } catch (e) {
        res.status(500).json({ error: 'Archiving failed' });
    }
});

// 9. UPLOAD
router.post('/:serverId/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { path: uploadDir = '' } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ error: 'No file' });
        
        const server = await Server.findOne({ serverId, userId: req.auth.userId });
        if (!server) return res.status(404).json({ error: 'Server not found' });
        ensureLifecycleFields(server);
        
        let targetPath = file.originalname;
        if (uploadDir) targetPath = `${uploadDir}/${file.originalname}`.replace('//', '/');

        if (!isValidPath(targetPath)) {
            return res.status(400).json({ error: 'Invalid upload path' });
        }

        if (file.size > LIMITS.MAX_SINGLE_FILE_BYTES) {
            return res.status(400).json({
                error: `Upload too large. Maximum allowed is ${Math.floor(LIMITS.MAX_SINGLE_FILE_BYTES / 1024)} KB.`
            });
        }
        
        const content = file.buffer.toString('utf8'); // Text assumption

        const encodedPath = encodeKey(targetPath);
        const projectedTotal = getProjectedTotalBytes(server.fileSystem, encodedPath, content);
        if (projectedTotal > LIMITS.MAX_TOTAL_FILES_BYTES) {
            return res.status(400).json({
                error: `Server storage limit reached. Maximum total is ${Math.floor(LIMITS.MAX_TOTAL_FILES_BYTES / 1024)} KB.`
            });
        }
        
        server.fileSystem.set(encodedPath, { content, type: 'file', updatedAt: new Date() });
        server.markModified('fileSystem');
        await server.save();
        
        // Disk
        const fullPath = path.join(BASE_TMP_DIR, serverId, targetPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
