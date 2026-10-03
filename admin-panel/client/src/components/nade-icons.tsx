import { Crosshair, Mouse } from "lucide-react";
import { grenadeIcon, teamIcon } from "../lib/nade-assets";
import { cn } from "../lib/utils";

export function GrenadeIcon({ type, className }: { type: string; className?: string }) {
  const src = grenadeIcon(type);
  return src ? <img src={src} alt="" aria-hidden="true" className={cn("size-6 shrink-0 object-contain", className)} /> : <Crosshair aria-hidden="true" className={cn("size-5 shrink-0", className)} />;
}

export function TeamIcon({ team, className }: { team: string; className?: string }) {
  return <img src={teamIcon(team)} alt="" aria-hidden="true" className={cn("size-5 shrink-0 object-contain", className)} />;
}

export function ThrowClickIcon({ clickType }: { clickType?: string }) {
  if (!["left", "right", "both"].includes(clickType || "")) return <Mouse aria-hidden="true" />;
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(clickType === "left" || clickType === "both") && <path d="M12 3a7 7 0 0 0-7 7v1h7Z" fill="currentColor" fillOpacity="0.65" stroke="none" />}
    {(clickType === "right" || clickType === "both") && <path d="M12 3a7 7 0 0 1 7 7v1h-7Z" fill="currentColor" fillOpacity="0.65" stroke="none" />}
    <rect x="5" y="3" width="14" height="18" rx="7" /><path d="M12 3v8M5 11h14" />
  </svg>;
}
