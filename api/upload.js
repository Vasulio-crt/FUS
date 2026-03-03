const { put } = require('@vercel/blob');
const { IncomingForm } = require('formidable');
const fs = require('fs');
const path = require('path');

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
	const timestamp = Date.now();
	return `${name}_${timestamp}${ext}`;
}

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'POST') {
		return res.status(405).json({
		success: false,
		message: 'Используйте POST.'
		});
	}

	try {
		const { files } = await parseForm(req);

		let uploaded = files.files;
		if (!uploaded) {
		return res.status(400).json({
			success: false,
			message: "Файлы не найдены. Используйте поле 'files'."
		});
		}

		if (!Array.isArray(uploaded)) {
		uploaded = [uploaded];
		}

		const results = [];

		for (const file of uploaded) {
		const safeName = sanitize(file.originalFilename || file.newFilename);
		const uniqueName = makeUnique(safeName);

		const fileBuffer = fs.readFileSync(file.filepath);

		const blob = await put(uniqueName, fileBuffer, {
			access: 'public',
			contentType: file.mimetype || 'application/octet-stream',
		});

		// Удаляем временный файл
		try { fs.unlinkSync(file.filepath); } catch {}

		results.push({
			name: uniqueName,
			size: file.size,
			path: blob.url,
			url: blob.url,
		});

		console.log(`✅ Загружен в Blob: ${uniqueName}`);
		}

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
		maxFileSize: 50 * 1024 * 1024,
		keepExtensions: true,
		});

		form.parse(req, (err, fields, files) => {
		if (err) reject(err);
		else resolve({ fields, files });
		});
	});
}

module.exports.config = {
	api: {
		bodyParser: false,
	},
};