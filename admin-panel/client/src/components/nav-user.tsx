import { accessOf, ROLE_CATALOG, type Actor } from "../../../shared/authorization";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

export type SidebarUser = Actor;

export function NavUser({ user, onLogout }: { user: SidebarUser; onLogout: () => void }) {
  const { isMobile } = useSidebar();
  const name = user.name || user.identitySteam64;
  const access = accessOf(user);
  const role = [access.platform, access.server].filter(id => id !== "none").map(id => ROLE_CATALOG.find(role => role.id === id)?.name).join(" · ");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={`Kontomenü für ${name}`}>
              <Avatar><AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
              <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs">{role}</span>
              </div>
              <ChevronsUpDown className="ml-auto" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "top" : "right"} align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{name}</DropdownMenuLabel>
              <DropdownMenuLabel>{user.identitySteam64}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onLogout}><LogOut aria-hidden="true" />Abmelden</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
