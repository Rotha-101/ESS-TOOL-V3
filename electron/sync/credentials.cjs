// Access key storage.
//
// The key lives in the main process only. It is never sent to the renderer,
// never written to localStorage, and never included in any state the renderer
// persists — the renderer can ask whether a key is set, and set or clear one,
// but cannot read it back.
//
// Encrypted with Electron safeStorage, which is DPAPI-backed on Windows: the
// ciphertext is bound to the Windows user account, so copying the file to
// another machine or another user yields nothing.

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'sync-credentials.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE(), 'utf8'));
  } catch {
    return null;
  }
}

/** True when a key is stored, without revealing it. */
function hasKey() {
  const stored = read();
  return Boolean(stored && stored.key);
}

/** Main-process use only — this is what signs requests. */
function getKey() {
  const stored = read();
  if (!stored || !stored.key) return null;

  if (stored.encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.key, 'base64'));
    } catch {
      // Written by a different Windows user, or the profile was copied between
      // machines. Treat as absent so the user is asked for the key again.
      return null;
    }
  }
  return stored.key;
}

function setKey(plaintext) {
  const value = typeof plaintext === 'string' ? plaintext.trim() : '';
  if (!value) return clearKey();

  const canEncrypt = safeStorage.isEncryptionAvailable();
  const payload = canEncrypt
    ? { encrypted: true, key: safeStorage.encryptString(value).toString('base64') }
    : { encrypted: false, key: value };

  fs.writeFileSync(FILE(), JSON.stringify(payload), { mode: 0o600 });
  return { ok: true, encrypted: canEncrypt };
}

function clearKey() {
  try {
    fs.unlinkSync(FILE());
  } catch { /* nothing stored */ }
  return { ok: true, encrypted: false };
}

module.exports = { hasKey, getKey, setKey, clearKey };
