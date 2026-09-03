import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

type AlertProps = ComponentPropsWithoutRef<"section"> & {
  variant?: "default" | "destructive" | "warning" | "success";
};

export function Alert({ className, variant = "default", ...props }: AlertProps) {
  return (
    <section
      role="alert"
      className={cn(
        "grid gap-1 rounded-lg border p-4 text-sm",
        variant === "default" && "border-border bg-card text-foreground",
        variant === "destructive" && "border-destructive/30 bg-destructive/10 text-destructive",
        variant === "warning" && "border-warning/35 bg-warning/10 text-warning-foreground",
        variant === "success" && "border-success/30 bg-success/10 text-success",
        className
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentPropsWithoutRef<"h3">) {
  return <h3 className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("text-sm leading-relaxed opacity-90", className)} {...props} />;
}
