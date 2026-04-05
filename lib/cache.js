// Кэш для списка файлов
const filesCache = {
	data: null,
	timestamp: 0,
	version: 0,
};

// Кэш для содержимого файлов (последние 2 файла)
const fileContentCache = {
	items: [], // [{ fileId, filename, buffer, size, timestamp }]
	maxSize: 2,
};

// ========== КЭШИРОВАНИЕ СПИСКА ФАЙЛОВ ==========

function getFilesCache() {
	return filesCache.data
		? { data: filesCache.data, version: filesCache.version, timestamp: filesCache.timestamp }
		: null;
}

function setFilesCache(data) {
	filesCache.data = data;
	filesCache.timestamp = Date.now();
	filesCache.version++;
}

function invalidateFilesCache() {
	filesCache.data = null;
	filesCache.timestamp = 0;
	filesCache.version++;
	console.log('XX Кэш списка файлов очищен');
}

function getFilesCacheVersion() {
	return filesCache.version;
}

// ========== КЭШИРОВАНИЕ СОДЕРЖИМОГО ФАЙЛОВ ==========

function getFileContent(fileId) {
	const item = fileContentCache.items.find(i => i.fileId === fileId);
	if (item) {
		item.timestamp = Date.now();
		console.log(`Файл из кэша: ${item.filename}`);
		return item;
	}
	return null;
}

function setFileContent(fileId, filename, buffer) {
	// Удаляем если уже есть
	fileContentCache.items = fileContentCache.items.filter(i => i.fileId !== fileId);

	// Если кэш полон — удаляем самый старый
	if (fileContentCache.items.length >= fileContentCache.maxSize) {
		fileContentCache.items.sort((a, b) => a.timestamp - b.timestamp);
		const removed = fileContentCache.items.shift();
		console.log(`XX Удалён из кэша файлов: ${removed.filename}`);
	}

	// Добавляем новый
	fileContentCache.items.push({
		fileId,
		filename,
		buffer,
		size: buffer.length,
		timestamp: Date.now(),
	});

	console.log(`Закэширован файл: ${filename} (${formatSize(buffer.length)})`);
	console.log(`В кэше файлов: ${fileContentCache.items.map(i => i.filename).join(', ')}`);
	}

	function removeFileContent(fileId) {
	const index = fileContentCache.items.findIndex(i => i.fileId === fileId);
		if (index !== -1) {
			const removed = fileContentCache.items.splice(index, 1)[0];
			console.log(`XX Удалён из кэша файлов: ${removed.filename}`);
		}
	}

	function clearFileContentCache() {
		fileContentCache.items = [];
		console.log('Кэш содержимого файлов очищен');
	}

function getFileContentCacheStats() {
	return {
		count: fileContentCache.items.length,
		maxSize: fileContentCache.maxSize,
		files: fileContentCache.items.map(i => ({
		filename: i.filename,
		size: i.size,
		age: Date.now() - i.timestamp,
		})),
		totalSize: fileContentCache.items.reduce((sum, i) => sum + i.size, 0),
	};
}

function formatSize(bytes) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = {
	// Список файлов
	getFilesCache,
	setFilesCache,
	invalidateFilesCache,
	getFilesCacheVersion,

	// Содержимое файлов
	getFileContent,
	setFileContent,
	removeFileContent,
	clearFileContentCache,
	getFileContentCacheStats,
};