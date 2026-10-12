'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nText, rText, pText, saltHex, hashHex] = parts;
  const n = Number(nText), r = Number(rText), p = Number(pText);
  if (!Number.isInteger(n) || n < 1 << 14 || n > 1 << 18 || r !== 8 || p !== 1 || !/^[a-f\d]{32}$/i.test(saltHex) || !/^[a-f\d]{128}$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N: n, r, p, maxmem: SCRYPT_MAXMEM });
  return crypto.timingSafeEqual(actual, expected);
}

function hashSessionToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function createSessionToken() { return crypto.randomBytes(32).toString('base64url'); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

module.exports = { hashPassword, verifyPassword, hashSessionToken, createSessionToken, normalizeEmail };
