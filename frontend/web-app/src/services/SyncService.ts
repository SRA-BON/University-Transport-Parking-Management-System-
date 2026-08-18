import api from './api';

export interface OfflineScan {
  id: string;
  type: 'bus' | 'parking_entry' | 'parking_exit';
  rfid_id: string;
  trip_id?: number;
  timestamp: string;
}

const STORAGE_KEY = 'transport_offline_scans';

class SyncService {
  private getQueue(): OfflineScan[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: OfflineScan[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    // Dispatch a custom event so hooks can re-render immediately
    window.dispatchEvent(new Event('offline-scans-updated'));
  }

  addScan(scan: Omit<OfflineScan, 'id' | 'timestamp'>) {
    const queue = this.getQueue();
    queue.push({
      ...scan,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString()
    });
    this.saveQueue(queue);
  }

  getPendingCount(): number {
    return this.getQueue().length;
  }

  async syncPendingScans() {
    if (!navigator.onLine) return;

    const queue = this.getQueue();
    if (queue.length === 0) return;

    console.log(`🔄 Attempting to sync ${queue.length} offline scans...`);
    const remainingQueue: OfflineScan[] = [];

    for (const scan of queue) {
      try {
        if (scan.type === 'bus') {
          await api.post('/bookings/rfid/gate-scan', { rfid_id: scan.rfid_id, trip_id: scan.trip_id, device: 'offline_sync' });
        } else if (scan.type === 'parking_entry') {
          await api.post('/rfid/parking/entry', { rfid_id: scan.rfid_id, device: 'offline_sync' });
        } else if (scan.type === 'parking_exit') {
          await api.post('/rfid/parking/exit', { rfid_id: scan.rfid_id, device: 'offline_sync' });
        }
        console.log(`✅ Synced scan ${scan.id} (${scan.type})`);
      } catch (err: any) {
        console.error(`❌ Failed to sync scan ${scan.id}:`, err?.response?.data || err.message);
        // Keep it in the queue if it's a network error. 
        // If it's a 4xx error (e.g., RFID not found, No seats), we should probably discard it to prevent infinite loop.
        if (!err.response || err.response.status >= 500) {
          remainingQueue.push(scan);
        }
      }
    }

    this.saveQueue(remainingQueue);
  }
}

export const syncService = new SyncService();
