import { useState, useEffect } from "react";
import {
  LayoutDashboard, Bot, Plug, Workflow, Settings, Zap, LogOut, Share2, Inbox, BarChart3,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgId } from "@/hooks/useOrgId";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Tools", url: "/tools", icon: Plug },
  { title: "Workflows", url: "/workflows", icon: Workflow },
  { title: "Social Media", url: "/social", icon: Share2, badgeKey: "social" as const },
  { title: "Inbox", url: "/inbox", icon: Inbox, badgeKey: "inbox" as const },
  { title: "Rapports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { orgId } = useOrgId();

  const [badges, setBadges] = useState<{ inbox: number; social: number }>({ inbox: 0, social: 0 });

  useEffect(() => {
    if (!orgId) return;
    // Fetch badge counts
    Promise.all([
      (supabase as any).from("email_inbox").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("ai_label", "urgent").in("status", ["unread", "reviewed"]),
      (supabase as any).from("social_posts").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "draft"),
    ]).then(([inboxRes, socialRes]: any[]) => {
      setBadges({
        inbox: inboxRes?.count ?? 0,
        social: socialRes?.count ?? 0,
      });
    });
  }, [orgId, location.pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-blue">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              Agentic OS
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url);
                const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-primary font-semibold"
                      >
                        <div className="relative shrink-0">
                          <item.icon className="h-4 w-4" />
                          {badgeCount > 0 && collapsed && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                              {badgeCount > 9 ? "9+" : badgeCount}
                            </span>
                          )}
                        </div>
                        {!collapsed && (
                          <span className="flex-1 flex items-center justify-between">
                            {item.title}
                            {badgeCount > 0 && (
                              <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px]">
                                {badgeCount}
                              </Badge>
                            )}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        {!collapsed && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Connecté</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
