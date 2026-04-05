require('dotenv').config();

const { listFiles } = require('../lib/google-drive');
const { getFilesCache, setFilesCache, getFilesCacheVersion, getFileContentCacheStats } = require('../lib/cache');
const { setCors } = require('../lib/auth');

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	try {
		// Проверяем кэш
		const cached = getFilesCache();
		const clientVersion = parseInt(req.query?.version) || 0;
		const currentVersion = getFilesCacheVersion();

		// Если клиент уже имеет актуальную версию
		if (clientVersion === currentVersion && cached) {
			return res.status(200).json({
				success: true,
				message: 'Данные не изменились',
				data: [],
				version: currentVersion,
				cached: true,
				noChange: true,
			});
		}

		// Если есть кэш — отдаём его
		if (cached) {
			const cacheStats = getFileContentCacheStats();

			return res.status(200).json({
				success: true,
				message: `Найдено файлов: ${cached.data.length}`,
				data: cached.data,
				version: currentVersion,
				cached: true,
				cacheAge: Date.now() - cached.timestamp,
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

		console.log(`Загружен список файлов: ${files.length} файлов`);

		return res.status(200).json({
			success: true,
			message: `Найдено файлов: ${files.length}`,
			data: files,
			version: getFilesCacheVersion(),
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