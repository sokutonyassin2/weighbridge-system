import { 
  Home, Truck, Scale, Settings, Users, Activity, BarChart3, Clock, 
  FileText, TrendingUp, AlertTriangle, Printer, UserCheck, Shield,
  CreditCard, TimerOff, DollarSign, List, LayoutGrid, Wrench, Package,
  History, Calendar, Send, CheckCircle, FileBarChart, Trash2, Banknote, BookOpen, TrendingDown,
  FileCheck, LogOut, User, Sun, Moon, Menu, Map, ChevronRight, Eye, ClipboardList, Layers
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useEffect, useState } from "react";

const weighbridgeItems = [
  { title: "Dashboard", url: "/weighbridge-dashboard", icon: Scale, roles: ["admin", "super_admin", "operator", "finance"] },
  { title: "New Entry", url: "/entry", icon: Truck, roles: ["admin", "super_admin", "operator"] },
  { title: "Vehicle History", url: "/vehicle-history", icon: History, roles: ["admin", "super_admin", "operator", "finance"] },
  { title: "Pending Weighs", url: "/pending", icon: Clock, roles: ["admin", "super_admin", "operator"] },
  { title: "Completed Vehicles", url: "/completed", icon: CheckCircle, roles: ["admin", "super_admin", "operator", "finance"] },
  { title: "Receipt History", url: "/receipt-history", icon: Printer, roles: ["admin", "super_admin", "operator"] },
  { title: "Cashier", url: "/cashier", icon: DollarSign, roles: ["admin", "super_admin", "operator", "finance", "cashier"] },
  { title: "Procurement Request", url: "/weighbridge-requisitions", icon: Package, roles: ["admin", "super_admin", "operator", "cashier"] },
  { title: "Overdue History", url: "/overdue-history", icon: TimerOff, roles: ["admin", "super_admin", "operator"] },
  { title: "Vehicle Types", url: "/vehicle-types", icon: Settings, roles: ["super_admin"] },

  // Management & Settings items
  { title: "Audit Trail", url: "/audit-trail", icon: FileText, roles: ["super_admin", "observer"] },
  { title: "Shift Reports", url: "/shift-reports", icon: BarChart3, roles: ["admin", "super_admin", "finance"] },
  { title: "Analytics", url: "/analytics", icon: TrendingUp, roles: ["admin", "super_admin", "finance"] },
  { title: "Penalties History", url: "/admin/penalties", icon: AlertTriangle, roles: ["admin", "super_admin", "finance"] },
  { title: "Company Weights", url: "/admin/company-weights", icon: Truck, roles: ["admin", "super_admin", "finance"] },
  { title: "Receipt Settings", url: "/admin/receipt-settings", icon: Settings, roles: ["super_admin"] },
  { title: "Weight Settings", url: "/admin/weight-settings", icon: Scale, roles: ["super_admin"] },
  { title: "All Entries", url: "/all-entries", icon: List, roles: ["super_admin"] },
];

