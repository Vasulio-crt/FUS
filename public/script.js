// ========== СОСТОЯНИЕ ==========
let selectedFilesList = [];
let pendingDeleteFile = null;
let isUploading = false;
let currentVersion = 0;
let duplicateResolutions = {};
let pollingInterval = null;

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
		const xhr = new XMLHttpRequest();

		xhr.upload.addEventListener('progress', e => {
			if (e.lengthComputable) {
				const pct = Math.round((e.loaded / e.total) * 100);
				progressFill.style.width = pct + '%';
				progressText.textContent = `${pct}% • ${formatSize(e.loaded)} / ${formatSize(e.total)}`;
			}
		});

		const response = await new Promise((resolve, reject) => {
			xhr.onload = () => resolve(xhr);
			xhr.onerror = () => reject(new Error('Ошибка сети'));
			xhr.open('POST', '/api/upload');
			xhr.send(formData);
		});

		const result = JSON.parse(response.responseText);

		// 409 Conflict — дубликаты
		if (response.status === 409 && result.requiresConfirmation) {
			progressContainer.style.display = 'none';
			uploadBtn.disabled = false;
			uploadBtn.innerHTML = '⬆️ Загрузить';
			isUploading = false;

			await handleDuplicates(result.duplicates);
			return;
		}

		if (response.status !== 200 || !result.success) {
			throw new Error(result.message || 'Ошибка загрузки');
		}

		showToast(result.message, 'success');

		selectedFilesList = [];
		selectedFilesDiv.style.display = 'none';
		uploadBtn.style.display = 'none';
		fileInput.value = '';
		duplicateResolutions = {};

		// НЕМЕДЛЕННО обновляем список
		await loadFiles(true);

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
				<p>Следующие файлы уже существуют. Выберите действие:</p>
				
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

		const cleanup = () => {
			modal.remove();
			document.body.style.overflow = '';
		};

		document.getElementById('cancelDuplicates').onclick = () => {
			cleanup();
			duplicateResolutions = {};
			showToast('Загрузка отменена', 'error');
			resolve();
		};

		document.getElementById('confirmDuplicates').onclick = () => {
			duplicateResolutions = {};
			document.querySelectorAll('.duplicate-action').forEach(select => {
				duplicateResolutions[select.dataset.filename] = select.value;
			});
			cleanup();
			uploadFiles();
			resolve();
		};

		modal.onclick = (e) => {
			if (e.target === modal) {
				document.getElementById('cancelDuplicates').click();
			}
		};
	});
}

// ========== СПИСОК ФАЙЛОВ ==========
async function loadFiles(force = false) {
	const refreshBtn = document.getElementById('refreshBtn');
	refreshBtn.disabled = true;

	try {
		const url = `/api/files?version=${force ? 0 : currentVersion}`;
		const res = await fetch(url);

		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();

		// Данные не изменились
		if (data.noChange && !force) {
			updateCacheInfo('Актуально', true);
			refreshBtn.disabled = false;
			return;
		}

		// Обновляем версию
		if (data.version) {
			currentVersion = data.version;
		}

		const files = data.data || [];
		const cachedFileIds = new Set(
			(data.fileContentCache?.files || []).map(f => f.filename)
		);

		const statusText = data.cached ? 'Из памяти' : 'Обновлено';
		updateCacheInfo(statusText, data.cached);

		renderFiles(files, cachedFileIds);

	} catch (err) {
		console.error('Ошибка:', err);
		updateCacheInfo('Ошибка', false);

		const filesList = document.getElementById('filesList');
		if (!filesList.children.length || filesList.querySelector('.empty-state')) {
			filesList.innerHTML = `
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

		setTimeout(() => {
			document.getElementById('deletePassword').focus();
		}, 300);

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

		// НЕМЕДЛЕННО обновляем список
		await loadFiles(true);
		return true;

	} catch (err) {
		showToast('Ошибка удаления', 'error');
		return false;
	}
}

document.getElementById('deletePassword').addEventListener('keydown', e => {
	if (e.key === 'Enter') {
		e.preventDefault();
		confirmDelete();
	}
	if (e.key === 'Escape') {
		closePasswordModal();
	}
});

document.addEventListener('keydown', e => {
	if (e.key === 'Escape' && document.getElementById('passwordModal').classList.contains('active')) {
		closePasswordModal();
	}
});

// ========== POLLING (проверка обновлений) ==========
function startPolling() {
	// Проверяем обновления каждые 3 секунды
	pollingInterval = setInterval(() => {
		if (!document.hidden && !isUploading) {
			loadFiles();
		}
	}, 3000);
}

function stopPolling() {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
}

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
		pdf: '📕', doc: '📘', docx: '📘', txt: '📝', rtf: '📝',
		odt: '📘', xls: '📊', xlsx: '📊', ppt: '📙', pptx: '📙',
		jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
		svg: '🖼️', webp: '🖼️', ico: '🖼️', bmp: '🖼️',
		heic: '🖼️', heif: '🖼️', tiff: '🖼️',
		mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
		webm: '🎬', flv: '🎬', wmv: '🎬', m4v: '🎬',
		mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
		aac: '🎵', m4a: '🎵', wma: '🎵', opus: '🎵',
		zip: '📦', rar: '📦', tar: '📦', gz: '📦',
		'7z': '📦', bz2: '📦', xz: '📦',
		js: '⚡', ts: '⚡', jsx: '⚡', tsx: '⚡',
		go: '🐹', py: '🐍', rb: '💎', php: '🐘',
		java: '☕', c: '⚙️', cpp: '⚙️', cs: '⚙️',
		html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
		json: '📋', xml: '📋', yaml: '📋', yml: '📋',
		md: '📝', sql: '🗃️', sh: '💻', bat: '💻',
		rs: '🦀', swift: '🐦', kt: '🎯', dart: '🎯',
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
	document.querySelectorAll('.toast').forEach(t => t.remove());

	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	toast.textContent = message;
	document.body.appendChild(toast);

	setTimeout(() => {
		if (toast.parentNode) toast.remove();
	}, 3000);
}

// ========== PULL TO REFRESH ==========
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
loadFiles(true);
startPolling();

document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		stopPolling();
	} else {
		loadFiles();
		startPolling();
	}
});