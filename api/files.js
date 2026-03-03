const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	// Скачивание конкретного файла
	const download = req.query?.download;
	if (download) {
		const safeName = path.basename(download);
		const filePath = path.join(UPLOADS_DIR, safeName);

		if (!fs.existsSync(filePath)) {
		return res.status(404).json({
			success: false,
			message: 'Файл не найден.'
		});
		}

		const stat = fs.statSync(filePath);
		res.setHeader('Content-Length', stat.size);
		res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

		const stream = fs.createReadStream(filePath);
		return stream.pipe(res);
	}

	// Список файлов
	if (!fs.existsSync(UPLOADS_DIR)) {
		return res.status(200).json({
		success: true,
		message: 'Найдено файлов: 0',
		data: []
		});
	}

	try {
		const entries = fs.readdirSync(UPLOADS_DIR);
		const files = entries
		.filter(name => {
			const fullPath = path.join(UPLOADS_DIR, name);
			return fs.statSync(fullPath).isFile();
		})
		.map(name => {
			const fullPath = path.join(UPLOADS_DIR, name);
			const stat = fs.statSync(fullPath);
			return {
			name,
			size: stat.size,
			path: `/uploads/${name}`,
			modified: stat.mtime
			};
		})
		.sort((a, b) => new Date(b.modified) - new Date(a.modified));

		return res.status(200).json({
		success: true,
		message: `Найдено файлов: ${files.length}`,
		data: files
		});
	} catch (err) {
		console.error('Ошибка чтения папки:', err);
		return res.status(500).json({
		success: false,
		message: 'Ошибка чтения файлов.'
		});
	}
};