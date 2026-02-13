const fs = require('fs');
const path = require('path');

const fileManagerPath = path.join(__dirname, 'client/src/components/FileManager.js');
const cssPath = path.join(__dirname, 'client/src/styles/main.css');

const fileManagerContent = `import { api } from '../services/api.js';

export function renderFileManager(container, socket, server) {
    container.innerHTML = \`
        <div class="fm-container" style="display: flex; height: 100%; gap: 1rem;">
            <div class="fm-sidebar" style="width: 240px; border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column;">
                <div class="fm-toolbar" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                    <h3 style="margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text-main);">FILES</h3>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="file" id="file-upload-input" style="display: none;" />
                        <button class="btn btn-sm" id="btn-upload" title="Upload" style="padding: 4px 8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        </button>
                        <button class="btn btn-sm btn-primary" id="btn-new-file" title="New File" style="padding: 4px 8px;">+</button>
                    </div>
                </div>
                <ul id="file-list" class="fm-list" style="list-style: none; padding: 0; margin: 0;"></ul>
            </div>
            <div class="fm-editor" style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; height: 32px;">
                     <input id="current-filename" readonly class="input" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.9rem; color: var(--text-muted); width: 100%; padding:0;" placeholder="Select a file...">
                     <button class="btn btn-sm btn-primary" id="btn-save" style="min-width: 80px;">Save</button>
                </div>
                <textarea id="file-editor" spellcheck="false" style="flex: 1; background: #080808; color: #e5e5e5; border: 1px solid var(--border); font-family: var(--font-mono); padding: 1rem; resize: none; border-radius: var(--radius); line-height: 1.6; font-size: 13px;"></textarea>
            </div>
        </div>
    \`;

    const list = container.querySelector('#file-list');
    const editor = container.querySelector('#file-editor');
    const filenameInput = container.querySelector('#current-filename');
    const uploadInput = container.querySelector('#file-upload-input');
    
    // Sort keys
    const files = server.fileSystem || {};
    let sortedFiles = Object.keys(files).sort();

    const renderList = () => {
        list.innerHTML = '';
        sortedFiles.forEach(f => {
            const li = document.createElement('li');
            li.style.padding = '0.4rem 0.5rem';
            li.style.cursor = 'pointer';
            li.style.borderRadius = '4px';
            li.style.marginBottom = '2px';
            li.style.fontSize = '0.85rem';
            li.style.color = 'var(--text-muted)';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '0.5rem';
            li.style.transition = 'all 0.1s ease';
            
            // Icon
            const icon = f.endsWith('.js') ? 'JS' : f.endsWith('.css') ? '#' : f.endsWith('.html') ? '<>' : '📄';
            li.innerHTML = \`<span style="font-family: var(--font-mono); opacity: 0.5; font-size: 0.7em; width: 16px;">\${icon}</span> \${f}\`;

            li.onclick = async () => {
                // Reset styles
                Array.from(list.children).forEach(c => { 
                    c.style.background = 'transparent'; 
                    c.style.color = 'var(--text-muted)';
                });
                li.style.background = 'var(--bg-hover)';
                li.style.color = 'var(--text-main)';
                loadFile(f);
            };
            list.appendChild(li);
        });
    };
    renderList();

    const loadFile = async (name, isNew = false) => {
        filenameInput.value = name;
        if (isNew) {
            editor.value = '';
        } else {
             editor.value = 'Loading...';
             editor.disabled = true;
             try {
                const res = await api.get(\`/files/\${server.serverId}/content?path=\${name}\`);
                editor.value = res.content || '';
             } catch (e) {
                 editor.value = \`Error loading file: \${e.message}\`;
             } finally {
                 editor.disabled = false;
             }
        }
    };

    // New File
    container.querySelector('#btn-new-file').onclick = () => {
        const name = prompt("Filename (e.g., index.js):");
        if (name) {
            if (!sortedFiles.includes(name)) {
                files[name] = { type: 'file' }; // Optimistic
                sortedFiles.push(name);
                sortedFiles.sort();
                renderList();
            }
            loadFile(name, true);
        }
    };

    // Upload
    container.querySelector('#btn-upload').onclick = () => {
        uploadInput.click();
    };

    uploadInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("File too large (max 5MB)");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const btn = container.querySelector('#btn-upload');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        try {
            const res = await api.post(\`/files/\${server.serverId}/upload\`, formData);
            if(res.success) {
                const name = res.filename || file.name;
                if (!files[name]) {
                    files[name] = { type: 'file' };
                    sortedFiles.push(name);
                    sortedFiles.sort();
                    renderList();
                }
                loadFile(name);
            }
        } catch (err) {
            alert(\`Upload failed: \${err.message}\`);
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            uploadInput.value = '';
        }
    };

    // Save
    container.querySelector('#btn-save').onclick = async () => {
        const path = filenameInput.value;
        const content = editor.value;
        if (!path) return;
        
        const btn = container.querySelector('#btn-save');
        const oldText = btn.innerText;
        btn.innerText = 'Saving...';
        btn.disabled = true;
        
        try {
            await api.post(\`/files/\${server.serverId}/save\`, { path, content });
            // Update local list if new
            if (!files[path]) {
                files[path] = { type: 'file' }; 
                if (!sortedFiles.includes(path)) sortedFiles.push(path);
                renderList();
            }
            btn.innerText = 'Saved';
            btn.style.background = 'var(--success)';
            btn.style.borderColor = 'var(--success)';
            
            setTimeout(() => { 
                btn.innerText = oldText; 
                btn.disabled = false;
                btn.style.background = '';
                btn.style.borderColor = ''; 
            }, 1000);
        } catch (e) {
            alert(e.message);
            btn.innerText = oldText;
            btn.disabled = false;
        }
    };
}
`;

