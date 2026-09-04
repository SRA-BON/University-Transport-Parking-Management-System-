import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function Recharge() {
  const { user } = useAuthStore();
  const isStaff = ['super_admin', 'admin', 'manager', 'developer'].includes(user?.role || '');

  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // bKash state
  const [bkashConfig, setBkashConfig] = useState<{
    adminBkashNumber: string; adminBkashName: string;
  } | null>(null);
  const [bkashPanelOpen, setBkashPanelOpen] = useState(false);
  const [userBkashNumber, setUserBkashNumber] = useState('');
  const [bkashTransactionId, setBkashTransactionId] = useState('');
  const [bkashSubmitting, setBkashSubmitting] = useState(false);

  // Admin verification state
  const [pendingBkash, setPendingBkash] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  // Admin bKash settings form state
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [adminSettings, setAdminSettings] = useState<{
    adminPersonalNumber: string; adminPersonalName: string;
  } | null>(null);

  const quickAmounts = [100, 250, 500, 1000, 2000, 5000];

  const load = async () => {
    setLoading(true);
    try {
      const [walletRes, txRes, cfgRes] = await Promise.all([
        api.get('/wallets'),
        api.get('/wallets/transactions').catch(() => ({ data: { transactions: [] } })),
        api.get('/wallets/bkash-config'),
      ]);
      setBalance(parseFloat(walletRes.data.balance) || 0);
      setHistory(txRes.data.transactions || []);
      if (cfgRes.data) setBkashConfig(cfgRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    if (!isStaff) return;
    setPendingLoading(true);
    try {
      const res = await api.get('/wallets/bkash/pending');
      setPendingBkash(res.data.payments || []);
    } catch (e) {
      console.error('Failed to load pending bKash:', e);
    } finally {
      setPendingLoading(false);
    }
  };

  const loadAdminSettings = async () => {
    if (!isStaff) return;
    setSettingsLoading(true);
    try {
      const res = await api.get('/wallets/bkash-settings');
      setAdminSettings(res.data.settings);
    } catch (e) {
      console.error('Failed to load bKash admin settings:', e);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (isStaff) {
      loadPending();
      loadAdminSettings();
    }
  }, [isStaff]);

  const recharge = async (method: string) => {
    if (!amount || amount <= 0) {
      setMsg('Please enter a valid amount');
      return;
    }
    setMsg(null);
    setProcessing(true);
    try {
      const res = await api.post('/wallets/recharge', { amount, method });
      if (res.data.payment_url) {
        window.location.href = res.data.payment_url;
      } else {
        setMsg(`Successfully recharged ৳${amount} (${method} mode)`);
        setAmount('');
        load();
      }
    } catch (e: any) {
      setMsg('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setProcessing(false);
    }
  };

  const submitBkash = async () => {
    if (!amount || amount <= 0) {
      setMsg('Please enter a valid amount');
      return;
    }
    if (!userBkashNumber || !/^\d{11}$/.test(userBkashNumber.replace(/^\+?(?:88)?/, ''))) {
      setMsg('Please enter a valid 11-digit bKash account number');
      return;
    }
    if (!bkashTransactionId || bkashTransactionId.length < 4) {
      setMsg('Please enter the bKash Transaction ID (TrxID)');
      return;
    }
    setMsg(null);
    setBkashSubmitting(true);
    try {
      const res = await api.post('/wallets/bkash/submit', {
        amount,
        userBkashNumber,
        bkashTransactionId,
      });
      setMsg(res.data.message || 'bKash payment submitted.');
      setAmount('');
      setUserBkashNumber('');
      setBkashTransactionId('');
      setBkashPanelOpen(false);
      load();
    } catch (e: any) {
      setMsg('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setBkashSubmitting(false);
    }
  };

  const verifyBkash = async (transactionId: string, approved: boolean) => {
    try {
      await api.post(`/wallets/bkash/verify/${transactionId}`, {
        approved,
        adminNote: adminNote || undefined,
      });
      setAdminNote('');
      loadPending();
      load();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const reverseBkash = async (transactionId: string, force = false) => {
    try {
      await api.post(`/wallets/bkash/reverse/${transactionId}`, {
        adminNote: adminNote || undefined,
        force,
      });
      setAdminNote('');
      loadPending();
      load();
      alert('Reversed successfully.');
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const saveAdminSettings = async () => {
    if (!adminSettings) return;
    if (!/^\d{10,15}$/.test(adminSettings.adminPersonalNumber.replace(/\D/g, ''))) {
      alert('bKash number must be 10-15 digits');
      return;
    }
    setSettingsSaving(true);
    try {
      const res = await api.post('/wallets/bkash-settings', adminSettings);
      setAdminSettings(res.data.settings);
      // Refresh bkash config too so user UI shows the new number
      const cfg = await api.get('/wallets/bkash-config');
      setBkashConfig(cfg.data);
      alert(res.data.message || 'Settings saved.');
      load();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSettingsSaving(false);
    }
  };

  const typeColor = (t: string) => {
    switch (t) {
      case 'recharge':
        return { bg: 'var(--success-bg)', color: 'var(--success-text)' };
      case 'payment':
        return { bg: 'var(--danger-bg)', color: 'var(--danger-color)' };
      case 'refund':
        return { bg: 'var(--info-bg)', color: 'var(--info-text)' };
      case 'penalty':
        return { bg: 'var(--warning-bg)', color: 'var(--warning-text)' };
      case 'reversal':
        return { bg: '#FFEBEE', color: '#C62828' };
      default:
        return { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' };
    }
  };

  const typeSign = (t: string) => (t === 'recharge' || t === 'refund' ? '+' : '-');

  return (
    <div className="app-page">
      <h2 style={styles.heading}>Recharge Wallet</h2>
      <p style={styles.sub}>Add funds to your digital wallet for transport & parking payments</p>

      <div style={styles.grid}>
        <div style={styles.balanceCard}>
          <div style={styles.balanceLabel}>Current Balance</div>
          {loading ? (
            <div className="loading-spinner" style={{ marginTop: 12 }} />
          ) : (
            <>
              <div style={styles.balanceAmount}>৳ {balance.toFixed(2)}</div>
              <div style={styles.balanceHint}>Enough for {Math.floor(balance / 40)} standard single trips</div>
            </>
          )}
        </div>

        <div style={styles.rechargeCard}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Add Money</h3>
          {msg && (
            <div style={{
              ...styles.msg,
              background: /failed|Failed|Invalid|Please/.test(msg) ? 'var(--danger-bg)' : 'var(--success-bg)',
              color: /failed|Failed|Invalid|Please/.test(msg) ? 'var(--danger-color)' : 'var(--success-text)',
            }}>
              {msg}
            </div>
          )}

          <label style={styles.label}>Amount (৳)</label>
          <input
            type="number"
            min={10}
            value={amount}
            onChange={(e) => setAmount(e.target.value ? parseFloat(e.target.value) : '')}
            style={styles.input}
          />

          <div style={styles.quickRow}>
            {quickAmounts.map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                style={{
                  ...styles.quickBtn,
                  background: amount === v ? 'var(--primary-color)' : 'var(--primary-light)',
                  color: amount === v ? '#fff' : 'var(--primary-color)',
                }}
              >
                ৳{v}
              </button>
            ))}
          </div>

          <div style={styles.paymentsRow}>

            {/* bKash button — appears BEFORE SSL button per requirements */}
            <button
              onClick={() => { setBkashPanelOpen((v) => !v); setMsg(null); }}
              disabled={processing || bkashSubmitting}
              style={{
                ...styles.payBtn,
                background: bkashPanelOpen
                  ? 'linear-gradient(135deg, #006633, #00884a)'
                  : 'linear-gradient(135deg, #e2136e, #ff4d8d)',
              }}
            >
              {bkashSubmitting ? <div className="loading-spinner" /> : (bkashPanelOpen ? 'Cancel' : 'bKash Send Money')}
            </button>

            {/* bKash manual form — appears between bKash button and SSL button when open */}
            {bkashPanelOpen && bkashConfig && (
              <div style={styles.bkashPanel}>

                <div style={styles.bkashStepHeader}>
                  <div style={styles.bkashStepNum}>1</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      Send Money from your bKash app
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Open your bKash app → Send Money → Enter the account below exactly
                    </div>
                  </div>
                </div>

                <div style={styles.bkashAdminCard}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>
                      SEND TO —
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#e2136e', fontFamily: 'JetBrains Mono, monospace' }}>
                      {bkashConfig.adminBkashNumber}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 0.5 }}>AMOUNT</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>৳ {(Number(amount) || 0).toFixed(2)}</div>
                  </div>
                </div>

                <div style={styles.bkashStepHeader}>
                  <div style={styles.bkashStepNum}>2</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      Enter payment confirmation details
                    </div>
                  </div>
                </div>

                <label style={styles.label}>Your bKash Account Number</label>
                <input
                  type="text"
                  maxLength={14}
                  placeholder="01XXXXXXXXX"
                  value={userBkashNumber}
                  onChange={(e) => setUserBkashNumber(e.target.value)}
                  style={styles.input}
                />

                <label style={styles.label}>bKash Transaction ID (TrxID)</label>
                <input
                  type="text"
                  placeholder="e.g. A8B7C6D5E4"
                  value={bkashTransactionId}
                  onChange={(e) => setBkashTransactionId(e.target.value.trim().toUpperCase())}
                  style={{ ...styles.input, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }}
                />

                <button
                  onClick={submitBkash}
                  disabled={bkashSubmitting || processing}
                  style={{
                    ...styles.payBtn,
                    background: 'linear-gradient(135deg, #006633, #00884a)',
                    marginTop: 14,
                  }}
                >
                  {bkashSubmitting ? <div className="loading-spinner" /> : 'Submit for Verification'}
                </button>
              </div>
            )}

            <button
              onClick={() => recharge('sslcommerz')}
              disabled={processing}
              style={{ ...styles.payBtn, background: 'linear-gradient(135deg, var(--success-text), #66BB6A)' }}
            >
              SSLCommerz (bKash / Nagad / Card)
            </button>
          </div>
        </div>
      </div>



      <h3 style={{ ...styles.sectionTitle, marginTop: 28 }}>Recent Transactions</h3>
      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 12 }} />
      ) : history.length === 0 ? (
        <div style={styles.empty}>No transactions yet. Try a test recharge above.</div>
      ) : (
        <div style={styles.history}>
          {history.slice(0, 15).map((tx) => {
            const s = typeColor(tx.type);
            return (
              <div key={tx.id} style={styles.txRow}>
                <div style={{ ...styles.txIcon, background: s.bg, color: s.color }}>
                  {typeSign(tx.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {tx.type.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {tx.description || (tx.booking_id ? `Booking #${tx.booking_id}` : 'Wallet transaction')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: s.color }}>
                    {typeSign(tx.type)}৳ {parseFloat(tx.amount).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                    {new Date(tx.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BkashCompletedReversable({ onReversed }: { onReversed: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // List pending to get ALL; then filter completed on client.
      // (For simplicity we also include reversed so admin sees history.)
      const tx = await api.get('/wallets/all-transactions').catch(() => ({ data: { transactions: [] } }));
      const bkashTxns = (tx.data.transactions || []).filter((t: any) =>
        t.transaction_type === 'recharge' && /bKash/i.test(t.description || '')
      );
      setRows(bkashTxns);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reverse = async (txId: number, amount: number, userId: number, force = false) => {
    try {
      // Reverse via a pending_payments lookup by description isn't 100% reliable — use direct amount deduction API.
      // Simpler: call reverse on any pending_payment idempotent via POST /bkash/reverse of a synthetic descriptor.
      // For reversals of bKash rows not tracked via pending_payments we just debited directly:
      const res = await fetch(`/api/wallets/reverse-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          user_id: userId,
          amount,
          reference: `Reversal of recharge tx#${txId} ${note ? ' — ' + note : ''}`,
          force,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNote('');
      onReversed();
      load();
      alert('Reversed successfully.');
    } catch (e: any) {
      alert('Failed: ' + (e.message || e));
    }
  };

  if (loading) return <div className="loading-spinner dark" style={{ marginTop: 12 }} />;
  if (rows.length === 0) return <div style={empty2}>No completed bKash recharge rows found.</div>;

  return (
    <div>
      <label style={{ display: 'block', margin: '4px 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Optional reversal note (appears on the transaction)
      </label>
      <input
        type="text"
        placeholder="e.g. not found in statement dated..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ ...input2, marginBottom: 12 }}
      />
      <div style={styles.history}>
        {rows.slice(0, 20).map((tx: any) => (
          <div key={tx.id} style={{ ...styles.txRow, alignItems: 'center' }}>
            <div style={{ ...styles.txIcon, background: 'var(--success-bg)', color: 'var(--success-text)' }}>+</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{tx.name || `User #${tx.user_id}`}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tx.description}</div>
            </div>
            <div style={{ fontWeight: 800, color: 'var(--success-text)' }}>
              +৳ {parseFloat(tx.amount).toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: '#AAA', marginLeft: 10, minWidth: 130, textAlign: 'right' }}>
              {new Date(tx.created_at).toLocaleString()}
            </div>
            <div style={{ marginLeft: 10, display: 'flex', gap: 6 }}>
              <button
                onClick={() => reverse(tx.id, Number(tx.amount), tx.user_id, false)}
                style={revBtn}
                title="Deduct from wallet; refuse if insufficient balance"
              >Reverse</button>
              <button
                onClick={() => reverse(tx.id, Number(tx.amount), tx.user_id, true)}
                style={{ ...revBtn, background: '#6A1B9A', borderColor: '#4A148C' }}
                title="Force reversal even if balance goes negative (debt marker)"
              >Force</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const revBtn: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: '1.5px solid #C62828',
  background: '#fff',
  color: '#C62828',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const empty2: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px dashed var(--border-color)',
  borderRadius: 14, padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13,
};
const input2: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  borderRadius: 8,
  boxSizing: 'border-box',
};

const styles: Record<string, React.CSSProperties> = {
  heading: { fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 24 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
  },
  balanceCard: {
    background: 'linear-gradient(135deg, var(--primary-color) 0%, #4A3FFF 100%)',
    borderRadius: 18,
    padding: 28,
    color: '#fff',
    boxShadow: '0 10px 30px -10px rgba(108, 99, 255, 0.55)',
  },
  balanceLabel: { fontSize: 13, opacity: 0.85, marginBottom: 8 },
  balanceAmount: {
    fontSize: 'clamp(32px, 6vw, 44px)',
    fontWeight: 900,
    letterSpacing: -1,
  },
  balanceHint: { marginTop: 10, fontSize: 13, opacity: 0.85 },
  rechargeCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 18,
    padding: 24,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
    marginTop: 10,
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
    boxSizing: 'border-box',
  },
  quickRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 12,
  },
  quickBtn: {
    padding: '10px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
  },
  paymentsRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 18,
  },
  payBtn: {
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 16px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    minHeight: 48,
    boxShadow: '0 6px 18px -6px rgba(0,0,0,0.25)',
  },
  bkashPanel: {
    marginTop: 4,
    padding: '16px',
    border: '1px solid rgba(226, 19, 110, 0.35)',
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(226,19,110,0.04), rgba(0,102,51,0.03))',
  },
  autoVerifyBadge: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#E8F5E9',
    color: '#2E7D32',
    fontSize: 12,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
  },
  autoMiniBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 999,
    background: '#E8F5E9',
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  bkashStepHeader: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    margin: '4px 0 10px',
  },
  bkashStepNum: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: '#e2136e',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    fontSize: 13,
    flexShrink: 0,
  },
  bkashAdminCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    margin: '6px 0 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
  },
  msg: {
    padding: '11px 14px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 10,
    whiteSpace: 'pre-wrap',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginBottom: 14,
  },
  settingsCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 18,
  },
  history: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    borderBottom: '1px solid var(--border-color)',
    flexWrap: 'wrap',
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    fontSize: 18,
    fontWeight: 900,
  },
  empty: {
    background: 'var(--bg-card)',
    border: '1px dashed var(--border-color)',
    borderRadius: 14,
    padding: 32,
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: 14,
  },
  verifyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
    marginBottom: 4,
  },
  verifyCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 14,
    padding: 18,
  },
  pendingBadge: {
    padding: '4px 12px',
    background: '#FFF8E1',
    color: '#E65100',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.4,
  },
  verifyDivider: {
    height: 1,
    background: 'var(--border-color)',
    margin: '12px 0',
  },
  verifyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: 13,
    flexWrap: 'wrap',
    gap: 8,
  },
  verifyLabel: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
};
