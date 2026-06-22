require('dotenv').config();

const { listFiles } = require('../lib/google-drive');
const { 
	getFilesCache, 
	setFilesCache, 
	getFilesCacheVersion,
	getFileContentCacheStats 
} = require('../lib/cache');
const { setCors } = require('../lib/auth');

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	try {
		const clientVersion = parseInt(req.query?.version) || 0;
		const currentVersion = getFilesCacheVersion();

		// Проверяем кэш
		const cached = getFilesCache();

		// Если версии совпадают — данные не изменились
		if (cached && clientVersion === currentVersion && clientVersion > 0) {
			return res.status(200).json({
				success: true,
				noChange: true,
				version: currentVersion,
				message: 'Данные актуальны',
			});
		}

		// Если есть кэш — отдаём его
		if (cached) {
			const stats = getFileContentCacheStats();

			return res.status(200).json({
				success: true,
				message: `Найдено файлов: ${cached.data.length}`,
				data: cached.data,
				version: currentVersion,
				cached: true,
				fileContentCache: stats,
			});
		}

		// Нет кэша — загружаем из Google Drive
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

		const stats = getFileContentCacheStats();

		console.log(`📋 Загружен список: ${files.length} файлов`);

		return res.status(200).json({
			success: true,
			message: `Найдено файлов: ${files.length}`,
			data: files,
			version: getFilesCacheVersion(),
			cached: false,
			fileContentCache: stats,
		});

	} catch (err) {
		console.error('Ошибка получения списка:', err);
		return res.status(500).json({
			success: false,
			message: `Ошибка: ${err.message}`,
		});
	}
};