import { Scale, Truck, Clock, DollarSign, Settings, List, LogOut, User, Sun, Moon, Activity, Users, FileText, CheckCircle, BarChart3, AlertTriangle, TrendingUp, History, TimerOff, Menu, Printer } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";

const allNavigationItems = [
  { title: "Dashboard", url: "/", icon: Scale, roles: ["admin", "operator"] },
  { title: "New Entry", url: "/entry", icon: Truck, roles: ["operator"] },
  { title: "Vehicle History", url: "/vehicle-history", icon: History, roles: ["admin", "operator"] },
  { title: "Pending Weighs", url: "/pending", icon: Clock, roles: ["admin", "operator"] },
  { title: "Completed Vehicles", url: "/completed", icon: CheckCircle, roles: ["admin", "operator"] },
  { title: "Cashier", url: "/cashier", icon: DollarSign, roles: ["admin", "operator"] },
  { title: "Overdue History", url: "/overdue-history", icon: TimerOff, roles: ["admin", "operator"] },
  { title: "Receipt History", url: "/receipt-history", icon: Printer, roles: ["admin", "operator"] },
  { title: "Audit Trail", url: "/audit-trail", icon: FileText, roles: ["admin"] },
  { title: "Shift Reports", url: "/shift-reports", icon: BarChart3, roles: ["admin"] },
  { title: "Analytics", url: "/analytics", icon: TrendingUp, roles: ["admin"] },
  { title: "Penalties History", url: "/admin/penalties", icon: AlertTriangle, roles: ["admin"] },
  { title: "Company Weights", url: "/admin/company-weights", icon: Truck, roles: ["admin"] },
  { title: "Receipt Settings", url: "/admin/receipt-settings", icon: Settings, roles: ["admin"] },
  { title: "Weight Settings", url: "/admin/weight-settings", icon: Scale, roles: ["admin"] },
  { title: "All Entries", url: "/all-entries", icon: List, roles: ["admin"] },
  { title: "Vehicle Types", url: "/vehicle-types", icon: Settings, roles: ["admin"] },
  { title: "Activity Logs", url: "/activity-logs", icon: Activity, roles: ["admin"] },
  { title: "User Management", url: "/user-management", icon: Users, roles: ["admin"] },
];

const getCurrentShift = () => {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 18 ? "Day" : "Night";
};

export function AppSidebar() {
  const { state } = useSidebar();
  const { userRole, userProfile, signOut } = useAuth();
  const isCollapsed = state === "collapsed";
  const [currentShift, setCurrentShift] = useState(getCurrentShift());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentShift(getCurrentShift());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const navigationItems = allNavigationItems.filter(item =>
    item.roles.includes(userRole || "operator")
  );

  const shiftIcon = currentShift === "Day" ? Sun : Moon;
  const ShiftIcon = shiftIcon;

  return (
    <Sidebar collapsible="icon" className="border-r bg-gradient-to-b from-sidebar to-sidebar/95">
      {/* Header with logo */}
      <div className="h-16 px-4 flex items-center justify-center border-b border-sidebar-border/50 bg-white">
        {!isCollapsed ? (
          <div className="flex items-center gap-3 w-full justify-center">
            <div className="relative w-full flex justify-center">
              <img
                src="/images/sudsud-energy-logo.png"
                alt="SudSud Group | Energy Feeds"
                className="h-12 w-auto object-contain drop-shadow-sm"
              />
            </div>
          </div>
        ) : (
          <div className="relative mx-auto">
            <img
              src="/images/sudsud-logo.png"
              alt="SudSud Group"
              className="h-7 object-contain"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* User profile section */}
      {!isCollapsed && (
        <div className="p-4 space-y-3 bg-gradient-to-b from-sidebar-accent/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold shadow-lg">
              {userProfile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{userProfile?.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60">@{userProfile?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={userRole === "admin" ? "default" : "secondary"}
              className={userRole === "admin"
                ? "bg-gradient-to-r from-primary to-primary/80 shadow-sm"
                : "bg-sidebar-accent/50 text-white hover:text-white pointer-events-none"
              }
            >
              {userRole === "admin" ? "Administrator" : "Operator"}
            </Badge>
          </div>
          <Separator className="bg-sidebar-border/30" />
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-sidebar-accent/30">
            <ShiftIcon className={`h-4 w-4 ${currentShift === "Day" ? "text-amber-500" : "text-indigo-400"}`} />
            <span className="text-sm font-medium text-sidebar-foreground">
              {currentShift} Shift
            </span>
          </div>
        </div>
      )}

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item, index) => (
                <SidebarMenuItem key={item.title} style={{ animationDelay: `${index * 30}ms` }} className="animate-fade-in">
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive
                          ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md"
                          : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                      <span className="font-medium">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/30 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-all duration-200 group"
            >
              <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              <span className="font-medium">Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
