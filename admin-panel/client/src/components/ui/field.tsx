import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

export function Field({ className, ...props }: ComponentPropsWithoutRef<"label">) {
  return <label className={cn("group/field grid gap-2 text-sm", className)} {...props} />;
}

export function FieldGroup({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("font-medium text-foreground", className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />;
}
