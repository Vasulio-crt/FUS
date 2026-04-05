const { google } = require('googleapis');
const stream = require('stream');

let driveClient = null;

function getOAuth2Client() {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

	if (!clientId || !clientSecret || !refreshToken) {
		throw new Error(
			'Google OAuth не настроен. Нужны GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.'
		);
	}

	const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
	oauth2Client.setCredentials({ refresh_token: refreshToken });

	return oauth2Client;
}

function getDriveClient() {
	if (driveClient) return driveClient;

	const auth = getOAuth2Client();
	driveClient = google.drive({ version: 'v3', auth });

	return driveClient;
}

function getFolderId() {
	const folderId = process.env.GOOGLE_FOLDER_ID;
	if (!folderId) {
		throw new Error('GOOGLE_FOLDER_ID не установлен');
	}
	return folderId;
}

// Загрузка файла
async function uploadFile(filename, buffer, mimeType) {
	const drive = getDriveClient();
	const folderId = getFolderId();

	const bufferStream = new stream.PassThrough();
	bufferStream.end(buffer);

	const response = await drive.files.create({
		requestBody: {
			name: filename,
			parents: [folderId],
		},
		media: {
			mimeType: mimeType || 'application/octet-stream',
			body: bufferStream,
		},
		fields: 'id, name, size, mimeType, createdTime',
	});

	return response.data;
}

// Список файлов
async function listFiles() {
	const drive = getDriveClient();
	const folderId = getFolderId();

	const response = await drive.files.list({
		q: `'${folderId}' in parents and trashed = false`,
		fields: 'files(id, name, size, mimeType, createdTime)',
		orderBy: 'createdTime desc',
		pageSize: 100,
	});

	return response.data.files || [];
}

// Получение файла (метаданные)
async function getFile(fileId) {
	const drive = getDriveClient();

	const response = await drive.files.get({
		fileId,
		fields: 'id, name, size, mimeType, createdTime',
	});

	return response.data;
}

// Скачивание файла
async function downloadFile(fileId) {
	const drive = getDriveClient();

	const response = await drive.files.get(
		{ fileId, alt: 'media' },
		{ responseType: 'arraybuffer' }
	);

	return Buffer.from(response.data);
}

// Удаление файла
async function deleteFile(fileId) {
	const drive = getDriveClient();
	await drive.files.delete({ fileId });
}

// Поиск файла по имени
async function findFileByName(filename) {
	const drive = getDriveClient();
	const folderId = getFolderId();

	// Экранируем кавычки в имени файла
	const escapedName = filename.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

	const response = await drive.files.list({
		q: `'${folderId}' in parents and name = '${escapedName}' and trashed = false`,
		fields: 'files(id, name, size, mimeType, createdTime)',
		pageSize: 1,
	});

	return response.data.files?.[0] || null;
}

module.exports = {
	uploadFile,
	listFiles,
	getFile,
	downloadFile,
	deleteFile,
	findFileByName,
};