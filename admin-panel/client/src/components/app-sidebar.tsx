import { Link, useLocation } from "react-router-dom";
import { Crosshair, MapPinned, Server, type LucideIcon } from "lucide-react";
import { ACTIVE_DUTY_MAPS, mapPath } from "@/lib/maps";
import { NavMain, type SidebarSection } from "@/components/nav-main";
import { NavUser, type SidebarUser } from "@/components/nav-user";
import { SidebarServerStatus, type SidebarServerStatusProps } from "@/components/sidebar-server-status";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

// Adapted from shadcn sidebar-08: nested navigation and account menu.
export function AppSidebar({ user, serverItems, onNavigate, onLogout, dirty, status, operation, unavailable }: {
  user: SidebarUser;
  serverItems: { label: string; path: string; icon: LucideIcon }[];
  onNavigate: () => void;
  onLogout: () => void;
} & Pick<SidebarServerStatusProps, "dirty" | "status" | "operation" | "unavailable">) {
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
    ],
  }];
  if (serverItems.length) sections.push({
    title: "Server",
    url: "/overview",
    icon: Server,
    isActive: serverItems.some(item => location.pathname === item.path),
    items: serverItems.filter(item => item.path !== "/overview").map(item => ({
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
    <Sidebar variant="sidebar" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/maps" onClick={navigate} aria-label="Playbook">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Crosshair aria-hidden="true" />
                </div>
                <div className="grid flex-1 gap-0.5 text-left leading-tight">
                  <span className="truncate font-semibold">Playbook</span>
                  <span className="truncate text-xs">Training & Matches</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sections} onNavigate={navigate} />
      </SidebarContent>
      <SidebarFooter>
        {serverItems.length > 0 && <SidebarServerStatus status={status} operation={operation} unavailable={unavailable} dirty={dirty} canMonitor={user.role === "admin"} onNavigate={navigate} />}
        <NavUser user={user} onLogout={onLogout} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
