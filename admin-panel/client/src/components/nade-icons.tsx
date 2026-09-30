import { Crosshair } from "lucide-react";
import { grenadeIcon, teamIcon } from "../lib/nade-assets";
import { cn } from "../lib/utils";

export function GrenadeIcon({ type, className }: { type: string; className?: string }) {
  const src = grenadeIcon(type);
  return src ? <img src={src} alt="" aria-hidden="true" className={cn("size-6 shrink-0 object-contain", className)} /> : <Crosshair aria-hidden="true" className={cn("size-5 shrink-0", className)} />;
}

export function TeamIcon({ team, className }: { team: string; className?: string }) {
  return <img src={teamIcon(team)} alt="" aria-hidden="true" className={cn("size-5 shrink-0 object-contain", className)} />;
}
