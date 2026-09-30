import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "asChild"> & {
  onClick: () => Promise<unknown>;
  icon?: LucideIcon;
  pendingLabel?: string;
  successLabel?: string;
};

// Feedback belongs to the action that triggered it, without a page-level banner.
export function ActionButton({ onClick, icon: Icon, pendingLabel = "Wird ausgeführt …", successLabel = "Erledigt", children, disabled, ...props }: Props) {
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const running = useRef(false);
  const errorId = useId();
  useEffect(() => {
    if (state !== "success") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function perform() {
    if (running.current) return;
    running.current = true;
    setError("");
    setState("pending");
    try {
      await onClick();
      setState("success");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Aktion fehlgeschlagen. Bitte erneut versuchen.");
      setState("error");
    } finally {
      running.current = false;
    }
  }

  return <span className="inline-flex max-w-full flex-col items-start gap-1">
    <Button {...props} type={props.type || "button"} disabled={disabled || state === "pending"} aria-busy={state === "pending"} aria-describedby={error ? errorId : props["aria-describedby"]} onClick={perform}>
      {state === "pending" ? <Spinner data-icon="inline-start" /> : state === "success" ? <Check data-icon="inline-start" /> : Icon ? <Icon data-icon="inline-start" /> : null}
      <span aria-live="polite">{state === "pending" ? pendingLabel : state === "success" ? successLabel : children}</span>
    </Button>
    {error && <span id={errorId} role="alert" className="max-w-xs whitespace-pre-wrap break-words text-xs text-destructive">{error}</span>}
  </span>;
}
