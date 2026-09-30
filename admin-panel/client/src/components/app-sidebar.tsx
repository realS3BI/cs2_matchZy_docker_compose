import { Link, useLocation } from "react-router-dom";
import { Crosshair, MapPinned, Server, type LucideIcon } from "lucide-react";
import { ACTIVE_DUTY_MAPS, mapPath } from "@/lib/maps";
import { NavMain, type SidebarSection } from "@/components/nav-main";
import { NavUser, type SidebarUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

// Adapted from shadcn sidebar-08: inset layout, nested navigation and account menu.
export function AppSidebar({ user, serverItems, onNavigate, onLogout, dirty, serviceState }: {
  user: SidebarUser;
  serverItems: { label: string; path: string; icon: LucideIcon }[];
  onNavigate: () => void;
  onLogout: () => void;
  dirty: boolean;
  serviceState?: string;
}) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const isLibrary = location.pathname === "/nades";
  const sections: SidebarSection[] = [{
    title: "Maps",
    url: "/maps",
    icon: MapPinned,
    isActive: isLibrary || location.pathname.startsWith("/maps"),
    defaultOpen: true,
    items: [
      ...ACTIVE_DUTY_MAPS.map(map => ({
        title: map.name,
        url: mapPath(map),
        isActive: location.pathname === mapPath(map) || location.pathname.startsWith(`${mapPath(map)}/`),
      })),
      { title: "All Maps", url: "/maps", isActive: location.pathname === "/maps" },
    ],
  }];
  if (serverItems.length) sections.push({
    title: "Server",
    url: "/overview",
    icon: Server,
    isActive: serverItems.some(item => location.pathname === item.path),
    items: serverItems.map(item => ({
      title: item.label,
      url: item.path,
      icon: item.icon,
      isActive: location.pathname === item.path,
    })),
  });

  function navigate() {
    setOpenMobile(false);
    onNavigate();
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/maps" onClick={navigate} aria-label="MatchZy Nade-Bibliothek">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Crosshair aria-hidden="true" />
                </div>
                <div className="grid flex-1 gap-0.5 text-left leading-tight">
                  <span className="truncate font-semibold">MatchZy</span>
                  <span className="truncate text-xs">Nades & Maps</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sections} onNavigate={navigate} />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        {serverItems.length > 0 && <p className="px-2 pt-1 text-xs text-muted-foreground" role="status">
          {dirty ? "Ungespeicherte Servereinstellungen" : serviceState === "running" ? "Server läuft" : serviceState ? "Server gestoppt" : "Serververwaltung verfügbar"}
        </p>}
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
