import { Activity, ChevronRight, CircleHelp, CirclePower, LoaderCircle, Pause, Save, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { serverPresentation, type ServerOperation, type ServerStatus } from "@/lib/server-status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const icons = { activity: Activity, loading: LoaderCircle, pause: Pause, offline: CirclePower, error: TriangleAlert, unknown: CircleHelp };

export type SidebarServerStatusProps = {
  status?: ServerStatus;
  operation?: ServerOperation;
  unavailable?: boolean;
  dirty: boolean;
  canMonitor: boolean;
  onNavigate: () => void;
};

export function SidebarServerStatus({ status, operation, unavailable, dirty, canMonitor, onNavigate }: SidebarServerStatusProps) {
  const presentation = canMonitor ? serverPresentation(status, operation, unavailable) : {
    tone: "neutral", icon: "unknown", label: "Serververwaltung", detail: "Öffne die Serverübersicht, um Einstellungen und Spielmodus zu verwalten.",
  } as const;
  const Icon = icons[presentation.icon];
  const failedAction = status?.lastAction?.status === "failed" && ["apply", "restart", "scheduled_restart", "repair", "map_change"].includes(status.lastAction.type);
  const syncError = status?.nadesSync?.state === "error";

  return (
    <div className="sidebar-server-status" data-tone={presentation.tone}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link className="sidebar-server-link" to={presentation.tone === "destructive" ? "/operations#diagnose" : "/overview"} onClick={onNavigate}>
            <span className="sidebar-server-icon" data-spinning={presentation.icon === "loading"}><Icon aria-hidden="true" /></span>
            <span className="sidebar-server-copy">
              <span className="sidebar-server-caption">CS2-Server</span>
              <span className="sidebar-server-label" role="status">{presentation.label}</span>
            </span>
            <ChevronRight className="sidebar-server-chevron" aria-hidden="true" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">{presentation.detail}</TooltipContent>
      </Tooltip>
      <div className="sidebar-server-notices" aria-live="polite">
        {dirty && <Link to="/overview" onClick={onNavigate} className="sidebar-server-notice"><Save aria-hidden="true" /><span>Ungespeicherte Änderungen</span><ChevronRight aria-hidden="true" /></Link>}
        {!unavailable && !operation && failedAction && <Link to="/overview" onClick={onNavigate} className="sidebar-server-notice" data-tone="destructive"><TriangleAlert aria-hidden="true" /><span>Letzte Aktion fehlgeschlagen</span><ChevronRight aria-hidden="true" /></Link>}
        {!unavailable && syncError && <Link to="/operations#diagnose" onClick={onNavigate} className="sidebar-server-notice" data-tone="destructive"><TriangleAlert aria-hidden="true" /><span>Nade-Sync fehlgeschlagen</span><ChevronRight aria-hidden="true" /></Link>}
      </div>
    </div>
  );
}
