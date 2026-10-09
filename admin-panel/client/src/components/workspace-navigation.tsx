import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

/** Route links remain usable with browser history, modifier clicks and keyboard navigation. */
export function WorkspaceNavigation({
  label,
  items,
  actions,
}: {
  label: string;
  items: { label: string; path: string; active?: boolean }[];
  /** Page-wide actions on the right; the bar then stays visible while scrolling. */
  actions?: ReactNode;
}) {
  return (
    <div className={actions ? "workspace-navigation has-actions" : "workspace-navigation"}>
      <nav className="workspace-navigation-links" aria-label={label}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end
            aria-current={item.active ? "page" : undefined}
            className={({ isActive }) =>
              (item.active ?? isActive)
                ? "workspace-navigation-link is-active"
                : "workspace-navigation-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {actions && <div className="workspace-navigation-actions">{actions}</div>}
    </div>
  );
}
