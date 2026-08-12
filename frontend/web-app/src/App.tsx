import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
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
import Layout from './components/Layout';

function AppRoutes() {
  const { token, isLoading, isBanned, hydrate } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = location.pathname.startsWith('/login') || location.pathname.startsWith('/register') || location.pathname.startsWith('/forgot-password');
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
        <p style={{ marginTop: 16, color: '#666', fontWeight: 600 }}>Loading Transport System...</p>
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

export default function App() {
  return <AppRoutes />;
}
