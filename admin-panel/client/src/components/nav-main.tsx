import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export type SidebarSection = {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive: boolean;
  defaultOpen?: boolean;
  items: { title: string; url: string; isActive: boolean; icon?: LucideIcon }[];
};

function NavSection({ item, onNavigate }: { item: SidebarSection; onNavigate: () => void }) {
  const activeChild = item.items.find(child => child.isActive)?.url;
  const [open, setOpen] = useState(item.defaultOpen || item.isActive);
  const Icon = item.icon;
  const parentActive = item.isActive && !activeChild;

  // Reveal the destination when navigation originates in the page or browser history.
  useEffect(() => {
    if (item.isActive) setOpen(true);
  }, [item.isActive, activeChild]);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.title} isActive={parentActive}>
          <Link to={item.url} onClick={onNavigate} aria-current={parentActive ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="data-[state=open]:rotate-90" aria-label={`${item.title}-Unterpunkte ein-/ausblenden`}>
            <ChevronRight aria-hidden="true" />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items.map(child => {
              const ChildIcon = child.icon;
              return (
                <SidebarMenuSubItem key={child.url}>
                  <SidebarMenuSubButton asChild isActive={child.isActive}>
                    <Link to={child.url} onClick={onNavigate} aria-current={child.isActive ? "page" : undefined}>
                      {ChildIcon && <ChildIcon aria-hidden="true" />}
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function NavMain({ items, onNavigate }: { items: SidebarSection[]; onNavigate: () => void }) {
  return (
    <SidebarGroup>
      <nav aria-label="Hauptnavigation">
        <SidebarMenu className="gap-1">
          {items.map(item => <NavSection key={item.title} item={item} onNavigate={onNavigate} />)}
        </SidebarMenu>
      </nav>
    </SidebarGroup>
  );
}
