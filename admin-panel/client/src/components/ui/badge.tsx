import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { cn } from "../../lib/utils";

/** Radar-Tinte: Seiten und Granatentypen. Gilt für nichts anderes (docs/design-system.md). */
export type BadgeTone = "t" | "ct" | "smoke" | "flash" | "he" | "molly" | "decoy";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: "default" | "highlight" | "secondary" | "destructive" | "success" | "warning" | "outline";
  tone?: BadgeTone;
};

const toneVar: Record<BadgeTone, string> = {
  t: "var(--side-t)",
  ct: "var(--side-ct)",
  smoke: "var(--nade-smoke)",
  flash: "var(--nade-flash)",
  he: "var(--nade-he)",
  molly: "var(--nade-molly)",
  decoy: "var(--nade-decoy)"
};

export function Badge({ className, variant = "default", tone, style, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      style={tone ? ({ ...style, "--badge-tone": toneVar[tone] } as CSSProperties) : style}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone
          ? "badge-tone"
          : [
              variant === "default" && "bg-primary/10 text-primary",
              variant === "highlight" && "bg-primary text-primary-foreground font-semibold",
              variant === "destructive" && "bg-destructive/10 text-destructive",
              variant === "success" && "bg-success/10 text-success",
              variant === "warning" && "bg-warning/10 text-warning-foreground",
              variant === "outline" && "border-border bg-transparent text-muted-foreground",
              variant === "secondary" && "bg-secondary text-secondary-foreground"
            ],
        className
      )}
      {...props}
    />
  );
}
