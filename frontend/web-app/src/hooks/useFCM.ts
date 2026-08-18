import { useEffect } from 'react';
import { onMessage } from 'firebase/messaging';
import { requestFCMToken, messaging } from '../firebase';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export function useFCM() {
  const { token, user } = useAuthStore();

  useEffect(() => {
    if (!token || !user) return;

    const setupFCM = async () => {
      try {
        const fcmToken = await requestFCMToken();
        if (fcmToken) {
          // Send to backend
          await api.post('/auth/fcm-token', { token: fcmToken, device_type: 'web' });
          console.log('✅ FCM Token successfully registered with backend');
        }

        // Listen for foreground messages
        const msg = await messaging();
        if (msg) {
          onMessage(msg, (payload) => {
            console.log('📨 Received foreground message:', payload);
            
            // Optionally, you can trigger a custom toast notification here
            // using react-hot-toast or similar.
            if (payload.notification) {
              const { title, body } = payload.notification;
              // toast(`${title}: ${body}`);
              // Fallback to native browser notification if allowed:
              if (Notification.permission === 'granted') {
                new Notification(title || 'Notification', { body });
              }
            }
          });
        }

      } catch (err) {
        console.error('Failed to setup FCM:', err);
      }
    };

    setupFCM();
  }, [token, user]);
}
