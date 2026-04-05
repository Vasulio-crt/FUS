// ========== СОСТОЯНИЕ ==========
let selectedFilesList = [];
let cachedVersion = 0;
let cachedFiles = [];
let cachedFileIds = new Set(); // ID файлов в кэше содержимого
let pendingDeleteFile = null;

// ========== ПАРОЛЬ ==========
function getSavedPassword() {
	const saved = localStorage.getItem('deletePassword');
	if (saved) {
		const { password, expires } = JSON.parse(saved);
		if (Date.now() < expires) return password;
		localStorage.removeItem('deletePassword');
	}
	return null;
}

function savePassword(password) {
	const expires = Date.now() + 60 * 60 * 1000; // 1 час
	localStorage.setItem('deletePassword', JSON.stringify({ password, expires }));
}

function clearSavedPassword() {
	localStorage.removeItem('deletePassword');
}

// ========== UI ЭЛЕМЕНТЫ ==========
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const selectedList = document.getElementById('selectedList');
const uploadBtn = document.getElementById('uploadBtn');

// ========== DRAG & DROP ==========
['dragenter','dragover'].forEach(e => uploadZone.addEventListener(e, ev => { ev.preventDefault(); uploadZone.classList.add('dragover'); }));
['dragleave','drop'].forEach(e => uploadZone.addEventListener(e, ev => { ev.preventDefault(); uploadZone.classList.remove('dragover'); }));
uploadZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(files) {
	selectedFilesList = Array.from(files);
	if (!selectedFilesList.length) return;
	selectedFilesDiv.style.display = 'block';
	uploadBtn.style.display = 'block';
	selectedList.innerHTML = selectedFilesList.map(f => `
		<div class="selected-file-item">
			<span class="name">${getFileIcon(f.name)} ${f.name}</span>
			<span class="size">${formatSize(f.size)}</span>
		</div>
	`).join('');
}

