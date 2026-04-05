require('dotenv').config();

const { findFileByName, deleteFile } = require('../../lib/google-drive');
const { invalidateFilesCache, removeFileContent } = require('../../lib/cache');
const { setCors, verifyDeletePassword } = require('../../lib/auth');

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'DELETE') {
		return res.status(405).json({
			success: false,
			message: 'Используйте DELETE.',
		});
	}

	// Проверяем пароль
	const password = req.headers['x-delete-password'] || req.query?.password;

	if (!password) {
		return res.status(401).json({
			success: false,
			message: 'Требуется пароль для удаления.',
			requiresPassword: true,
		});
	}

	if (!verifyDeletePassword(password)) {
		return res.status(403).json({
			success: false,
			message: 'Неверный пароль.',
		});
	}

	// Получаем имя файла
	let filename = req.query?.filename;
	if (!filename && req.params?.filename) filename = req.params.filename;
	if (!filename) {
		const parts = req.url.split('/');
		filename = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
	}

	if (!filename) {
		return res.status(400).json({
			success: false,
			message: 'Укажите имя файла.',
		});
	}

	try {
		// Ищем файл
		const file = await findFileByName(filename);

		if (!file) {
			return res.status(404).json({
				success: false,
				message: 'Файл не найден.',
			});
		}

		// Удаляем из Google Drive
		await deleteFile(file.id);

		// Удаляем из кэша содержимого
		removeFileContent(file.id);

		// Сбрасываем кэш списка файлов
		invalidateFilesCache();

		console.log(`XX Удалён: ${filename}`);

		return res.status(200).json({
			success: true,
			message: `Файл '${filename}' удалён.`,
		});
	} catch (err) {
		console.error('Ошибка удаления:', err);
		return res.status(500).json({
			success: false,
			message: `Ошибка: ${err.message}`,
		});
	}
};