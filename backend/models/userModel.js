const { get, run } = require('../database');

async function findByUsernameOrEmail(username, email) {
  return get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
}

async function findByLogin(login) {
  return get('SELECT * FROM users WHERE username = ? OR email = ?', [login, login]);
}

async function createUser(username, email, passwordHash) {
  return run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
}

module.exports = {
  findByUsernameOrEmail,
  findByLogin,
  createUser
};
