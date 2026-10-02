export function captureFrame(game, width, height) {
  if (game.minimized) throw new Error('CS2 ist minimiert. Bitte das Spiel wieder öffnen.');
  if (![width, height].every(n => Number.isInteger(n) && n >= 64 && n <= 16384)) throw new Error('Ungültige Aufnahmegröße.');
  const client = game.client;
  // Chromium builds may capture client area, DWM bounds, or full window bounds.
  // Match real physical pixels. Never guess title-bar sizes or crop crosshairs.
  const matches = [client, game.visible, game.window].filter(rect => rect && rect.right - rect.left === width && rect.bottom - rect.top === height);
  const frames = matches.map(rect => ({ width, height, left: client.left - rect.left, top: client.top - rect.top, right: rect.right - client.right, bottom: rect.bottom - client.bottom }))
    .filter(frame => [frame.left, frame.top, frame.right, frame.bottom].every(n => Number.isInteger(n) && n >= 0) && width - frame.left - frame.right >= 64 && height - frame.top - frame.bottom >= 64);
  if (!frames.length || frames.some(frame => JSON.stringify(frame) !== JSON.stringify(frames[0])))
    throw new Error('Der Fensterrand ist nicht eindeutig erkennbar. Stelle CS2 auf „Vollbild im Fenster“ und verbinde es erneut.');
  return frames[0];
}
