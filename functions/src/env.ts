// Lightweight .env loader for local emulation only.
// It tries to read the project root .env file and populate process.env
// for keys that are not already defined. In production on Firebase, use
// Functions env vars or Secrets; this loader is a no-op if the file is missing.
import fs from 'fs';
import path from 'path';

function loadRootEnv() {
  try {
    const root = path.resolve(__dirname, '..', '..');
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

loadRootEnv();

