import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useRFIDStore } from '../store/rfidStore';

interface LocationData {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed_kmh: number | null;
  accuracy_meters: number | null;
  last_updated: string;
}

interface TripData {
  id: number;
  route_name?: string;
  bus_number?: string;
  departure_time: string;
  arrival_time?: string;
  status: string;
  route_id?: number;
  bus_id?: number;
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}
type GMapStyleArray = Array<{ elementType?: string; featureType?: string; stylers: Array<Record<string, any>> }>;
type GMapSymbol = {
  path: string | number;
  scale?: number;
  anchor?: any;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  rotation?: number;
  labelOrigin?: any;
};

declare global {
  interface Window {
    google: any;
    initGoogleMap?: () => void;
  }
}

const DEFAULT_DHKA_LAT = 23.8103;
const DEFAULT_DHKA_LNG = 90.4125;
const DEFAULT_ZOOM = 14;
const POLL_INTERVAL_MS = 7000;

export default function TripTracker() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isStaffUpdate = ['super_admin', 'admin', 'manager', 'developer', 'bus_attendant'].includes(user?.role || '');

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any | null>(null);
  const busMarker = useRef<any | null>(null);
  const accuracyCircle = useRef<any | null>(null);
  const routePolyline = useRef<any | null>(null);
  const locationHistory = useRef<LatLngLiteral[]>([]);
  const recenterRequested = useRef<boolean>(false);

  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [trip, setTrip] = useState<TripData | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pegmanActive, setPegmanActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string; detail?: string } | null>(null);

  const { setActiveHandler } = useRFIDStore();

  const showMessage = (type: 'success' | 'error' | 'warning', text: string, detail?: string) => {
    setScanMessage({ type, text, detail });
    setTimeout(() => setScanMessage(null), 6000);
  };

  const handleGateScan = useCallback(async (rfidId: string) => {
    if (!id) return;
    try {
      const res = await api.post('/bookings/rfid/gate-scan', { rfid_id: rfidId, trip_id: id });
      const s = res.data;
      if (s.success) {
        showMessage('success', `Gate scan successful for ${s.student?.name}`, `Student ID: ${s.student?.student_id}`);
      }
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || err.response?.data?.error || `Failed to process scan`);
    }
  }, [id]);

  useEffect(() => {
    // Only register the handler if we're a staff member managing this trip
    if (isStaffUpdate && trip?.status === 'in_progress') {
      setActiveHandler(handleGateScan);
    } else {
      setActiveHandler(null);
    }
    return () => setActiveHandler(null);
  }, [isStaffUpdate, trip?.status, handleGateScan, setActiveHandler]);

  const VITE_GOOGLE_MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

  const loadGoogleMapsScript = useCallback(() => {
    if (!(window as any).__gmAuthFailureInstalled) {
      (window as any).__gmAuthFailureInstalled = true;
      window.addEventListener('error', (ev: any) => {
        const msg = String(ev?.message || ev?.error?.message || '');
        if (/ApiNotActivatedMapError|InvalidKeyMapError|RefererNotAllowedMapError|BillingNotEnabledMapError|QuotaExceededMapError|RequestDeniedMapError|MissingKeyMapError/.test(msg)) {
          setErrorMsg(`Google Maps Error: ${msg}. Fix in Google Cloud Console → Credentials → API key restrictions.`);
        }
      });
    }

    const isReady = () => !!(window.google && window.google.maps && typeof (window.google.maps as any).Map === 'function');
    if (isReady()) {
      setScriptLoaded(true);
      return;
    }

    let scriptEl: HTMLScriptElement | null = document.getElementById('google-maps-script') as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = 'google-maps-script';
      scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${VITE_GOOGLE_MAPS_KEY || ''}&libraries=geometry&v=quarterly`;
      scriptEl.async = true;
      scriptEl.defer = true;
      scriptEl.onerror = () => setErrorMsg('Failed to load Google Maps script (network error or blocked by extension).');
      document.head.appendChild(scriptEl);
    }

    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (isReady()) {
        clearInterval(poll);
        setScriptLoaded(true);
      } else if (attempts > 300) {
        clearInterval(poll);
        setErrorMsg('Google Maps failed to initialize after 30s. Open DevTools (F12) → Console for the specific error (likely API key restriction, billing not enabled, or Maps JavaScript API not activated in Google Cloud Console).');
      }
    }, 100);
  }, [VITE_GOOGLE_MAPS_KEY]);

  useEffect(() => {
    loadGoogleMapsScript();
  }, [loadGoogleMapsScript]);

  const fetchTripAndLocation = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/trips/${id}/location`);
      setTrip(res.data.trip);
      setLocation(res.data.location);
      setErrorMsg(null);
      setLastRefresh(new Date());
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error || e.message || 'Failed to load trip location');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTripAndLocation();
    const iv = setInterval(fetchTripAndLocation, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchTripAndLocation]);

  const getThemeStyles = (): GMapStyleArray => {
    const isDark = document.body.classList.contains('dark-theme');
    if (!isDark) return [];
    return [
      { elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1e1e1e' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#a0a0a0' }] },
      { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c0c0c0' }] },
      { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#888' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1b2c1c' }] },
      { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#81c784' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#333' }] },
      { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#999' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#444' }] },
      { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14222c' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#64b5f6' }] },
    ];
  };

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google || !window.google.maps) return;
    if (mapInstance.current) return;

    const lat = location?.latitude ?? DEFAULT_DHKA_LAT;
    const lng = location?.longitude ?? DEFAULT_DHKA_LNG;

    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: DEFAULT_ZOOM,
      disableDefaultUI: true,
      zoomControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      styles: getThemeStyles(),
    });

    mapInstance.current.addListener('zoom_changed', () => {
      if (mapInstance.current) setZoom(mapInstance.current.getZoom() as number);
    });

    mapInstance.current.addListener('dragend', () => {
      setIsFollowing(false);
    });

    const streetView = mapInstance.current.getStreetView();
    streetView.addListener('visible_changed', () => {
      setPegmanActive(streetView.getVisible());
    });
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (scriptLoaded) initMap();
  }, [scriptLoaded, initMap]);

  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps) return;
    mapInstance.current.setOptions({ styles: getThemeStyles() });
  }, [scriptLoaded]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const createBusIcon = (heading: number | null): GMapSymbol => {
    const rotation = heading != null && !isNaN(Number(heading)) ? Number(heading) : 0;
    return {
      path: 'M12 2L4 8v12h16V8l-8-6zm0 2.5L17.5 9h-11L12 4.5zM6 11v7h2v-7H6zm4 0v7h4v-7h-4zm6 0v7h2v-7h-2z',
      fillColor: '#6C63FF',
      fillOpacity: 1,
      scale: 2.2,
      anchor: new window.google.maps.Point(12, 12),
      strokeColor: '#fff',
      strokeWeight: 1.5,
      rotation,
    };
  };

  useEffect(() => {
    if (!mapInstance.current || !window.google?.maps || !location) return;
    const { latitude, longitude, heading, accuracy_meters } = location;
    const latLng = { lat: Number(latitude), lng: Number(longitude) };

    if (!busMarker.current) {
      busMarker.current = new window.google.maps.Marker({
        map: mapInstance.current,
        position: latLng,
        title: 'Bus Location',
        icon: createBusIcon(heading),
        animation: window.google.maps.Animation.DROP,
      });
    } else {
      busMarker.current.setPosition(latLng);
      busMarker.current.setIcon(createBusIcon(heading));
    }

    if (accuracy_meters != null) {
      const radiusMeters = Math.max(Number(accuracy_meters), 10);
      if (!accuracyCircle.current) {
        accuracyCircle.current = new window.google.maps.Circle({
          map: mapInstance.current,
          center: latLng,
          radius: radiusMeters,
          strokeColor: '#6C63FF',
          strokeOpacity: 0.5,
          strokeWeight: 1,
          fillColor: '#6C63FF',
          fillOpacity: 0.08,
        });
      } else {
        accuracyCircle.current.setCenter(latLng);
        accuracyCircle.current.setRadius(radiusMeters);
      }
    }

    locationHistory.current.push(latLng);
    if (locationHistory.current.length > 150) locationHistory.current.shift();
    if (locationHistory.current.length >= 2) {
      if (!routePolyline.current) {
        routePolyline.current = new window.google.maps.Polyline({
          map: mapInstance.current,
          path: locationHistory.current,
          geodesic: true,
          strokeColor: '#6C63FF',
          strokeOpacity: 0.6,
          strokeWeight: 4,
        });
      } else {
        routePolyline.current.setPath(locationHistory.current);
      }
    }

    if (isFollowing || recenterRequested.current) {
      recenterRequested.current = false;
      mapInstance.current.panTo(latLng);
    }
  }, [location, scriptLoaded, isFollowing]);

  const handleZoomIn = () => {
    if (!mapInstance.current) return;
    mapInstance.current.setZoom(Math.min((mapInstance.current.getZoom() as number) + 1, 20));
  };
  const handleZoomOut = () => {
    if (!mapInstance.current) return;
    mapInstance.current.setZoom(Math.max((mapInstance.current.getZoom() as number) - 1, 3));
  };
  const handleRecenter = () => {
    if (!mapInstance.current || !location) return;
    recenterRequested.current = true;
    setIsFollowing(true);
    mapInstance.current.panTo({
      lat: Number(location.latitude),
      lng: Number(location.longitude),
    });
  };

  const handleToggleFullscreen = () => {
    if (!mapRef.current) return;
    const el = mapRef.current;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleTogglePegman = () => {
    if (!mapInstance.current || !window.google?.maps) return;
    const streetView = mapInstance.current.getStreetView();
    if (streetView.getVisible()) {
      streetView.setVisible(false);
      setPegmanActive(false);
    } else if (location) {
      streetView.setPosition({
        lat: Number(location.latitude),
        lng: Number(location.longitude),
      });
      streetView.setPov({ heading: Number(location.heading ?? 0), pitch: 0 });
      streetView.setVisible(true);
      setPegmanActive(true);
    }
  };

  const minsAgo = (dt?: string | Date) => {
    if (!dt) return '';
    const d = new Date(dt);
    const seconds = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (seconds < 60) return `${Math.round(seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'in_progress': return { bg: '#E3F2FD', color: '#1565C0' };
      case 'scheduled':   return { bg: '#E8F5E9', color: '#2E7D32' };
      case 'completed':   return { bg: '#F5F5F5', color: '#666' };
      case 'cancelled':   return { bg: '#FFEBEE', color: '#C62828' };
      case 'delayed':     return { bg: '#FFF8E1', color: '#b78103' };
      default:            return { bg: '#F5F5F5', color: '#666' };
    }
  };

  // Real-time GPS tracking for staff
  useEffect(() => {
    if (!isStaffUpdate || !id || trip?.status !== 'in_progress') return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        api.post(`/trips/${id}/location`, {
          latitude,
          longitude,
          heading: heading ?? null,
          speedKmh: speed != null ? speed * 3.6 : null,
          accuracyMeters: accuracy,
        }).catch(e => console.error('Failed to post GPS:', e));
      },
      (err) => console.error('GPS tracking error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isStaffUpdate, id, trip?.status]);

  return (
    <div className="app-page" style={{ padding: 0, height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <style>{`
        @media (max-width: 768px) {
          .trip-controls-stack > button,
          .trip-controls-stack > div {
            transform: scale(0.88);
            transform-origin: top right;
          }
          .trip-controls-stack {
            gap: 4px !important;
          }
        }
        @media (max-width: 480px) {
          .trip-controls-stack > button,
          .trip-controls-stack > div {
            transform: scale(0.82);
          }
          .trip-controls-stack {
            gap: 2px !important;
            right: 8px !important;
            top: 8px !important;
          }
        }
        @media (max-height: 600px) {
          .trip-controls-stack {
            bottom: calc(30vh + 8px) !important;
            max-height: calc(100% - 16px - 30vh - 8px) !important;
          }
        }
      `}</style>
      <header style={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={styles.iconBtn}
            title="Back"
          >
            ←
          </button>
          <div>
            <h2 style={styles.heading}>🚌 Live Trip Tracker</h2>
            <p style={styles.subTitle}>
              {trip ? (
                <>
                  {trip.route_name || `Trip #${trip.id}`} · {trip.bus_number || 'Bus'}
                </>
              ) : 'Loading trip info...'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {trip && (
            <span style={{
              padding: '6px 12px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 12,
              textTransform: 'capitalize',
              background: statusBadgeColor(trip.status).bg,
              color: statusBadgeColor(trip.status).color,
            }}>
              {String(trip.status || '').replace('_', ' ')}
            </span>
          )}
          {lastRefresh && (
            <span style={styles.refreshTag}>
              {loading ? <><span className="loading-spinner dark" style={{ width: 12, height: 12, borderWidth: 2 }} /> Syncing…</> : `✅ Updated ${minsAgo(lastRefresh)}`}
            </span>
          )}
          {isStaffUpdate && trip?.status === 'in_progress' && (
            <span style={{ ...styles.refreshTag, background: '#E3F2FD', color: '#1565C0', border: '1px solid #90CAF9' }}>
              📍 Broadcasting Live GPS
            </span>
          )}
        </div>
      </header>



      {errorMsg && (
        <div style={styles.errorBanner}>
          ⚠️ {errorMsg}
          <button onClick={fetchTripAndLocation} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      {scanMessage && (
        <div style={{
          padding: '14px 18px', margin: '10px 16px', borderRadius: 12, fontWeight: 600,
          background: scanMessage.type === 'success' ? '#E8F5E9' : scanMessage.type === 'warning' ? '#FFF8E1' : '#FFEBEE',
          color: scanMessage.type === 'success' ? '#2E7D32' : scanMessage.type === 'warning' ? '#E65100' : '#C62828',
          border: `1px solid ${scanMessage.type === 'success' ? '#A5D6A7' : scanMessage.type === 'warning' ? '#FFCC80' : '#EF9A9A'}`,
          position: 'absolute', top: 80, left: 0, right: 0, zIndex: 100
        }}>
          <div>{scanMessage.text}</div>
          {scanMessage.detail && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{scanMessage.detail}</div>}
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />

        {loading && !trip && (
          <div style={styles.mapOverlay}>
            <div className="loading-spinner dark" style={{ width: 36, height: 36, borderWidth: 4 }} />
            <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Loading map and trip data…</p>
          </div>
        )}

        {!location && !loading && (
          <div style={styles.mapOverlay}>
            <div style={{ fontSize: 48 }}>🕒</div>
            <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontWeight: 700, fontSize: 15 }}>
              Location stream not started yet.
            </p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 4 }}>
              GPS updates will appear once the bus driver begins the journey.
            </p>
          </div>
        )}

        {!VITE_GOOGLE_MAPS_KEY && (
          <div style={styles.apiKeyBanner}>
            🔑 Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your frontend <code>.env</code> to load Google Map tiles.
          </div>
        )}

        {/* Auto-follow toggle — top-left corner of map */}
        <div style={styles.followToggleWrap}>
          <label style={styles.followToggle}>
            <input
              type="checkbox"
              checked={isFollowing}
              onChange={(e) => setIsFollowing(e.target.checked)}
            />
            <span>Auto-follow bus</span>
          </label>
        </div>

        {/* Custom map controls — top-right, correct order, mobile-safe */}
        <div
          style={{
            ...styles.mapControls,
            ...(trip
              ? {}
              : { bottom: 12, maxHeight: 'calc(100% - 24px)' }),
          }}
          className="trip-controls-stack"
        >
          <button onClick={handleToggleFullscreen} style={styles.ctrlBtn} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button onClick={handleZoomIn} style={styles.ctrlBtn} title="Zoom In (Camera +)">
            ＋
          </button>
          <button onClick={handleZoomOut} style={styles.ctrlBtn} title="Zoom Out (Camera −)">
            −
          </button>
          <div style={styles.zoomBadge}>z{zoom}</div>
          <button
            onClick={handleTogglePegman}
            style={{
              ...styles.ctrlBtn,
              background: pegmanActive ? 'var(--primary-color)' : undefined,
              color: pegmanActive ? '#fff' : undefined,
              borderColor: pegmanActive ? 'var(--primary-color)' : undefined,
            }}
            title={pegmanActive ? 'Exit Street View' : 'Street View (Pegman)'}
          >
            🚶
          </button>
          <button onClick={handleRecenter} style={styles.ctrlBtn} title="Recenter on Bus">
            ⌖
          </button>
        </div>
      </div>

      {/* Info card — outside map, below it, never overlaps controls */}
      {trip && (
        <div style={styles.infoCard}>
          <div style={styles.infoCardHeader}>
            <span style={{ fontSize: 22 }}>🚌</span>
            <div style={{ flex: 1 }}>
              <div style={styles.busNumber}>{trip?.bus_number || '—'}</div>
              <div style={styles.routeName}>{trip?.route_name || `Trip #${trip?.id}`}</div>
            </div>
            <Link to="/bookings" style={{ textDecoration: 'none' }}>
              <button style={styles.viewBookingsBtn}>🎫 View Booking</button>
            </Link>
          </div>

          <div style={styles.infoGrid}>
            <InfoCell label="Departure" value={trip?.departure_time ? new Date(trip.departure_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'} />
            <InfoCell
              label="Speed"
              value={location?.speed_kmh != null ? `${Number(location.speed_kmh).toFixed(0)} km/h` : '—'}
            />
            <InfoCell
              label="Accuracy"
              value={location?.accuracy_meters != null ? `±${Number(location.accuracy_meters).toFixed(0)} m` : '—'}
            />
            <InfoCell
              label="Coordinates"
              value={location ? `${Number(location.latitude).toFixed(4)}, ${Number(location.longitude).toFixed(4)}` : '—'}
            />
          </div>

          {location?.last_updated && (
            <div style={styles.lastUpdated}>
              📡 GPS last received: {new Date(location.last_updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })} · {minsAgo(location.last_updated)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoCell}>
      <div style={styles.infoCellLabel}>{label}</div>
      <div style={styles.infoCellValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topBar: {
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-color)',
    gap: 16,
    flexWrap: 'wrap',
  },
  heading: {
    fontSize: 'clamp(16px, 3vw, 20px)',
    fontWeight: 800,
    color: 'var(--text-primary)',
    margin: 0,
  },
  subTitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginTop: 2,
    margin: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  },
  refreshTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    borderRadius: 999,
    background: 'var(--bg-hover)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
  },
  simBtn: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1.5px solid var(--primary-color)',
    background: 'var(--primary-light)',
    color: 'var(--primary-color)',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  simPanel: {
    padding: '12px 24px',
    background: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-color)',
  },
  smallBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBanner: {
    padding: '12px 24px',
    background: 'var(--danger-bg)',
    color: 'var(--danger-color)',
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
  },
  retryBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--primary-color)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  mapOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.02)',
    backdropFilter: 'blur(2px)',
    zIndex: 2,
  },
  apiKeyBanner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 14px',
    borderRadius: 10,
    background: 'rgba(255, 152, 0, 0.95)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    zIndex: 3,
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    maxWidth: '90%',
    textAlign: 'center',
  },
  mapControls: {
    position: 'absolute',
    top: 12,
    right: 12,
    bottom: 'calc(38vh + 16px)',
    zIndex: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 'calc(100% - 24px - 38vh - 16px)',
    overflowY: 'auto',
    paddingBottom: 4,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
  },
  zoomBadge: {
    textAlign: 'center',
    padding: '3px 6px',
    borderRadius: 8,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  followToggleWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 4,
  },
  followToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
  },
  infoCard: {
    background: 'var(--bg-card)',
    borderTop: '1px solid var(--border-color)',
    padding: '12px 16px',
    flexShrink: 0,
    overflowY: 'auto',
    maxHeight: '38vh',
  },
  infoCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  busNumber: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  routeName: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  viewBookingsBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--primary-color)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10,
    marginBottom: 10,
  },
  infoCell: {
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--bg-hover)',
  },
  infoCellLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoCellValue: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  lastUpdated: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 600,
    paddingTop: 8,
    borderTop: '1px dashed var(--border-light)',
  },
};
