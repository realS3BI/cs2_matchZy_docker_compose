import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

export function Field({ className, ...props }: ComponentPropsWithoutRef<"label">) {
  return <label className={cn("grid gap-2 text-sm", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("font-semibold text-foreground", className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />;
}
