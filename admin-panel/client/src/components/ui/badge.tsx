import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: "default" | "destructive" | "success" | "warning" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-transparent px-2 py-1 text-xs font-semibold",
        variant === "destructive" && "bg-destructive/10 text-destructive",
        variant === "success" && "bg-success/12 text-success",
        variant === "warning" && "bg-warning/12 text-warning-foreground",
        variant === "outline" && "border-border bg-transparent text-muted-foreground",
        variant === "default" && "bg-secondary text-secondary-foreground",
        className
      )}
      {...props}
    />
  );
}