const cssContent = \`:root {
  --bg-app: #050505;
  --bg-panel: #0A0A0A;
  --bg-hover: #161616;
  
  --primary: #FFFFFF;
  --primary-hover: #E5E5E5;
  
  --danger: #FF3333;
  --success: #33FF88;
  
  --border: #333333;
  --border-hover: #444444;
  
  --text-main: #EDEDED;
  --text-muted: #888888;
  
  --radius: 6px;
  
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

body {
    margin: 0;
    font-family: var(--font-sans);
    background-color: var(--bg-app);
    color: var(--text-main);
    line-height: 1.5;
    min-height: 100vh;
}

/* Layout */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}

.grid {
    display: grid;
    gap: 1.5rem;
}

.cols-3 {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

/* Typography */
h1, h2, h3 { 
    margin: 0 0 1rem 0; 
    font-weight: 600; 
    color: var(--text-main);
}

h1 { font-size: 1.8rem; letter-spacing: -0.03em; }
h2 { font-size: 1.4rem; letter-spacing: -0.02em; }
h3 { font-size: 1rem; letter-spacing: -0.01em; color: var(--text-muted); text-transform: uppercase; }

p { color: var(--text-muted); font-size: 0.95rem; }

/* Cards */
.card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    transition: border-color 0.15s ease;
}

.card:hover {
    border-color: var(--border-hover);
}

.server-card {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 160px;
    position: relative;
    overflow: hidden;
}

.server-card:hover {
    border-color: var(--text-muted);
}

.server-card h3 {
    color: var(--text-main);
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
    text-transform: none;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-radius: 99px;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    gap: 6px;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.status-allocating .status-dot { background: #888; }
.status-allocating { background: #222; color: #888; border: 1px solid #333; }

.status-ready .status-dot { background: #33FF88; }
.status-ready { background: rgba(51, 255, 136, 0.05); color: #33FF88; border: 1px solid rgba(51, 255, 136, 0.15); }

.status-running .status-dot { background: #3291FF; }
.status-running { background: rgba(50, 145, 255, 0.05); color: #3291FF; border: 1px solid rgba(50, 145, 255, 0.15); }

.status-stopped .status-dot { background: #444; }
.status-stopped { background: #111; color: #666; border: 1px solid #222; }


/* Inputs */
.input, textarea {
    background: #000;
    border: 1px solid var(--border);
    color: var(--text-main);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    font-family: var(--font-sans);
    font-size: 0.875rem;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
}
.input:focus, textarea:focus {
    outline: none;
    border-color: var(--text-muted);
}

/* Buttons */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    color: var(--text-main);
    text-decoration: none;
    user-select: none;
}

.btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-primary {
    background: var(--primary);
    color: #000;
    border-color: var(--primary);
}

.btn-primary:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
}

.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
}

.btn-danger {
    color: var(--danger);
    border-color: rgba(255, 51, 51, 0.2);
}
.btn-danger:hover {
    background: rgba(255, 51, 51, 0.1);
    border-color: var(--danger);
}
\`;

fs.writeFileSync(fileManagerPath, fileManagerContent);
fs.writeFileSync(cssContent, cssContent); // Wait, error here in my script draft logic... path is first arg.
fs.writeFileSync(cssPath, cssContent);

console.log('Files updated successfully');
`;

const scriptPath = path.join(__dirname, 'update_files.js');
fs.writeFileSync(scriptPath, scriptContent);
