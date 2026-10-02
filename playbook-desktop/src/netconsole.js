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
  constructor({ port = 2121, log = () => {}, connectTimeoutMs = 3000, replyTimeoutMs = 5000 } = {}) {
    this.port = port; this.log = log; this.connectTimeoutMs = connectTimeoutMs; this.replyTimeoutMs = replyTimeoutMs;
    this.connectionId = 0; this.requestId = 0;
  }
  createReader() { return new LineReader(); }
  sendCommands(commands) { this.socket.write([...commands, ''].join('\n')); }
  async connect() {
    if (this.connectPromise) return this.connectPromise;
    if (this.socket && !this.socket.destroyed && !this.socket.connecting) return;
    this.connectPromise = new Promise((resolve, reject) => {
      const connection = ++this.connectionId;
      const start = Date.now();
      this.log('tcp.connect', { connection, host: '127.0.0.1', port: this.port, timeoutMs: this.connectTimeoutMs });
      const socket = net.createConnection({ host: '127.0.0.1', port: this.port });
      this.socket = socket;
      const reader = this.createReader();
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error('Zeitüberschreitung'), { code: 'ETIMEDOUT' })), this.connectTimeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        this.log('tcp.connected', { connection, port: this.port, elapsedMs: Date.now() - start });
        resolve();
      });
      socket.on('data', bytes => {
        try {
          for (const message of reader.push(bytes)) if (this.socket === socket) this.pending?.receive(message);
        } catch (error) {
          this.log('protocol.invalid', { connection, code: error.code || 'EPROTOCOL', error: error.message, version: error.version, packetSize: error.packetSize, packetType: error.packetType }, 'ERROR');
          socket.destroy(error);
        }
      });
      socket.on('error', error => {
        clearTimeout(timer);
        this.log('tcp.error', { connection, port: this.port, code: error.code || 'EPROTOCOL', elapsedMs: Date.now() - start }, 'ERROR');
        const reason = error.code === 'ECONNREFUSED' ? 'CS2 nimmt keine lokale Verbindung an.' : 'Die lokale Verbindung zu CS2 ist fehlgeschlagen.';
        const failure = Object.assign(new Error(`${reason} Die Netconsole-Verbindung konnte nicht hergestellt werden. Diagnose: 127.0.0.1:${this.port}, ${error.code || 'Verbindungsfehler'}.`), { code: error.code || 'EPROTOCOL' });
        reject(failure);
        if (this.socket === socket) this.pending?.fail(failure);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        this.log('tcp.closed', { connection, pending: Boolean(this.socket === socket && this.pending) });
        const error = Object.assign(new Error('Verbindung zu CS2 unterbrochen. Die Wiederherstellung bleibt vorgemerkt.'), { code: 'ECONNCLOSED' });
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
    const request = ++this.requestId;
    const start = Date.now();
    // Log names and response progress, never personal values or raw console output.
    const names = commands.map(command => command.split(' ')[0]).map(name => /^[a-z_][a-z0-9_]*$/i.test(name) ? name : '<unbekannt>');
    this.log('command.sent', { request, names, count: commands.length, timeoutMs: this.replyTimeoutMs });
    return new Promise((resolve, reject) => {
      let output = '', started = false, finished = false, receivedLines = 0, ignoredLines = 0;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer); this.pending = undefined;
        this.log(error ? 'command.failed' : 'command.confirmed', {
          request, code: error?.code, elapsedMs: Date.now() - start, receivedLines, ignoredLines, startMarker: started, endMarker: !error, responseChars: output.length,
        }, error ? 'ERROR' : 'INFO');
        if (error) { this.socket?.destroy(); reject(error); } else resolve(output);
      };
      const timer = setTimeout(() => finish(Object.assign(new Error(`CS2 bestätigt die lokale Steuerung nicht. Zeitüberschreitung nach ${this.replyTimeoutMs} ms: ${receivedLines} Antwortzeilen, Startmarkierung ${started ? 'empfangen' : 'fehlt'}, Endmarkierung fehlt. Die Aufnahme wurde abgebrochen.`), { code: 'EREPLYTIMEOUT' })), this.replyTimeoutMs);
      this.pending = {
        fail: finish,
        receive: message => {
          receivedLines++;
          if (message.trim() === marker + '_start') { started = true; return; }
          if (!started) { ignoredLines++; return; }
          if (message.trim() === marker) { finish(); return; }
          output += message + '\n';
          if (output.length > 1_000_000) finish(new Error('Zu viele Konsolendaten von CS2.'));
        },
      };
      try { this.sendCommands([`echo ${marker}_start`, ...commands, `echo ${marker}`]); }
      catch (error) { finish(error); }
    });
  }
  async read(names) {
    const output = await this.execute(names);
    try { return Object.fromEntries(names.map(name => [name, readValue(output, name)])); }
    catch (error) {
      this.log('values.unreadable', { names, responseChars: output.length, lines: output.split('\n').filter(Boolean).length }, 'ERROR');
      throw Object.assign(error, { code: 'ECVARREPLY' });
    }
  }
  async write(values) {
    const names = Object.keys(values);
    // Size setters also update CS2's authoring height. Write the saved height
    // after all size fields, including when recovering older journal files.
    const ordered = [...names.filter(name => name !== 'cl_crosshair_screen_height'), ...names.filter(name => name === 'cl_crosshair_screen_height')];
    await this.execute(ordered.map(name => `${name} ${values[name]}`));
    const actual = await this.read(names);
    const mismatched = names.filter(name => numeric(actual[name]) !== numeric(values[name]));
    if (mismatched.length) {
      this.log('values.mismatched', { names: mismatched }, 'ERROR');
      const hint = mismatched.some(name => name.startsWith('cl_crosshair'))
        ? 'CS2 hat die Fadenkreuzwerte abweichend übernommen. Bitte die Spielauflösung prüfen und das Spielbild erneut verbinden.'
        : 'Bitte mit dem Trainingsserver verbinden und prüfen, ob die benötigten HUD- und Viewmodel-Einstellungen erlaubt sind.';
      throw Object.assign(new Error(`CS2 hat ${mismatched.join(', ')} nicht wie angefordert übernommen. ${hint}`), { code: 'ECVARMISMATCH' });
    }
  }
  close() { this.socket?.destroy(); }
}
