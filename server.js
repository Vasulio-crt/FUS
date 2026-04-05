require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Статика
app.use(express.static(PUBLIC_DIR));

// API роуты
app.post('/api/upload', require('./api/upload'));
app.get('/api/files', require('./api/files'));
app.get('/api/download/:filename', require('./api/download/[filename]'));
app.delete('/api/delete/:filename', require('./api/delete/[filename]'));

// Fallback
app.get('*', (req, res) => {
	res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
	console.log(`Сервер запущен: http://localhost:${PORT}`);
	console.log(`Google Drive Folder: ${process.env.GOOGLE_FOLDER_ID || 'НЕ УСТАНОВЛЕН'}`);
	console.log(`Пароль для удаления: ${process.env.DELETE_PASSWORD ? 'установлен' : 'дефолтный (admin)'}`);
});