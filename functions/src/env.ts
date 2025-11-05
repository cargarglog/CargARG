// Minimal loader para que el emulador de Functions lea .env de la raíz.
// En producción, usar environment vars / secrets de Firebase.
import fs from 'fs';
import path from 'path';

function loadRootEnv() {
  try {
    const root = path.resolve(__dirname, '..', '..');
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx <= 0) continue;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}

loadRootEnv();

