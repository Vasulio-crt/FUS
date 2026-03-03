const { del, list } = require('@vercel/blob');

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

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
		// Ищем blob по имени
		const { blobs } = await list();
		const blob = blobs.find(b => b.pathname === filename);

		if (!blob) {
		return res.status(404).json({
			success: false,
			message: 'Файл не найден.',
		});
		}

		await del(blob.url);

		console.log(`🗑️ Удалён: ${filename}`);

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