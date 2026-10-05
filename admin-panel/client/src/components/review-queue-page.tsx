import { isPlatformAdmin } from "../../../shared/authorization";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronDown, ClipboardCheck, RefreshCw } from "lucide-react";
import { missingReviewMedia } from "../../../shared/review-media";
import { mapMatchesNade } from "../lib/maps";
import { lineupKey, lineupReviewPath } from "../lib/lineups";
import { queueSearch, reviewQueue, reviewQueueStatus, reviewStatus, REVIEW_FILTERS } from "../lib/review-queue";
import { ActionButton } from "./action-button";
import { GrenadeIcon } from "./nade-icons";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ReviewSessionWorkspace } from "./review-session-workspace";

export function ReviewQueuePage({ maps, nades, user, onRefresh, onEntriesChange = (_entries: any[]) => { void onRefresh(); } }) {
  const [search, setSearch] = useSearchParams();
  if (!isPlatformAdmin(user)) return <Navigate to="/maps" replace />;
  const entries = reviewQueue(nades, maps, search);
  const filter = (key: string, value: string) => setSearch(current => {
    const next = queueSearch(current);
    if (!value || (key !== "status" && value === "all")) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: key === "q" });
  const href = nade => {
    const map = maps.find(map => mapMatchesNade(map, nade.map));
    const next = queueSearch(search); next.set("queue", "1");
    return map ? `${lineupReviewPath(map, nade)}?${next}` : undefined;
  };
  return <article className="playbook-page grid gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="control-kicker">Server · Plattform-Admin</p><h1 className="control-title mt-2 text-3xl">Reviews</h1><p className="mt-2 text-sm text-muted-foreground">Eingereichte Lineups prüfen und ausstehende Aufnahmen vervollständigen.</p></div>
      <ActionButton variant="outline" icon={RefreshCw} onClick={onRefresh} successLabel="Aktualisiert">Aktualisieren</ActionButton>
    </header>
    <ReviewSessionWorkspace {...{ nades, user, onEntriesChange }} />
    <Collapsible defaultOpen={false} className="grid gap-4">
    <CollapsibleTrigger asChild><Button variant="outline" className="w-full justify-between">Reviews und Filter · {entries.length} offen<ChevronDown data-icon="inline-end" /></Button></CollapsibleTrigger>
    <CollapsibleContent className="grid gap-4">
    <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
      <Field><FieldLabel>Map</FieldLabel><Select value={search.get("map") || "all"} onValueChange={value => filter("map", value)}><SelectTrigger aria-label="Reviews nach Map filtern"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle Maps</SelectItem>{maps.map(map => <SelectItem key={map.key} value={map.key}>{map.name}</SelectItem>)}</SelectContent></Select></Field>
      <Field><FieldLabel>Status</FieldLabel><Select value={reviewQueueStatus(search)} onValueChange={value => filter("status", value)}><SelectTrigger aria-label="Review-Status filtern"><SelectValue /></SelectTrigger><SelectContent>{REVIEW_FILTERS.map(filter => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}</SelectContent></Select></Field>
      <Field htmlFor="review-search"><FieldLabel>Lineup suchen</FieldLabel><Input id="review-search" value={search.get("q") || ""} onChange={event => filter("q", event.target.value)} placeholder="Name, Start oder Ziel …" /></Field>
    </CardContent></Card>
    <p className="text-sm text-muted-foreground" role="status">{entries.length} {entries.length === 1 ? "offenes Review" : "offene Reviews"}</p>
    {entries.length ? <ul className="grid gap-3" aria-label="Offene Reviews">{entries.map(nade => {
      const map = maps.find(map => mapMatchesNade(map, nade.map));
      const target = href(nade);
      const status = REVIEW_FILTERS.find(filter => filter.value === reviewStatus(nade))!;
      const missing = missingReviewMedia(nade);
      return <li key={lineupKey(nade)}><Card><CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex min-w-0 items-start gap-3"><GrenadeIcon type={nade.type} className="mt-1 size-5 shrink-0" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{map?.name || nade.map} · {nade.owner === "default" ? "Importierte Aufnahme" : "Spieleraufnahme"}</p><h2 className="mt-1 break-words font-semibold">{nade.displayName || nade.name}</h2><p className="mt-1 text-sm text-muted-foreground">{nade.throwFromTitle || "Startposition"} → {nade.throwToTitle || "Zielposition"}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{status.label}</Badge><Badge variant={missing.length ? "secondary" : "success"}>{5 - missing.length} / 5 Aufnahmen</Badge></div></div></div>
        {target ? <Button asChild variant="secondary"><Link to={target}><ClipboardCheck data-icon="inline-start" />Review öffnen<ArrowRight data-icon="inline-end" /></Link></Button> : <span className="text-sm text-muted-foreground">Map nicht verfügbar</span>}
      </CardContent></Card></li>;
    })}</ul> : <Empty><EmptyHeader><EmptyTitle>Keine offenen Reviews</EmptyTitle><EmptyDescription>Für diese Filter ist nichts ausstehend. Wähle eine andere Map oder einen anderen Status.</EmptyDescription></EmptyHeader></Empty>}
    </CollapsibleContent>
    </Collapsible>
  </article>;
}
