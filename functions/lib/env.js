"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Minimal loader para que el emulador de Functions lea .env de la raíz.
// En producción, usar environment vars / secrets de Firebase.
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function loadRootEnv() {
    try {
        const root = path_1.default.resolve(__dirname, '..', '..');
        const envPath = path_1.default.join(root, '.env');
        if (!fs_1.default.existsSync(envPath))
            return;
        const content = fs_1.default.readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith('#'))
                continue;
            const idx = t.indexOf('=');
            if (idx <= 0)
                continue;
            const k = t.slice(0, idx).trim();
            const v = t.slice(idx + 1).trim();
            if (!process.env[k])
                process.env[k] = v;
        }
    }
    catch { }
}
loadRootEnv();
//# sourceMappingURL=env.js.map