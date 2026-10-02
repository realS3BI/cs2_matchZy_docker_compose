import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Only return these flags. A game's full command line can contain server
// passwords and must never reach logs, the renderer, or an error message.
const diagnosticScript = readFileSync(new URL('./cs2-diagnostics.ps1', import.meta.url), 'utf8');

export function launchDiagnosis(info) {
  if (!info.running) return 'Es läuft derzeit kein CS2-Prozess.';
  if (info.processCount > 1) return `Es laufen ${info.processCount} CS2-Prozesse. Bitte genau eine Instanz öffnen; die Verbindung kann nicht eindeutig zugeordnet werden.`;
  if (!info.readable) return 'CS2 läuft; Windows gibt seine Startoptionen nicht zum Lesen frei.';
  if (info.commandPipe) {
    if (!info.insecure) return 'CS2 wurde mit -concommandpipe, aber ohne -insecure gestartet. CS2 erlaubt die Command-Pipe nur im Review-Start ohne VAC.';
    if (!info.playbookPipeId) return 'CS2 wurde mit einer Command-Pipe gestartet, die nicht zu Playbook gehört. Beende CS2 und starte es über Playbook erneut.';
    if (!info.listenersReadable) return 'CS2 läuft im Review-Modus mit Command-Pipe und ohne VAC. Windows konnte den Antwortkanal nicht prüfen.';
    if (!info.listeners.some(listener => listener.cs2 && listener.port === 29000 && ['127.0.0.1', '0.0.0.0', '::'].includes(listener.address))) return 'CS2 läuft im Review-Modus mit Command-Pipe, öffnet aber noch keinen lokalen Antwortkanal auf Port 29000. Bitte auf das Hauptmenü warten.';
    return 'CS2 läuft im Review-Modus ohne VAC, mit Playbook-Command-Pipe und lokalem Antwortkanal auf Port 29000. Die Protokollprüfung zeigt, ob das Spiel Befehle und Variablen bestätigt.';
  }
  if (info.ports?.length > 1) return `CS2 wurde mit mehreren -netconport-Einträgen gestartet (${info.ports.join(', ')}). Die Startoptionen sind widersprüchlich.`;
  if (info.port === null) return (info.vconsole ? 'CS2 läuft noch mit den alten VConsole-Startoptionen. ' : 'CS2 wurde ohne Playbook-Command-Pipe gestartet. ') + 'Beende CS2 vollständig und starte es über die aktualisierte Playbook-App für den Review ohne VAC.';
  if (info.port !== 2121)
    return `CS2 wurde mit einem anderen Netconsole-Port gestartet (${info.port}). Playbook verwendet Port 2121. Prüfe die CS2-Startoptionen in Steam auf einen zusätzlichen -netconport-Eintrag.`;
  if (!info.listenersReadable) return 'CS2 wurde mit -netconport 2121 gestartet. Die Windows-Portprüfung ist nicht verfügbar; die Startoption allein bestätigt keine Verbindung.';
  const local = info.listeners.filter(listener => listener.port === 2121 && ['127.0.0.1', '0.0.0.0', '::'].includes(listener.address));
  if (local.some(listener => !listener.cs2)) return 'Port 2121 wird von einem anderen Prozess belegt. Playbook kann dort keine eindeutige CS2-Verbindung bestätigen.';
  if (!local.length) return `CS2 läuft${Number.isInteger(info.uptimeSeconds) ? ` seit ${info.uptimeSeconds} Sekunden` : ''} mit -netconport 2121, öffnet aber keinen TCP-Listener für 127.0.0.1:2121. Die aktuelle CS2-Version unterstützt die frühere Netconsole nicht mehr. Erneutes Verbinden oder eine Firewall-Freigabe behebt die fehlende Schnittstelle nicht.`;
  if (info.netconPassword) return 'CS2 öffnet Port 2121, wurde aber mit -netconpassword gestartet. Playbook unterstützt keine passwortgeschützte Netconsole; das Passwort wird nicht ausgelesen.';
  return 'CS2 öffnet einen TCP-Listener für 127.0.0.1:2121. Ob Befehle bestätigt werden, zeigt die separate Protokollprüfung im Diagnosebericht.';
}

