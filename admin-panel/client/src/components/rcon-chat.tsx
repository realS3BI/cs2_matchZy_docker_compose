import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Message, MessageContent, MessageHeader } from "./ui/message";
import { Bubble, BubbleContent } from "./ui/bubble";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "./ui/message-scroller";

export function RconChat() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState([{ id: "welcome", role: "server", text: "Verbinde dich mit dem Server, indem du einen Befehl sendest, zum Beispiel status." }]);
  const [busy, setBusy] = useState(false);
  async function send(event) {
    event.preventDefault();
    if (busy || !command.trim()) return;
    const sent = command.trim(); setCommand(""); setBusy(true);
    const append = (role, text) => setMessages(current => [...current.slice(-99), { id: crypto.randomUUID(), role, text }]);
    append("user", sent);
    try { const result = await api("/api/server/rcon", { method: "POST", body: JSON.stringify({ command: sent }) }); append("server", result.output); }
    catch (error) { append("error", error.message); }
    finally { setBusy(false); }
  }
  return <Card>
    <CardHeader className="flex-row items-start justify-between"><div className="grid gap-2"><CardTitle>Server-Konsole</CardTitle><CardDescription>Sende RCON-Befehle und lies die Antwort von CS2. Der Verlauf bleibt nur in diesem geöffneten Fenster.</CardDescription></div><Button variant="outline" size="icon" aria-label="Verlauf leeren" disabled={busy} onClick={() => setMessages([])}><Trash2 /></Button></CardHeader>
    <CardContent><div className="h-[min(55vh,560px)] rounded-lg border bg-console p-4" role="log" aria-label="RCON-Verlauf" aria-live="polite">
      <MessageScrollerProvider autoScroll><MessageScroller><MessageScrollerViewport><MessageScrollerContent>
        {messages.map(message => <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}><Message align={message.role === "user" ? "end" : "start"}><MessageContent><MessageHeader>{message.role === "user" ? "Du → CS2" : message.role === "error" ? "Verbindungsfehler" : "CS2 → Du"}</MessageHeader><Bubble><BubbleContent><pre className="whitespace-pre-wrap break-all font-mono text-xs">{message.text}</pre></BubbleContent></Bubble></MessageContent></Message></MessageScrollerItem>)}
      </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>
    </div></CardContent>
    <CardFooter><form className="w-full" onSubmit={send}><FieldGroup className="sm:flex-row sm:items-end"><Field><FieldLabel><label htmlFor="rcon-command">RCON-Befehl</label></FieldLabel><Input id="rcon-command" value={command} onChange={event => setCommand(event.target.value)} placeholder="status" maxLength={1024} autoComplete="off" spellCheck={false} /></Field><Button disabled={busy || !command.trim()}><Send data-icon="inline-start" />{busy ? "Wartet auf CS2…" : "Senden"}</Button></FieldGroup></form></CardFooter>
  </Card>;
}
