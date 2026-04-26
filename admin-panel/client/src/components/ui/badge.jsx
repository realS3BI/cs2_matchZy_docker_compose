import { cn } from "../../lib/utils";

export function Badge({ className, variant = "default", ...props }) {
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
