import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

/** A titled block of a Server page; links like /operations#logs scroll to it. */
export function PageSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { hash } = useLocation();
  useEffect(() => {
    if (decodeURIComponent(hash.slice(1)) === id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [hash, id]);
  return (
    <section id={id} className="page-section" aria-labelledby={`${id}-title`}>
      <div className="section-heading"><h2 id={`${id}-title`}>{title}</h2></div>
      {children}
    </section>
  );
}
