import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { useRFIDScanner } from '../hooks/useRFIDScanner';
import { useRFIDStore } from '../store/rfidStore';

export default function Layout() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  // Dark/Light Mode Theme Toggle
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Mobile navigation state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    if (confirm('Are you sure you want to sign out?')) {
      signOut();
      navigate('/login', { replace: true });
    }
  };

  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    color: isActive ? '#fff' : 'var(--text-secondary, #555)',
    background: isActive ? 'var(--primary-color, #6C63FF)' : 'transparent',
    transition: 'background 0.15s ease, color 0.15s ease',
  });

  const isManagementStaff = ['super_admin', 'admin', 'manager', 'developer'].includes(user?.role || '');
  const showStudentFeatures = user?.role === 'student';
  const showParkingController = ['super_admin', 'admin', 'manager', 'developer', 'parking_attendant'].includes(user?.role || '');
  const showTripController = ['super_admin', 'admin', 'manager', 'developer', 'bus_attendant'].includes(user?.role || '');

  const sidebarElement = (
    <aside style={{
      ...styles.sidebar,
      ...(isMobile ? {
        position: 'fixed',
        left: isSidebarOpen ? 0 : -280,
        top: 0,
        zIndex: 1000,
        height: '100vh',
        boxShadow: isSidebarOpen ? '0 0 20px rgba(0,0,0,0.2)' : 'none',
        transition: 'left 0.3s ease',
      } : {})
    }}>
      <div style={styles.brand}>
        <div style={styles.brandIcon}>
          <img 
            src="https://www.bracu.ac.bd/sites/default/files/resources/media/bracu_logo_12-0-2022.png" 
            alt="BRACU" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={styles.brandTitle}>Bracu Safe Ride</h1>
        </div>
        {isMobile && (
          <button 
            onClick={() => setIsSidebarOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--text-primary)'
            }}
          >
            ✕
          </button>
        )}
      </div>

      <nav style={styles.nav}>
        <NavLink to="/" end className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🏠 Dashboard</NavLink>

        {showStudentFeatures && (
          <>
            <NavLink to="/explore" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🚍 Find Bus</NavLink>
            <NavLink to="/bookings" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🎫 My Bookings</NavLink>
            <NavLink to="/parking" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🏛️ Parking</NavLink>
            <NavLink to="/recharge" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>💳 Recharge Wallet</NavLink>
          </>
        )}

        {isManagementStaff && (
          <>
            <NavLink to="/admin" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>📋 Admin Panel</NavLink>
            <NavLink to="/wallet-manager" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>💰 Wallet Manager</NavLink>
            <NavLink to="/reports" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>📊 Reports &amp; Analytics</NavLink>
          </>
        )}

        {showTripController && (
          <NavLink to="/explore" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🚍 Trip Controller</NavLink>
        )}
        {showParkingController && (
          <NavLink to="/parking-controller" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>⚙️ Parking Controller</NavLink>
        )}
        {(showTripController || showParkingController) && (
          <NavLink to="/global-map" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>🌍 Global Map</NavLink>
        )}

        <NavLink to="/profile" className="nav-item" style={navLinkStyle} onClick={() => isMobile && setIsSidebarOpen(false)}>👤 Profile</NavLink>
      </nav>

      {/* Theme Toggle Button */}
      <button onClick={toggleTheme} style={styles.themeToggleBtn}>
        {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
      </button>

      <div style={styles.userBox}>
        <div style={styles.userAvatar}>
          {(user?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.userName}>{user?.name || 'User'}</p>
          <p style={styles.userEmail}>{user?.email}</p>
          <p style={styles.userRole}>{user?.role?.toUpperCase()}</p>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn} title="Sign out">
          ⏻
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{
      ...styles.root,
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      {/* Mobile Header */}
      {isMobile && (
        <header style={styles.mobileHeader}>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            style={styles.hamburgerBtn}
          >
            ☰
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🚍</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>BRACU Safe Ride</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
              style={{
                ...styles.mobileThemeBtn,
                transform: isSettingsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              ⚙️
            </button>
            {isSettingsOpen && (
              <div style={styles.mobileSettingsDropdown}>
                <button className="dropdown-item" style={styles.dropdownBtn} onClick={() => { setIsSettingsOpen(false); navigate('/'); }}>🏠 Dashboard</button>
                <button className="dropdown-item" style={styles.dropdownBtn} onClick={() => { setIsSettingsOpen(false); toggleTheme(); }}>{theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}</button>
                <button className="dropdown-item" style={{...styles.dropdownBtn, color: '#e74c3c'}} onClick={() => { setIsSettingsOpen(false); handleLogout(); }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Backdrop for mobile drawer */}
      {isMobile && isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={styles.backdrop}
        />
      )}

      {sidebarElement}

      <main style={{
        ...styles.main,
        padding: isMobile ? '16px' : '32px 40px',
      }}>
        {!showStudentFeatures && <RFIDScannerStatus />}
        <Outlet />
      </main>
    </div>
  );
}

function RFIDScannerStatus() {
  const { plugged, setPlugged } = useRFIDStore();
  const [toast, setToast] = useState<{ name: string; id: string; dept?: string } | null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleScan = useCallback(async (scannedId: string) => {
    setPlugged(true);
    if (toastTimer) clearTimeout(toastTimer);

    try {
      const res = await api.get(`/rfid/lookup?rfid_id=${encodeURIComponent(scannedId)}`);
      const student = res.data?.user || res.data?.student;
      if (student) {
        const info = {
          name: student.name,
          id: student.student_id || student.display_id || scannedId,
          dept: student.department,
        };
        setToast(info);
        const t = setTimeout(() => setToast(null), 5000);
        setToastTimer(t);
      } else {
        setToast({ name: 'Unknown Card', id: scannedId });
        const t = setTimeout(() => setToast(null), 3000);
        setToastTimer(t);
      }
    } catch {
      setToast({ name: 'Card scanned', id: scannedId });
      const t = setTimeout(() => setToast(null), 3000);
      setToastTimer(t);
    }
  }, [toastTimer, setPlugged]);

  useRFIDScanner(handleScan, 50);

  return (
    <>
      <div style={{
        background: plugged ? '#E8F5E9' : '#FFF3E0',
        color: plugged ? '#2E7D32' : '#E65100',
        padding: '8px 16px',
        borderRadius: 8,
        marginBottom: 16,
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${plugged ? '#C8E6C9' : '#FFE0B2'}`
      }}>
        <span>{plugged ? '🟢 RFID scanner: plugged/active' : '🟠 RFID scanner: unplugged/idle'}</span>
      </div>
      {toast && (
        <div style={{
          background: 'linear-gradient(135deg, #1565C0 0%, #42A5F5 100%)',
          color: '#fff',
          padding: '12px 18px',
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 14,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 4px 16px rgba(21,101,192,0.35)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <span style={{ fontSize: 22 }}>📡</span>
          <div>
            <div>Card Scanned: <strong>{toast.name}</strong></div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>ID: {toast.id}{toast.dept ? ` · ${toast.dept}` : ''}</div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  sidebar: {
    width: 280,
    background: 'var(--bg-card, #fff)',
    borderRight: '1px solid var(--border-color, #EAEAEA)',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    position: 'sticky',
    top: 0,
    height: '100vh',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottom: '1px solid var(--border-light, #F0F0F0)',
  },
  brandIcon: {
    width: 48,
    height: 48,
    background: '#fff',
    borderRadius: 8,
    padding: 4,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary, #1A1A1A)',
    marginBottom: 2,
  },
  brandSub: {
    fontSize: 12,
    color: 'var(--text-secondary, #888)',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  themeToggleBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.15s ease',
  },
  userBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    border: '1px solid var(--border-light, #F0F0F0)',
    borderRadius: 12,
    background: 'var(--bg-hover, #FAFAFA)',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'var(--primary-color, #6C63FF)',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
  },
  userName: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary, #1A1A1A)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userEmail: {
    fontSize: 12,
    color: 'var(--text-secondary, #666)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userRole: {
    fontSize: 10,
    color: 'var(--primary-color, #6C63FF)',
    fontWeight: 700,
    marginTop: 2,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: 'none',
    background: 'var(--danger-bg, #FFEBEE)',
    color: 'var(--danger-color, #D32F2F)',
    cursor: 'pointer',
    fontSize: 16,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
  },
  main: {
    flex: 1,
    padding: '32px 40px',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  mobileHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-color)',
    position: 'sticky',
    top: 0,
    zIndex: 999,
  },
  hamburgerBtn: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    padding: 4,
  },
  mobileSettingsDropdown: {
    position: 'absolute',
    top: '120%',
    right: 0,
    background: 'var(--bg-card)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 160,
    zIndex: 2000,
    padding: 8,
    gap: 4
  },
  dropdownBtn: {
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  mobileThemeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.4)',
    zIndex: 999,
  },
};
