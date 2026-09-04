import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const DEFAULT_DHKA_LAT = 23.8103;
const DEFAULT_DHKA_LNG = 90.4125;
const DEFAULT_ZOOM = 12;

export default function GlobalMap() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<{ [tripId: number]: any }>({});

  const [scriptLoaded, setScriptLoaded] = useState(!!(window.google && window.google.maps));
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<any[]>([]);

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

  const fetchTrips = useCallback(async () => {
    try {
      const res = await api.get('/trips/active/locations');
      setTrips(res.data.trips || []);
      setErrorMsg('');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error || e.message || 'Failed to load trips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
    const iv = setInterval(fetchTrips, 5000);
    return () => clearInterval(iv);
  }, [fetchTrips]);

  useEffect(() => {
    if (!scriptLoaded || !mapRef.current) return;
    if (!window.google?.maps) return;

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: DEFAULT_DHKA_LAT, lng: DEFAULT_DHKA_LNG },
        zoom: DEFAULT_ZOOM,
        disableDefaultUI: false,
      });
    }

    const currentTripIds = new Set(trips.map(t => t.trip_id));
    
    // Remove stale markers
    Object.keys(markersRef.current).forEach(idStr => {
      const id = Number(idStr);
      if (!currentTripIds.has(id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    trips.forEach(trip => {
      if (trip.latitude && trip.longitude) {
        const pos = { lat: Number(trip.latitude), lng: Number(trip.longitude) };
        if (!markersRef.current[trip.trip_id]) {
          const marker = new window.google.maps.Marker({
            map: mapInstance.current,
            position: pos,
            title: `${trip.route_name} - ${trip.bus_number}`,
            label: {
              text: String(trip.bus_number || trip.trip_id),
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '12px',
            },
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 20,
              fillColor: '#1565C0',
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#ffffff',
            }
          });
          
          marker.addListener('click', () => {
            navigate(`/trip/${trip.trip_id}/track`);
          });

          markersRef.current[trip.trip_id] = marker;
        } else {
          markersRef.current[trip.trip_id].setPosition(pos);
        }
      }
    });
  }, [scriptLoaded, trips, navigate]);

  return (
    <div className="app-page" style={{ padding: 0, height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
      <header style={{ padding: '16px 20px', background: '#fff', borderBottom: '1px solid #E0E0E0', zIndex: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#333' }}>🌍 Global Map View</h2>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
          Tracking {trips.length} active trips in real-time.
        </p>
      </header>

      {errorMsg && (
        <div style={{ background: '#FFEBEE', color: '#C62828', padding: 12, textAlign: 'center' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
        
        {loading && trips.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading-spinner dark" />
          </div>
        )}
      </div>
    </div>
  );
}
