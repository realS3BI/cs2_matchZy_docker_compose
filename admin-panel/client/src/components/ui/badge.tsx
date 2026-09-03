import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: "default" | "secondary" | "destructive" | "success" | "warning" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium",
        variant === "destructive" && "bg-destructive/10 text-destructive",
        variant === "success" && "bg-success/10 text-success",
        variant === "warning" && "bg-warning/10 text-warning-foreground",
        variant === "outline" && "border-border bg-transparent text-muted-foreground",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "default" && "bg-primary/10 text-primary",
        className
      )}
      {...props}
    />
  );
}
