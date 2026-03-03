const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR));

app.post('/api/upload', require('./api/upload'));
app.get('/api/files', require('./api/files'));
app.get('/api/download/:filename', require('./api/download/[filename]'));
app.delete('/api/delete/:filename', require('./api/delete/[filename]'));

app.get('*', (req, res) => {
	res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
	console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});