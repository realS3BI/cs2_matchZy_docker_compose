/** Copy from a user action, including local HTTP previews without Clipboard API. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Embedded browsers may expose the API but deny permission. */ }
  }

  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(field);
  let copied = false;
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    // Legacy fallback only: unlike Clipboard API this also works on HTTP.
    copied = document.execCommand("copy");
  } catch { /* The manual-copy message below covers unsupported/blocked copying. */ }
  finally {
    field.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
  if (!copied) throw new Error("Automatisches Kopieren ist in diesem Browser nicht verfügbar. Bitte den Text markieren und mit Strg+C oder ⌘C kopieren.");
}
