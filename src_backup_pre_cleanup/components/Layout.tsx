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
          <header className="sticky top-0 z-40 border-b px-3 md:px-6 py-3 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm">
            <div className="flex items-center gap-3">
              {/* Sidebar trigger works for both desktop collapse and mobile drawer */}
              <SidebarTrigger />

              {/* Search - responsive width */}
              <div className="flex-1 max-w-xl">
                <GlobalSearch />
              </div>

              {/* Offline Status Indicator */}
              <div className="flex items-center gap-2">
                {isOffline ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive text-destructive-foreground text-xs">
                    <WifiOff className="h-3 w-3" />
                    OFFLINE
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success text-success-foreground text-xs">
                    <Wifi className="h-3 w-3" />
                    ONLINE
                  </div>
                )}
                {pendingItems > 0 && (
                  <div className="px-2 py-1 rounded-md bg-warning text-warning-foreground text-xs">
                    {pendingItems} pending
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
