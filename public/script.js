// ========== СОСТОЯНИЕ ==========
let selectedFilesList = [];
let cachedVersion = 0;
let cachedFiles = [];
let cachedFileIds = new Set();
let pendingDeleteFile = null;
let isUploading = false;

// ========== ПАРОЛЬ ==========
function getSavedPassword() {
	try {
		const saved = localStorage.getItem('deletePassword');
		if (saved) {
			const { password, expires } = JSON.parse(saved);
			if (Date.now() < expires) return password;
			localStorage.removeItem('deletePassword');
		}
	} catch (e) {}
	return null;
}

function savePassword(password) {
	try {
		const expires = Date.now() + 60 * 60 * 1000;
		localStorage.setItem('deletePassword', JSON.stringify({ password, expires }));
	} catch (e) {}
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

	// Скролл к кнопке
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

	const progressContainer = document.getElementById('progressContainer');
	const progressFill = document.getElementById('progressFill');
	const progressText = document.getElementById('progressText');

	progressContainer.style.display = 'block';
	uploadBtn.disabled = true;
	uploadBtn.innerHTML = '<span class="loading-spinner"></span>Загрузка...';

	try {
		await new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener('progress', e => {
				if (e.lengthComputable) {
					const pct = Math.round((e.loaded / e.total) * 100);
					progressFill.style.width = pct + '%';
					progressText.textContent = `${pct}% • ${formatSize(e.loaded)} / ${formatSize(e.total)}`;
				}
			});

			xhr.onload = () => {
				try {
					const result = JSON.parse(xhr.responseText);
					if (xhr.status === 200 && result.success) {
						showToast(result.message, 'success');
						resolve();
					} else {
						reject(new Error(result.message || 'Ошибка сервера'));
					}
				} catch {
					reject(new Error('Ошибка ответа сервера'));
				}
			};

			xhr.onerror = () => reject(new Error('Ошибка сети'));
			xhr.open('POST', '/api/upload');
			xhr.send(formData);
		});

		// Сброс
		selectedFilesList = [];
		selectedFilesDiv.style.display = 'none';
		uploadBtn.style.display = 'none';
		fileInput.value = '';

		// Обновляем список
		cachedVersion = 0;
		loadFiles();

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

// ========== СПИСОК ФАЙЛОВ ==========
async function loadFiles() {
	const refreshBtn = document.getElementById('refreshBtn');
	refreshBtn.disabled = true;

	try {
		const res = await fetch(`/api/files?version=${cachedVersion}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();

		if (data.noChange && cachedFiles.length > 0) {
			updateCacheInfo('Актуально', true);
			refreshBtn.disabled = false;
			return;
		}

		cachedVersion = data.version || 0;
		cachedFiles = data.data || [];

		if (data.fileContentCache) {
			cachedFileIds = new Set(data.fileContentCache.files.map(f => f.filename));
		}

		updateCacheInfo(data.cached ? 'Кэш' : 'Обновлено', data.cached);
		renderFiles(cachedFiles);

	} catch (err) {
		console.error('Ошибка:', err);
		updateCacheInfo('Ошибка', false);

		if (cachedFiles.length === 0) {
			document.getElementById('filesList').innerHTML = `
				<div class="empty-state">
					<div class="empty-icon">⚠️</div>
					<div>Не удалось загрузить</div>
				</div>
			`;
		}
	} finally {
		refreshBtn.disabled = false;
	}
}

function forceRefresh() {
	cachedVersion = 0;
	loadFiles();
}

function updateCacheInfo(text, isCached) {
	document.getElementById('cacheInfo').innerHTML = `
		<span class="cache-badge ${isCached ? '' : 'miss'}">${text}</span>
	`;
}

function renderFiles(files) {
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
						aria-label="Скачать">
						⬇️
					</a>
					<button class="btn-small btn-delete" 
							onclick="requestDelete('${safeNameAttr}')"
							aria-label="Удалить">
						🗑️
					</button>
				</div>
			</div>
		`;
	}).join('');
}

// ========== УДАЛЕНИЕ ==========
function requestDelete(filename) {
	const savedPassword = getSavedPassword();

	if (savedPassword) {
		executeDelete(filename, savedPassword);
	} else {
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

		// Блокируем скролл body
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
	btn.innerHTML = '<span class="loading-spinner"></span>';

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
			document.getElementById('modalError').textContent = 'Неверный пароль';
			document.getElementById('modalError').style.display = 'block';
			clearSavedPassword();
			document.getElementById('deletePassword').value = '';
			document.getElementById('deletePassword').focus();
			return false;
		}

		if (!res.ok) {
			showToast(data.message || 'Ошибка', 'error');
			return false;
		}

		showToast(data.message, 'success');
		cachedVersion = 0;
		loadFiles();
		return true;

	} catch (err) {
		showToast('Ошибка удаления', 'error');
		return false;
	}
}

// Клавиатура
document.getElementById('deletePassword').addEventListener('keydown', e => {
	if (e.key === 'Enter') {
		e.preventDefault();
		confirmDelete();
	}
	if (e.key === 'Escape') {
		closePasswordModal();
	}
});

// Закрытие по Escape
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
		// Видео
		mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
		webm: '🎬', flv: '🎬', wmv: '🎬',
		// Аудио
		mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
		aac: '🎵', m4a: '🎵', wma: '🎵',
		// Архивы
		zip: '📦', rar: '📦', tar: '📦', gz: '📦',
		'7z': '📦', bz2: '📦',
		// Код
		js: '⚡', ts: '⚡', jsx: '⚡', tsx: '⚡',
		go: '🐹', py: '🐍', rb: '💎', php: '🐘',
		java: '☕', c: '⚙️', cpp: '⚙️', cs: '⚙️',
		html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
		json: '📋', xml: '📋', yaml: '📋', yml: '📋',
		md: '📝', sql: '🗃️', sh: '💻', bat: '💻',
		// Прочее
		exe: '⚙️', dmg: '💿', iso: '💿', apk: '📱',
	};
	return icons[ext] || '📄';
}

function escapeHtml(str) {
	const div = document.createElement('div');
	div.textContent = str;
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