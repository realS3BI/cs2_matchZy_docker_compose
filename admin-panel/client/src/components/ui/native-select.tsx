import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

export function NativeSelect({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return (
    <select
      className={cn("flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50", className)}
      {...props}
    />
  );
}
