import { setTimeout as delay } from 'node:timers/promises';

export async function launchAndWait(launch, console, { timeoutMs = 60_000, retryMs = 1000 } = {}) {
  await launch();
  console.close();
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try { await console.read(['crosshair']); return; }
    catch (error) { lastError = error; }
    if (Date.now() < deadline) await delay(retryMs);
  } while (Date.now() < deadline);
  throw new Error(`Steam wurde gestartet, aber CS2 hat die lokale Steuerung noch nicht bestätigt. Bestätige gegebenenfalls die Startabfrage in Steam und warte auf das CS2-Hauptmenü. Danach „Spielbild verbinden“ erneut versuchen. ${lastError.message}`);
}