export function diagnosticReport(diagnosis, { appVersion = '', operation = 'connect', error, protocolConfirmed = false, transport } = {}) {
  const info = diagnosis.info;
  const lines = [
    `Playbook ${appVersion} – CS2-Diagnose`, `Zeit: ${new Date().toISOString()}`, `Aktion: ${operation}`,
    transport ? 'Verbindungsziel: lokale Command-Pipe; Antwortkanal 127.0.0.1:29000 (VConsole)' : 'Verbindungsziel: 127.0.0.1:2121 (alte TCP-Netconsole)',
    `Protokollprüfung: ${protocolConfirmed ? 'crosshair wurde von CS2 lesbar bestätigt' : 'nicht bestätigt'}`,
  ];
  if (transport) lines.push(`Command-Pipe bereit: ${transport.prepared}; CS2 am Befehlskanal: ${transport.commandConnected}; CS2 am Ausgabekanal: ${transport.outputConnected}; Antwortkanal verbunden: ${transport.responseConnected}`);
  if (error) lines.push(`Fehlercode: ${error.code || 'nicht verfügbar'}`, `Ursprünglicher Fehler: ${error.message}`);
  if (info) {
    lines.push(`CS2-Prozesse: ${info.processCount}; PID: ${info.processId ?? '–'}; Fenster: ${info.hasWindow === null ? 'unbekannt' : info.hasWindow ? 'vorhanden' : 'fehlt'}; Laufzeit: ${info.uptimeSeconds ?? '–'} s`,
      `Startoptionen lesbar: ${info.readable ? 'ja' : 'nein'}; netconport: ${info.ports.join(', ') || 'fehlt'}; console: ${info.console}; vconsole: ${info.vconsole}; tools: ${info.tools}; insecure: ${info.insecure}; commandPipe: ${info.commandPipe}; netconPassword vorhanden: ${info.netconPassword}`,
      `Windows-Portprüfung: ${info.listenersReadable ? 'erfolgreich' : `nicht verfügbar (${info.listenerError || 'unbekannt'})`}`);
    for (const listener of info.listeners) lines.push(`TCP-Listener: ${listener.address}:${listener.port}; PID ${listener.processId}; ${listener.cs2 ? 'CS2' : 'anderer Prozess'}`);
    if (info.listenersReadable && !info.listeners.length) lines.push('TCP-Listener: keiner auf dem Zielport und keiner von CS2.');
  }
  lines.push(`Befund: ${diagnosis.summary}`);
  return lines.join('\n');
}

export async function collectCS2Diagnostics({ run = promisify(execFile) } = {}) {
  try {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await run(executable,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(diagnosticScript, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 8000, maxBuffer: 16_384, encoding: 'utf8' });
    const raw = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    const keys = ['running', 'readable', 'vconsole', 'port', 'processCount', 'processId', 'uptimeSeconds', 'hasWindow', 'console', 'tools', 'insecure', 'commandPipe', 'playbookPipeId', 'netconPassword', 'ports', 'expectedPort', 'listenersReadable', 'listenerError'];
    const info = Object.fromEntries(keys.map(key => [key, raw[key]]));
    info.listeners = Array.isArray(raw.listeners) ? raw.listeners.map(({ address, port, processId, cs2 }) => ({ address, port, processId, cs2 })) : undefined;
    if (typeof info.running !== 'boolean' || typeof info.readable !== 'boolean' || typeof info.vconsole !== 'boolean' ||
        !(info.port === null || Number.isInteger(info.port)) || !Number.isInteger(info.processCount) ||
        !Array.isArray(info.ports) || !info.ports.every(Number.isInteger) || typeof info.listenersReadable !== 'boolean' ||
        !['console', 'tools', 'insecure', 'commandPipe', 'netconPassword'].every(key => typeof info[key] === 'boolean') ||
        !(info.hasWindow === null || typeof info.hasWindow === 'boolean') ||
        !(info.processId === null || Number.isInteger(info.processId)) || !(info.uptimeSeconds === null || Number.isInteger(info.uptimeSeconds)) ||
        !(info.listenerError === null || typeof info.listenerError === 'string' && /^[A-Za-z]+$/.test(info.listenerError)) ||
        !(info.playbookPipeId === null || typeof info.playbookPipeId === 'string' && /^[a-f0-9]{32}$/.test(info.playbookPipeId)) ||
        !Array.isArray(info.listeners) || !info.listeners.every(listener => typeof listener.address === 'string' && /^[\da-f.:]+$/i.test(listener.address) && Number.isInteger(listener.port) && Number.isInteger(listener.processId) && typeof listener.cs2 === 'boolean')) throw Object.assign(new Error('Ungültige Diagnose'), { code: 'EINVALIDDIAGNOSIS' });
    return { info, summary: launchDiagnosis(info) };
  } catch (error) {
    const code = error.killed ? 'ETIMEDOUT' : typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'EPOWERSHELL';
    return { summary: `Die Windows-Prüfung der CS2-Startoptionen und TCP-Listener ist nicht verfügbar (${code}).`, code };
  }
}

export async function diagnoseCS2() { return (await collectCS2Diagnostics()).summary; }
