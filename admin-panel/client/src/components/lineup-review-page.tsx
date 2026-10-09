import { isPlatformAdmin } from "../../../shared/authorization";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Copy } from "lucide-react";
import { api } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { findLineup, lineupKey, lineupPath, lineupReviewPath } from "../lib/lineups";
import { mapMatchesNade, mapSlug } from "../lib/maps";
import { queueSearch, reviewQueue, REVIEW_QUEUE_PATH } from "../lib/review-queue";
import { LineupReview } from "./lineup-review";
import { ActionButton } from "./action-button";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";

export function LineupReviewPage({ maps, nades, user, onEntriesChange }) {
  const { mapSlug: slug, lineupId } = useParams();
  const map = maps.find(map => mapSlug(map) === slug);
  const nade = findLineup<any>(nades, lineupId);
  if (!map || !nade || !mapMatchesNade(map, nade.map)) return <Empty><EmptyHeader><EmptyTitle>Lineup nicht gefunden</EmptyTitle><EmptyDescription>Die Aufnahme wurde entfernt oder der Review-Link ist ungültig.</EmptyDescription></EmptyHeader><EmptyContent><Button asChild variant="secondary"><Link to={isPlatformAdmin(user) ? REVIEW_QUEUE_PATH : "/maps"}>Zurück zur Übersicht</Link></Button></EmptyContent></Empty>;
  return <ReviewContent key={lineupKey(nade)} {...{ map, nade, maps, nades, user, onEntriesChange }} />;
}
function ReviewContent({ map, nade, maps, nades, user, onEntriesChange }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const running = useRef(false);
  const queued = isPlatformAdmin(user) && search.get("queue") === "1";
  const filters = queueSearch(search);
  const queue = queued ? reviewQueue(nades, maps, filters) : [];
  const position = queue.findIndex(entry => lineupKey(entry) === lineupKey(nade));
  // Keep the next item reachable after approving the current one removes it.
  const nextRef = useRef<any>(undefined);
  if (position >= 0) nextRef.current = queue[position + 1];
  const next = position >= 0 ? queue[position + 1] : queue.find(entry => lineupKey(entry) === lineupKey(nextRef.current || nade)) || queue[0];
  const previous = position > 0 ? queue[position - 1] : undefined;
  const href = entry => {
    const entryMap = maps.find(map => mapMatchesNade(map, entry.map));
    const params = queueSearch(search); params.set("queue", "1");
    return entryMap ? `${lineupReviewPath(entryMap, entry)}?${params}` : undefined;
  };
  async function mutate(action, extra = {}) {
    if (running.current) throw new Error("Eine Aktion läuft bereits.");
    running.current = true; setBusy(true);
    try {
      const result = await api("/api/nades/entry", { method: "POST", body: JSON.stringify({ owner: nade.owner, map: nade.map, name: nade.name, revision: nade.updatedAt || "", action, ...extra }) });
      onEntriesChange(result.entries);
    } finally { running.current = false; setBusy(false); }
  }
  return <article className="playbook-page grid gap-5">
    <div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm"><Link to={lineupPath(map, nade)}><ArrowLeft data-icon="inline-start" />Zur Detailseite</Link></Button>{queued && <Button asChild variant="ghost" size="sm"><Link to={`${REVIEW_QUEUE_PATH}${filters.size ? `?${filters}` : ""}`}>Alle Reviews</Link></Button>}</div>
    <PageHeader size="compact" eyebrow={`${map.name} · Review`} title={nade.displayName || nade.name} className="mb-0"
      actions={<ActionButton variant="outline" icon={Copy} onClick={() => copyText(`.loadnade ${nade.name}`)} successLabel="Kopiert">Ingame-Befehl kopieren</ActionButton>} />
    <LineupReview nade={nade} user={user} disabled={busy} mutate={mutate} onEntriesChange={onEntriesChange} onBusyChange={setCaptureBusy} />
    {queued && <nav aria-label="Zwischen Reviews wechseln" className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
      <Button variant="outline" disabled={busy || captureBusy || !previous || !href(previous)} onClick={() => { if (previous && href(previous)) navigate(href(previous)); }}><ArrowLeft data-icon="inline-start" />Vorheriges Lineup</Button>
      <span className="text-sm text-muted-foreground">{position >= 0 ? `${position + 1} / ${queue.length}` : "Review abgeschlossen"}</span>
      <Button variant="secondary" disabled={busy || captureBusy || !next || !href(next)} onClick={() => { if (next && href(next)) navigate(href(next)); }}>Nächstes Lineup<ArrowRight data-icon="inline-end" /></Button>
    </nav>}
  </article>;
}
