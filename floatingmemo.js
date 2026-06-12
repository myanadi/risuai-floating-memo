//@name Floating_Memo_v2.1.0
//@display-name 플로팅 메모장
//@api 3.0
//@version 2.1.0

(async () => {
    const MEMO_STORAGE_KEY = 'floating_memo_data_v1';
    let memoData = { folders: [], notes: [] };
    let currentFolder = 'all';
    let searchQuery = '';
    let editingNoteId = null;
    let viewingNoteId = null;

    const genId = (prefix) => prefix + '_' + Math.random().toString(36).substr(2, 9);

    const fallbackCopyTextToClipboard = (text) => {
        return new Promise((resolve, reject) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) resolve();
                else reject(new Error('Fallback failed'));
            } catch (err) {
                reject(err);
            }
            document.body.removeChild(textArea);
        });
    };

    const toggleMemoUI = async () => {
        try {
            const storage = await risuai.getLocalPluginStorage();
            const stored = await storage.getItem(MEMO_STORAGE_KEY);
            if (stored) {
                if (typeof stored === 'string') {
                    try { memoData = JSON.parse(stored); } catch(e) {}
                } else {
                    memoData = stored; 
                }
            }
        } catch (err) {
            console.error("메모 데이터 불러오기 실패:", err);
        }

        if (!memoData.folders) memoData.folders = [];
        if (!memoData.notes) memoData.notes = [];

        await risuai.showContainer('fullscreen');

        const viewport = document.createElement('meta');
        viewport.name = "viewport";
        viewport.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
        document.head.appendChild(viewport);

        document.body.innerHTML = `
            <style>
                body { 
                    margin: 0; padding: 0; background-color: transparent; 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    width: 100vw; height: 100vh; overflow: hidden;
                    position: relative;
                }

                .backdrop { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; cursor: pointer;}

                .memo-panel {
                    --bg-panel: #ffffff; 
                    --bg-body: #fafafa;
                    --text-main: #2c3e50;
                    --text-sub: #7f8c8d;
                    --border: #e2e8f0;
                    --point: #4A90E2; 
                    --point-hover: #357ABD;
                    --danger: #e74c3c;
                    --star: #f39c12; 

                    position: absolute; 
                    z-index: 2;
                    right: 20px; 
                    bottom: 80px; 
                    width: 340px; 
                    height: 75vh; 
                    max-height: 650px;
                    background-color: var(--bg-panel); 
                    border-radius: 16px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    display: flex; flex-direction: column;
                    overflow: hidden;
                    animation: slideUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                }

                @media (max-width: 600px) {
                    .memo-panel {
                        width: 92vw;
                        right: 4vw; 
                        bottom: 70px;
                        height: 80vh;
                    }
                }

                @keyframes slideUp { from { transform: translateY(30px) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

                .panel-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; background-color: var(--bg-panel); cursor: grab; user-select: none; }
                .panel-header:active { cursor: grabbing; }
                
                .title-row { display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
                .title-row h3 { margin: 0; font-size: 1.15rem; color: var(--text-main); font-weight: 700; pointer-events: auto; }
                .close-btn { background: transparent; border: none; font-size: 1.4rem; cursor: pointer; color: var(--text-sub); transition: 0.2s; padding: 0; line-height: 1; pointer-events: auto;}
                .close-btn:hover { color: var(--text-main); }
                
                .search-bar { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; box-sizing: border-box; font-size: 0.9rem; background-color: var(--bg-body); transition: border-color 0.2s; cursor: text; pointer-events: auto; }
                .search-bar:focus { outline: none; border-color: var(--point); background-color: #fff; }

                /* ★ 가로 스크롤을 위한 핵심 수정 부분 */
                .folder-chips { display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--border); background-color: var(--bg-panel); }
                .folder-chips::-webkit-scrollbar { display: none; }
                .chip { flex-shrink: 0; padding: 6px 14px; border-radius: 20px; background-color: var(--bg-body); border: 1px solid var(--border); cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-sub); transition: 0.2s; display: flex; align-items: center; gap: 6px; }
                .chip:hover { border-color: #ccc; }
                .chip.active { background-color: var(--text-main); color: #fff; border-color: var(--text-main); }
                
                .chip.fav-chip { color: var(--star); border-color: var(--star); background-color: #fffaf0; }
                .chip.fav-chip.active { background-color: var(--star); color: #fff; border-color: var(--star); }

                .memo-list { flex: 1; overflow-y: auto; padding: 12px 16px; background-color: var(--bg-body); position: relative; }
                
                .memo-card { background-color: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: transform 0.1s, box-shadow 0.1s; position: relative; cursor: pointer; }
                .memo-card:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.05); border-color: #cbd5e1; }
                
                .card-header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
                .card-header-row h4 { margin: 0; font-size: 1rem; color: var(--text-main); flex: 1; word-break: break-all; padding-right: 8px;}
                
                .memo-card p { margin: 0; font-size: 0.85rem; color: var(--text-sub); white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; pointer-events: none; }
                .card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; pointer-events: auto; }
                
                .icon-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 6px; border-radius: 6px; transition: background-color 0.2s, transform 0.1s; color: var(--text-sub); }
                .icon-btn:hover { background-color: var(--bg-body); color: var(--text-main); }
                .star-btn { padding: 4px; font-size: 1.1rem; line-height: 1; color: #ccc; transition: 0.2s; }
                .star-btn.is-fav { color: var(--star); }
                .star-btn:active { transform: scale(1.2); }

                .panel-footer { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 10px; background-color: var(--bg-panel); }
                .add-btn { flex: 1; padding: 12px; border: none; border-radius: 10px; background-color: var(--point); color: #fff; font-weight: bold; cursor: pointer; font-size: 0.95rem; transition: background-color 0.2s; }
                .add-btn:hover { background-color: var(--point-hover); }
                .add-btn.folder { background-color: #e2e8f0; color: var(--text-main); flex: 0.6; }
                .add-btn.folder:hover { background-color: #cbd5e1; }

                .editor-view { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: #ffffff; background-color: var(--bg-panel); display: none; flex-direction: column; animation: slideIn 0.2s ease-out; }
                @keyframes slideIn { from{ transform: translateX(100%); } to{ transform: translateX(0); } }
                .editor-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); background-color: #ffffff; background-color: var(--bg-panel); }
                .editor-header h4 { margin: 0; font-size: 1.1rem; color: var(--text-main); }
                .editor-view input.title-input, .editor-view select { margin: 12px 16px 0 16px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; outline: none; transition: border-color 0.2s; }
                .editor-view input.title-input:focus, .editor-view select:focus, .editor-view textarea:focus { border-color: var(--point); }
                .editor-view textarea { margin: 12px 16px 16px 16px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; flex: 1; resize: none; font-size: 0.95rem; line-height: 1.5; outline: none; }
                
                .detail-content-area { padding: 16px; flex: 1; overflow-y: auto; background-color: var(--bg-body); font-size: 0.95rem; line-height: 1.6; color: var(--text-main); white-space: pre-wrap; word-break: break-word; }

                .empty-state { text-align: center; color: var(--text-sub); margin-top: 40px; font-size: 0.9rem; line-height: 1.6; }
                .folder-manage-item { display: flex; align-items: center; background-color: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .folder-name-input { flex: 1; border: none; background-color: transparent; font-size: 0.95rem; outline: none; margin: 0 8px; color: var(--text-main); padding: 4px; border-bottom: 1px solid transparent; transition: 0.2s; }
                .folder-name-input:focus { border-bottom: 1px solid var(--point); }
                .drag-handle { cursor: grab; padding: 0 4px; color: #b0bec5; font-size: 1.3rem; line-height: 1; user-select: none; transition: color 0.2s; display: flex; align-items: center; }
                .drag-handle:hover { color: var(--text-main); }
                .drag-handle:active { cursor: grabbing; color: var(--point); }
            </style>

            <div class="backdrop" id="close-backdrop"></div>
            
            <div class="memo-panel" id="memo-panel">
                <div id="main-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="panel-header" id="panel-header">
                        <div class="title-row">
                            <h3>📝 플로팅 메모</h3>
                            <button class="close-btn" id="close-btn">✕</button>
                        </div>
                        <input type="text" id="search-input" class="search-bar" placeholder="🔍 제목이나 내용으로 검색...">
                    </div>
                    <div class="folder-chips" id="folder-container"></div>
                    <div class="memo-list" id="memo-container"></div>
                    <div class="panel-footer">
                        <button class="add-btn folder" id="btn-open-folder-manage">⚙️ 폴더 관리</button>
                        <button class="add-btn" id="btn-add-note">✏️ 새 메모</button>
                    </div>
                </div>

                <div class="editor-view" id="editor-view" style="z-index: 10;">
                    <div class="editor-header">
                        <button id="btn-editor-back" class="icon-btn">⬅️ 뒤로</button>
                        <h4 id="editor-title-text">새 메모</h4>
                        <button id="btn-editor-save" class="icon-btn" style="color: var(--point); font-weight: bold;">저장</button>
                    </div>
                    <input type="text" id="edit-title" class="title-input" placeholder="메모 제목">
                    <select id="edit-folder"></select>
                    <textarea id="edit-content" placeholder="무엇을 메모할까요?"></textarea>
                </div>

                <div class="editor-view" id="detail-view" style="z-index: 12;">
                    <div class="editor-header">
                        <button id="btn-detail-back" class="icon-btn">⬅️ 목록</button>
                        <h4 id="detail-title-text" style="flex: 1; text-align: center; margin: 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">제목</h4>
                        <div style="display: flex; gap: 4px;">
                            <button id="btn-detail-copy" class="icon-btn" title="내용 복사">📋</button>
                            <button id="btn-detail-edit" class="icon-btn" style="color: var(--point); font-weight: bold;">수정</button>
                        </div>
                    </div>
                    <div class="detail-content-area" id="detail-content-text"></div>
                </div>

                <div class="editor-view" id="folder-manage-view" style="z-index: 15;">
                    <div class="editor-header" style="justify-content: center; position: relative;">
                        <button id="btn-folder-manage-back" class="icon-btn" style="position: absolute; left: 16px;">⬅️ 완료</button>
                        <h4 style="color: var(--text-main); margin: 0;">⚙️ 폴더 관리</h4>
                    </div>
                    <div style="padding: 12px 16px; flex: 1; overflow-y: auto; background-color: var(--bg-body);">
                        <button class="add-btn" id="btn-manage-add-folder" style="width: 100%; margin-bottom: 16px;">+ 새 폴더 만들기</button>
                        <div id="folder-sort-container"></div>
                    </div>
                </div>

                <div class="editor-view" id="manual-copy-view" style="z-index: 20;">
                    <div class="editor-header" style="justify-content: center; position: relative;">
                        <button id="btn-manual-copy-close" class="icon-btn" style="position: absolute; left: 16px;">⬅️ 돌아가기</button>
                        <h4 style="color: var(--danger); margin: 0;">(Ctrl+C)</h4>
                    </div>
                    <p style="margin: 12px 16px; font-size: 0.85rem; color: var(--text-sub); line-height: 1.4;">
                        보안 환경으로 인해 자동 복사가 제한되었습니다.<br>아래 텍스트를 직접 복사해주세요.
                    </p>
                    <textarea id="manual-copy-text" style="margin: 0 16px 16px 16px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; flex: 1; resize: none; font-size: 0.95rem; line-height: 1.5; outline: none;" readonly></textarea>
                </div>
            </div>
        `;

        const initSortable = (containerId, itemClass, handleClass, onUpdate) => {
            const container = document.getElementById(containerId);
            let draggedEl = null;

            const onStart = (e) => {
                if (!e.target.closest('.' + handleClass)) return;
                draggedEl = e.target.closest('.' + itemClass);
                if (!draggedEl) return;
                
                draggedEl.style.opacity = '0.4';
                draggedEl.style.pointerEvents = 'none'; 
                draggedEl.style.transition = 'none';

                document.addEventListener('mousemove', onMove, {passive: false});
                document.addEventListener('touchmove', onMove, {passive: false});
                document.addEventListener('mouseup', onEnd);
                document.addEventListener('touchend', onEnd);
            };

            const onMove = (e) => {
                if (!draggedEl) return;
                e.preventDefault(); 
                const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;

                const elemBelow = document.elementFromPoint(clientX, clientY);
                if (!elemBelow) return;

                const droppableBelow = elemBelow.closest('.' + itemClass);
                if (droppableBelow && droppableBelow !== draggedEl && droppableBelow.parentNode === container) {
                    const rect = droppableBelow.getBoundingClientRect();
                    const isNext = clientY > rect.top + rect.height / 2;
                    if (isNext) {
                        droppableBelow.parentNode.insertBefore(draggedEl, droppableBelow.nextSibling);
                    } else {
                        droppableBelow.parentNode.insertBefore(draggedEl, droppableBelow);
                    }
                }
            };

            const onEnd = () => {
                if (!draggedEl) return;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchend', onEnd);

                draggedEl.style.opacity = '1';
                draggedEl.style.pointerEvents = '';
                draggedEl.style.transition = '';

                const newOrderIds = Array.from(container.querySelectorAll('.' + itemClass)).map(el => el.dataset.id);
                onUpdate(newOrderIds);
                draggedEl = null;
            };

            container.addEventListener('mousedown', onStart);
            container.addEventListener('touchstart', onStart, {passive: false});
        };

        const updateFolderOrder = (newOrderIds) => {
            const updatedFolders = [];
            newOrderIds.forEach(id => {
                const folder = memoData.folders.find(f => f.id === id);
                if (folder) updatedFolders.push(folder);
            });
            memoData.folders = updatedFolders;
            saveData();
            renderFolders(); 
        };

        const panel = document.getElementById('memo-panel');
        const header = document.getElementById('panel-header');
        let isPanelDragging = false;
        let startX, startY, initialLeft, initialTop;

        const dragPanelStart = (e) => {
            if (e.target.closest('.search-bar') || e.target.closest('.close-btn')) return;
            isPanelDragging = true;
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            startX = clientX; startY = clientY;
            
            const rect = panel.getBoundingClientRect();
            panel.style.right = 'auto'; panel.style.bottom = 'auto';
            panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
            initialLeft = rect.left; initialTop = rect.top;
        };

        const dragPanelMove = (e) => {
            if (!isPanelDragging) return;
            e.preventDefault(); 
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            const dx = clientX - startX; const dy = clientY - startY;
            panel.style.left = (initialLeft + dx) + 'px'; panel.style.top = (initialTop + dy) + 'px';
        };
        const dragPanelEnd = () => { isPanelDragging = false; };

        header.addEventListener('mousedown', dragPanelStart);
        document.addEventListener('mousemove', dragPanelMove);
        document.addEventListener('mouseup', dragPanelEnd);
        header.addEventListener('touchstart', dragPanelStart, { passive: false });
        document.addEventListener('touchmove', dragPanelMove, { passive: false });
        document.addEventListener('touchend', dragPanelEnd);

        const saveData = async () => {
            try { 
                const storage = await risuai.getLocalPluginStorage();
                await storage.setItem(MEMO_STORAGE_KEY, memoData); 
            } 
            catch (err) { console.error("데이터 저장 실패:", err); }
        };

        const renderFolders = () => {
            const container = document.getElementById('folder-container');
            let html = `
                <div class="chip ${currentFolder === 'all' ? 'active' : ''}" data-id="all">전체</div>
                <div class="chip fav-chip ${currentFolder === 'favorites' ? 'active' : ''}" data-id="favorites">⭐ 즐겨찾기</div>
            `;
            memoData.folders.forEach(f => {
                const isActive = currentFolder === f.id;
                html += `<div class="chip ${isActive ? 'active' : ''}" data-id="${f.id}">📁 ${f.name}</div>`;
            });
            container.innerHTML = html;
        };

        const renderFolderManageList = () => {
            const container = document.getElementById('folder-sort-container');
            if (memoData.folders.length === 0) {
                container.innerHTML = '<p class="empty-state">생성된 폴더가 없습니다.</p>';
                return;
            }
            let html = '';
            memoData.folders.forEach(f => {
                html += `
                    <div class="folder-manage-item" data-id="${f.id}">
                        <div class="drag-handle folder-handle" title="끌어서 이동">≡</div>
                        <input type="text" class="folder-name-input" value="${f.name}" data-id="${f.id}">
                        <button class="icon-btn" data-action="delete-folder" data-id="${f.id}" title="폴더 삭제">🗑️</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        };

        const renderNotes = () => {
            const container = document.getElementById('memo-container');
            let filtered = memoData.notes;

            if (currentFolder === 'favorites') {
                filtered = filtered.filter(n => n.isFavorite === true);
            } else if (currentFolder !== 'all') {
                filtered = filtered.filter(n => n.folderId === currentFolder);
            }
            
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                filtered = filtered.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)));
            }

            if (filtered.length === 0) {
                container.innerHTML = `<div class="empty-state">메모가 없습니다.<br><br><b>새 메모</b>를 눌러 시작해보세요!</div>`;
                return;
            }

            let html = '';
            [...filtered].sort((a, b) => {
                if (a.isFavorite && !b.isFavorite) return -1;
                if (!a.isFavorite && b.isFavorite) return 1;
                return b.timestamp - a.timestamp;
            }).forEach(note => {
                const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const starIcon = note.isFavorite ? '⭐' : '☆';
                const starClass = note.isFavorite ? 'is-fav' : '';
                
                html += `
                    <div class="memo-card" data-id="${note.id}">
                        <div class="card-header-row">
                            <h4>${escapeHtml(note.title || '제목 없음')}</h4>
                            <button class="icon-btn star-btn ${starClass}" data-action="toggle-star" data-id="${note.id}" title="즐겨찾기 토글">${starIcon}</button>
                        </div>
                        <p>${escapeHtml(note.content || '')}</p>
                        <div class="card-actions">
                            <button class="icon-btn" data-action="copy" data-id="${note.id}" title="클립보드에 복사">📋</button>
                            <button class="icon-btn" data-action="edit" data-id="${note.id}" title="수정">✏️</button>
                            <button class="icon-btn" data-action="delete" data-id="${note.id}" title="삭제">🗑️</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        };

        const openDetailView = (id) => {
            viewingNoteId = id;
            const note = memoData.notes.find(n => n.id === id);
            if (!note) return;

            document.getElementById('detail-title-text').innerText = note.title || '제목 없음';
            document.getElementById('detail-content-text').innerText = note.content || '';
            document.getElementById('detail-view').style.display = 'flex';
        };

        const closeDetailView = () => {
            document.getElementById('detail-view').style.display = 'none';
            viewingNoteId = null;
        };

        document.getElementById('btn-detail-back').addEventListener('click', closeDetailView);
        document.getElementById('btn-detail-edit').addEventListener('click', () => {
            const id = viewingNoteId;
            closeDetailView();
            openEditor(id);
        });

        document.getElementById('btn-detail-copy').addEventListener('click', async () => {
            const note = memoData.notes.find(n => n.id === viewingNoteId);
            if (!note) return;
            
            let textToCopy = note.content || '';
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    await fallbackCopyTextToClipboard(textToCopy);
                }
                const btn = document.getElementById('btn-detail-copy');
                const originalIcon = btn.innerText;
                btn.innerText = '✅';
                setTimeout(() => { btn.innerText = originalIcon; }, 1000);
            } catch (err) {
                const manualView = document.getElementById('manual-copy-view');
                const manualText = document.getElementById('manual-copy-text');
                manualText.value = textToCopy;
                manualView.style.display = 'flex';
                setTimeout(() => { manualText.focus(); manualText.select(); }, 100);
            }
        });

        const updateEditorFolderSelect = () => {
            const select = document.getElementById('edit-folder');
            select.innerHTML = '<option value="all">분류 없음 (전체)</option>';
            memoData.folders.forEach(f => select.innerHTML += `<option value="${f.id}">📁 ${f.name}</option>`);
        };

        const openEditor = (noteId = null) => {
            editingNoteId = noteId;
            updateEditorFolderSelect();
            
            if (noteId) {
                const note = memoData.notes.find(n => n.id === noteId);
                document.getElementById('editor-title-text').innerText = '메모 수정';
                document.getElementById('edit-title').value = note.title;
                document.getElementById('edit-content').value = note.content;
                document.getElementById('edit-folder').value = note.folderId || 'all';
            } else {
                searchQuery = '';
                document.getElementById('search-input').value = '';
                document.getElementById('editor-title-text').innerText = '새 메모';
                document.getElementById('edit-title').value = '';
                document.getElementById('edit-content').value = '';
                document.getElementById('edit-folder').value = currentFolder === 'favorites' ? 'all' : currentFolder;
            }
            document.getElementById('editor-view').style.display = 'flex';
        };

        const closeUI = async () => await risuai.hideContainer();
        document.getElementById('close-btn').addEventListener('click', closeUI);
        document.getElementById('close-backdrop').addEventListener('click', closeUI);

        document.getElementById('search-input').addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderNotes();
        });

        // --- 폴더 가로 드래그 스크롤 기능 추가 ---
        const folderContainer = document.getElementById('folder-container');
        let isFolderDown = false;
        let folderStartX;
        let folderScrollLeft;
        let isFolderDragged = false;

        folderContainer.addEventListener('mousedown', (e) => {
            isFolderDown = true;
            isFolderDragged = false; // 마우스를 누를 때 드래그 상태 초기화
            folderStartX = e.pageX - folderContainer.offsetLeft;
            folderScrollLeft = folderContainer.scrollLeft;
            folderContainer.style.cursor = 'grabbing';
        });

        folderContainer.addEventListener('mouseleave', () => {
            isFolderDown = false;
            folderContainer.style.cursor = '';
        });

        folderContainer.addEventListener('mouseup', () => {
            isFolderDown = false;
            folderContainer.style.cursor = '';
        });

        folderContainer.addEventListener('mousemove', (e) => {
            if (!isFolderDown) return;
            e.preventDefault();
            const x = e.pageX - folderContainer.offsetLeft;
            const walk = (x - folderStartX) * 1.5; // 이동 속도 배율 (원하면 조절 가능)
            
            // 일정 픽셀 이상 마우스를 움직이면 클릭이 아닌 '드래그'로 판정
            if (Math.abs(walk) > 5) {
                isFolderDragged = true;
            }
            folderContainer.scrollLeft = folderScrollLeft - walk;
        });

        // 기존 폴더 클릭 이벤트 (드래그 시 선택 방지 로직 추가)
        folderContainer.addEventListener('click', (e) => {
            // 드래그를 한 상태에서 마우스를 뗄 때는 클릭 이벤트 무시
            if (isFolderDragged) {
                isFolderDragged = false;
                return;
            }
            const chip = e.target.closest('.chip');
            if (!chip) return;
            currentFolder = chip.dataset.id;
            renderFolders(); renderNotes();
        });

        document.getElementById('btn-open-folder-manage').addEventListener('click', () => {
            renderFolderManageList();
            document.getElementById('folder-manage-view').style.display = 'flex';
        });

        document.getElementById('btn-folder-manage-back').addEventListener('click', () => {
            document.getElementById('folder-manage-view').style.display = 'none';
            renderFolders(); renderNotes();
        });

        document.getElementById('btn-manage-add-folder').addEventListener('click', () => {
            const name = prompt('새 폴더의 이름을 입력하세요.');
            if (name && name.trim()) {
                memoData.folders.push({ id: genId('f'), name: name.trim() });
                renderFolderManageList(); saveData(); 
            }
        });

        document.getElementById('folder-sort-container').addEventListener('input', (e) => {
            if (e.target.classList.contains('folder-name-input')) {
                const id = e.target.dataset.id;
                const folder = memoData.folders.find(f => f.id === id);
                if (folder) folder.name = e.target.value.trim();
                saveData(); 
            }
        });

        document.getElementById('folder-sort-container').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="delete-folder"]');
            if (!btn) return;
            const fId = btn.dataset.id;
            if (confirm('이 폴더를 삭제할까요? (안에 있던 메모들은 "전체"로 이동됩니다)')) {
                memoData.folders = memoData.folders.filter(f => f.id !== fId);
                memoData.notes.forEach(n => { if (n.folderId === fId) n.folderId = 'all'; });
                if(currentFolder === fId) currentFolder = 'all';
                renderFolderManageList(); saveData();
            }
        });

        document.getElementById('btn-add-note').addEventListener('click', () => openEditor());

        document.getElementById('memo-container').addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            
            if (btn) {
                const action = btn.dataset.action;
                const id = btn.dataset.id;

                if (action === 'edit') { 
                    openEditor(id); 
                } else if (action === 'delete') {
                    if (confirm('이 메모를 삭제하시겠습니까?')) {
                        memoData.notes = memoData.notes.filter(n => n.id !== id);
                        renderNotes(); saveData();
                    }
                } else if (action === 'toggle-star') {
                    const note = memoData.notes.find(n => n.id === id);
                    if (note) {
                        note.isFavorite = !note.isFavorite; 
                        renderNotes(); saveData();
                    }
                } else if (action === 'copy') {
                    const origin = memoData.notes.find(n => n.id === id);
                    if (!origin) return;

                    let textToCopy = origin.content || '';

                    try {
                        if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(textToCopy);
                        } else {
                            await fallbackCopyTextToClipboard(textToCopy);
                        }
                        const originalIcon = btn.innerText;
                        btn.innerText = '✅';
                        setTimeout(() => { btn.innerText = originalIcon; }, 1000);
                    } catch (err) {
                        const manualView = document.getElementById('manual-copy-view');
                        const manualText = document.getElementById('manual-copy-text');
                        manualText.value = textToCopy;
                        manualView.style.display = 'flex';
                        setTimeout(() => { manualText.focus(); manualText.select(); }, 100);
                    }
                }
                return; 
            }

            const card = e.target.closest('.memo-card');
            if (card) {
                openDetailView(card.dataset.id);
            }
        });

        const closeEditor = () => { document.getElementById('editor-view').style.display = 'none'; };
        document.getElementById('btn-editor-back').addEventListener('click', closeEditor);
        document.getElementById('btn-manual-copy-close').addEventListener('click', () => { document.getElementById('manual-copy-view').style.display = 'none'; });

        document.getElementById('btn-editor-save').addEventListener('click', () => {
            const title = document.getElementById('edit-title').value.trim();
            const content = document.getElementById('edit-content').value.trim();
            const folderId = document.getElementById('edit-folder').value;

            if (!title && !content) return alert('내용이나 제목을 입력해주세요.');

            if (editingNoteId) {
                const note = memoData.notes.find(n => n.id === editingNoteId);
                if (note) { 
                    note.title = title; 
                    note.content = content; 
                    note.folderId = folderId; 
                    note.timestamp = Date.now(); 
                }
            } else {
                memoData.notes.push({ 
                    id: genId('n'), 
                    title, 
                    content, 
                    folderId, 
                    timestamp: Date.now(),
                    isFavorite: currentFolder === 'favorites' 
                });
            }

            closeEditor(); renderNotes(); saveData(); 
        });

        renderFolders();
        renderNotes();
        initSortable('folder-sort-container', 'folder-manage-item', 'folder-handle', updateFolderOrder);
    };

    // 혹시 모를 대비용 햄버거 메뉴 등록 (트리플 탭 전용으로 쓰려면 이 블록 지워도 됨)
    await risuai.registerButton({ 
        name: '메모장 열기', 
        icon: '✏️', 
        iconType: 'html', 
        location: 'hamburger', 
        id: 'btn-floating-memo' 
    }, toggleMemoUI);

    try {
        const rootDoc = await risuai.getRootDocument();
        const rootBody = await rootDoc.querySelector('body');
        
        let tapCount = 0;
        let tapTimer = null;

        await rootBody.addEventListener('click', async () => {
            tapCount++;
            if (tapCount >= 3) {
                tapCount = 0;
                clearTimeout(tapTimer);
                toggleMemoUI(); 
            } else {
                clearTimeout(tapTimer);
                tapTimer = setTimeout(() => {
                    tapCount = 0;
                }, 500);
            }
        });
    } catch (err) {
        console.warn('트리플 탭 등록 에러:', err);
    }

})();