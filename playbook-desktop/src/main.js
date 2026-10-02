import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, powerSaveBlocker, session, shell } from 'electron';
import updater from 'electron-updater';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VConsole } from './vconsole.js';
import { Presentation } from './presentation.js';
import { captureFrame } from './geometry.js';
import { ORIGIN, trusted, loginNavigation } from './security.js';
import { startupLog } from './startup-log.js';
import { Updates } from './updates.js';
import { launchAndWait } from './launch.js';
import { diagnoseCS2 } from './cs2-diagnostics.js';

const { autoUpdater } = updater;
const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
let window, presentation, target, blocker, quitting = false, launching = false;
const updates = new Updates(autoUpdater, () => app.isPackaged);
const consoleConnection = new VConsole();
const startup = startupLog(app);

function startupFailed(error) {
  const message = error instanceof Error ? error.message : String(error);
  startup.write(`Start fehlgeschlagen: ${message}`);
  dialog.showErrorBox('Playbook konnte nicht gestartet werden', `${message}\n\nStartprotokoll: ${startup.file}`);
  app.exit(1);
}

async function native(action) {
  if (process.platform !== 'win32') throw new Error('Die CS2-Aufnahme benötigt Windows 10 oder 11.');
  const executable = app.isPackaged ? path.join(process.resourcesPath, 'Playbook.Windows.exe') : path.join(here, '../native/bin/publish/Playbook.Windows.exe');
  try {
    const { stdout } = await exec(executable, action ? [action] : [], { windowsHide: true, timeout: 5000, maxBuffer: 16_384 });
    return JSON.parse(stdout);
  } catch (error) { throw new Error(error.stderr?.trim() || (action === 'launch' ? 'Steam konnte CS2 nicht starten.' : 'CS2-Fenster nicht gefunden. Bitte CS2 starten und geöffnet lassen.')); }
}
const game = () => native();
async function connectionError(error) {
  if (process.platform !== 'win32') return error;
  const diagnosis = await diagnoseCS2();
  startup.write(`CS2-Verbindung: ${diagnosis}`);
  return new Error(`${error.message}\n\nStartprüfung: ${diagnosis}`);
}
async function capturedGame() {
  const next = await game();
  if (!target || next.identity !== target.identity || next.id !== target.id) throw new Error('Das CS2-Fenster hat sich geändert. Bitte das Spielbild erneut verbinden.');
  return next;
}
function releaseCapture() {
  target = undefined;
  globalShortcut.unregister('F8');
  if (blocker !== undefined && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
  blocker = undefined;
}
async function disconnect() {
  releaseCapture();
  await presentation.recover();
}
function handle(name, work) {
  ipcMain.handle('review:' + name, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !trusted(event.senderFrame.url)) throw new Error('Diese Seite darf CS2 nicht steuern.');
    return work(...args);
  });
}

