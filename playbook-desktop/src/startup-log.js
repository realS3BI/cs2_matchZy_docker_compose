import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export function startupLog(app) {
  const file = path.join(app.getPath('userData'), 'logs', 'startup.log');
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    if (statSync(file, { throwIfNoEntry: false })?.size > 256 * 1024) renameSync(file, file + '.previous');
  } catch { /* Logging must not prevent the app from starting. */ }
  const write = (message) => {
    const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
    try { appendFileSync(file, line, 'utf8'); } catch { console.error(line.trim()); }
  };
  write(`Start: Playbook ${app.getVersion()}, ${process.platform}/${process.arch}`);
  return { file, write };
}
