import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked = false, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span className={cn("block size-4 rounded-full bg-card shadow-sm transition-transform", checked && "translate-x-4")} />
    </button>
  );
}
