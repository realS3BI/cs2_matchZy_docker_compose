import net from 'node:net';
import { randomUUID } from 'node:crypto';

// Source 2 VConsole2, not the old newline-based Source 1 netconsole.
export function commandPacket(command) {
  const body = Buffer.from(command + '\0');
  if (body.length > 65523) throw new Error('Konsolenbefehl zu lang.');
  const packet = Buffer.alloc(12 + body.length);
  packet.write('CMND'); packet.writeUInt32BE(0x00d40000, 4);
  packet.writeUInt16BE(packet.length, 8); body.copy(packet, 12);
  return packet;
}

export class PacketReader {
  buffer = Buffer.alloc(0);
  push(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    const messages = [];
    while (this.buffer.length >= 12) {
      const size = this.buffer.readUInt16BE(8);
      if (size < 12) throw new Error('Ungültige Antwort von CS2.');
      if (this.buffer.length < size) break;
      const packet = this.buffer.subarray(0, size);
      if (packet.toString('ascii', 0, 4) === 'PRNT' && size >= 40)
        messages.push(packet.subarray(40).toString('utf8').replace(/\0.*$/s, ''));
      this.buffer = this.buffer.subarray(size);
    }
    return messages;
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

export class VConsole {
  socket;
  pending;
  connectPromise;
  queue = Promise.resolve();
  constructor({ port = 29000 } = {}) { this.port = port; }
  async connect() {
    if (this.connectPromise) return this.connectPromise;
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) return;
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: this.port });
      this.socket = socket;
      const reader = new PacketReader();
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
        reject(new Error(`${reason} Beende CS2 vollständig und starte es über „CS2 mit lokaler Steuerung starten“. Warte anschließend auf das Hauptmenü. Diagnose: 127.0.0.1:${this.port}, ${error.code || 'Verbindungsfehler'}.`));
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
    await this.connect();
    const marker = 'playbook_' + randomUUID().replaceAll('-', '');
    return new Promise((resolve, reject) => {
      let output = '';
      const finish = (error) => {
        clearTimeout(timer); this.pending = undefined;
        if (error) { this.socket?.destroy(); reject(error); } else resolve(output);
      };
      const timer = setTimeout(() => finish(new Error('CS2 bestätigt die lokale Steuerung nicht. Die Aufnahme wurde abgebrochen.')), 5000);
      this.pending = {
        fail: finish,
        receive: message => {
          output += message;
          if (output.length > 1_000_000) return finish(new Error('Zu viele Konsolendaten von CS2.'));
          if (output.split(/\r?\n/).some(line => line.trim() === marker)) finish();
        },
      };
      for (const command of [...commands, `echo ${marker}`]) this.socket.write(commandPacket(command));
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
