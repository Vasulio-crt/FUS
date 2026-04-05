function getDeletePassword() {
	const password = process.env.DELETE_PASSWORD;
	if (!password) {
		console.warn('⚠️ DELETE_PASSWORD не установлен! Используется дефолтный пароль.');
		return 'admin';
	}
	return password;
}

function verifyDeletePassword(providedPassword) {
	const correctPassword = getDeletePassword();
	return providedPassword === correctPassword;
}

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Delete-Password');
}

module.exports = {
	getDeletePassword,
	verifyDeletePassword,
	setCors,
};