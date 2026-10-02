function failure(error) {
  // An empty GitHub Atom feed throws without an updater-specific error code.
  if (error?.code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' || error?.message === 'No published versions on GitHub')
    return { state: 'unpublished', message: 'Noch kein App-Update veröffentlicht. Bis dahin mit playbook.cmd aktualisieren.' };
  return { state: 'error', message: 'Update derzeit nicht erreichbar. Du kannst weiterarbeiten und es später erneut versuchen.' };
}

export class Updates {
  status = { state: 'idle', message: 'Updates werden automatisch gesucht.' };
  constructor(updater, isPackaged) {
    this.updater = updater;
    this.isPackaged = isPackaged;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.on('checking-for-update', () => { this.status = { state: 'checking', message: 'Suche nach Updates …' }; });
    updater.on('update-available', info => { this.status = { state: 'downloading', message: `Version ${info.version} wird heruntergeladen.` }; });
    updater.on('update-not-available', () => { this.status = { state: 'current', message: 'Die App ist aktuell.' }; });
    updater.on('update-downloaded', info => { this.status = { state: 'ready', message: `Version ${info.version} ist bereit. Nach dem Review neu starten.` }; });
    updater.on('error', error => { this.status = failure(error); });
  }
  async check() {
    if (!this.isPackaged()) {
      this.status = { state: 'development', message: 'Automatische Updates sind im installierten Windows-Paket verfügbar.' };
      return;
    }
    // Keep a downloaded installer available, including on subsequent checks.
    if (['ready', 'downloading'].includes(this.status.state)) return;
    try { await this.updater.checkForUpdates(); }
    catch (error) { this.status = failure(error); }
  }
}
