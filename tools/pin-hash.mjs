// Make a lock-screen PIN hash for js/lock-config.js:   node tools/pin-hash.mjs 123456
import { pbkdf2Sync, randomBytes } from 'node:crypto';
const pin = (process.argv[2] || '').trim();
if (!/^\d{4}$|^\d{6}$/.test(pin)) { console.error('Usage: node tools/pin-hash.mjs <4 or 6 digit PIN>'); process.exit(1); }
const salt = randomBytes(16), it = 600000;
const hash = pbkdf2Sync(pin, salt, it, 32, 'sha256').toString('base64');
console.log(`window.AURA_LOCK = { salt: '${salt.toString('base64')}', hash: '${hash}', it: ${it}, len: ${pin.length}, after: 5 };`);
