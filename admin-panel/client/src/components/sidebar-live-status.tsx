import { ChevronRight, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import type { TeamView } from "../../../shared/strats";

export function SidebarLiveStatus({ teams, confirmed, onNavigate }: {
  teams: TeamView[];
  confirmed: boolean;
  onNavigate: () => void;
}) {
  return (
    <nav className="sidebar-server-status sidebar-live-status" data-tone={teams.length > 0 && confirmed ? "success" : "neutral"} aria-label="Live-Teams">
      {teams.length === 0 ? (
        <Link className="sidebar-server-link" to="/strats/live" onClick={onNavigate}>
          <span className="sidebar-server-icon"><Radio aria-hidden="true" /></span>
          <span className="sidebar-server-copy">
            <span className="sidebar-server-caption">Live</span>
            <span className="sidebar-live-name">Kein Team live</span>
          </span>
          <ChevronRight className="sidebar-server-chevron" aria-hidden="true" />
        </Link>
      ) : teams.map(team => (
        <Link key={team.id} className="sidebar-server-link" to={`/strats/live/${team.id}`} onClick={onNavigate}>
          <span className="sidebar-server-icon"><Radio aria-hidden="true" /></span>
          <span className="sidebar-server-copy">
            <span className="sidebar-server-caption sidebar-live-caption">{confirmed ? "Live" : "Live · Letzter Stand"}</span>
            <span className="sidebar-live-name truncate">{team.name}</span>
            {team.active && <span className="sidebar-live-detail truncate">{team.active.content.title}</span>}
          </span>
          <ChevronRight className="sidebar-server-chevron" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
