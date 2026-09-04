import { useEffect } from 'react';
import { onMessage } from 'firebase/messaging';
import { requestFCMToken, messaging } from '../firebase';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

export function useFCM() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();

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

            const data = payload.data || {};
            const notification = payload.notification;
            let navPath: string | null = null;

            if (data.type === 'trip_tracking') {
              if (data.tripId) {
                navPath = `/trip/${data.tripId}/track`;
              } else if (data.link) {
                try {
                  const url = new URL(data.link);
                  navPath = url.pathname + url.search;
                } catch (_) {
                  navPath = data.link;
                }
              } else if (data.click_action) {
                try {
                  const url = new URL(data.click_action);
                  navPath = url.pathname + url.search;
                } catch (_) {
                  navPath = data.click_action;
                }
              }
            }

            if (notification) {
              const { title, body } = notification;
              if (Notification.permission === 'granted') {
                const opts: NotificationOptions = {
                  body: body || '',
                  icon: 'https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png',
                  badge: 'https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png',
                  tag: data.type || 'transport-notification',
                  data: { ...data, navPath },
                  requireInteraction: data.type === 'trip_tracking',
                };
                try {
                  const n = new Notification(title || 'Notification', opts);
                  n.onclick = (event) => {
                    event.preventDefault();
                    window.focus();
                    const target = (event.target as any)?.data?.navPath || navPath;
                    if (target) {
                      if (target.startsWith('http')) {
                        window.open(target, '_blank');
                      } else {
                        navigate(target);
                      }
                    }
                    n.close();
                  };
                } catch (e) {
                  console.error('Failed to show notification:', e);
                }
              }
            } else if (navPath) {
              // Data-only notification: auto-navigate to tracker
              setTimeout(() => navigate(navPath!), 500);
            }
          });
        }
      } catch (err) {
        console.error('Failed to setup FCM:', err);
      }
    };

    setupFCM();
  }, [token, user, navigate]);
}
