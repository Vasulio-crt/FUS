let selectedFilesList = [];

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const selectedList = document.getElementById('selectedList');
const uploadBtn = document.getElementById('uploadBtn');

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
					progressText.textContent = `Загрузка... ${pct}% (${formatSize(e.loaded)} / ${formatSize(e.total)})`;
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
					reject(new Error(`Сервер вернул ошибку (${xhr.status})`));
				}
			};
			xhr.onerror = () => reject(new Error('Ошибка сети'));
			xhr.open('POST', '/api/upload');
			xhr.send(formData);
		});

		selectedFilesList = [];
		selectedFilesDiv.style.display = 'none';
		uploadBtn.style.display = 'none';
		fileInput.value = '';
		loadFiles();
	} catch (err) {
		showToast(err.message, 'error');
	} finally {
		uploadBtn.disabled = false;
		setTimeout(() => { progressContainer.style.display = 'none'; progressFill.style.width = '0%'; }, 1000);
	}
}

async function loadFiles() {
	try {
		const res = await fetch('/api/files');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();
		const files = data.data || [];

		document.getElementById('fileCount').textContent = files.length;
		const filesList = document.getElementById('filesList');

		if (!files.length) {
			filesList.innerHTML = '<div class="empty-state">Файлов пока нет</div>';
			return;
		}

		filesList.innerHTML = files.map(file => `
			<div class="file-card">
				<div class="file-info">
					<span class="file-icon">${getFileIcon(file.name)}</span>
					<div class="file-details">
						<div class="file-name">${file.name}</div>
						<div class="file-size">${formatSize(file.size)}</div>
					</div>
				</div>
				<div class="file-actions">
					<a href="/api/download/${encodeURIComponent(file.name)}" class="btn-small btn-download">⬇️ Скачать</a>
					<button class="btn-small btn-delete" onclick="deleteFile('${file.name}')">🗑️ Удалить</button>
				</div>
			</div>
		`).join('');
	} catch (err) {
		console.error('Ошибка загрузки списка:', err);
	}
}

async function deleteFile(filename) {
	if (!confirm(`Удалить "${filename}"?`)) return;
	try {
		const res = await fetch(`/api/delete/${encodeURIComponent(filename)}`, { method: 'DELETE' });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		showToast(data.message, data.success ? 'success' : 'error');
		if (data.success) loadFiles();
	} catch { showToast('Ошибка удаления', 'error'); }
}

function formatSize(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024, sizes = ['B','KB','MB','GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
	const ext = filename.split('.').pop().toLowerCase();
	const icons = {
		pdf:'📕',doc:'📘',docx:'📘',txt:'📝',
		jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',svg:'🖼️',webp:'🖼️',
		mp4:'🎬',avi:'🎬',mov:'🎬',mkv:'🎬',
		mp3:'🎵',wav:'🎵',flac:'🎵',
		zip:'📦',rar:'📦',tar:'📦',gz:'📦','7z':'📦',
		js:'⚡',go:'🐹',py:'🐍',html:'🌐',css:'🎨',
		json:'📋',xml:'📋',csv:'📊',xls:'📊',xlsx:'📊',
	};
	return icons[ext] || '📄';
}

function showToast(message, type = 'success') {
	const toast = document.createElement('div');
	toast.className = `toast ${type}`;
	toast.textContent = message;
	document.body.appendChild(toast);
	setTimeout(() => toast.remove(), 3000);
}

loadFiles();