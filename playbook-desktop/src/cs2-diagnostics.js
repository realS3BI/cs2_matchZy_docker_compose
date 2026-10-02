import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Only return these flags. A game's full command line can contain server
// passwords and must never reach logs, the renderer, or an error message.
const diagnosticScript = readFileSync(new URL('./cs2-diagnostics.ps1', import.meta.url), 'utf8');

export function launchDiagnosis(info) {
  if (!info.running) return 'Es läuft derzeit kein CS2-Prozess.';
  if (!info.readable) return 'CS2 läuft; Windows gibt seine Startoptionen nicht zum Lesen frei.';
  if (info.port === null) return (info.vconsole ? 'CS2 läuft noch mit den alten VConsole-Startoptionen. ' : 'CS2 wurde ohne Netconsole gestartet. ') + 'Beende CS2 vollständig und starte es über die aktualisierte Playbook-App mit -netconport 2121.';
  if (info.port !== 2121)
    return `CS2 wurde mit einem anderen Netconsole-Port gestartet (${info.port}). Playbook verwendet Port 2121. Prüfe die CS2-Startoptionen in Steam auf einen zusätzlichen -netconport-Eintrag.`;
  return 'CS2 wurde mit -netconport 2121 gestartet. Falls die Verbindung auch im Hauptmenü nicht bestätigt wird, bitte diese Startprüfung zusammen mit dem Fehler weitergeben.';

}

export async function diagnoseCS2() {
  try {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await promisify(execFile)(executable,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(diagnosticScript, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 8000, maxBuffer: 16_384, encoding: 'utf8' });
    const info = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    if (typeof info.running !== 'boolean' || typeof info.readable !== 'boolean' || typeof info.vconsole !== 'boolean' || !(info.port === null || Number.isInteger(info.port))) throw new Error('Ungültige Diagnose');
    return launchDiagnosis(info);
  } catch { return 'Die tatsächlichen CS2-Startoptionen konnten nicht geprüft werden.'; }
}
