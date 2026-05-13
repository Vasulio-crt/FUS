// ========== СОСТОЯНИЕ ==========
let selectedFilesList = [];
let pendingDeleteFile = null;
let isUploading = false;
let filesETag = null;
let duplicateResolutions = {}; // Решения для дубликатов

// ========== ПАРОЛЬ ==========
function getSavedPassword() {
    try {
        const saved = localStorage.getItem('deletePassword');
        if (saved) {
            const { password, expires } = JSON.parse(saved);
            if (Date.now() < expires) return password;
            localStorage.removeItem('deletePassword');
        }
    } catch (e) {
        console.error('Ошибка чтения пароля:', e);
    }
    return null;
}

function savePassword(password) {
    try {
        const expires = Date.now() + 60 * 60 * 1000; // 1 час
        localStorage.setItem('deletePassword', JSON.stringify({ password, expires }));
    } catch (e) {
        console.error('Ошибка сохранения пароля:', e);
    }
}

function clearSavedPassword() {
    try {
        localStorage.removeItem('deletePassword');
    } catch (e) {}
}

// ========== UI ЭЛЕМЕНТЫ ==========
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const selectedList = document.getElementById('selectedList');
const uploadBtn = document.getElementById('uploadBtn');

// ========== DRAG & DROP ==========
['dragenter', 'dragover'].forEach(e => {
    uploadZone.addEventListener(e, ev => {
        ev.preventDefault();
        ev.stopPropagation();
        uploadZone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(e => {
    uploadZone.addEventListener(e, ev => {
        ev.preventDefault();
        ev.stopPropagation();
        uploadZone.classList.remove('dragover');
    });
});

uploadZone.addEventListener('drop', e => {
    if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
    }
});

uploadZone.addEventListener('click', () => {
    if (!isUploading) fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        handleFiles(fileInput.files);
    }
});

// Touch feedback
uploadZone.addEventListener('touchstart', () => {
    if (!isUploading) uploadZone.classList.add('dragover');
}, { passive: true });

uploadZone.addEventListener('touchend', () => {
    uploadZone.classList.remove('dragover');
}, { passive: true });

function handleFiles(files) {
    selectedFilesList = Array.from(files);
    if (!selectedFilesList.length) return;

    selectedFilesDiv.style.display = 'block';
    uploadBtn.style.display = 'block';

    selectedList.innerHTML = selectedFilesList.map(f => `
        <div class="selected-file-item">
            <span class="name">${getFileIcon(f.name)} ${escapeHtml(f.name)}</span>
            <span class="size">${formatSize(f.size)}</span>
        </div>
    `).join('');

    // Скролл к кнопке на мобильных
    setTimeout(() => {
        uploadBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// ========== ЗАГРУЗКА ФАЙЛОВ ==========
async function uploadFiles() {
    if (!selectedFilesList.length || isUploading) return;

    isUploading = true;
    const formData = new FormData();

    selectedFilesList.forEach(file => formData.append('files', file));

    // Добавляем решения по дубликатам
    if (Object.keys(duplicateResolutions).length > 0) {
        formData.append('duplicateActions', JSON.stringify(duplicateResolutions));
    }

    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progressContainer.style.display = 'block';
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="loading-spinner"></span>Загрузка...';

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        // 409 Conflict — есть дубликаты, требуется подтверждение
        if (response.status === 409 && result.requiresConfirmation) {
            progressContainer.style.display = 'none';
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '⬆️ Загрузить';
            isUploading = false;

            // Показываем диалог с дубликатами
            await handleDuplicates(result.duplicates);
            return;
        }

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Ошибка загрузки');
        }

        showToast(result.message, 'success');

        // Сброс
        selectedFilesList = [];
        selectedFilesDiv.style.display = 'none';
        uploadBtn.style.display = 'none';
        fileInput.value = '';
        duplicateResolutions = {};

        // Обновляем список (кэш автоматически сброшен на бэкенде)
        loadFiles(true);

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        isUploading = false;
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '⬆️ Загрузить';

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
        }, 1000);
    }
}

// ========== ОБРАБОТКА ДУБЛИКАТОВ ==========
async function handleDuplicates(duplicates) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal duplicate-modal" onclick="event.stopPropagation()">
                <div class="modal-handle"></div>
                <h3>⚠️ Найдены дубликаты</h3>
                <p>Следующие файлы уже существуют. Выберите действие для каждого:</p>
                
                <div class="duplicates-list" id="duplicatesList"></div>
                
                <div class="modal-buttons">
                    <button class="btn-cancel" id="cancelDuplicates">Отменить</button>
                    <button class="btn-confirm" id="confirmDuplicates">Продолжить</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        const list = document.getElementById('duplicatesList');
        list.innerHTML = duplicates.map(dup => `
            <div class="duplicate-item">
                <div class="duplicate-info">
                    <div class="duplicate-name">${getFileIcon(dup.name)} ${escapeHtml(dup.name)}</div>
                    <div class="duplicate-meta">
                        Существующий: ${formatSize(dup.existingSize)} → Новый: ${formatSize(dup.size)}
                    </div>
                </div>
                <select class="duplicate-action" data-filename="${escapeHtml(dup.name)}">
                    <option value="replace">🔄 Перезаписать</option>
                    <option value="keep_both" selected>➕ Сохранить оба</option>
                    <option value="skip">⏭️ Пропустить</option>
                </select>
            </div>
        `).join('');

        // Обработчики кнопок
        const cancelBtn = document.getElementById('cancelDuplicates');
        const confirmBtn = document.getElementById('confirmDuplicates');

        const cleanup = () => {
            modal.remove();
            document.body.style.overflow = '';
        };

        cancelBtn.onclick = () => {
            cleanup();
            duplicateResolutions = {};
            showToast('Загрузка отменена', 'error');
            resolve();
        };

        confirmBtn.onclick = () => {
            // Собираем решения
            duplicateResolutions = {};
            document.querySelectorAll('.duplicate-action').forEach(select => {
                const filename = select.dataset.filename;
                duplicateResolutions[filename] = select.value;
            });

            cleanup();
            // Перезапускаем загрузку с решениями
            uploadFiles();
            resolve();
        };

        // Закрытие по клику на overlay
        modal.onclick = (e) => {
            if (e.target === modal) {
                cancelBtn.click();
            }
        };

        // ESC для закрытия
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cancelBtn.click();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

// ========== СПИСОК ФАЙЛОВ С ETAG ==========
async function loadFiles(forceRefresh = false) {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;

    try {
        const headers = {};

        // Добавляем ETag для проверки изменений
        if (filesETag && !forceRefresh) {
            headers['If-None-Match'] = filesETag;
        }

        const res = await fetch('/api/files', { headers });

        // 304 Not Modified — файлы не изменились
        if (res.status === 304) {
            updateCacheInfo('Не изменилось', true);
            refreshBtn.disabled = false;
            return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Сохраняем новый ETag
        filesETag = res.headers.get('ETag');

        const files = data.data || [];
        const cachedFileIds = new Set(
            (data.fileContentCache?.files || []).map(f => f.filename)
        );

        const cacheStatus = res.headers.get('X-Cache') || 'UNKNOWN';
        const cacheAge = res.headers.get('X-Cache-Age');

        let statusText = 'Обновлено';
        if (cacheStatus === 'HIT' && cacheAge) {
            statusText = `Кэш (${cacheAge})`;
        }

        updateCacheInfo(statusText, cacheStatus === 'HIT');
        renderFiles(files, cachedFileIds);

    } catch (err) {
        console.error('Ошибка загрузки списка:', err);
        updateCacheInfo('Ошибка', false);

        // Показываем ошибку если список пустой
        const filesList = document.getElementById('filesList');
        if (!filesList.children.length || filesList.querySelector('.empty-state')) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <div>Не удалось загрузить список</div>
                </div>
            `;
        }
    } finally {
        refreshBtn.disabled = false;
    }
}

function forceRefresh() {
    filesETag = null;
    loadFiles(true);
}

function updateCacheInfo(text, isCached) {
    document.getElementById('cacheInfo').innerHTML = `
        <span class="cache-badge ${isCached ? '' : 'miss'}">${text}</span>
    `;
}

function renderFiles(files, cachedFileIds) {
    document.getElementById('fileCount').textContent = files.length;
    const filesList = document.getElementById('filesList');

    if (!files.length) {
        filesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <div>Файлов пока нет</div>
            </div>
        `;
        return;
    }

    filesList.innerHTML = files.map(file => {
        const isCached = cachedFileIds.has(file.name);
        const safeName = escapeHtml(file.name);
        const safeNameAttr = file.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="file-card">
                <div class="file-info">
                    <span class="file-icon">${getFileIcon(file.name)}</span>
                    <div class="file-details">
                        <div class="file-name">${safeName}</div>
                        <div class="file-meta">
                            <span>${formatSize(file.size)}</span>
                            ${isCached ? '<span class="file-cached">⚡ в кэше</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="file-actions">
                    <a href="/api/download/${encodeURIComponent(file.name)}" 
                       class="btn-small btn-download" 
                       aria-label="Скачать">⬇️</a>
                    <button class="btn-small btn-delete" 
                            onclick="requestDelete('${safeNameAttr}')"
                            aria-label="Удалить">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ========== УДАЛЕНИЕ С ПАРОЛЕМ ==========
function requestDelete(filename) {
    const savedPassword = getSavedPassword();

    if (savedPassword) {
        // Есть сохранённый пароль — удаляем сразу
        executeDelete(filename, savedPassword);
    } else {
        // Показываем модалку для ввода пароля
        pendingDeleteFile = filename;
        document.getElementById('deleteFileName').textContent = filename;
        document.getElementById('deletePassword').value = '';
        document.getElementById('modalError').style.display = 'none';
        document.getElementById('rememberPassword').checked = false;
        document.getElementById('passwordModal').classList.add('active');

        // Фокус с задержкой для анимации
        setTimeout(() => {
            document.getElementById('deletePassword').focus();
        }, 300);

        // Блокируем скролл
        document.body.style.overflow = 'hidden';
    }
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
    document.body.style.overflow = '';
    pendingDeleteFile = null;
}

function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
        closePasswordModal();
    }
}

async function confirmDelete() {
    const password = document.getElementById('deletePassword').value;
    const remember = document.getElementById('rememberPassword').checked;

    if (!password) {
        document.getElementById('modalError').textContent = 'Введите пароль';
        document.getElementById('modalError').style.display = 'block';
        document.getElementById('deletePassword').focus();
        return;
    }

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>Удаление...';

    const success = await executeDelete(pendingDeleteFile, password);

    if (success && remember) {
        savePassword(password);
    }

    btn.disabled = false;
    btn.textContent = 'Удалить';

    if (success) {
        closePasswordModal();
    }
}

async function executeDelete(filename, password) {
    try {
        const res = await fetch(`/api/delete/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: { 'X-Delete-Password': password }
        });

        const data = await res.json();

        if (res.status === 403) {
            // Неверный пароль
            document.getElementById('modalError').textContent = 'Неверный пароль';
            document.getElementById('modalError').style.display = 'block';
            clearSavedPassword();
            document.getElementById('deletePassword').value = '';
            document.getElementById('deletePassword').focus();
            return false;
        }

        if (!res.ok) {
            showToast(data.message || 'Ошибка удаления', 'error');
            return false;
        }

        showToast(data.message, 'success');

        // Обновляем список (кэш автоматически сброшен на бэкенде)
        filesETag = null;
        loadFiles(true);
        return true;

    } catch (err) {
        console.error('Ошибка удаления:', err);
        showToast('Ошибка удаления', 'error');
        return false;
    }
}

// Клавиатура для модалки пароля
document.getElementById('deletePassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmDelete();
    }
    if (e.key === 'Escape') {
        closePasswordModal();
    }
});

// Закрытие модалки пароля по Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('passwordModal').classList.contains('active')) {
        closePasswordModal();
    }
});

// ========== УТИЛИТЫ ==========
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const icons = {
        // Документы
        pdf: '📕', doc: '📘', docx: '📘', txt: '📝', rtf: '📝',
        odt: '📘', xls: '📊', xlsx: '📊', ppt: '📙', pptx: '📙',
        // Изображения
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
        svg: '🖼️', webp: '🖼️', ico: '🖼️', bmp: '🖼️',
        heic: '🖼️', heif: '🖼️', tiff: '🖼️',
        // Видео
        mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
        webm: '🎬', flv: '🎬', wmv: '🎬', m4v: '🎬',
        // Аудио
        mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
        aac: '🎵', m4a: '🎵', wma: '🎵', opus: '🎵',
        // Архивы
        zip: '📦', rar: '📦', tar: '📦', gz: '📦',
        '7z': '📦', bz2: '📦', xz: '📦',
        // Код
        js: '⚡', ts: '⚡', jsx: '⚡', tsx: '⚡',
        go: '🐹', py: '🐍', rb: '💎', php: '🐘',
        java: '☕', c: '⚙️', cpp: '⚙️', cs: '⚙️',
        html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
        json: '📋', xml: '📋', yaml: '📋', yml: '📋',
        md: '📝', sql: '🗃️', sh: '💻', bat: '💻',
        rs: '🦀', swift: '🐦', kt: '🎯', dart: '🎯',
        // Прочее
        exe: '⚙️', dmg: '💿', iso: '💿', apk: '📱',
        ipa: '📱', deb: '📦', rpm: '📦',
    };
    return icons[ext] || '📄';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    // Удаляем предыдущие тосты
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

// ========== PULL TO REFRESH (для мобильных) ==========
let touchStartY = 0;
let isPulling = false;

document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
    }
}, { passive: true });

document.addEventListener('touchmove', e => {
    if (window.scrollY === 0 && e.touches[0].clientY > touchStartY + 80) {
        isPulling = true;
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (isPulling) {
        forceRefresh();
        isPulling = false;
    }
    touchStartY = 0;
}, { passive: true });

// ========== ЗАПУСК ==========
loadFiles();

// Обновляем при возврате на вкладку
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadFiles();
    }
});

// Периодическое обновление (каждые 5 минут, но только если кэш устарел)
setInterval(() => {
    if (!document.hidden) {
        loadFiles();
    }
}, 5 * 60 * 1000);