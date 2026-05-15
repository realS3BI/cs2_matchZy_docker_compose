import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: "default" | "destructive";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold",
        variant === "destructive" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
        className
      )}
      {...props}
    />
  );
}
