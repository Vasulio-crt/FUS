const { IncomingForm } = require('formidable');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_SIZE = 50 * 1024 * 1024;

if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function sanitize(name) {
	return path.basename(name)
		.replace(/\.\./g, '')
		.replace(/[\/\\]/g, '')
		.replace(/\s+/g, '_');
}

function makeUnique(filename) {
	const ext = path.extname(filename);
	const name = path.basename(filename, ext);
	const timestamp = new Date().toISOString()
		.replace(/[-:T]/g, '')
		.replace(/\..+/, '')
		.slice(0, 15);
	return `${name}_${timestamp}${ext}`;
}

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'POST') {
		return res.status(405).json({
		success: false,
		message: 'Метод не поддерживается. Используйте POST.'
		});
	}

	const form = new IncomingForm({
		multiples: true,
		maxFileSize: MAX_SIZE,
		keepExtensions: true,
	});

	form.parse(req, (err, fields, files) => {
		if (err) {
		console.error('Ошибка парсинга:', err);
		return res.status(400).json({
			success: false,
			message: `Ошибка загрузки: ${err.message}`
		});
		}

		let uploaded = files.files;
		if (!uploaded) {
		return res.status(400).json({
			success: false,
			message: "Файлы не найдены. Используйте поле 'files'."
		});
		}

		// formidable v3 всегда возвращает массив
		if (!Array.isArray(uploaded)) {
		uploaded = [uploaded];
		}

		const results = [];

		for (const file of uploaded) {
		try {
			const safeName = sanitize(file.originalFilename || file.newFilename);
			const uniqueName = makeUnique(safeName);
			const destPath = path.join(UPLOADS_DIR, uniqueName);

			const data = fs.readFileSync(file.filepath);
			fs.writeFileSync(destPath, data);
			fs.unlinkSync(file.filepath);

			results.push({
			name: uniqueName,
			size: file.size,
			path: `/uploads/${uniqueName}`
			});

			console.log(`✅ Загружен: ${uniqueName} (${file.size} байт)`);
		} catch (e) {
			console.error('Ошибка сохранения файла:', e);
		}
		}

		return res.status(200).json({
		success: true,
		message: `Загружено файлов: ${results.length}`,
		data: results
		});
	});
};

module.exports.config = {
	api: {
		bodyParser: false,
	},
};