// ========== ЗАГРУЗКА ФАЙЛОВ ==========
async function uploadFiles() {
	if (!selectedFilesList.length) return;
	const formData = new FormData();
	selectedFilesList.forEach(file => formData.append('files', file));

	const progressContainer = document.getElementById('progressContainer');
	const progressFill = document.getElementById('progressFill');
	const progressText = document.getElementById('progressText');
	progressContainer.style.display = 'block';
	uploadBtn.disabled = true;

	try {
		await new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.upload.addEventListener('progress', e => {
				if (e.lengthComputable) {
					const pct = Math.round((e.loaded / e.total) * 100);
					progressFill.style.width = pct + '%';
					progressText.textContent = `Загрузка... ${pct}%`;
				}
			});
			xhr.onload = () => {
				try {
					const result = JSON.parse(xhr.responseText);
					if (xhr.status === 200 && result.success) {
						showToast(result.message, 'success');
						resolve();
					} else {
						reject(new Error(result.message || 'Ошибка'));
					}
				} catch { reject(new Error('Ошибка ответа сервера')); }
			};
			xhr.onerror = () => reject(new Error('Ошибка сети'));
			xhr.open('POST', '/api/upload');
			xhr.send(formData);
		});

		selectedFilesList = [];
		selectedFilesDiv.style.display = 'none';
		uploadBtn.style.display = 'none';
		fileInput.value = '';

		// Кэш устарел — принудительно обновляем
		cachedVersion = 0;
		loadFiles();
	} catch (err) {
		showToast(err.message, 'error');
	} finally {
		uploadBtn.disabled = false;
		setTimeout(() => { progressContainer.style.display = 'none'; progressFill.style.width = '0%'; }, 1000);
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

		// Если данные не изменились
		if (data.noChange && cachedFiles.length > 0) {
			updateCacheInfo('Актуально', true);
			refreshBtn.disabled = false;
			return;
		}

		// Обновляем локальный кэш
		cachedVersion = data.version || 0;
		cachedFiles = data.data || [];

		// Обновляем список закэшированных файлов
		if (data.fileContentCache) {
			cachedFileIds = new Set(data.fileContentCache.files.map(f => f.filename));
		}

		updateCacheInfo(data.cached ? 'Из кэша' : 'Обновлено', data.cached);
		renderFiles(cachedFiles);
	} catch (err) {
		console.error('Ошибка:', err);
		updateCacheInfo('Ошибка', false);
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
		filesList.innerHTML = '<div class="empty-state">Файлов пока нет</div>';
		return;
	}

	filesList.innerHTML = files.map(file => {
		const isCached = cachedFileIds.has(file.name);
		return `
		<div class="file-card">
			<div class="file-info">
				<span class="file-icon">${getFileIcon(file.name)}</span>
				<div class="file-details">
					<div class="file-name">${file.name}</div>
					<div class="file-meta">
						<span>${formatSize(file.size)}</span>
						${isCached ? '<span class="file-cached">⚡ в кэше</span>' : ''}
					</div>
				</div>
			</div>
			<div class="file-actions">
				<a href="/api/download/${encodeURIComponent(file.name)}" class="btn-small btn-download">⬇️ Скачать</a>
				<button class="btn-small btn-delete" onclick="requestDelete('${escapeHtml(file.name)}')">🗑️ Удалить</button>
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
		// Показываем модалку
		pendingDeleteFile = filename;
		document.getElementById('deleteFileName').textContent = filename;
		document.getElementById('deletePassword').value = '';
		document.getElementById('modalError').style.display = 'none';
		document.getElementById('passwordModal').classList.add('active');
		document.getElementById('deletePassword').focus();
	}
}

function closePasswordModal() {
	document.getElementById('passwordModal').classList.remove('active');
	pendingDeleteFile = null;
}

async function confirmDelete() {
	const password = document.getElementById('deletePassword').value;
	const remember = document.getElementById('rememberPassword').checked;

	if (!password) {
		document.getElementById('modalError').textContent = 'Введите пароль';
		document.getElementById('modalError').style.display = 'block';
		return;
	}

	const btn = document.getElementById('confirmDeleteBtn');
	btn.disabled = true;
	btn.textContent = 'Удаление...';

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
			return false;
		}

		if (!res.ok) {
			showToast(data.message || 'Ошибка', 'error');
			return false;
		}

		showToast(data.message, 'success');

		// Кэш устарел
		cachedVersion = 0;
		loadFiles();
		return true;
	} catch (err) {
		showToast('Ошибка удаления', 'error');
		return false;
	}
}

// Enter для подтверждения
document.getElementById('deletePassword').addEventListener('keydown', (e) => {
	if (e.key === 'Enter') confirmDelete();
	if (e.key === 'Escape') closePasswordModal();
});

// ========== УТИЛИТЫ ==========
function formatSize(bytes) {
	if (!bytes || bytes === 0) return '0 B';
	const k = 1024, sizes = ['B','KB','MB','GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
	const ext = (filename || '').split('.').pop().toLowerCase();
	const icons = {
		pdf:'📕',doc:'📘',docx:'📘',txt:'📝',
		jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',svg:'🖼️',webp:'🖼️',
		mp4:'🎬',avi:'🎬',mov:'🎬',mkv:'🎬',
		mp3:'🎵',wav:'🎵',flac:'🎵',ogg:'🎵',
		zip:'📦',rar:'📦',tar:'📦',gz:'📦','7z':'📦',
		js:'⚡',ts:'⚡',go:'🐹',py:'🐍',html:'🌐',css:'🎨',
		json:'📋',xml:'📋',csv:'📊',xls:'📊',xlsx:'📊',
	};
	return icons[ext] || '📄';
}

function escapeHtml(str) {
	return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function showToast(message, type = 'success') {
	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	toast.textContent = message;
	document.body.appendChild(toast);
	setTimeout(() => toast.remove(), 3000);
}

// ========== ЗАПУСК ==========
loadFiles();