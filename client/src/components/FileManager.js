import { api } from '../services/api.js';

let editorInstance = null;
let currentPath = null; 

const loadMonaco = () => {
    return new Promise((resolve) => {
        if (window.monaco) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
        script.onload = () => {
            window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
            window.require(['vs/editor/editor.main'], () => {
                resolve();
            });
        };
        document.body.appendChild(script);
    });
};

export async function renderFileManager(container, socket, server) {
    // 1. Layout
    container.innerHTML = `
        <div class="file-manager" style="height: calc(100vh - 240px); min-height: 500px; display: flex; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-card);">
            <!-- SIDEBAR -->
            <div class="file-sidebar" style="width: 260px; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column;">
                <div class="toolbar" style="padding: 0.5rem; display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); background: var(--bg-panel);">
                    <button class="btn btn-sm btn-secondary" id="fm-new-file" title="New File"><i class="fas fa-file-plus"></i></button>
                    <button class="btn btn-sm btn-secondary" id="fm-new-folder" title="New Folder"><i class="fas fa-folder-plus"></i></button>
                    <button class="btn btn-sm btn-secondary" id="fm-upload" title="Upload"><i class="fas fa-upload"></i></button>
                    <button class="btn btn-sm btn-secondary" id="fm-refresh" title="Refresh"><i class="fas fa-sync-alt"></i></button>
                    <button class="btn btn-sm btn-secondary" id="fm-archive" title="Download Zip"><i class="fas fa-file-archive"></i></button>
                    <input type="file" id="fm-upload-input" style="display: none;">
                </div>
                <div id="file-tree" style="flex: 1; overflow-y: auto; padding: 0.5rem; font-size: 0.85rem; user-select: none;">
                    <div style="padding: 1rem; color: var(--text-muted); text-align: center;">Loading...</div>
                </div>
            </div>

            <!-- EDITOR -->
            <div class="file-editor-area" style="flex: 1; display: flex; flex-direction: column; background: #1e1e1e;">
                <div class="editor-header" style="height: 40px; background: var(--bg-panel); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 1rem; justify-content: space-between;">
                    <div id="active-file-path" style="font-family: monospace; color: var(--text-muted); font-size: 0.8rem;">No file selected</div>
                    <div style="display: flex; gap: 0.5rem;">
                         <button class="btn btn-sm btn-primary" id="fm-save" disabled><i class="fas fa-save"></i> Save</button>
                         <button class="btn btn-sm btn-secondary" id="fm-download" disabled title="Download File"><i class="fas fa-download"></i></button>
                         <button class="btn btn-sm btn-danger" id="fm-delete" disabled title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div id="monaco-container" style="flex: 1; position: relative;"></div>
            </div>
        </div>
    `;

    const treeContainer = container.querySelector('#file-tree');
    const saveBtn = container.querySelector('#fm-save');
    const downloadBtn = container.querySelector('#fm-download');
    const deleteBtn = container.querySelector('#fm-delete');
    const pathDisplay = container.querySelector('#active-file-path');
    const uploadInput = container.querySelector('#fm-upload-input');
    const uploadBtn = container.querySelector('#fm-upload');
    const loadZipBtn = container.querySelector('#fm-archive');

    // 2. Initialize Editor
    await loadMonaco();
    
    // Dispose previous instance if active
    if (editorInstance) {
        editorInstance.dispose();
    }
    
    editorInstance = window.monaco.editor.create(container.querySelector('#monaco-container'), {
        value: '// Select a file to view or edit...',
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        readOnly: true,
        fontFamily: "'Fira Code', monospace",
        fontSize: 14
    });

    // 3. Logic Functions
    const fetchTree = async () => {
        try {
            treeContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i></div>';
            const data = await api.get(`/files/${server.serverId}/list`);
            renderTree(data, treeContainer);
        } catch (e) {
            treeContainer.innerHTML = `<div style="color: var(--status-error); padding: 1rem;">Failed to load files</div>`;
            console.error(e);
        }
    };

    const loadFile = async (path) => {
        if (!path) return;
        currentPath = path;
        
        pathDisplay.innerText = "Loading...";
        editorInstance.updateOptions({ readOnly: true }); 
        
        try {
            const res = await api.get(`/files/${server.serverId}/content?path=${encodeURIComponent(path)}`);
            
            // Determine language from extension
            const ext = path.split('.').pop();
            let lang = 'plaintext';
            if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) lang = 'javascript';
            if (['html', 'htm'].includes(ext)) lang = 'html';
            if (['css', 'scss', 'less'].includes(ext)) lang = 'css';
            if (['json'].includes(ext)) lang = 'json';
            if (['md'].includes(ext)) lang = 'markdown';
            if (['py'].includes(ext)) lang = 'python';

            const model = window.monaco.editor.createModel(
                res.content, 
                lang,
                window.monaco.Uri.file(path) // Provides intellisense context based on file path
            );
            
            editorInstance.setModel(model);
            editorInstance.updateOptions({ readOnly: false });
            
            pathDisplay.innerText = path;
            saveBtn.disabled = false;
            downloadBtn.disabled = false;
            deleteBtn.disabled = false;
        } catch (e) {
            pathDisplay.innerText = `Error: ${e.message}`;
            currentPath = null;
        }
    };

    const saveFile = async () => {
        if (!currentPath) return;
        
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving';
        saveBtn.disabled = true;

        try {
            const content = editorInstance.getValue();
            await api.post(`/files/${server.serverId}/save`, {
                path: currentPath,
                content
            });
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved';
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }, 2000);
        } catch (e) {
            alert(e.message);
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    };

    const deleteItem = async (path) => {
        if (!confirm(`Are you sure you want to delete ${path}?`)) return;
        try {
            await api.delete(`/files/${server.serverId}/delete?path=${encodeURIComponent(path)}`);
            if (currentPath && (currentPath === path || currentPath.startsWith(path + '/'))) {
                currentPath = null;
                editorInstance.setValue('// File deleted');
                editorInstance.updateOptions({ readOnly: true });
                pathDisplay.innerText = "No file selected";
                saveBtn.disabled = true;
                downloadBtn.disabled = true;
                deleteBtn.disabled = true;
            }
            fetchTree();
        } catch (e) {
            alert(e.message);
        }
    };

    const renameItem = async (oldPath) => {
        const newPath = prompt("Enter new path/name:", oldPath);
        if (!newPath || newPath === oldPath) return;
        
        try {
            await api.post(`/files/${server.serverId}/rename`, { oldPath, newPath });
            // If current file was renamed, update currentPath just in case
            if (currentPath === oldPath) {
                currentPath = newPath;
                pathDisplay.innerText = newPath;
                // Editor content remains same, just path changes
            }
            fetchTree();
        } catch (e) {
            alert(e.message);
        }
    };

    const downloadItem = (path) => {
        if (!path) return;
        window.clerk.session.getToken().then(token => {
             fetch(`http://localhost:10000/api/files/${server.serverId}/download?path=${encodeURIComponent(path)}`, {
                 headers: { 'Authorization': `Bearer ${token}` }
             })
             .then(res => {
                 if (!res.ok) throw new Error("Download failed");
                 return res.blob();
             })
             .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = path.split('/').pop();
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(e => alert("Download failed: " + e.message));
        });
    };

    const createItem = async (type) => {
        const name = prompt(`Enter ${type} name (relative path, e.g. src/utils.js):`);
        if (!name) return;
        
        try {
            if (type === 'file') {
                await api.post(`/files/${server.serverId}/save`, { path: name, content: '' });
                fetchTree();
                // Optionally make folders along the way in API logic? Currently api logic just does mkdir for dir
                // If path has new folders, save might fail unless server handles intermediate recursive paths.
            } else {
                 await api.post(`/files/${server.serverId}/create-dir`, { path: name });
                 fetchTree();
            }
        } catch (e) {
            alert(e.message);
        }
    };
    
    const downloadZip = () => {
        window.clerk.session.getToken().then(token => {
             fetch(`http://localhost:10000/api/files/${server.serverId}/archive`, {
                 headers: { 'Authorization': `Bearer ${token}` }
             })
             .then(res => res.blob())
             .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `server-${server.serverId}-archive.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
             });
        });
    };

    // 4. Render Tree Logic
    const renderTree = (nodes, target) => {
        target.innerHTML = '';
        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.paddingLeft = '0';
        list.style.margin = '0';
        
        const buildList = (items, parentList, level = 0) => {
            // Sort: folders first, then files. Alphabetical.
            items.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });

            items.forEach(item => {
                const li = document.createElement('li');
                li.style.marginTop = '2px';
                
                const row = document.createElement('div');
                row.className = 'file-row';
                row.dataset.path = item.path;
                row.style.padding = '4px 8px';
                row.style.cursor = 'pointer';
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.borderRadius = '4px';
                row.style.paddingLeft = `${level * 12 + 8}px`; // Indent
                row.style.color = "var(--text-secondary)";
                row.style.whiteSpace = 'nowrap';
                row.style.transition = 'background 0.1s';
                row.title = item.path;
                
                // Icon
                const icon = document.createElement('i');
                let iconClass = 'fas fa-file';
                let iconColor = 'var(--text-muted)';
                
                if (item.type === 'directory') {
                    iconClass = 'fas fa-folder';
                    iconColor = '#dcb67a';
                } else {
                    const ext = item.name.split('.').pop();
                    if (['js', 'jsx'].includes(ext)) { iconClass = 'fab fa-js'; iconColor = '#f1e05a'; }
                    else if (['html'].includes(ext)) { iconClass = 'fab fa-html5'; iconColor = '#e34c26'; }
                    else if (['css', 'scss'].includes(ext)) { iconClass = 'fab fa-css3-alt'; iconColor = '#563d7c'; }
                    else if (['json'].includes(ext)) { iconClass = 'fas fa-code'; iconColor = '#cbcb41'; }
                    else if (['md'].includes(ext)) { iconClass = 'fas fa-info-circle'; iconColor = '#4a9eff'; }
                    else if (['py'].includes(ext)) { iconClass = 'fab fa-python'; iconColor = '#3572A5'; }
                    else if (['png', 'jpg', 'gif'].includes(ext)) { iconClass = 'fas fa-image'; iconColor = '#b392f0'; }
                }

                icon.className = iconClass;
                icon.style.marginRight = '8px';
                icon.style.width = '16px';
                icon.style.textAlign = 'center';
                icon.style.color = iconColor;
                
                // Name
                const span = document.createElement('span');
                span.innerText = item.name;
                
                row.appendChild(icon);
                row.appendChild(span);

                // Events
                row.onmouseenter = () => {
                   if (row.dataset.path !== currentPath) row.style.backgroundColor = 'var(--bg-hover)';
                };
                row.onmouseleave = () => {
                   if (row.dataset.path !== currentPath) row.style.backgroundColor = 'transparent';
                };

                row.onclick = (e) => {
                    e.stopPropagation();
                    
                    // Highlight logic
                    document.querySelectorAll('.file-row').forEach(el => {
                        el.style.backgroundColor = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                    });
                    
                    row.style.backgroundColor = 'var(--bg-active)';
                    row.style.color = 'var(--text-primary)';
                    
                    if (item.type === 'file') {
                        loadFile(item.path);
                    } else {
                        // Toggle folder
                        const childrenContainer = li.querySelector('ul');
                         if (childrenContainer) {
                            const isHidden = childrenContainer.style.display === 'none';
                            childrenContainer.style.display = isHidden ? 'block' : 'none';
                            icon.className = isHidden ? 'fas fa-folder' : 'fas fa-folder-open';
                        }
                    }
                };

                // Context Menu
                row.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Remove existing menus
                    document.querySelectorAll('.file-context-menu').forEach(el => el.remove());

                    const menu = document.createElement('div');
                    menu.className = 'file-context-menu';
                    menu.style.position = 'fixed';
                    menu.style.left = `${e.clientX}px`;
                    menu.style.top = `${e.clientY}px`;
                    menu.style.background = 'var(--bg-card)';
                    menu.style.border = '1px solid var(--border)';
                    menu.style.borderRadius = '4px';
                    menu.style.padding = '4px 0';
                    menu.style.zIndex = '10000';
                    menu.style.minWidth = '140px';
                    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

                    const createOption = (label, iconCls, action) => {
                        const opt = document.createElement('div');
                        opt.style.padding = '6px 12px';
                        opt.style.cursor = 'pointer';
                        opt.style.display = 'flex';
                        opt.style.alignItems = 'center';
                        opt.style.gap = '8px';
                        opt.style.fontSize = '13px';
                        opt.style.color = 'var(--text-primary)';
                        opt.innerHTML = `<i class="${iconCls}" style="width:16px;"></i> ${label}`;
                        
                        opt.onmouseenter = () => opt.style.background = 'var(--bg-hover)';
                        opt.onmouseleave = () => opt.style.background = 'transparent';
                        
                        opt.onclick = () => {
                            action();
                            menu.remove();
                        };
                        menu.appendChild(opt);
                    };

                    createOption('Rename', 'fas fa-i-cursor', () => renameItem(item.path));
                    
                    if (item.type === 'file') {
                        createOption('Open', 'fas fa-code', () => loadFile(item.path));
                        createOption('Download', 'fas fa-download', () => downloadItem(item.path));
                    }
                    
                    createOption('Delete', 'fas fa-trash', () => deleteItem(item.path));

                    document.body.appendChild(menu);

                    // Click away to close
                    const closeHandler = () => {
                        menu.remove();
                        document.removeEventListener('click', closeHandler);
                        document.removeEventListener('contextmenu', closeHandler);
                    };
                    // Delay slightly to avoid immediate trigger
                    setTimeout(() => {
                        document.addEventListener('click', closeHandler);
                        document.addEventListener('contextmenu', closeHandler);
                    }, 50);
                };

                li.appendChild(row);

                if (item.children && item.children.length > 0) {
                    const subUl = document.createElement('ul');
                    subUl.style.listStyle = 'none';
                    subUl.style.paddingLeft = '0';
                    subUl.style.display = 'none'; // Collapsed by default
                    buildList(item.children, subUl, level + 1);
                    li.appendChild(subUl);
                } 

                parentList.appendChild(li);
            });
        };

        if (nodes.length === 0) {
            target.innerHTML = '<div style="padding: 1rem; color: var(--text-dim); text-align: center; font-size: 0.8rem;">Empty Directory</div>';
        } else {
            buildList(nodes, list);
            target.appendChild(list);
        }
    };

    // 5. Event Listeners
    saveBtn.onclick = saveFile;
    deleteBtn.onclick = () => deleteItem(currentPath);
    downloadBtn.onclick = () => downloadItem(currentPath);
    loadZipBtn.onclick = downloadZip;
    
    container.querySelector('#fm-refresh').onclick = fetchTree;
    container.querySelector('#fm-new-file').onclick = () => createItem('file');
    container.querySelector('#fm-new-folder').onclick = () => createItem('directory');
    
    uploadBtn.onclick = () => uploadInput.click();
    
    uploadInput.onchange = async () => {
        if (uploadInput.files.length === 0) return;
        const file = uploadInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await api.post(`/files/${server.serverId}/upload`, formData); 
            fetchTree();
            uploadInput.value = '';
        } catch (e) {
            alert("Upload failed: " + e.message);
        } finally {
             uploadBtn.innerHTML = '<i class="fas fa-upload"></i>';
        }
    };

    fetchTree();

    return () => {
        if (editorInstance) {
            editorInstance.dispose();
            editorInstance = null;
        }
    };
}
