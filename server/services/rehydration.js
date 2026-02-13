const fs = require('fs').promises;
const path = require('path');
const Server = require('../models/Server');

// Base directory for temp storage - /tmp on Render
const BASE_TMP_DIR = process.platform === 'win32' ? path.join(process.env.TEMP || 'C:\\Temp', 'nodehost_bots') : '/tmp/nodehost_bots';

// HELPER: Encode keys for Mongoose Map (dots not allowed)
const encodeKey = (k) => k.replace(/\./g, '%2E');
const decodeKey = (k) => k.replace(/%2E/g, '.');

const ensureDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

/**
 * Rehydrates a bot's files from MongoDB to disk
 * @param {string} serverId 
 * @param {Map} fileSystem - The fileSystem map from the Server model (optional override)
 */
const rehydrate = async (serverId, fileSystemOverride) => {
  const serverDir = path.join(BASE_TMP_DIR, serverId);
  await ensureDir(serverDir);
  
  let fileSystem = fileSystemOverride;
  if (!fileSystem) {
      const server = await Server.findOne({ serverId });
      if (!server) throw new Error('Server not found');
      fileSystem = server.fileSystem;
  }

  // If empty or null map
  if (!fileSystem || fileSystem.size === 0) {
      // Create minimal package.json if empty
      const defaultPackageJson = {
          name: "my-bot",
          version: "1.0.0",
          main: "index.js",
          scripts: { "start": "node index.js" },
          dependencies: {}
      };
      await fs.writeFile(path.join(serverDir, 'package.json'), JSON.stringify(defaultPackageJson, null, 2));
      return serverDir;
  }

  // Iterate over the Map and write files
  // Keys are stored encoded (e.g., 'src%2Ejs'), we must decode to write to disk
  for (const [key, fileData] of fileSystem.entries()) {
    const relPath = decodeKey(key);
    const fullPath = path.join(serverDir, relPath);
    const dirName = path.dirname(fullPath);
    
    await ensureDir(dirName);
    
    // Safety handling for fileData (could be string or object)
    let content = '';
    if (typeof fileData === 'string') {
        content = fileData;
    } else if (fileData && fileData.content) {
        content = fileData.content;
    }
    
    await fs.writeFile(fullPath, content);
  }

  return serverDir;
};

/**
 * Syncs changes from disk back to MongoDB
 * Call this after file operations or periodic intervals
 * @param {string} serverId 
 */
const syncToDB = async (serverId) => {
  const serverDir = path.join(BASE_TMP_DIR, serverId);
  const server = await Server.findOne({ serverId });
  
  if (!server) throw new Error('Server not found');

  const fileMap = new Map();

  const readDirRecursive = async (dir, baseDir) => {
    const files = await fs.readdir(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      // Relative path for DB key
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/'); // Force forward slashes

      if (file.isDirectory()) {
         if (file.name === 'node_modules' || file.name === '.git') continue;
         await readDirRecursive(fullPath, baseDir);
      } else {
         const content = await fs.readFile(fullPath, 'utf8');
         const key = encodeKey(relPath);
         fileMap.set(key, { content, type: 'file', updatedAt: new Date() });
      }
    }
  };

  try {
      await readDirRecursive(serverDir, serverDir);
      server.fileSystem = fileMap;
      server.markModified('fileSystem');
      await server.save();
      console.log(`[Rehydration] Synced ${serverId} to DB`);
  } catch (err) {
      console.error(`[Rehydration] Error syncing ${serverId}:`, err);
  }
};

module.exports = {
  BASE_TMP_DIR,
  encodeKey,
  decodeKey,
  rehydrate,
  syncToDB
};
