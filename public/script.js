let selectedFilesList = [];

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const selectedList = document.getElementById('selectedList');
const uploadBtn = document.getElementById('uploadBtn');

// Drag & Drop
['dragenter', 'dragover'].forEach(event => {
	uploadZone.addEventListener(event, (e) => {
		e.preventDefault();
		uploadZone.classList.add('dragover');
	});
});

['dragleave', 'drop'].forEach(event => {
	uploadZone.addEventListener(event, (e) => {
		e.preventDefault();
		uploadZone.classList.remove('dragover');
	});
});

uploadZone.addEventListener('drop', (e) => {
	const files = e.dataTransfer.files;
	handleFiles(files);
});

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
	handleFiles(fileInput.files);
});

function handleFiles(files) {
	selectedFilesList = Array.from(files);
	if (selectedFilesList.length === 0) return;

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
	if (selectedFilesList.length === 0) return;

	const formData = new FormData();
	selectedFilesList.forEach(file => formData.append('files', file));

	const progressContainer = document.getElementById('progressContainer');
	const progressFill = document.getElementById('progressFill');
	const progressText = document.getElementById('progressText');

	progressContainer.style.display = 'block';
	uploadBtn.disabled = true;

	try {
		const xhr = new XMLHttpRequest();

		xhr.upload.addEventListener('progress', (e) => {
			if (e.lengthComputable) {
				const percent = Math.round((e.loaded / e.total) * 100);
				progressFill.style.width = percent + '%';
				progressText.textContent = `Загрузка... ${percent}% (${formatSize(e.loaded)} / ${formatSize(e.total)})`;
			}
		});

		await new Promise((resolve, reject) => {
			xhr.onload = () => {
				if (xhr.status === 200) {
					const result = JSON.parse(xhr.responseText);
					showToast(result.message, 'success');
					resolve();
				} else {
					const result = JSON.parse(xhr.responseText);
					reject(new Error(result.message));
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
		loadFiles();

	} catch (err) {
		showToast(err.message, 'error');
	} finally {
		uploadBtn.disabled = false;
		setTimeout(() => {
			progressContainer.style.display = 'none';
			progressFill.style.width = '0%';
		}, 1000);
	}
}

async function loadFiles() {
	try {
		const res = await fetch('/api/files');
		const data = await res.json();

		const filesList = document.getElementById('filesList');
		const fileCount = document.getElementById('fileCount');

		const files = data.data || [];
		fileCount.textContent = files.length;

		if (files.length === 0) {
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
					<a href="${file.path}" download class="btn-small btn-download">⬇️ Скачать</a>
					<button class="btn-small btn-delete" onclick="deleteFile('${file.name}')">🗑️ Удалить</button>
				</div>
			</div>
		`).join('');

	} catch (err) {
		console.error('Ошибка загрузки списка:', err);
	}
}

async function deleteFile(filename) {
	if (!confirm(`Удалить файл "${filename}"?`)) return;

	try {
		const res = await fetch(`/api/delete/${encodeURIComponent(filename)}`, {
			method: 'DELETE'
		});
		const data = await res.json();

		if (data.success) {
			showToast(data.message, 'success');
			loadFiles();
		} else {
			showToast(data.message, 'error');
		}
	} catch (err) {
		showToast('Ошибка удаления', 'error');
	}
}

function formatSize(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
	const ext = filename.split('.').pop().toLowerCase();
	const icons = {
		pdf: '📕', doc: '📘', docx: '📘', txt: '📝',
		jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
		mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
		mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
		zip: '📦', rar: '📦', tar: '📦', gz: '📦', '7z': '📦',
		js: '⚡', go: '🐹', py: '🐍', html: '🌐', css: '🎨',
		json: '📋', xml: '📋', csv: '📊', xls: '📊', xlsx: '📊',
		exe: '⚙️', dmg: '💿', iso: '💿',
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

// Загружаем список при открытии
loadFiles();
