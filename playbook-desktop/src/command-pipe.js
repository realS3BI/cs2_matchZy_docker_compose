import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { NetConsole } from './netconsole.js';

// Commands use CS2's supported -concommandpipe. Numeric replies are delivered
// through VConsole; piped cvar replies are absent from the console logfile.
export class VConsoleReader {
  buffer = Buffer.alloc(0);
  push(bytes) {
    this.buffer = Buffer.concat([this.buffer, bytes]);
    const lines = [];
    while (this.buffer.length >= 12) {
      const version = this.buffer.readUInt16BE(4);
      // CVRB (v2) and EFUL (v5, emitted on map load) use a 32-bit length.
      // The old 16-bit parser split the initial cvar dump mid-packet.
      if (![0xd4, 2, 5].includes(version)) {
        const type = this.buffer.toString('ascii', 0, 4);
        throw Object.assign(new Error('Unbekanntes CS2-Antwortprotokoll.'), { code: 'EPROTOCOL', version, packetType: /^[A-Z]{4}$/.test(type) ? type : 'unknown', packetSize: this.buffer.readUInt32BE(6) });
      }
      const size = version === 0xd4 ? this.buffer.readUInt16BE(8) : this.buffer.readUInt32BE(6);
      if (size < 12 || size > 16_000_000) throw Object.assign(new Error('Ungültige Paketgröße im CS2-Antwortkanal.'), { code: 'EPROTOCOL', version, packetSize: size });
      if (this.buffer.length < size) break;
      const packet = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
      if (packet.toString('ascii', 0, 4) === 'PRNT') {
        if (size < 40) throw Object.assign(new Error('Unvollständige CS2-Konsolenantwort.'), { code: 'EPROTOCOL', packetType: 'PRNT', packetSize: size });
        const text = packet.subarray(40).toString('utf8').replace(/\0.*$/s, '');
        lines.push(...text.split(/\r?\n/).filter(Boolean).map(line => line.replace(/^\s*\[Console\]\s*/, '')));
      }
    }
    return lines;
  }
}

export class CommandPipe extends NetConsole {
  constructor({ inspect = async () => {}, ...options } = {}) {
    super({ ...options, port: options.port ?? 29000 });
    this.inspect = inspect;
    this.id = randomUUID().replaceAll('-', '');
    this.clients = new Set();
    this.servers = [];
  }
  state() {
    return { prepared: Boolean(this.preparePromise), commandConnected: Boolean(this.writer && !this.writer.destroyed), outputConnected: Boolean(this.output && !this.output.destroyed), responseConnected: Boolean(this.socket && !this.socket.destroyed && !this.socket.connecting) };
  }
  createReader() { return new VConsoleReader(); }
  async prepare() {
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = this.startServers().catch(error => { this.preparePromise = undefined; throw error; });
    return this.preparePromise;
  }
  async startServers() {
    if (process.platform !== 'win32') throw new Error('Die CS2-Command-Pipe benötigt Windows.');
    try {
      for (const channel of ['cmd', 'out']) {
        const server = net.createServer(socket => {
          const property = channel === 'cmd' ? 'writer' : 'output';
          if (this[property] && !this[property].destroyed) { socket.destroy(); return; }
          this[property] = socket;
          this.clients.add(socket);
          this.log('pipe.connected', { channel });
          // Drain the output pipe. Actual queued replies arrive via VConsole.
          socket.on('data', () => {});
          socket.on('error', error => {
            this.log('pipe.error', { channel, code: error.code }, 'ERROR');
            if (channel === 'cmd' && this.writer === socket) this.pending?.fail(Object.assign(new Error('CS2 hat seine Command-Pipe unterbrochen.'), { code: 'EPIPE' }));
          });
          socket.on('close', () => {
            this.clients.delete(socket);
            if (this[property] === socket) this[property] = undefined;
            this.log('pipe.closed', { channel });
          });
        });
        this.servers.push(server);
        await new Promise((resolve, reject) => {
          const fail = error => reject(Object.assign(new Error(`Die lokale CS2-Command-Pipe konnte nicht erstellt werden (${error.code || 'EPIPE'}).`), { code: error.code || 'EPIPE' }));
          server.once('error', fail);
          server.listen({ path: `\\\\.\\pipe\\playbook_${this.id}_${channel}`, readableAll: false, writableAll: false }, () => {
            server.removeListener('error', fail);
            server.on('error', error => this.log('pipe.server.failed', { channel, code: error.code }, 'ERROR'));
            resolve();
          });
        });
      }
      this.log('pipe.prepared', { channels: 2, responsePort: this.port });
      return this.id;
    } catch (error) { this.shutdown(); throw error; }
  }
  async connect() {
    if (!this.writer || this.writer.destroyed) throw Object.assign(new Error('CS2 ist noch nicht mit der Playbook-Command-Pipe verbunden. Beende CS2 vollständig und starte es über Playbook für den Review ohne VAC.'), { code: 'EPIPEWAIT' });
    if (!this.socket || this.socket.destroyed || this.socket.connecting) await this.inspect(this.id);
    return super.connect();
  }
  sendCommands(commands) {
    if (!this.writer || this.writer.destroyed) throw Object.assign(new Error('Die CS2-Command-Pipe wurde unterbrochen.'), { code: 'EPIPE' });
    this.writer.write([...commands, ''].join('\n'), error => {
      if (error) this.pending?.fail(Object.assign(new Error(`Die CS2-Command-Pipe konnte den Befehl nicht übertragen (${error.code || 'EPIPE'}).`), { code: error.code || 'EPIPE' }));
    });
  }
  shutdown() {
    this.close();
    for (const client of this.clients) client.destroy();
    for (const server of this.servers) server.close();
    this.servers = []; this.preparePromise = undefined;
  }
}
