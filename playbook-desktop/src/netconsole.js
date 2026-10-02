import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

// CS2's regular text netconsole. VConsole2 is a separate tools protocol.
export class LineReader {
  buffer = '';
  decoder = new StringDecoder('utf8');
  push(bytes) {
    this.buffer += this.decoder.write(bytes);
    if (this.buffer.length > 1_000_000 || this.buffer.includes('\0')) throw new Error('Ungültige Antwort der CS2-Netconsole.');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();
    return lines.map(line => line.replace(/\r$/, '').replace(/^\s*\[Console\]\s*/, ''));
  }
}

export function readValue(output, name) {
  // CS2 builds print either name = value or "name" = "value".
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp('(?:^|\\n)\\s*"?' + escaped + '"?\\s*=\\s*"?(true|false|[-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)\\b', 'i'));
  if (!match) throw new Error(`CS2 hat ${name} nicht lesbar bestätigt. Bitte CS2 und Playbook aktualisieren.`);
  return match[1].toLowerCase();
}
export const numeric = value => value === 'true' ? 1 : value === 'false' ? 0 : Number(value);

export class NetConsole {
  socket;
  pending;
  connectPromise;
  queue = Promise.resolve();
  constructor({ port = 2121 } = {}) { this.port = port; }
  async connect() {
    if (this.connectPromise) return this.connectPromise;
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) return;
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: this.port });
      this.socket = socket;
      const reader = new LineReader();
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error('Zeitüberschreitung'), { code: 'ETIMEDOUT' })), 3000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.on('data', bytes => {
        try {
          for (const message of reader.push(bytes)) if (this.socket === socket) this.pending?.receive(message);
        } catch (error) { socket.destroy(error); }
      });
      socket.on('error', error => {
        clearTimeout(timer);
        const reason = error.code === 'ECONNREFUSED' ? 'CS2 nimmt keine lokale Verbindung an.' : 'Die lokale Verbindung zu CS2 ist fehlgeschlagen.';
        reject(new Error(`${reason} Die Netconsole-Verbindung konnte nicht hergestellt werden. Diagnose: 127.0.0.1:${this.port}, ${error.code || 'Verbindungsfehler'}.`));
      });
      socket.on('close', () => {
        clearTimeout(timer);
        const error = new Error('Verbindung zu CS2 unterbrochen. Die Wiederherstellung bleibt vorgemerkt.');
        reject(error);
        if (this.socket === socket) this.pending?.fail(error);
      });
    }).finally(() => { this.connectPromise = undefined; });
    return this.connectPromise;
  }
  execute(commands) {
    const run = () => this.exchange(commands);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
  async exchange(commands) {
    if (commands.some(command => typeof command !== 'string' || /[\r\n\0]/.test(command) || command.length > 16_000)) throw new Error('Ungültiger Konsolenbefehl.');
    await this.connect();
    const marker = 'playbook_' + randomUUID().replaceAll('-', '');
    return new Promise((resolve, reject) => {
      let output = '', started = false, finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer); this.pending = undefined;
        if (error) { this.socket?.destroy(); reject(error); } else resolve(output);
      };
      const timer = setTimeout(() => finish(new Error('CS2 bestätigt die lokale Steuerung nicht. Die Aufnahme wurde abgebrochen.')), 5000);
      this.pending = {
        fail: finish,
        receive: message => {
          if (message.trim() === marker + '_start') { started = true; return; }
          if (!started) return;
          if (message.trim() === marker) { finish(); return; }
          output += message + '\n';
          if (output.length > 1_000_000) finish(new Error('Zu viele Konsolendaten von CS2.'));
        },
      };
      this.socket.write([`echo ${marker}_start`, ...commands, `echo ${marker}`, ''].join('\n'));
    });
  }
  async read(names) {
    const output = await this.execute(names);
    return Object.fromEntries(names.map(name => [name, readValue(output, name)]));
  }
  async write(values) {
    const names = Object.keys(values);
    await this.execute(names.map(name => `${name} ${values[name]}`));
    const actual = await this.read(names);
    for (const name of names) if (numeric(actual[name]) !== numeric(values[name]))
      throw new Error(`CS2 erlaubt ${name} momentan nicht. Für Fotos bitte mit dem Trainingsserver verbinden.`);
  }
  close() { this.socket?.destroy(); }
}