const logisticsItems = [
  { title: "Overview", url: "/logistics", icon: LayoutGrid, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Trip Orders", url: "/logistics/orders", icon: ClipboardList, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Compliance Center", url: "/logistics/compliance", icon: Shield, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin", "procurement_officer"] },
  { title: "Fleet Registry", url: "/logistics/fleet", icon: Truck, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin", "garage_manager"] },
  { title: "Driver Management", url: "/logistics/drivers", icon: UserCheck, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Trip Tracking", url: "/logistics/trips", icon: Send, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Vehicle Reports", url: "/logistics/reports/vehicle", icon: BarChart3, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin", "garage_manager"] },
  { title: "Master Collection", url: "/logistics/masters", icon: Layers, roles: ["logistics_admin", "logistics_manager", "admin", "super_admin"] },
];

const garageItems = [
  { title: "Garage Command", url: "/garage", icon: Wrench, roles: ["mechanic", "admin", "super_admin", "garage_manager", "storekeeper"] },
  { title: "Vehicle Equipment", url: "/garage/equipment", icon: FileCheck, roles: ["mechanic", "admin", "super_admin", "garage_manager", "storekeeper"] },
  { title: "Lifecycle Analytics", url: "/garage/lifecycle", icon: Activity, roles: ["admin", "super_admin", "garage_manager", "finance", "storekeeper"] },
  { title: "Parts & Store", url: "/garage/store", icon: Package, roles: ["mechanic", "admin", "super_admin", "garage_manager", "storekeeper"] },
  { title: "Requisition Logs", url: "/garage/logs", icon: History, roles: ["mechanic", "admin", "super_admin", "garage_manager", "storekeeper"] },
  { title: "Archived / Dustbin", url: "/garage/deleted", icon: Trash2, roles: ["admin", "super_admin", "garage_manager"] },
  { title: "Inventory Reports", url: "/garage/inventory-reports", icon: BarChart3, roles: ["admin", "super_admin"] },
  { title: "Staff Attendance", url: "/garage/attendance", icon: UserCheck, roles: ["mechanic", "admin", "super_admin", "garage_manager", "storekeeper"] },
];

const procurementItems = [
  { title: "Management Approvals", url: "/procurement/approvals", icon: CheckCircle, roles: ["admin", "super_admin"] },
  { title: "Payment Portal", url: "/procurement/cashier-portal", icon: DollarSign, roles: ["admin", "super_admin", "cashier", "procurement_cashier"] },
  { title: "Overview", url: "/procurement", icon: BarChart3, roles: ["admin", "super_admin", "procurement_officer", "finance"] },
  { title: "Procurement Reports", url: "/procurement/reports", icon: FileBarChart, roles: ["admin", "super_admin", "procurement_officer", "cashier", "finance"] },
  { title: "Compliance Centre", url: "/procurement/compliance", icon: Shield, roles: ["admin", "super_admin", "procurement_officer"] },
  { title: "Replaced Parts", url: "/procurement/replaced-parts", icon: Wrench, roles: ["admin", "super_admin"] },
];

const systemItems = [
  { title: "User Management", url: "/user-management", icon: Users, roles: ["super_admin"] },
  { title: "Activity Logs", url: "/activity-logs", icon: Activity, roles: ["super_admin"] },
];

const financeItems = [
  { title: "Trip Sheets", url: "/logistics/tripsheets", icon: DollarSign, roles: ["finance", "logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Trip Invoices", url: "/logistics/invoices", icon: CreditCard, roles: ["finance", "logistics_admin", "logistics_manager", "admin", "super_admin"] },
  { title: "Trip Reconciliation", url: "/logistics/reconciliation", icon: FileCheck, roles: ["finance", "audit_clerk", "super_admin", "admin"] },
  { title: "Logistics P&L", url: "/finance-dashboard", icon: LayoutGrid, roles: ["finance", "admin", "super_admin"] },
  { title: "Accounts Receivable", url: "/finance/receivables", icon: CreditCard, roles: ["finance", "admin", "super_admin"] },
  { title: "Payroll Management", url: "/finance/payroll", icon: Users, roles: ["finance", "admin", "super_admin"] },
  { title: "Company Expenses", url: "/finance/expenses", icon: Banknote, roles: ["finance", "admin", "super_admin"] },
  { title: "Asset Depreciation", url: "/finance/assets", icon: TrendingDown, roles: ["finance", "admin", "super_admin"] },
  { title: "General Ledger", url: "/finance/ledger", icon: BookOpen, roles: ["finance", "admin", "super_admin"] },
  { title: "Reconciliations Review", url: "/finance/reconciliations", icon: FileCheck, roles: ["finance", "admin", "super_admin"] },
];

const getCurrentShift = () => {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 18 ? "Day" : "Night";
};

export function AppSidebar() {
  const { state } = useSidebar();
  const { userRole, userProfile, signOut } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const isCollapsed = state === "collapsed";
  const [currentShift, setCurrentShift] = useState(getCurrentShift());
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentShift(getCurrentShift());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const hasAccess = (itemRoles: string[]) => {
    if (userRole === "super_admin") return true;
    if (!userRole) return false;

    return itemRoles.includes(userRole);
  };

  // Filter sections based on role
  const showWeighbridge = userRole === "super_admin" || userRole === "admin" || userRole === "operator" || userRole === "finance" || userRole === "cashier";
  const showLogistics = userRole === "super_admin" || userRole === "admin" || userRole === "logistics_admin" || userRole === "logistics_manager" || userRole === "garage_manager" || userRole === "audit_clerk";
  const showGarage = userRole === "super_admin" || userRole === "admin" || userRole === "garage_manager" || userRole === "mechanic" || userRole === "storekeeper";
  const showProcurement = userRole === "super_admin" || userRole === "admin" || userRole === "procurement_officer" || userRole === "finance" || userRole === "cashier" || userRole === "procurement_cashier";
  const showObserver = userRole === "super_admin" || userRole === "admin" || userRole === "observer";
  const showSystem = userRole === "super_admin";

  const filteredWeighbridge = weighbridgeItems.filter(item => hasAccess(item.roles));
  const filteredLogistics = logisticsItems.filter(item => hasAccess(item.roles));
  const filteredGarage = garageItems.filter(item => hasAccess(item.roles));
  const filteredProcurement = procurementItems.filter(item => hasAccess(item.roles));
  const filteredSystem = systemItems.filter(item => hasAccess(item.roles));
  const filteredFinance = financeItems.filter(item => hasAccess(item.roles));

  const shiftIcon = currentShift === "Day" ? Sun : Moon;
  const ShiftIcon = shiftIcon;

  return (
    <Sidebar collapsible="icon" className="border-r bg-gradient-to-b from-sidebar to-sidebar/95">
      {/* Header with logo */}
      <div className="h-24 px-4 flex flex-col items-center justify-center border-b border-sidebar-border/50 bg-white shadow-sm">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-3 w-full justify-center">
              <div className="relative w-full flex justify-center">
                <img
                  src="/images/sudsud-energy-logo.png"
                  alt="SudSud Group | Energy Feeds"
                  className="h-10 w-auto object-contain drop-shadow-sm"
                />
              </div>
            </div>
            {/* Environment Indicator Badge */}
            <div className={`mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex flex-col items-center gap-0.5 ${import.meta.env.VITE_USE_MOCK_DATA === 'true'
              ? 'bg-amber-100 text-amber-700 border border-amber-300 animate-pulse'
              : import.meta.env.VITE_SUPABASE_URL?.includes('vsgtvcvzijuehawpodhz')
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${import.meta.env.VITE_USE_MOCK_DATA === 'true'
                  ? 'bg-amber-500'
                  : import.meta.env.VITE_SUPABASE_URL?.includes('vsgtvcvzijuehawpodhz') ? 'bg-green-500' : 'bg-blue-500'
                  }`} />
                {import.meta.env.VITE_USE_MOCK_DATA === 'true'
                  ? '🛡️ Safety Testing Mode'
                  : import.meta.env.VITE_SUPABASE_URL?.includes('vsgtvcvzijuehawpodhz') ? 'Live Production' : 'Staging / QA'}
              </div>
              {import.meta.env.VITE_USE_MOCK_DATA === 'true' && (
                <span className="text-[8px] opacity-70">No data sent to server</span>
              )}
            </div>
          </>
        ) : (
          <div className="relative mx-auto py-4">
            <img
              src="/images/sudsud-logo.png"
              alt="SudSud Group"
              className="h-7 object-contain"
            />
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${import.meta.env.VITE_USE_MOCK_DATA === 'true'
              ? 'bg-amber-500 animate-pulse'
              : import.meta.env.VITE_SUPABASE_URL?.includes('vsgtvcvzijuehawpodhz') ? 'bg-green-500' : 'bg-blue-500'
              }`} title={import.meta.env.VITE_USE_MOCK_DATA === 'true' ? "Safety Testing Mode" : "Live Production"} />
          </div>
        )}
      </div>

      {/* User profile section */}
      {!isCollapsed && (
        <div className="p-4 space-y-3 bg-gradient-to-b from-sidebar-accent/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground font-bold shadow-lg ${userRole === 'super_admin' ? 'bg-gradient-to-br from-purple-600 to-indigo-600' :
              userRole?.includes('logistics') ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                'bg-gradient-to-br from-primary to-primary/70'
              }`}>
              {userProfile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">{userProfile?.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60">@{userProfile?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`pointer-events-none text-white ${userRole === "super_admin" ? "bg-purple-600" :
                userRole === "admin" ? "bg-primary" :
                  userRole?.includes("logistics") ? "bg-amber-500" :
                    "bg-sidebar-accent/50"
                }`}
            >
              {userRole === "super_admin" ? "Super Admin" :
                userRole === "admin" ? "Administrator" :
                  userRole === "operator" ? "Operator" :
                    userRole === "logistics_admin" ? "Logistics Admin" :
                      userRole?.replace("_", " ").toUpperCase()}
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
      <SidebarContent className="px-2 space-y-2">

        {/* COMMAND CENTER SECTION - SUPER ADMIN ONLY */}
        {userRole === "super_admin" && (
          <SidebarGroup className="py-2">
            <SidebarGroupLabel className="px-2 mb-1 font-bold text-[10px] uppercase tracking-[0.2em] text-purple-600/80">
              Command Center
            </SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Global Dashboard">
                  <NavLink
                    to="/admin/dashboard"
                    className={({ isActive }) =>
                      `flex items-center gap-4 px-3 py-4 rounded-xl transition-all duration-300 group ${isActive
                        ? "bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-[0_8px_16px_-6px_rgba(79,70,229,0.5)] scale-[1.02]"
                        : "hover:bg-purple-50 text-sidebar-foreground/80 hover:text-purple-700 border border-transparent hover:border-purple-100"
                      }`
                    }
                  >
                    <LayoutGrid className={`h-5 w-5 stroke-[2.5] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110`} />
                    <span className="font-bold text-sm tracking-tight text-inherit">Superadmin Dashboard</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <Separator className="mt-4 opacity-50" />
          </SidebarGroup>
        )}

        {/* WEIGHBRIDGE SECTION */}
        {showWeighbridge && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <Scale className="mr-2 h-4 w-4" />
                  <span>Weighbridge System</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  {filteredWeighbridge.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                              ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg scale-[1.02]"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            }`
                          }
                        >
                          <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                          <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* LOGISTICS SECTION */}
        {filteredLogistics.length > 0 && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <Truck className="mr-2 h-4 w-4" />
                  <span>Logistics</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  {filteredLogistics.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg scale-[1.02]"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            }`
                          }
                        >
                          <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                          <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* GARAGE SECTION */}
        {filteredGarage.length > 0 && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <Wrench className="mr-2 h-4 w-4" />
                  <span>Garage & Maint.</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                    {filteredGarage.map((item) => {
                      let displayTitle = item.title;
                      if (language === 'sw') {
                        if (item.title === "Vehicle Equipment") displayTitle = "Vifaa vya Gari";
                        if (item.title === "Lifecycle Analytics") displayTitle = "Uchambuzi wa Maisha";
                      }
                      return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild tooltip={displayTitle}>
                          <NavLink
                            to={item.url}
                            className={({ isActive }) =>
                              `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                                ? "bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-lg scale-[1.02]"
                                : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                              }`
                            }
                          >
                            <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                            <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{displayTitle}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      );
                    })}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* PROCUREMENT SECTION */}
        {filteredProcurement.length > 0 && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <DollarSign className="mr-2 h-4 w-4" />
                  <span>Procurement</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  {filteredProcurement.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg scale-[1.02]"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            }`
                          }
                        >
                          <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                          <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* FINANCE SECTION */}
        {filteredFinance.length > 0 && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <DollarSign className="mr-2 h-4 w-4" />
                  <span>Finance & Accounts</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  {filteredFinance.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg scale-[1.02]"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            }`
                          }
                        >
                          <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                          <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* OBSERVER SECTION */}
        {showObserver && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <Activity className="mr-2 h-4 w-4" />
                  <span>Security & Audit</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Guardian Eye">
                      <NavLink
                        to="/guardian-eye"
                        className={({ isActive }) =>
                          `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                            ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg scale-[1.02]"
                            : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                          }`
                        }
                      >
                        <Activity className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                        <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">Guardian Eye</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Audit Trail">
                      <NavLink
                        to="/audit-trail"
                        className={({ isActive }) =>
                          `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                            ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg scale-[1.02]"
                            : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                          }`
                        }
                      >
                        <FileText className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                        <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">Audit Trail</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {/* SYSTEM SECTION - NOW LAST */}
        {showSystem && (
          <Collapsible className="group/collapsible">
            <SidebarGroup className="py-0">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center transition-all hover:bg-sidebar-accent/50 px-2 py-2 rounded-md font-semibold text-sm tracking-wider text-sidebar-foreground/80">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>System Administration</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90 text-amber-500" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarMenu>
                  {filteredSystem.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-4 px-3 py-3 rounded-lg transition-all duration-200 group ${isActive
                              ? "bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-lg scale-[1.02]"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            }`
                          }
                        >
                          <item.icon className={`h-[18px] w-[18px] stroke-[2] transition-transform duration-200 group-hover:scale-110`} />
                          <span className="font-medium text-sm tracking-tight transition-transform duration-200 group-hover:translate-x-1">{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

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
    </Sidebar >
  );
}
