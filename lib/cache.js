const crypto = require('crypto');

// Глобальный кэш списка файлов
const filesCache = {
	data: null,
	version: 0,
	etag: null,
};

// Кэш содержимого файлов (последние 2)
const fileContentCache = {
	items: [],
	maxSize: 2,
};

// ========== СПИСОК ФАЙЛОВ ==========

function getFilesCache() {
	return filesCache.data ? {
		data: filesCache.data,
		version: filesCache.version,
		etag: filesCache.etag,
	} : null;
}

function setFilesCache(data) {
	const hash = crypto
		.createHash('md5')
		.update(JSON.stringify(data))
		.digest('hex');

	filesCache.data = data;
	filesCache.version++;
	filesCache.etag = `"${hash}"`;

	console.log(`📋 Кэш обновлён: версия ${filesCache.version}, файлов: ${data.length}`);
}

function invalidateFilesCache() {
	filesCache.data = null;
	filesCache.version++;
	console.log(`🔄 Кэш сброшен: новая версия ${filesCache.version}`);
}

function getFilesCacheVersion() {
	return filesCache.version;
}

function getFilesCacheETag() {
	return filesCache.etag;
}

// ========== СОДЕРЖИМОЕ ФАЙЛОВ ==========

function getFileContent(fileId) {
	const item = fileContentCache.items.find(i => i.fileId === fileId);
	if (item) {
		item.timestamp = Date.now();
		console.log(`📦 Файл из кэша: ${item.filename}`);
		return item;
	}
	return null;
}

function setFileContent(fileId, filename, buffer) {
	fileContentCache.items = fileContentCache.items.filter(i => i.fileId !== fileId);

	if (fileContentCache.items.length >= fileContentCache.maxSize) {
		fileContentCache.items.sort((a, b) => a.timestamp - b.timestamp);
		const removed = fileContentCache.items.shift();
		console.log(`🗑️ Удалён из кэша: ${removed.filename}`);
	}

	fileContentCache.items.push({
		fileId,
		filename,
		buffer,
		size: buffer.length,
		timestamp: Date.now(),
	});

	console.log(`💾 Закэширован: ${filename}`);
}

function removeFileContent(fileId) {
	const index = fileContentCache.items.findIndex(i => i.fileId === fileId);
	if (index !== -1) {
		const removed = fileContentCache.items.splice(index, 1)[0];
		console.log(`🗑️ Удалён из кэша: ${removed.filename}`);
	}
}

function getFileContentCacheStats() {
	return {
		count: fileContentCache.items.length,
		maxSize: fileContentCache.maxSize,
		files: fileContentCache.items.map(i => ({
			filename: i.filename,
			size: i.size,
		})),
	};
}

module.exports = {
	getFilesCache,
	setFilesCache,
	invalidateFilesCache,
	getFilesCacheVersion,
	getFilesCacheETag,
	
	getFileContent,
	setFileContent,
	removeFileContent,
	getFileContentCacheStats,
};