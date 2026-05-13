// Кэш для списка файлов
const filesCache = {
	data: null,
	timestamp: 0,
	etag: null,
};

// TTL кэша: 2 часа
const FILES_CACHE_TTL = 2 * 60 * 60 * 1000;

// Кэш для содержимого файлов (последние 2 файла)
const fileContentCache = {
	items: [], // [{ fileId, filename, buffer, size, timestamp }]
	maxSize: 2,
};

// ========== КЭШИРОВАНИЕ СПИСКА ФАЙЛОВ ==========

function getFilesCache() {
	const now = Date.now();
	const age = now - filesCache.timestamp;

	// Проверяем TTL
	if (filesCache.data && age < FILES_CACHE_TTL) {
		return {
			data: filesCache.data,
			etag: filesCache.etag,
			timestamp: filesCache.timestamp,
			age,
			valid: true,
		};
	}

	// Кэш устарел
	return null;
}

function setFilesCache(data) {
	const crypto = require('crypto');

	// Генерируем ETag из содержимого
	const hash = crypto
		.createHash('md5')
		.update(JSON.stringify(data))
		.digest('hex');
	const etag = `"${hash}"`;

	filesCache.data = data;
	filesCache.etag = etag;
	filesCache.timestamp = Date.now();

	console.log(`📋 Кэш списка обновлён (${data.length} файлов, TTL: 2 часа)`);
}

function invalidateFilesCache() {
	filesCache.data = null;
	filesCache.etag = null;
	filesCache.timestamp = 0;
	console.log('📋 Кэш списка файлов сброшен');
}

function getFilesCacheETag() {
	const cached = getFilesCache();
	return cached ? cached.etag : null;
}

function getFilesCacheAge() {
	if (!filesCache.timestamp) return null;
	return Date.now() - filesCache.timestamp;
}

// ========== КЭШИРОВАНИЕ СОДЕРЖИМОГО ФАЙЛОВ ==========

function getFileContent(fileId) {
	const item = fileContentCache.items.find(i => i.fileId === fileId);
	if (item) {
		// Обновляем timestamp для LRU
		item.timestamp = Date.now();
		console.log(`📦 Файл из кэша содержимого: ${item.filename}`);
		return item;
	}
	return null;
}

function setFileContent(fileId, filename, buffer) {
	// Удаляем если уже есть
	fileContentCache.items = fileContentCache.items.filter(i => i.fileId !== fileId);

	// Если кэш полон — удаляем самый старый (LRU)
	if (fileContentCache.items.length >= fileContentCache.maxSize) {
		fileContentCache.items.sort((a, b) => a.timestamp - b.timestamp);
		const removed = fileContentCache.items.shift();
		console.log(`🗑️ Удалён из кэша содержимого: ${removed.filename}`);
	}

	// Добавляем новый
	fileContentCache.items.push({
		fileId,
		filename,
		buffer,
		size: buffer.length,
		timestamp: Date.now(),
	});

	console.log(`💾 Закэширован файл: ${filename} (${formatSize(buffer.length)})`);
	console.log(`📊 В кэше: ${fileContentCache.items.map(i => i.filename).join(', ')}`);
}

function removeFileContent(fileId) {
	const index = fileContentCache.items.findIndex(i => i.fileId === fileId);
	if (index !== -1) {
		const removed = fileContentCache.items.splice(index, 1)[0];
		console.log(`🗑️ Удалён из кэша содержимого: ${removed.filename}`);
	}
}

function clearFileContentCache() {
	fileContentCache.items = [];
	console.log('🗑️ Кэш содержимого файлов очищен');
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
	getFilesCacheETag,
	getFilesCacheAge,

	// Содержимое файлов
	getFileContent,
	setFileContent,
	removeFileContent,
	clearFileContentCache,
	getFileContentCacheStats,

	// Константы
	FILES_CACHE_TTL,
};