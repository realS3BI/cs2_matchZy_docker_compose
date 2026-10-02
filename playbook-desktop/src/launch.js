import { setTimeout as delay } from 'node:timers/promises';

export async function launchAndWait(launch, console, { timeoutMs = 60_000, retryMs = 1000, log = () => {} } = {}) {
  const start = Date.now();
  log('launch.requested', { timeoutMs, retryMs });
  try { await launch(); }
  catch (error) { log('launch.failed', { code: error.code, error: error.message }, 'ERROR'); throw error; }
  log('steam.started');
  console.close();
  const deadline = Date.now() + timeoutMs;
  let lastError, attempt = 0;
  do {
    attempt++;
    try {
      await console.read(['crosshair']);
      log('launch.confirmed', { attempt, elapsedMs: Date.now() - start });
      return;
    }
    catch (error) { lastError = error; log('launch.retry', { attempt, elapsedMs: Date.now() - start, code: error.code, error: error.message }, 'WARN'); }
    if (Date.now() < deadline) await delay(retryMs);
  } while (Date.now() < deadline);
  log('launch.timeout', { attempts: attempt, elapsedMs: Date.now() - start, code: lastError.code }, 'ERROR');
  throw Object.assign(new Error(`Steam wurde gestartet, aber CS2 hat die lokale Steuerung noch nicht bestätigt. Bestätige gegebenenfalls die Startabfrage in Steam und warte auf das CS2-Hauptmenü. Danach „Spielbild verbinden“ erneut versuchen. ${lastError.message}`), { code: lastError.code, cause: lastError });
}