if (!app.requestSingleInstanceLock()) {
  startup.write('Playbook läuft bereits. Das vorhandene Fenster wird angefordert.');
  app.quit();
}
else {
  app.on('second-instance', () => {
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
    }
  });
  // Electron waits for the ESM entry to finish before emitting ready. A top-level
  // await on whenReady() deadlocks that loader and leaves a windowless process.
  const startupDeadline = setTimeout(() => startupFailed(new Error('Innerhalb von 15 Sekunden wurde kein Playbook-Fenster geöffnet.')), 15_000);
  void app.whenReady().then(() => {
    startup.write('Electron ist startbereit.');
    presentation = new Presentation(consoleConnection, path.join(app.getPath('userData'), 'review-recovery.json'), async () => (await game()).identity);
    window = new BrowserWindow({
      width: 1440, height: 1000, minWidth: 950, minHeight: 650, backgroundColor: '#0b1218', title: 'Playbook',
      webPreferences: { preload: path.join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
    });
    clearTimeout(startupDeadline);
    startup.write('Playbook-Fenster erstellt.');
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Playbook', submenu: [
        { label: 'Startseite', click: () => void window.loadURL(ORIGIN) },
        { label: 'Neu laden', role: 'reload' },
        { label: 'Nach Updates suchen', click: () => void updates.check() },
        { label: 'Startprotokoll öffnen', click: () => void shell.openPath(startup.file) },
        { type: 'separator' }, { label: 'Beenden', role: 'quit' },
      ] },
      { label: 'Bearbeiten', submenu: [{ role: 'undo', label: 'Rückgängig' }, { role: 'redo', label: 'Wiederholen' }, { type: 'separator' }, { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' }, { role: 'paste', label: 'Einfügen' }, { role: 'selectAll', label: 'Alles auswählen' }] },
      { label: 'Ansicht', submenu: [{ role: 'resetZoom', label: 'Originalgröße' }, { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' }, { role: 'togglefullscreen', label: 'Vollbild' }] },
    ]));
    const browser = session.defaultSession;
    browser.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window.webContents && trusted(details.requestingUrl || '') && ['display-capture', 'clipboard-sanitized-write'].includes(permission)));
    browser.setPermissionCheckHandler((contents, permission, origin) => contents === window.webContents && trusted(origin) && ['display-capture', 'clipboard-sanitized-write'].includes(permission));
    browser.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        if (request.frame !== window.webContents.mainFrame || !trusted(request.securityOrigin) || !target || request.audioRequested) throw new Error('Aufnahme nicht freigegeben.');
        const current = await capturedGame();
        if (current.minimized) throw new Error('CS2 ist minimiert.');
        const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
        const source = sources.find(source => source.id.split(':')[1] === current.id);
        if (!source) throw new Error('CS2 ist nicht aufnehmbar.');
        callback({ video: source });
      } catch { callback({}); }
    }, { useSystemPicker: false });
    window.webContents.on('will-navigate', (event, url) => { if (!loginNavigation(url)) event.preventDefault(); });
    window.webContents.on('will-redirect', (event, url) => { if (!loginNavigation(url)) event.preventDefault(); });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) void disconnect().catch(() => {});
    });
    window.webContents.on('render-process-gone', () => { void disconnect().catch(() => {}); });
    handle('status', async () => ({ appVersion: app.getVersion(), update: updates.status, connected: Boolean(target), recovery: Boolean(await presentation.saved()), active: Boolean(presentation.active) }));
    handle('launch', async () => {
      if (launching) throw new Error('CS2 wird bereits gestartet. Bitte auf die Verbindung warten.');
      launching = true;
      try {
        if (target || presentation.active) throw new Error('Bitte zuerst den Review beenden und das Spielbild trennen.');
        await launchAndWait(() => native('launch'), consoleConnection);
        await presentation.recover();
      }
      catch (error) { throw await connectionError(error); }
      finally { launching = false; }
    });
    handle('connect', async () => {
      if (launching) throw new Error('CS2 wird noch gestartet. Bitte kurz warten und anschließend das Spielbild verbinden.');
      if (presentation.active) throw new Error('Bitte die Aufnahme zuerst beenden.');
      const next = await game();
      try {
        await presentation.recover();
        await consoleConnection.read(['crosshair']);
      } catch (error) { throw await connectionError(error); }
      target = next;
      blocker ??= powerSaveBlocker.start('prevent-display-sleep');
    });
    handle('frame', async (width, height) => captureFrame(await capturedGame(), width, height));
    handle('begin', async slot => {
      await capturedGame();
      if (presentation.active) throw new Error('Eine Aufnahme läuft bereits.');
      if (slot === 'video' && !globalShortcut.register('F8', () => window.webContents.send('review:stop-video')))
        throw new Error('F8 ist von einer anderen App belegt. Bitte dort freigeben und erneut versuchen.');
      try { return await presentation.begin(slot); }
      catch (error) { globalShortcut.unregister('F8'); throw error; }
    });
    handle('end', async token => { if (typeof token !== 'string' || token.length > 100) throw new Error('Ungültige Aufnahme.'); await presentation.end(token); globalShortcut.unregister('F8'); });
    handle('disconnect', disconnect);
    handle('recover', async () => { await presentation.recover(); globalShortcut.unregister('F8'); });
    handle('update-check', () => updates.check());
    handle('update-install', async () => {
      if (target || presentation.active || await presentation.saved()) throw new Error('Bitte den Review beenden und die Spieleinstellungen wiederherstellen, bevor die App neu startet.');
      if (updates.status.state !== 'ready') throw new Error('Es ist noch kein Update bereit.');
      quitting = true; autoUpdater.quitAndInstall(false, true);
    });
    void updates.check();
    if (app.isPackaged) setInterval(() => { void updates.check(); }, 4 * 60 * 60 * 1000).unref();
    // Recovery after a crash/reload is retried even when the review page is closed.
    setInterval(() => {
      void presentation.recoverIfIdle().catch(() => {});
    }, 5000).unref();
    window.on('close', event => {
      if (quitting) return;
      event.preventDefault();
      void disconnect().then(() => { quitting = true; app.quit(); }).catch(async () => {
        const choice = await dialog.showMessageBox(window, { type: 'warning', buttons: ['Geöffnet lassen', 'Trotzdem beenden'], defaultId: 0, cancelId: 0, message: 'CS2 konnte noch nicht wiederhergestellt werden.', detail: 'Die ursprünglichen Einstellungen bleiben lokal gesichert. Verbinde CS2 erneut, damit Playbook sie wiederherstellen kann.' });
        if (choice.response === 1) { quitting = true; app.quit(); }
      });
    });
    app.on('will-quit', () => { globalShortcut.unregisterAll(); consoleConnection.close(); });
    void window.loadURL(ORIGIN).then(() => startup.write('Playbook-Seite geladen.')).catch(error => {
      startup.write(`Playbook-Seite konnte nicht geladen werden: ${error.code || 'Ladefehler'}`);
      void dialog.showMessageBox(window, { type: 'error', message: 'Playbook ist momentan nicht erreichbar.', detail: 'Prüfe die Internetverbindung. Über Playbook → Neu laden kannst du es erneut versuchen.' });
    });
  }).catch(error => { clearTimeout(startupDeadline); startupFailed(error); });
}
