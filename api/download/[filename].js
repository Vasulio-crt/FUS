require('dotenv').config();

const { findFileByName, downloadFile, getFile } = require('../../lib/google-drive');
const { getFileContent, setFileContent } = require('../../lib/cache');
const { setCors } = require('../../lib/auth');

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
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
		// Ищем файл в Google Drive
		const file = await findFileByName(filename);

		if (!file) {
			return res.status(404).json({
				success: false,
				message: 'Файл не найден.',
			});
		}

		// Проверяем кэш содержимого
		let buffer;
		const cached = getFileContent(file.id);

		if (cached) {
			buffer = cached.buffer;
			res.setHeader('X-Cache', 'HIT');
		} else {
			// Скачиваем из Google Drive
			buffer = await downloadFile(file.id);

			// Сохраняем в кэш (последние 2 файла)
			setFileContent(file.id, file.name, buffer);
			res.setHeader('X-Cache', 'MISS');
		}

		// Заголовки для скачивания
		res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
		res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
		res.setHeader('Content-Length', buffer.length);

		return res.send(buffer);
	} catch (err) {
		console.error('Ошибка скачивания:', err);
		return res.status(500).json({
			success: false,
			message: `Ошибка: ${err.message}`,
		});
	}
};