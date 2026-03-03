const { list } = require('@vercel/blob');

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

	try {
		const { blobs } = await list();

		const files = blobs.map(blob => ({
			name: blob.pathname,
			size: blob.size,
			path: blob.url,
			url: blob.url,
			uploaded: blob.uploadedAt,
		}));

		// Сортировка: новые сверху
		files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

		return res.status(200).json({
		success: true,
		message: `Найдено файлов: ${files.length}`,
		data: files,
		});
	} catch (err) {
		console.error('Ошибка получения списка:', err);
		return res.status(500).json({
		success: false,
		message: `Ошибка: ${err.message}`,
		});
	}
};