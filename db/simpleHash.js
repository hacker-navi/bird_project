// Lightweight salted-hash helper (avoids adding a native bcrypt dependency
// for this demo). NOT a substitute for a production-grade KDF like bcrypt/argon2 -
// swap this out before real deployment (see README "Production Extensibility").
const crypto = require('crypto');

const SALT = 'ner-lirp-demo-salt-v1';

function hash(password) {
  return crypto.createHash('sha256').update(SALT + password).digest('hex');
}

function verify(password, hashed) {
  return hash(password) === hashed;
}

module.exports = { hash, verify };
