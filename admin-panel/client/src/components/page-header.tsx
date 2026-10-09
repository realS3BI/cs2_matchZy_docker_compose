import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  /** Kicker in Label-Schrift über dem Titel, z. B. „Server“ oder „Match Admin“. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Aktionen rechts unten; auf schmalen Breiten unter dem Text. */
  actions?: ReactNode;
  /** display: Bibliotheksseiten, default: Arbeitsbereiche, compact: Unterseiten mit Zurück-Pfeil. */
  size?: "display" | "default" | "compact";
  className?: string;
  children?: ReactNode;
};

/** Ein Seitenkopf für alle Seiten. Siehe docs/design-system.md, Abschnitt „Seitenkopf“. */
export function PageHeader({ title, eyebrow, description, actions, size = "default", className, children }: PageHeaderProps) {
  const trailing = actions ?? children;
  return (
    <header className={cn("page-header", className)} data-size={size}>
      <div className="page-header-copy">
        {eyebrow && <p className="control-kicker">{eyebrow}</p>}
        <h1 className="control-title page-header-title">{title}</h1>
        {description && <p className="page-header-description">{description}</p>}
      </div>
      {trailing && <div className="page-header-actions">{trailing}</div>}
    </header>
  );
}
