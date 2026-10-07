import { NavLink } from "react-router-dom";

/** Route links remain usable with browser history, modifier clicks and keyboard navigation. */
export function WorkspaceNavigation({
  label,
  items,
}: {
  label: string;
  items: { label: string; path: string; active?: boolean }[];
}) {
  return (
    <nav className="workspace-navigation" aria-label={label}>
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
  );
}
