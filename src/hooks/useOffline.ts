import { useState, useEffect } from 'react';
import offlineDataManager from '@/lib/offlineDataManager';

const useOffline = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingItems, setPendingItems] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Check initial offline status
    const checkOfflineStatus = () => {
      const status = offlineDataManager.getOfflineStatus();
      setIsOffline(status.isOffline);
      setPendingItems(status.pendingItems);
    };

    checkOfflineStatus();

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOffline(false);
      // Trigger sync when back online
      syncData();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll for changes periodically
    const interval = setInterval(() => {
      const status = offlineDataManager.getOfflineStatus();
      if (status.pendingItems !== pendingItems) {
        setPendingItems(status.pendingItems);
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [pendingItems]);

  const syncData = async () => {
    if (!isOffline) {
      setIsSyncing(true);
      try {
        await offlineDataManager.syncWithServer();
      } finally {
        setIsSyncing(false);
      }
    }
  };

  return {
    isOffline,
    pendingItems,
    isSyncing,
    syncData,
  };
};

export default useOffline;
export { useOffline };