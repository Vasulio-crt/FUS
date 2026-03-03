const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/upload', require('./api/upload'));
app.get('/api/files', require('./api/files'));
app.delete('/api/delete/:filename', require('./api/delete/[filename]'));

app.listen(PORT, () => {
	console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});