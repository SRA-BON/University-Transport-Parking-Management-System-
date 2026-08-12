import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

const BD_DISTRICTS = [
  'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Jamalpur', 'Kishoreganj',
  'Madaripur', 'Manikganj', 'Munshiganj', 'Mymensingh', 'Narayanganj', 'Narsingdi',
  'Netrokona', 'Rajbari', 'Shariatpur', 'Sherpur', 'Tangail', 'Bogra',
  'Joypurhat', 'Naogaon', 'Natore', 'Nawabganj', 'Pabna', 'Rajshahi',
  'Sirajganj', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari',
  'Panchagarh', 'Rangpur', 'Thakurgaon', 'Bagerhat', 'Chuadanga', 'Jashore',
  'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail',
  'Satkhira', 'Brahmanbaria', 'Chandpur', 'Chittagong', 'Comilla', "Cox's Bazar",
  'Feni', 'Khagrachari', 'Lakshmipur', 'Noakhali', 'Rangamati', 'Habiganj',
  'Maulvibazar', 'Sunamganj', 'Sylhet', 'Barisal', 'Bhola', 'Jhalokati',
  'Patuakhali', 'Pirojpur', 'Bandarban'
];

const VEHICLE_TYPES = ['La', 'Ha', 'Ga'];

type Vehicle = {
  id: number;
  user_id: number;
  district: string;
  vehicle_type: string;
  reg_number: string;
  vehicle_reg_no: string;
  is_default: boolean;
  created_at: string;
};

