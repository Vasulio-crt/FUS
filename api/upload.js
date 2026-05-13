require('dotenv').config();

const { IncomingForm } = require('formidable');
const fs = require('fs');
const path = require('path');
const { uploadFile, findFileByName, deleteFile } = require('../lib/google-drive');
const { invalidateFilesCache } = require('../lib/cache');
const { setCors } = require('../lib/auth');

function sanitize(name) {
	return path.basename(name)
		.replace(/\.\./g, '')
		.replace(/[\/\\]/g, '')
		.replace(/\s+/g, '_');
}

function makeUnique(filename) {
	const ext = path.extname(filename);
	const name = path.basename(filename, ext);
	const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
	return `${name}_${uniqueId}${ext}`;
}

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'POST') {
		return res.status(405).json({
			success: false,
			message: 'Используйте POST.',
		});
	}

	try {
		const { files, fields } = await parseForm(req);

		let uploaded = files.files;
		if (!uploaded) {
			return res.status(400).json({
				success: false,
				message: "Файлы не найдены. Используйте поле 'files'.",
			});
		}

		if (!Array.isArray(uploaded)) {
			uploaded = [uploaded];
		}

		// Парсим действия для дубликатов (из формы)
		const duplicateActions = {};
		if (fields.duplicateActions) {
			try {
				const parsed = Array.isArray(fields.duplicateActions) 
					? fields.duplicateActions[0] 
					: fields.duplicateActions;
				Object.assign(duplicateActions, JSON.parse(parsed));
			} catch (e) {
				console.error('Ошибка парсинга duplicateActions:', e);
			}
		}

		const results = [];
		const duplicates = [];

		// Первый проход: проверяем дубликаты
		for (const file of uploaded) {
			const safeName = sanitize(file.originalFilename || file.newFilename);
			const existing = await findFileByName(safeName);

			if (existing) {
				const action = duplicateActions[safeName];

				if (!action || action === 'ask') {
					// Нет решения — добавляем в список дубликатов
					duplicates.push({
						name: safeName,
						size: file.size,
						existingId: existing.id,
						existingSize: parseInt(existing.size) || 0,
					});
				}
			}
		}

		// Если есть нерешённые дубликаты — возвращаем их для подтверждения
		if (duplicates.length > 0) {
			// Удаляем временные файлы
			for (const file of uploaded) {
				try {
					fs.unlinkSync(file.filepath);
				} catch (e) {}
			}

			return res.status(409).json({
				success: false,
				requiresConfirmation: true,
				duplicates,
				message: `Найдено ${duplicates.length} дубликатов. Требуется подтверждение.`,
			});
		}

		// Второй проход: загружаем файлы с учётом решений
		for (const file of uploaded) {
			const safeName = sanitize(file.originalFilename || file.newFilename);
			const action = duplicateActions[safeName];
			const fileBuffer = fs.readFileSync(file.filepath);

			let finalName = safeName;
			let shouldUpload = true;

			// Проверяем дубликат снова
			const existing = await findFileByName(safeName);

			if (existing) {
				if (action === 'replace') {
					// Удаляем старый файл
					await deleteFile(existing.id);
					console.log(`🔄 Перезаписан: ${safeName}`);
				} else if (action === 'keep_both') {
					// Добавляем уникальный код
					finalName = makeUnique(safeName);
					console.log(`➕ Создан дубликат: ${finalName}`);
				} else if (action === 'skip') {
					// Пропускаем
					shouldUpload = false;
					console.log(`⏭️ Пропущен: ${safeName}`);
				}
			}

			if (shouldUpload) {
				const driveFile = await uploadFile(
					finalName,
					fileBuffer,
					file.mimetype || 'application/octet-stream'
				);

				results.push({
					id: driveFile.id,
					name: driveFile.name,
					size: parseInt(driveFile.size) || file.size,
					mimeType: driveFile.mimeType,
					action: existing ? action : 'new',
				});

				console.log(`✅ Загружен: ${finalName}`);
			}

			// Удаляем временный файл
			try {
				fs.unlinkSync(file.filepath);
			} catch (e) {}
		}

		// Сбрасываем кэш
		invalidateFilesCache();

		return res.status(200).json({
			success: true,
			message: `Загружено файлов: ${results.length}`,
			data: results,
		});

	} catch (err) {
		console.error('Ошибка загрузки:', err);
		return res.status(500).json({
			success: false,
			message: `Ошибка: ${err.message}`,
		});
	}
};

function parseForm(req) {
	return new Promise((resolve, reject) => {
		const form = new IncomingForm({
			multiples: true,
			maxFileSize: 100 * 1024 * 1024,
			keepExtensions: true,
		});
		form.parse(req, (err, fields, files) => {
			if (err) reject(err);
			else resolve({ fields, files });
		});
	});
}

module.exports.config = {
	api: { bodyParser: false },
};