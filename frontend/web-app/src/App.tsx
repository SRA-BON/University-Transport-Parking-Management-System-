import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import SetNewPassword from './pages/SetNewPassword';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import Recharge from './pages/Recharge';
import Parking from './pages/Parking';
import ParkingProfile from './pages/ParkingProfile';
import AdminDashboard from './pages/AdminDashboard';
import ParkingControllerPage from './pages/ParkingControllerPage';
import ModifyTrip from './pages/ModifyTrip';
import TripTracker from './pages/TripTracker';
import GlobalMap from './pages/GlobalMap';
import Reports from './pages/Reports';
import WalletManager from './pages/WalletManager';
import Layout from './components/Layout';

import { useOfflineSync } from './hooks/useOfflineSync';
import { useFCM } from './hooks/useFCM';

function AppRoutes() {
  const { token, isLoading, isBanned, hydrate } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Mount global offline sync listener
  useOfflineSync();
  // Mount FCM listener
  useFCM();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = location.pathname.startsWith('/login') || location.pathname.startsWith('/register') || location.pathname.startsWith('/forgot-password') || location.pathname.startsWith('/reset-password');
    if (!token && !inAuth) {
      console.log('🚨 No token, redirecting to login from:', location.pathname);
      navigate('/login', { replace: true });
    } else if (token && inAuth) {
      console.log('🏠 Has token, redirecting to dashboard from:', location.pathname);
      navigate('/', { replace: true });
    }
  }, [token, isLoading, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div style={styles.loadingRoot}>
        <img 
          src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png" 
          alt="BRACU Logo" 
          style={{ width: '250px', marginBottom: '24px' }}
        />
        <div className="loading-spinner dark" />
        <p style={{ marginTop: 16, color: '#666', fontWeight: 600 }}>Loading BRACU Safe Ride...</p>
      </div>
    );
  }

  if (isBanned) {
    return (
      <div style={styles.bannedRoot}>
        <div style={styles.crossIcon}>❌</div>
        <h1 style={styles.bannedTitle}>Access Denied</h1>
        <p style={styles.bannedMessage}>
          You have been temporarily suspended from the system. 
          Please contact administration for further support.
        </p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<SetNewPassword />} />

      {/* Full-screen trip tracker page (outside Layout sidebar so map can use full viewport) */}
      <Route path="/trip/:id/track" element={<TripTracker />} />
      <Route path="/global-map" element={<GlobalMap />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/trips/:id/modify" element={<ModifyTrip />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/recharge" element={<Recharge />} />
        <Route path="/parking" element={<Parking />} />
        <Route path="/parking/profile" element={<ParkingProfile />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/wallet-manager" element={<WalletManager />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/parking-controller" element={<ParkingControllerPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingRoot: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#FAFAFA',
  },
  bannedRoot: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111', // Black screen
    color: '#fff',
    padding: '20px',
    textAlign: 'center',
  },
  crossIcon: {
    fontSize: '64px',
    marginBottom: '24px',
  },
  bannedTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#ff4444',
  },
  bannedMessage: {
    fontSize: '16px',
    maxWidth: '400px',
    lineHeight: '1.5',
    color: '#ddd',
  },
};

import React from 'react';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#C62828', fontFamily: 'monospace' }}>
          <h2>React Crashed</h2>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />

    </ErrorBoundary>
  );
}
