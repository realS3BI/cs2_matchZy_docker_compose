import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

export function NativeSelect({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return (
    <select
      className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)}
      {...props}
    />
  );
}
