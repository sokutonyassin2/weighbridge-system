import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Wifi, WifiOff } from "lucide-react";
import { useState, useEffect } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingItems, setPendingItems] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for pending offline items in localStorage
    try {
      const offlineData = localStorage.getItem('offline_data_queue');
      if (offlineData) {
        const data = JSON.parse(offlineData);
        setPendingItems(data.filter((item: any) => item.syncStatus === 'pending').length);
      }
    } catch (e) {
      console.error('Error reading offline data:', e);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar handles its own responsive visibility (hidden on desktop, drawer on mobile) */}
        <AppSidebar />

        <div className="flex-1 flex flex-col overflow-auto">
          <header className="sticky top-0 z-40 border-b px-2.5 sm:px-4 md:px-6 py-2.5 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-xs">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              {/* Sidebar trigger works for both desktop collapse and mobile drawer */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <SidebarTrigger className="shrink-0" />
                {/* Search - responsive width */}
                <div className="flex-1 max-w-xl min-w-0">
                  <GlobalSearch />
                </div>
              </div>

              {/* Offline Status Indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isOffline ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold">
                    <WifiOff className="h-3 w-3" />
                    <span className="hidden sm:inline">OFFLINE</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <Wifi className="h-3 w-3 text-emerald-600" />
                    <span className="hidden sm:inline">ONLINE</span>
                  </div>
                )}
                {pendingItems > 0 && (
                  <div className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                    {pendingItems}
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto min-w-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
