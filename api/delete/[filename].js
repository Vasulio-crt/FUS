const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'DELETE') {
		return res.status(405).json({
		success: false,
		message: 'Используйте DELETE.'
		});
	}

	let filename = req.query?.filename;

	if (!filename) {
		const parts = req.url.split('/');
		filename = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
	}

	if (!filename && req.params?.filename) {
		filename = req.params.filename;
	}

	if (!filename) {
		return res.status(400).json({
		success: false,
		message: 'Укажите имя файла.'
		});
	}

	const safeName = path.basename(filename);
	const filePath = path.join(UPLOADS_DIR, safeName);

	if (!fs.existsSync(filePath)) {
		return res.status(404).json({
		success: false,
		message: 'Файл не найден.'
		});
	}

	try {
		fs.unlinkSync(filePath);
		console.log(`🗑️ Удалён: ${safeName}`);

		return res.status(200).json({
		success: true,
		message: `Файл '${safeName}' удалён.`
		});
	} catch (err) {
		console.error('Ошибка удаления:', err);
		return res.status(500).json({
		success: false,
		message: 'Ошибка удаления файла.'
		});
	}
};