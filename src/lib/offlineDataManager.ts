// offlineDataManager.ts
// Handles offline data storage and synchronization

interface OfflineDataItem {
  id: string;
  type: 'vehicle_entry' | 'weigh_record' | 'payment' | 'penalty' | 'vehicle_types' | 'user_auth' | 'other';
  operation: 'create' | 'update' | 'delete' | 'read';
  data: any;
  timestamp: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  tableName?: string;
}

class OfflineDataManager {
  private storageKey = 'offline_data_queue';
  private draftKeyPrefix = 'weigh_draft_';
  private syncInterval: number | null = null;

  constructor() {
    this.init();
  }

  private init() {
    // Initialize the offline data storage
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify([]));
    }

    // Start periodic sync when online
    this.startPeriodicSync();
  }

  private getOfflineData(): OfflineDataItem[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading offline data:', error);
      return [];
    }
  }

  private saveOfflineData(data: OfflineDataItem[]) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving offline data:', error);
    }
  }

  addData(item: Omit<OfflineDataItem, 'id' | 'timestamp' | 'syncStatus'>): string {
    const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem: OfflineDataItem = {
      id,
      ...item,
      timestamp: Date.now(),
      syncStatus: 'pending'
    };

    const currentData = this.getOfflineData();
    currentData.push(newItem);
    this.saveOfflineData(currentData);

    return id;
  }

  removeData(id: string) {
    const currentData = this.getOfflineData();
    const updatedData = currentData.filter(item => item.id !== id);
    this.saveOfflineData(updatedData);
  }

  // --- DRAFT MANAGEMENT (Anti-Data Loss) ---
  saveDraft(entryId: string, data: any): void {
    try {
      localStorage.setItem(`${this.draftKeyPrefix}${entryId}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to save draft:', e);
    }
  }

  getDraft(entryId: string): any | null {
    try {
      const item = localStorage.getItem(`${this.draftKeyPrefix}${entryId}`);
      if (!item) return null;
      return JSON.parse(item).data;
    } catch (e) {
      return null;
    }
  }

  clearDraft(entryId: string): void {
    try {
      localStorage.removeItem(`${this.draftKeyPrefix}${entryId}`);
    } catch (e) {
      console.warn('Failed to clear draft:', e);
    }
  }
  // -----------------------------------------

  updateSyncStatus(id: string, status: 'pending' | 'syncing' | 'synced' | 'failed') {
    const currentData = this.getOfflineData();
    const itemIndex = currentData.findIndex(item => item.id === id);

    if (itemIndex !== -1) {
      currentData[itemIndex].syncStatus = status;
      this.saveOfflineData(currentData);
    }
  }

  getPendingItems(): OfflineDataItem[] {
    const allData = this.getOfflineData();
    return allData.filter(item => item.syncStatus === 'pending');
  }

  async syncWithServer(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    const pendingItems = this.getPendingItems();
    if (pendingItems.length === 0) {
      return true; // Nothing to sync
    }

    let allSynced = true;

    for (const item of pendingItems) {
      try {
        this.updateSyncStatus(item.id, 'syncing');

        // Determine the appropriate API endpoint based on item type
        let response;
        let url;
        let options;

        switch (item.type) {
          case 'vehicle_entry':
            url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vehicle_entries`;
            options = {
              method: item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PATCH' : 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
              },
              body: JSON.stringify(item.data)
            };
            break;

          case 'weigh_record':
            url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/weigh_records`;
            options = {
              method: item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PATCH' : 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
              },
              body: JSON.stringify(item.data)
            };
            break;

          case 'payment':
            url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/payments`;
            options = {
              method: item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PATCH' : 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
              },
              body: JSON.stringify(item.data)
            };
            break;

          case 'penalty':
            url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/penalties`;
            options = {
              method: item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PATCH' : 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
              },
              body: JSON.stringify(item.data)
            };
            break;

          default:
            url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${item.tableName}`;
            options = {
              method: item.operation === 'create' ? 'POST' : item.operation === 'update' ? 'PATCH' : 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token') || ''}`
              },
              body: JSON.stringify(item.data)
            };
        }

        response = await fetch(url, options);

        if (response.ok) {
          this.updateSyncStatus(item.id, 'synced');
          this.removeData(item.id); // Remove successfully synced item
        } else {
          console.error(`Sync failed for item ${item.id}:`, response.status, response.statusText);
          this.updateSyncStatus(item.id, 'failed');
          allSynced = false;
        }
      } catch (error) {
        console.error(`Error syncing item ${item.id}:`, error);
        this.updateSyncStatus(item.id, 'failed');
        allSynced = false;
      }
    }

    return allSynced;
  }

  private startPeriodicSync() {
    // Check for online status every 30 seconds and sync if back online
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine) {
        this.syncWithServer();
      }
    }, 30000); // Check every 30 seconds
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  getOfflineStatus(): { isOffline: boolean; pendingItems: number } {
    const isOffline = !navigator.onLine;
    const pendingItems = this.getPendingItems().length;

    return { isOffline, pendingItems };
  }

  // Method to handle Supabase operations when offline
  async handleOfflineOperation(
    type: 'vehicle_entry' | 'weigh_record' | 'payment' | 'penalty' | 'vehicle_types' | 'user_auth' | 'other',
    operation: 'create' | 'update' | 'delete' | 'read',
    data: any,
    tableName?: string
  ): Promise<{ success: boolean; offlineId?: string; error?: string }> {
    if (navigator.onLine) {
      // If online, try to perform the operation directly
      try {
        // This would be handled by the regular Supabase client
        // For now, return success to allow the regular flow
        return { success: true };
      } catch (error) {
        // If online operation fails, store offline
        const offlineId = this.addData({ type, operation, data, tableName });
        return { success: false, offlineId, error: 'Online operation failed, stored offline' };
      }
    } else {
      // If offline, store the operation
      const offlineId = this.addData({ type, operation, data, tableName });
      return { success: false, offlineId, error: 'Stored offline, will sync when online' };
    }
  }

  // Cache critical data for offline use
  cacheCriticalData(type: 'vehicle_types' | 'user_auth', data: any): void {
    try {
      const cacheKey = `offline_cache_${type}`;
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // Cache for 24 hours
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching critical data:', error);
    }
  }

  // Get cached critical data
  getCachedData(type: 'vehicle_types' | 'user_auth'): any {
    try {
      const cacheKey = `offline_cache_${type}`;
      const cachedData = localStorage.getItem(cacheKey);

      if (!cachedData) return null;

      const parsedData = JSON.parse(cachedData);

      // Check if cache has expired
      if (parsedData.expiresAt && Date.now() > parsedData.expiresAt) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return parsedData.data;
    } catch (error) {
      console.error('Error getting cached critical data:', error);
      return null;
    }
  }

  // Update cached data if online
  async updateCachedData(type: 'vehicle_types' | 'user_auth', fetchFunction: () => Promise<any>): Promise<any> {
    if (navigator.onLine) {
      try {
        const freshData = await fetchFunction();
        this.cacheCriticalData(type, freshData);
        return freshData;
      } catch (error) {
        console.error(`Error updating cached ${type}:`, error);
        // Return cached data if available
        return this.getCachedData(type) || null;
      }
    } else {
      // If offline, return cached data
      return this.getCachedData(type) || null;
    }
  }

  private async syncServiceWorkerQueue(): Promise<boolean> {
    const swOfflineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');

    if (swOfflineQueue.length === 0) {
      return true;
    }

    let allSynced = true;

    for (const request of swOfflineQueue) {
      try {
        // Reconstruct headers from array
        const headers = new Headers();
        request.headers.forEach(([key, value]) => {
          headers.append(key, value);
        });

        const response = await fetch(request.url, {
          method: request.method,
          headers: headers,
          body: request.body
        });

        if (response.ok) {
          // Remove from queue
          const updatedQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
          const index = updatedQueue.findIndex(item => item.timestamp === request.timestamp);
          if (index !== -1) {
            updatedQueue.splice(index, 1);
            localStorage.setItem('offlineQueue', JSON.stringify(updatedQueue));
          }
        } else {
          console.error('Failed to sync SW queue item:', response.status, response.statusText);
          allSynced = false;
        }
      } catch (error) {
        console.error('Error syncing SW queue item:', error);
        allSynced = false;
      }
    }

    return allSynced;
  }
}

export default new OfflineDataManager();