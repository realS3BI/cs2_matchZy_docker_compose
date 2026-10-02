import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Current CS2 (September 2026). Only numeric cvars, no arbitrary console input.
// White static cross with a black half outline, as selected in CS2.
export const CROSSHAIR = Object.freeze({
  cl_crosshairstyle: '4', cl_crosshair_length: '22', cl_crosshair_thickness: '3',
  cl_crosshair_gap: '9', cl_crosshair_screen_height: '1080',
  cl_crosshaircolor_r: '255', cl_crosshaircolor_g: '255', cl_crosshaircolor_b: '255', cl_crosshaircolor_a: '255',
  cl_crosshairoutline_r: '0', cl_crosshairoutline_g: '0', cl_crosshairoutline_b: '0', cl_crosshairoutline_a: '255',
  cl_crosshair_drawoutline: '2', cl_crosshairdot: 'false', cl_crosshair_t: 'false', cl_crosshair_recoil: 'false',
  cl_ironsight_usecrosshaircolor: 'false', cl_ironsight_dot_scale: '1',
  cl_grenadecrosshair_smoke: 'false', cl_grenadecrosshair_flash: 'false', cl_grenadecrosshair_fire: 'false',
  cl_grenadecrosshair_explosive: 'false', cl_grenadecrosshair_decoy: 'false',
});
const CLEAN = Object.freeze({
  cl_draw_only_deathnotices: '1', cl_drawhud: 'true', r_drawviewmodel: 'false', crosshair: 'true',
  cl_showfps: '0', r_show_build_info: 'false', cl_hud_telemetry_frametime_show: '0',
  cl_hud_telemetry_net_misdelivery_show: '0', cl_hud_telemetry_net_quality_graph_show: '0',
  cl_hud_telemetry_ping_show: '0', cl_hud_telemetry_serverrecvmargin_graph_show: '0',
});
export const NAMES = Object.freeze([...Object.keys(CROSSHAIR), ...Object.keys(CLEAN)]);
export const FRONT_CAMERA = Object.freeze({ c_minpitch: '-89', c_maxpitch: '89', c_minyaw: '-180', c_maxyaw: '180', cam_idealyaw: '180', cam_idealpitch: '0', cam_collision: '1', cam_showangles: 'false' });
const OLD_FRONT_NAMES = [...NAMES, ...Object.keys(FRONT_CAMERA).filter(name => !["c_minpitch", "c_maxpitch"].includes(name))];
const FRONT_NAMES = [...NAMES, ...Object.keys(FRONT_CAMERA)];
const LEGACY_NAMES = NAMES.filter(name => !name.startsWith('cl_ironsight_'));
export function profile(slot, screenHeight = 1080, cameraPitch = 0) {
  if (!['aim', 'position', 'front', 'effect', 'video'].includes(slot)) throw new Error('Unbekannte Aufnahme.');
  if (!Number.isInteger(screenHeight) || screenHeight < 240 || screenHeight > 16384) throw new Error('Die aktuelle CS2-Spielhöhe konnte nicht bestimmt werden. Bitte das Spielbild erneut verbinden.');
  if (!Number.isFinite(cameraPitch) || Math.abs(cameraPitch) > 89) throw new Error('Ungültiger Kamera-Pitch.');
  // CS2 rebases pixel dimensions to the current game height when sizes change.
  // A fixed 1080 reference rescales the values again on e.g. a 1440p window.
  return { ...CROSSHAIR, ...CLEAN, ...(slot === 'front' ? { ...FRONT_CAMERA, cam_idealpitch: String(cameraPitch) } : {}), cl_crosshair_screen_height: String(screenHeight), crosshair: ['front', 'effect'].includes(slot) ? 'false' : 'true', r_drawviewmodel: slot === 'video' ? 'true' : 'false' };
}
export function validSnapshot(saved) {
  const names = saved?.version === 1 ? LEGACY_NAMES : saved?.version === 2 ? NAMES : saved?.version === 3 && typeof saved.frontCamera === 'boolean' ? (saved.frontCamera ? OLD_FRONT_NAMES : NAMES) : saved?.version === 4 && typeof saved.frontCamera === "boolean" ? (saved.frontCamera ? FRONT_NAMES : NAMES) : [];
  return names.length > 0 && typeof saved.game === 'string' &&
    saved.values && Object.keys(saved.values).length === names.length &&
    names.every(name => /^(?:true|false|[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)$/i.test(saved.values[name] ?? ''));
}

export class Presentation {
  active;
  timer;
  queue = Promise.resolve();
  constructor(console, path, game) { this.console = console; this.path = path; this.game = game; }
  serial(work) { const next = this.queue.then(work, work); this.queue = next.catch(() => {}); return next; }
  async saved() {
    try { const value = JSON.parse(await readFile(this.path, 'utf8')); if (!validSnapshot(value)) throw new Error('Ungültige Sicherung. Bitte die lokale Wiederherstellungsdatei prüfen.'); return value; }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  recover() { return this.serial(() => this.restore()); }
  recoverIfIdle() { return this.serial(async () => { if (!this.active) await this.restore(); }); }
  async restore() {
    clearTimeout(this.timer);
    try {
      const saved = await this.saved();
      if (!saved) return;
      // Restore even after a CS2 restart: archived crosshair settings can survive it.
      if (saved.frontCamera) await this.console.execute(['firstperson']);
      await this.console.write(saved.values);
      await unlink(this.path);
    } finally { this.active = undefined; }
  }
  begin(slot, cameraPitch = 0) {
    return this.serial(async () => {
      if (this.active) throw new Error('Eine Aufnahme läuft bereits.');
      await this.restore();
      const game = await this.game();
      const settings = profile(slot, game.client.bottom - game.client.top, cameraPitch);
      const values = await this.console.read(Object.keys(settings));
      const saved = { version: 4, game: game.identity, frontCamera: slot === 'front', values };
      // Journal must reach disk before the first setting changes.
      await writeFile(this.path + '.tmp', JSON.stringify(saved), { mode: 0o600, flush: true });
      await rename(this.path + '.tmp', this.path);
      const token = randomUUID();
      this.active = { token, slot };
      try {
        await this.console.write(settings);
        if (slot === 'front') {
          const reply = await this.console.execute(['thirdperson']);
          if (/cheat|unknown command/i.test(reply)) throw new Error('CS2 hat Third Person abgelehnt. Bitte die Kamera auf dem Trainingsserver freigeben.');
        }
        this.timer = setTimeout(() => { void this.recover().catch(() => {}); }, slot === 'video' ? 135_000 : 15_000);
        return token;
      } catch (error) {
        try { await this.restore(); } catch { throw new Error(`${error.message} Die ursprünglichen Einstellungen sind lokal gesichert. Bitte CS2 verbinden und „Einstellungen wiederherstellen“ wählen.`); }
        throw error;
      }
    });
  }
  end(token) {
    return this.serial(async () => {
      if (this.active && token !== this.active.token) throw new Error('Diese Aufnahme ist nicht mehr aktiv.');
      await this.restore();
    });
  }
}
