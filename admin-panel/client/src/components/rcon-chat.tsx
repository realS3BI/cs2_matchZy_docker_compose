import { useEffect, useRef, useState } from "react";
import { Check, Copy, Send, Terminal, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type Entry = { id: string; command: string; time: string; output?: string; error?: string };

/** Read-only commands that are safe to suggest; clicking only fills the prompt. */
const QUICK_COMMANDS = ["status", "css_plugins list", "meta list"];
const MAX_ENTRIES = 100;

function OutputCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button type="button" className="rcon-copy" aria-label={copied ? "Ausgabe kopiert" : "Ausgabe kopieren"} onClick={async () => { await copyText(text); setCopied(true); }}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </button>
  );
}

export function RconChat() {
  const [command, setCommand] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries, busy]);

  async function send(event) {
    event.preventDefault();
    const sent = command.trim();
    if (busy || !sent) return;
    const id = crypto.randomUUID();
    const time = new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    history.current = [sent, ...history.current.filter(item => item !== sent)].slice(0, 50);
    historyIndex.current = -1;
    setCommand("");
    setBusy(true);
    setEntries(current => [...current.slice(-(MAX_ENTRIES - 1)), { id, command: sent, time }]);
    const settle = (patch: Partial<Entry>) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
    try {
      const result = await api("/api/server/rcon", { method: "POST", body: JSON.stringify({ command: sent }) });
      settle({ output: String(result.output ?? "") });
    } catch (error) {
      settle({ error: error.message });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // Shell-style history: ↑ walks back through sent commands, ↓ returns to an empty prompt.
  function browseHistory(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const items = history.current;
    if (!items.length) return;
    event.preventDefault();
    const next = event.key === "ArrowUp" ? Math.min(historyIndex.current + 1, items.length - 1) : historyIndex.current - 1;
    historyIndex.current = Math.max(next, -1);
    setCommand(historyIndex.current === -1 ? "" : items[historyIndex.current]);
  }

  function prefill(value: string) {
    setCommand(value);
    historyIndex.current = -1;
    inputRef.current?.focus();
  }

  return (
    <section className="rcon-console" aria-labelledby="rcon-console-title">
      <header className="rcon-console-bar">
        <div className="flex min-w-0 items-center gap-2.5">
          <Terminal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 id="rcon-console-title" className="text-sm font-semibold">Server-Konsole</h2>
          <span className="truncate text-xs text-muted-foreground">RCON · Verlauf bleibt nur in diesem Fenster</span>
        </div>
        <Button variant="ghost" size="sm" disabled={busy || entries.length === 0} onClick={() => setEntries([])}><Trash2 data-icon="inline-start" />Leeren</Button>
      </header>

      <div ref={outputRef} className="rcon-console-output" role="log" aria-label="RCON-Verlauf" aria-live="polite">
        {entries.length === 0 ? (
          <p className="rcon-console-empty">Noch keine Befehle. Sende zum Beispiel <code>status</code>, um die Verbindung zu prüfen.</p>
        ) : entries.map(entry => (
          <div key={entry.id} className="rcon-entry">
            <div className="rcon-entry-command">
              <span className="rcon-prompt" aria-hidden="true">›</span>
              <span className="min-w-0 flex-1 break-all">{entry.command}</span>
              <time className="rcon-entry-time">{entry.time}</time>
            </div>
            {entry.output !== undefined && (
              <div className="rcon-entry-output">
                <pre>{entry.output.trim() || "Keine Ausgabe."}</pre>
                {entry.output.trim() && <OutputCopy text={entry.output} />}
              </div>
            )}
            {entry.error && <p className="rcon-entry-error" role="alert">{entry.error}</p>}
            {entry.output === undefined && !entry.error && <p className="rcon-entry-pending"><Spinner className="size-3" />Wartet auf CS2 …</p>}
          </div>
        ))}
      </div>

      <form className="rcon-console-form" onSubmit={send}>
        <div className="rcon-console-suggestions" aria-label="Schnellbefehle">
          {QUICK_COMMANDS.map(item => <button key={item} type="button" onClick={() => prefill(item)}>{item}</button>)}
        </div>
        <div className="rcon-console-prompt">
          <span className="rcon-prompt" aria-hidden="true">›</span>
          <label htmlFor="rcon-command" className="sr-only">RCON-Befehl</label>
          <input
            ref={inputRef}
            id="rcon-command"
            value={command}
            onChange={event => { setCommand(event.target.value); historyIndex.current = -1; }}
            onKeyDown={browseHistory}
            placeholder="RCON-Befehl eingeben …"
            maxLength={1024}
            autoComplete="off"
            spellCheck={false}
          />
          <Button size="sm" type="submit" disabled={busy || !command.trim()}>{busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}Senden</Button>
        </div>
      </form>
    </section>
  );
}
