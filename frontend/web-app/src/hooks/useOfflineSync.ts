import { useEffect, useState } from 'react';
import { syncService } from '../services/SyncService';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(syncService.getPendingCount());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncService.syncPendingScans();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdate = () => {
      setPendingCount(syncService.getPendingCount());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-scans-updated', handleQueueUpdate);

    // Initial sync check just in case we started online with pending items
    if (navigator.onLine && syncService.getPendingCount() > 0) {
      syncService.syncPendingScans();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-scans-updated', handleQueueUpdate);
    };
  }, []);

  return { isOnline, pendingCount };
}
