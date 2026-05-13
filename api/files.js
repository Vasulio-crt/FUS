require('dotenv').config();

const { listFiles } = require('../lib/google-drive');
const { getFilesCache, setFilesCache, getFilesCacheETag, getFileContentCacheStats } = require('../lib/cache');
const { setCors } = require('../lib/auth');

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	try {
		// Проверяем кэш
		const cached = getFilesCache();

		// ETag клиента
		const clientEtag = req.headers['if-none-match'];

		// Если кэш валиден и ETag совпадает
		if (cached && clientEtag && clientEtag === cached.etag) {
			res.status(304).end();
			return;
		}

		// Если кэш валиден — отдаём его
		if (cached) {
			const cacheStats = getFileContentCacheStats();

			res.setHeader('ETag', cached.etag);
			res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
			res.setHeader('X-Cache', 'HIT');
			res.setHeader('X-Cache-Age', Math.round(cached.age / 1000) + 's');

			return res.status(200).json({
				success: true,
				message: `Найдено файлов: ${cached.data.length}`,
				data: cached.data,
				cached: true,
				cacheAge: cached.age,
				fileContentCache: cacheStats,
			});
		}

		// Запрашиваем из Google Drive
		const driveFiles = await listFiles();

		const files = driveFiles.map(file => ({
			id: file.id,
			name: file.name,
			size: parseInt(file.size) || 0,
			mimeType: file.mimeType,
			uploaded: file.createdTime,
		}));

		// Сохраняем в кэш
		setFilesCache(files);

		const cacheStats = getFileContentCacheStats();
		const etag = getFilesCacheETag();

		res.setHeader('ETag', etag);
		res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
		res.setHeader('X-Cache', 'MISS');

		console.log(`📋 Загружен список файлов: ${files.length} файлов`);

		return res.status(200).json({
			success: true,
			message: `Найдено файлов: ${files.length}`,
			data: files,
			cached: false,
			fileContentCache: cacheStats,
		});

	} catch (err) {
		console.error('Ошибка получения списка:', err);
		return res.status(500).json({
			success: false,
			message: `Ошибка: ${err.message}`,
		});
	}
};