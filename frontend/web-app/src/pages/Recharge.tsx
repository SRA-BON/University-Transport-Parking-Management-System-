import { useEffect, useState } from 'react';
import api from '../services/api';

export default function Recharge() {
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const quickAmounts = [100, 250, 500, 1000, 2000, 5000];

  const load = async () => {
    setLoading(true);
    try {
      const [walletRes, txRes] = await Promise.all([
        api.get('/wallets'),
        api.get('/wallets/transactions').catch(() => ({ data: { transactions: [] } })),
      ]);
      setBalance(parseFloat(walletRes.data.balance) || 0);
      setHistory(txRes.data.transactions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recharge = async (method: string) => {
    if (!amount || amount <= 0) {
      setMsg('❌ Please enter a valid amount');
      return;
    }
    setMsg(null);
    setProcessing(true);
    try {
      const res = await api.post('/wallets/recharge', { amount, method });
      if (res.data.payment_url) {
        window.location.href = res.data.payment_url;
      } else {
        setMsg(`✅ Successfully recharged ৳${amount} (${method} mode)`);
        setAmount(100);
        load();
      }
    } catch (e: any) {
      setMsg('❌ Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setProcessing(false);
    }
  };

  const typeColor = (t: string) => {
    switch (t) {
      case 'recharge':
        return { bg: 'var(--success-bg)', color: 'var(--success-text)', icon: '⬆️' };
      case 'payment':
        return { bg: 'var(--danger-bg)', color: 'var(--danger-color)', icon: '⬇️' };
      case 'refund':
        return { bg: 'var(--info-bg)', color: 'var(--info-text)', icon: '↩️' };
      case 'penalty':
        return { bg: 'var(--warning-bg)', color: 'var(--warning-text)', icon: '⚠️' };
      default:
        return { bg: 'var(--bg-hover)', color: 'var(--text-secondary)', icon: '•' };
    }
  };

  return (
    <div className="app-page">
      <h2 style={styles.heading}>💳 Recharge Wallet</h2>
      <p style={styles.sub}>Add funds to your digital wallet for transport & parking payments</p>

      <div style={styles.grid}>
        <div style={styles.balanceCard}>
          <div style={styles.balanceLabel}>Current Balance</div>
          {loading ? (
            <div className="loading-spinner" style={{ marginTop: 12 }} />
          ) : (
            <>
              <div style={styles.balanceAmount}>৳ {balance.toFixed(2)}</div>
              <div style={styles.balanceHint}>Enough for {Math.floor(balance / 40)} standard single trips 🚌</div>
            </>
          )}
        </div>

        <div style={styles.rechargeCard}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Add Money</h3>
          {msg && <div style={styles.msg}>{msg}</div>}

          <label style={styles.label}>Amount (৳)</label>
          <input
            type="number"
            min={10}
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
            <button
              onClick={() => recharge('test')}
              disabled={processing}
              style={{ ...styles.payBtn, background: 'linear-gradient(135deg, var(--primary-color), #8B83FF)' }}
            >
              {processing ? <div className="loading-spinner" /> : '💵 Test / Instant Recharge'}
            </button>
            <button
              onClick={() => recharge('sslcommerz')}
              disabled={processing}
              style={{ ...styles.payBtn, background: 'linear-gradient(135deg, var(--success-text), #66BB6A)' }}
            >
              🏦 SSLCommerz (bKash / Nagad / Card)
            </button>
          </div>
        </div>
      </div>

      <h3 style={{ ...styles.sectionTitle, marginTop: 28 }}>📜 Recent Transactions</h3>
      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 12 }} />
      ) : history.length === 0 ? (
        <div style={styles.empty}>No transactions yet. Try a test recharge above!</div>
      ) : (
        <div style={styles.history}>
          {history.slice(0, 15).map((tx) => {
            const s = typeColor(tx.type);
            return (
              <div key={tx.id} style={styles.txRow}>
                <div style={{ ...styles.txIcon, background: s.bg, color: s.color }}>{s.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {tx.type.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {tx.description || (tx.booking_id ? `Booking #${tx.booking_id}` : 'Wallet transaction')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: s.color }}>
                    {tx.type === 'recharge' || tx.type === 'refund' ? '+' : '-'}৳ {parseFloat(tx.amount).toFixed(2)}
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
  balanceLabel: {
    fontSize: 13,
    opacity: 0.85,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 'clamp(32px, 6vw, 44px)',
    fontWeight: 900,
    letterSpacing: -1,
  },
  balanceHint: {
    marginTop: 10,
    fontSize: 13,
    opacity: 0.85,
  },
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
    marginTop: 4,
  },
  input: {
    width: '100%',
    padding: '13px 14px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 700,
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
  msg: {
    padding: '11px 14px',
    borderRadius: 10,
    background: 'var(--success-bg)',
    color: 'var(--success-text)',
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
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'grid',
    placeItems: 'center',
    fontSize: 16,
    fontWeight: 700,
  },
  txType: {
    fontSize: 14,
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
};
