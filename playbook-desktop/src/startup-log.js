import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export function safeLogText(value) {
  return String(value)
    .replace(/("(?:password|netconpassword|token|ticket|authorization)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[ENTFERNT]"')
    .replace(/\b(password|netconpassword|token|ticket|authorization)\b(\s+[=:]?\s*|[=:]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1$2[ENTFERNT]')
    .replace(/[\r\n\x00-\x1f\x7f]+/g, ' ')
    .slice(0, 8000);
}

export function startupLog(app) {
  const file = path.join(app.getPath('userData'), 'logs', 'startup.log');
  try {
    mkdirSync(path.dirname(file), { recursive: true });
  } catch { /* Logging must not prevent the app from starting. */ }
  const write = (message) => {
    const line = `${new Date().toISOString()} [${process.pid}] ${safeLogText(message)}\n`;
    try {
      if (statSync(file, { throwIfNoEntry: false })?.size > 512 * 1024) renameSync(file, file + '.previous');
      appendFileSync(file, line, 'utf8');
    } catch { console.error(line.trim()); }
  };
  const event = (scope, name, details = {}, level = 'INFO') => write(`[${level}] [${scope}] ${name} ${JSON.stringify(details)}`);
  write(`Start: Playbook ${app.getVersion()}, ${process.platform}/${process.arch}`);
  return { file, write, event };
}