export default function ParkingProfile() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [district, setDistrict] = useState('Dhaka');
  const [vehicleType, setVehicleType] = useState('La');
  const [regFirstTwo, setRegFirstTwo] = useState('');
  const [regLastFour, setRegLastFour] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);

  const resetForm = () => {
    setDistrict('Dhaka');
    setVehicleType('La');
    setRegFirstTwo('');
    setRegLastFour('');
    setSetAsDefault(false);
    setEditingId(null);
    setShowAddForm(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [profileRes, sessionRes] = await Promise.all([
        api.get('/parking/profile').catch(() => ({ data: { vehicles: [], profile: null } })),
        api.get('/parking/sessions/active').catch(() => ({ data: { session: null } })),
      ]);
      const vList: Vehicle[] = profileRes.data.vehicles || [];
      setVehicles(vList);
      setActiveSession(sessionRes.data.session || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const flashMsg = (text: string, type: 'success' | 'error') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(null), 4000);
  };

  const buildRegNumber = () => `${regFirstTwo}-${regLastFour}`;

  const validateForm = () => {
    if (!district) return 'District is required';
    if (!vehicleType) return 'Vehicle type is required';
    if (!/^\d{2}$/.test(regFirstTwo)) return 'First part of registration must be 2 digits';
    if (!/^\d{4}$/.test(regLastFour)) return 'Second part of registration must be 4 digits';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      flashMsg('❌ ' + err, 'error');
      return;
    }
    setMsg(null);
    setSaving(true);
    try {
      const payload = {
        district,
        vehicleType,
        regNumber: buildRegNumber(),
        isDefault: setAsDefault || vehicles.length === 0,
      };

      if (editingId) {
        await api.put(`/parking/vehicles/${editingId}`, payload);
        flashMsg('✅ Vehicle updated successfully', 'success');
      } else {
        await api.post('/parking/vehicles', payload);
        flashMsg('✅ Vehicle added successfully', 'success');
      }
      resetForm();
      loadData();
    } catch (e: any) {
      flashMsg('❌ Failed: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vehicleId: number) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) return;
    try {
      await api.delete(`/parking/vehicles/${vehicleId}`);
      flashMsg('🗑️ Vehicle deleted', 'success');
      loadData();
    } catch (e: any) {
      flashMsg('❌ Failed: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  const handleSetDefault = async (vehicleId: number) => {
    try {
      await api.put(`/parking/vehicles/${vehicleId}/default`);
      flashMsg('⭐ Default vehicle updated', 'success');
      loadData();
    } catch (e: any) {
      flashMsg('❌ Failed: ' + (e.response?.data?.error || e.message), 'error');
    }
  };

  const startEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setDistrict(v.district);
    setVehicleType(v.vehicle_type);
    const parts = v.reg_number.split('-');
    setRegFirstTwo(parts[0] || '');
    setRegLastFour(parts[1] || '');
    setSetAsDefault(v.is_default);
    setShowAddForm(true);
  };

  const defaultVehicle = vehicles.find((v) => v.is_default) || vehicles[0];
  const anyVehicleLinked = vehicles.length > 0;

  return (
    <div className="app-page">
      <header style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>🚗 Parking Profile</h2>
          <p style={styles.subHeading}>Link your vehicles to start using automated parking</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/parking" style={styles.secondaryBtn}>📊 Dashboard</Link>
        </div>
      </header>



      <div style={styles.grid}>
        <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
          <div style={styles.cardHeader}>
            <div>
              <h3 style={styles.cardTitle}>🚙 My Vehicles</h3>
              <p style={styles.cardSub}>
                Register your vehicle(s). You can add multiple vehicles and set one as the default for parking entry.
              </p>
            </div>
            {!showAddForm && (
              <button
                onClick={() => { resetForm(); setShowAddForm(true); }}
                style={styles.addBtn}
              >
                ➕ Add Vehicle
              </button>
            )}
          </div>

          {msg && (
            <div
              style={{
                ...styles.msg,
                background: msgType === 'success' ? '#E8F5E9' : '#FFEBEE',
                color: msgType === 'success' ? '#2E7D32' : '#C62828',
              }}
            >
              {msg}
            </div>
          )}

          {showAddForm && (
            <div style={styles.formCard}>
              <h4 style={styles.formTitle}>
                {editingId ? '✏️ Edit Vehicle' : '➕ Add New Vehicle'}
              </h4>
              <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.formRow}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={styles.label}>District</label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      style={styles.select}
                      disabled={saving}
                    >
                      {BD_DISTRICTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <label style={styles.label}>Vehicle Type</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      style={styles.select}
                      disabled={saving}
                    >
                      {VEHICLE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label style={styles.label}>Registration Number (6 digits)</label>
                <div style={styles.regRow}>
                  <input
                    value={regFirstTwo}
                    onChange={(e) => setRegFirstTwo(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="54"
                    style={{ ...styles.input, ...styles.regInput, textAlign: 'center' }}
                    disabled={saving}
                    maxLength={2}
                  />
                  <span style={styles.regDash}>-</span>
                  <input
                    value={regLastFour}
                    onChange={(e) => setRegLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="2429"
                    style={{ ...styles.input, ...styles.regInput, textAlign: 'center' }}
                    disabled={saving}
                    maxLength={4}
                  />
                </div>
                <p style={styles.hint}>
                  Format: <code>District-Type XX-XXXX</code> → Preview:{' '}
                  <strong style={{ color: '#6C63FF' }}>
                    {district}-{vehicleType} {regFirstTwo || 'XX'}-{regLastFour || 'XXXX'}
                  </strong>
                </p>

                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={setAsDefault || vehicles.length === 0}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    disabled={saving || vehicles.length === 0}
                    style={{ marginRight: 8 }}
                  />
                  Set as default vehicle for parking entry
                </label>

                <div style={styles.formActions}>
                  <button type="submit" style={styles.saveBtn} disabled={saving}>
                    {saving ? <div className="loading-spinner" /> : editingId ? '💾 Update Vehicle' : '✅ Add Vehicle'}
                  </button>
                  {!saving && (
                    <button
                      type="button"
                      onClick={resetForm}
                      style={styles.cancelBtn}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="loading-spinner dark" style={{ marginTop: 20 }} />
          ) : vehicles.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 48 }}>🚫</div>
              <p style={styles.emptyTitle}>No vehicles registered yet</p>
              <p style={styles.emptyText}>Click "Add Vehicle" to register your first vehicle.</p>
            </div>
          ) : (
            <div style={styles.vehicleList}>
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  style={{
                    ...styles.vehicleCard,
                    borderColor: v.is_default ? '#6C63FF' : 'var(--border-color)',
                    boxShadow: v.is_default ? '0 4px 14px -4px rgba(108, 99, 255, 0.3)' : 'none',
                  }}
                >
                  <div style={styles.vehicleMain}>
                    <div style={styles.vehiclePlate}>
                      {v.district}-{v.vehicle_type} {v.reg_number}
                    </div>
                    <div style={styles.vehicleMeta}>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>District:</span>
                        <span style={styles.metaValue}>{v.district}</span>
                      </div>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Type:</span>
                        <span style={styles.metaValue}>{v.vehicle_type}</span>
                      </div>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Reg No:</span>
                        <span style={styles.metaValue}>{v.reg_number}</span>
                      </div>
                    </div>
                  </div>
                  <div style={styles.vehicleActions}>
                    {v.is_default ? (
                      <span style={styles.defaultBadge}>⭐ Default</span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(v.id)}
                        style={styles.ghostBtn}
                        title="Set as default"
                      >
                        ☆ Default
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(v)}
                      style={{ ...styles.ghostBtn, color: '#1976D2' }}
                      title="Edit vehicle"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      style={{ ...styles.ghostBtn, color: '#D32F2F' }}
                      title="Delete vehicle"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📋 Profile Status</h3>

          {loading ? (
            <div className="loading-spinner dark" style={{ marginTop: 20 }} />
          ) : (
            <div style={styles.statusGrid}>
              <StatusItem
                icon="👤"
                label="Student Name"
                value={user?.name || '—'}
              />
              <StatusItem
                icon="🎓"
                label="Student ID"
                value={user?.student_id || '—'}
              />
              <StatusItem
                icon="🏛️"
                label="Department"
                value={(user?.department as string) || 'Not set'}
              />

              <StatusItem
                icon="🚗"
                label="Vehicles Linked"
                value={`${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`}
                ok={anyVehicleLinked}
              />
              <StatusItem
                icon="⭐"
                label="Default Vehicle"
                value={defaultVehicle?.vehicle_reg_no || 'None'}
                ok={!!defaultVehicle}
              />
              <StatusItem
                icon="🅿️"
                label="Active Session"
                value={activeSession ? `Token #${activeSession.digital_token}` : 'None'}
                ok={!!activeSession}
                okText={!!activeSession ? 'Yes' : undefined}
              />
            </div>
          )}

          <div style={styles.infoBox}>
            <div style={{ fontSize: 22 }}>ℹ️</div>
            <div>
              <p style={styles.infoTitle}>How Parking Works</p>
              <ol style={styles.infoList}>
                <li>Link your vehicle(s) on this page.</li>
                <li>At the parking entrance, the system scans your Student ID card.</li>
                <li>Your default vehicle will be used for entry.</li>
                <li>You'll receive a 3-digit digital token.</li>
                <li>At exit, the system scans your ID again — bill is auto-deducted.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
  ok,
  okText,
}: {
  icon: string;
  label: string;
  value: string;
  ok?: boolean;
  okText?: string;
}) {
  return (
    <div style={styles.statusItem}>
      <div style={styles.statusIcon}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.statusLabel}>{label}</div>
        <div style={styles.statusValue}>{value}</div>
      </div>
      {ok !== undefined && (
        <span
          style={{
            ...styles.statusDot,
            background: ok ? '#E8F5E9' : '#FFEBEE',
            color: ok ? '#2E7D32' : '#C62828',
          }}
        >
          {okText !== undefined ? okText : ok ? 'OK' : 'Missing'}
        </span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  subHeading: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  secondaryBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    display: 'inline-block',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 16,
    padding: 26,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  cardTitle: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 },
  cardSub: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 },
  addBtn: {
    padding: '10px 18px',
    background: 'linear-gradient(135deg, var(--primary-color), #8B83FF)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
    whiteSpace: 'nowrap',
  },
  formCard: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--primary-color)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: 'var(--primary-color)',
    marginBottom: 14,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 4 },
  formRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
    marginTop: 4,
    display: 'block',
  },
  select: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
  },
  regRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  regInput: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 18,
    letterSpacing: 2,
  },
  regDash: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  hint: { fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: 10,
    cursor: 'pointer',
  },
  formActions: {
    display: 'flex',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    background: 'linear-gradient(135deg, var(--primary-color), #8B83FF)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px 22px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    minWidth: 200,
    maxWidth: 240,
    minHeight: 46,
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    padding: '13px 22px',
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: 46,
  },
  msg: {
    padding: '11px 14px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 12,
  },
  emptyState: {
    padding: 40,
    textAlign: 'center',
    borderRadius: 12,
    background: 'var(--bg-hover)',
    border: '2px dashed var(--border-color)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  vehicleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  vehicleCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 12,
    background: 'var(--bg-card)',
    border: '2px solid var(--border-color)',
    flexWrap: 'wrap',
    transition: 'all 0.2s ease',
  },
  vehicleMain: {
    flex: 1,
    minWidth: 240,
  },
  vehiclePlate: {
    display: 'inline-block',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #6C63FF, #8B83FF)',
    color: '#fff',
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 16,
    fontFamily: 'monospace',
    letterSpacing: 1,
    boxShadow: '0 4px 10px -2px rgba(108, 99, 255, 0.4)',
    marginBottom: 10,
  },
  vehicleMeta: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    fontWeight: 600,
  },
  metaValue: {
    fontSize: 13,
    color: 'var(--text-primary)',
    fontWeight: 700,
  },
  vehicleActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  defaultBadge: {
    padding: '6px 12px',
    background: 'linear-gradient(135deg, #FFD54F, #FFB300)',
    color: '#5D4037',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  ghostBtn: {
    padding: '8px 12px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    color: 'var(--text-primary)',
    transition: 'all 0.15s ease',
  },
  statusGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--bg-hover)',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 18,
    border: '1px solid var(--border-color)',
    flexShrink: 0,
  },
  statusLabel: { fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 },
  statusValue: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: 2,
  },
  statusDot: {
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  infoBox: {
    marginTop: 18,
    padding: 16,
    background: 'var(--primary-light)',
    borderRadius: 12,
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoTitle: { fontSize: 14, fontWeight: 800, color: 'var(--primary-color)', marginBottom: 6 },
  infoList: {
    paddingLeft: 18,
    fontSize: 12,
    color: 'var(--primary-color)',
    lineHeight: 1.7,
  },
  warnCard: {
    padding: 20,
    background: 'var(--warning-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  warnTitle: { fontSize: 15, fontWeight: 800, color: 'var(--warning-text)', marginBottom: 4 },
  warnText: { fontSize: 13, color: 'var(--warning-text)', lineHeight: 1.5 },
  primaryBtn: {
    padding: '14px 20px',
    background: 'linear-gradient(135deg, var(--primary-color), #8B83FF)',
    color: '#fff',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 14,
    display: 'inline-block',
    boxShadow: '0 4px 14px -4px rgba(108, 99, 255, 0.5)',
  },
};
