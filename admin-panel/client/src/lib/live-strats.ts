import { matchesEconomy, type PublishedStrat, type StratEconomy, type StratView } from "../../../shared/strats.js";

export type PlayableStrat = { id: string; revision: number; published: PublishedStrat };
export type LiveFilters = { map: string; side: string; ownEconomy: StratEconomy[]; opponentEconomy: StratEconomy[]; query: string };

export function playableStrats(entries: StratView[], teamId: string): PlayableStrat[] {
  return entries.flatMap(strat => strat.teamId === teamId && !strat.archived && strat.published
    ? [{ id: strat.id, revision: strat.revision, published: strat.published }] : []);
}

// Live always uses the published snapshot, including when the draft has changed.
export function filterLiveStrats(entries: PlayableStrat[], filters: LiveFilters): PlayableStrat[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return entries.filter(({ published: { content } }) =>
    (!filters.map || content.map === filters.map) && (!filters.side || content.side === filters.side) &&
    matchesEconomy(content.ownEconomy, filters.ownEconomy) && matchesEconomy(content.opponentEconomy, filters.opponentEconomy) &&
    (!query || `${content.title} ${content.description}`.toLocaleLowerCase().includes(query)));
}
