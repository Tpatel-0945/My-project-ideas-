/* Default lock screen PIN for every device that opens AURA.
   Only a salted PBKDF2-SHA256 hash is stored here; the PIN itself is not in the code.
   Change your PIN inside the app (Me → Privacy lock → Change PIN). The new PIN replaces this one and follows your account.
   To set a different default here, run:  node tools/pin-hash.mjs 123456   and paste the output below.
   Remove this file's contents (or set hash to '') to start without a lock. */
window.AURA_LOCK = { salt: 'Y3KyogTisJyU+a/jnBxptQ==', hash: 'IHQP1HXfjYSoSUk7yu9byOEBbz+780qw0r/yBljTsbA=', it: 600000, len: 6, after: 5 };
