const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const PORT = 3333;

async function getToken() {
	console.log('\nВведи данные из Google Cloud Console:\n');
	
	const readline = require('readline').createInterface({
		input: process.stdin,
		output: process.stdout
	});

	const question = (prompt) => new Promise(resolve => readline.question(prompt, resolve));

	const client_id = await question('Client ID: ');
	const client_secret = await question('Client Secret: ');

	readline.close();

	if (!client_id || !client_secret) {
		console.error('❌ Client ID и Client Secret обязательны!');
		process.exit(1);
	}

	const oauth2Client = new google.auth.OAuth2(
		client_id.trim(),
		client_secret.trim(),
		`http://localhost:${PORT}/callback`
	);

	const authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
		prompt: 'consent', // Всегда запрашивать refresh_token
	});

	console.log('\n🔐 Открой эту ссылку в браузере:\n');
	console.log(authUrl);
	console.log('\n⏳ Ожидаю авторизацию...\n');

	const code = await new Promise((resolve, reject) => {
		const server = http.createServer(async (req, res) => {
		const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
		const query = Object.fromEntries(reqUrl.searchParams);

		if (query.code) {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end('<h1>✅ Авторизация успешна!</h1><p>Можешь закрыть эту страницу.</p>');
			server.close();
			resolve(query.code);
		} else if (query.error) {
			res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`<h1>❌ Ошибка: ${query.error}</h1>`);
			server.close();
			reject(new Error(query.error));
		}
		});

		server.listen(PORT, () => {
		console.log(`📡 Локальный сервер запущен на http://localhost:${PORT}`);
		});

		server.on('error', (err) => {
		if (err.code === 'EADDRINUSE') {
			console.error(`❌ Порт ${PORT} уже занят. Освободи его или измени PORT в скрипте.`);
		} else {
			console.error('❌ Ошибка сервера:', err);
		}
		reject(err);
		});
	});

	const { tokens } = await oauth2Client.getToken(code);

	console.log('\nТокены получены!\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('\nДобавь эти переменные в .env:\n');
	console.log(`GOOGLE_CLIENT_ID=${client_id}`);
	console.log(`GOOGLE_CLIENT_SECRET=${client_secret}`);
	console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
	console.log(`GOOGLE_FOLDER_ID=твой_folder_id\n`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	// Сохраняем токены
	const output = {
		client_id,
		client_secret,
		refresh_token: tokens.refresh_token,
		access_token: tokens.access_token,
		expiry_date: tokens.expiry_date,
		timestamp: new Date().toISOString()
	};

	fs.writeFileSync('tokens.json', JSON.stringify(output, null, 2));
	console.log('Токены сохранены в tokens.json\n');
}

getToken().catch((err) => {
	console.error('\nОшибка:', err.message);
	process.exit(1);
});