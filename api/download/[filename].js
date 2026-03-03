const { list } = require('@vercel/blob');
const https = require('https');
const http = require('http');

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
	setCors(res);

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	// Получаем имя файла
	let filename = req.query?.filename;

	if (!filename && req.params?.filename) {
		filename = req.params.filename;
	}

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
		// Ищем файл в Blob Storage
		const { blobs } = await list();
		const blob = blobs.find(b => b.pathname === filename);

		if (!blob) {
		return res.status(404).json({
			success: false,
			message: 'Файл не найден.',
		});
		}

		// Ставим заголовки для принудительного скачивания
		res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
		res.setHeader('Content-Type', 'application/octet-stream');

		if (blob.size) {
		res.setHeader('Content-Length', blob.size);
		}

		const client = blob.url.startsWith('https') ? https : http;

		client.get(blob.url, (proxyRes) => {
		proxyRes.pipe(res);
		}).on('error', (err) => {
		console.error('Ошибка проксирования:', err);
		res.status(500).json({
			success: false,
			message: 'Ошибка скачивания файла.',
		});
		});

	} catch (err) {
		console.error('Ошибка:', err);
		return res.status(500).json({
		success: false,
		message: `Ошибка: ${err.message}`,
		});
	}
};