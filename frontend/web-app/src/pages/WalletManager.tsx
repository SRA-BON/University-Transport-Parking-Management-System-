import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function WalletManager() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'transactions' | 'bkash'>('bkash');

  // ── Transactions ──
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txSearch, setTxSearch] = useState('');

  // ── bKash Pending & Settings ──
  const [adminSettings, setAdminSettings] = useState<any>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pendingBkash, setPendingBkash] = useState<any[]>([]);
  const [adminNote, setAdminNote] = useState<{ [key: string]: string }>({});
  const [creditAmount, setCreditAmount] = useState<{ [key: string]: string }>({});
  const [actionMsg, setActionMsg] = useState<{ [key: string]: string }>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'transactions') {
        const res = await api.get('/wallets/all-transactions');
        setTransactions(res.data.transactions || []);
      } else {
        const res = await api.get('/wallets/bkash/pending');
        const payments = res.data.payments || [];
        setPendingBkash(payments);
        const initial: { [k: string]: string } = {};
        payments.forEach((p: any) => { initial[p.transaction_id] = String(p.amount); });
        setCreditAmount(initial);

        // Fetch settings
        const cfg = await api.get('/wallets/bkash-config');
        if (cfg.data) {
          setAdminSettings({
            adminPersonalNumber: cfg.data.adminBkashNumber,
            adminPersonalName: cfg.data.adminBkashName,
          });
        }
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeTab]);

  const saveAdminSettings = async () => {
    if (!adminSettings) return;
    if (!/^\d{10,15}$/.test(adminSettings.adminPersonalNumber.replace(/\D/g, ''))) {
      alert('bKash number must be 10-15 digits');
      return;
    }
    setSettingsSaving(true);
    try {
      await api.post('/wallets/bkash-settings', adminSettings);
      alert('Settings saved.');
      load();
    } catch (e: any) {
      alert('Failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSettingsSaving(false);
    }
  };

  const approveBkash = async (transactionId: string) => {
    try {
      setActionMsg({ ...actionMsg, [transactionId]: '...' });
      await api.post(`/wallets/bkash/verify/${transactionId}`, {
        approved: true,
        adminNote: adminNote[transactionId] || undefined,
        creditAmount: creditAmount[transactionId] || undefined,
      });
      setActionMsg({ ...actionMsg, [transactionId]: 'Approved' });
      setTimeout(() => load(), 800);
    } catch (e: any) {
      setActionMsg({ ...actionMsg, [transactionId]: 'Error: ' + (e.response?.data?.error || e.message) });
    }
  };

  const rejectBkash = async (transactionId: string) => {
    if (!confirm("Reject this bKash request? The student's wallet will NOT be credited.")) return;
    try {
      setActionMsg({ ...actionMsg, [transactionId]: '...' });
      await api.post(`/wallets/bkash/verify/${transactionId}`, {
        approved: false,
        adminNote: adminNote[transactionId] || 'Rejected by admin',
      });
      setActionMsg({ ...actionMsg, [transactionId]: 'Rejected' });
      setTimeout(() => load(), 800);
    } catch (e: any) {
      setActionMsg({ ...actionMsg, [transactionId]: 'Error: ' + (e.response?.data?.error || e.message) });
    }
  };

  const filteredTx = transactions.filter(t =>
    t.user_name?.toLowerCase().includes(txSearch.toLowerCase()) ||
    t.description?.toLowerCase().includes(txSearch.toLowerCase())
  );

  const isStaff = ['admin', 'super_admin', 'manager'].includes(user?.role || '');
  if (!isStaff) return <div style={{ padding: 40, color: 'var(--danger-color)' }}>Access denied.</div>;

  return (
    <div className="app-page">
      <div style={S.header}>
        <div>
          <h2 style={S.heading}>Wallet Manager</h2>
          <p style={S.sub}>Review all transactions and verify pending bKash payments</p>
        </div>
        <button onClick={load} style={S.refreshBtn}>Refresh</button>
      </div>

      <div style={S.tabs}>
        <button style={activeTab === 'bkash' ? S.activeTab : S.tab} onClick={() => setActiveTab('bkash')}>
          bKash Verification
          {pendingBkash.length > 0 && activeTab !== 'bkash' && (
            <span style={S.badge}>{pendingBkash.length}</span>
          )}
        </button>
        <button style={activeTab === 'transactions' ? S.activeTab : S.tab} onClick={() => setActiveTab('transactions')}>
          All Transactions
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner dark" style={{ marginTop: 24 }} />
      ) : error ? (
        <div style={S.errorBox}>{error}</div>
      ) : activeTab === 'bkash' ? (
        <>
          {/* bKash Admin Settings (wallet number + auto-verify) */}
          <h3 style={{ ...S.sectionTitle, marginTop: 28, marginBottom: 16 }}>bKash Receiving Wallet (Admin Settings)</h3>
          {!adminSettings ? (
            <div className="loading-spinner dark" style={{ marginTop: 12 }} />
          ) : (
            <div style={S.settingsCard}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div>
                  <label style={S.label}>System Bkash </label>
                  <input
                    type="text"
                    value={adminSettings.adminPersonalNumber}
                    onChange={(e) => setAdminSettings((s: any) => s ? { ...s, adminPersonalNumber: e.target.value.replace(/\D/g, '') } : s)}
                    style={{ ...S.input, fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, fontSize: 16 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Send Money receipts arrive here.
                  </div>
                </div>
                <div>
                  <label style={S.label}>Account Holder Name</label>
                  <input
                    type="text"
                    value={adminSettings.adminPersonalName}
                    onChange={(e) => setAdminSettings((s: any) => s ? { ...s, adminPersonalName: e.target.value } : s)}
                    style={S.input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={saveAdminSettings}
                  disabled={settingsSaving}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, var(--primary-color), #4A3FFF)',
                    color: '#fff', fontWeight: 800, fontSize: 13,
                    boxShadow: '0 6px 16px -4px rgba(108,99,255,0.45)',
                  }}
                >
                  {settingsSaving ? '…' : 'Save Wallet Settings'}
                </button>
              </div>
            </div>
          )}

          <h3 style={{ ...S.sectionTitle, marginTop: 32, marginBottom: 16 }}>Pending bKash Verifications ({pendingBkash.length})</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Check each student's TrxID against your personal bKash statement, adjust the credit amount if needed, then approve or reject.
          </p>
          {pendingBkash.length === 0 ? (
            <div style={S.emptyBox}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#x2705;</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>All caught up!</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>No pending bKash verifications.</div>
            </div>
          ) : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Date &amp; Time</th>
                    <th style={S.th}>Student</th>
                    <th style={S.th}>Their bKash #</th>
                    <th style={S.th}>TrxID</th>
                    <th style={S.th}>Submitted</th>
                    <th style={S.th}>Credit Amount (editable)</th>
                    <th style={S.th}>Admin Note</th>
                    <th style={S.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBkash.map((p) => {
                    const gr = p.gateway_response || {};
                    const msg = actionMsg[p.transaction_id];
                    return (
                      <tr key={p.transaction_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={S.td}>
                          <div style={{ fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: 700 }}>{p.user_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.student_id}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.email}</div>
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', color: '#e2136e', fontWeight: 700 }}>
                          {gr.user_bkash_number || '-'}
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 700 }}>
                          {gr.bkash_transaction_id || '-'}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#1565C0' }}>
                          {'\u09f3'} {parseFloat(p.amount).toFixed(2)}
                        </td>
                        <td style={S.td}>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={creditAmount[p.transaction_id] ?? p.amount}
                            onChange={e => setCreditAmount({ ...creditAmount, [p.transaction_id]: e.target.value })}
                            style={S.amtInput}
                          />
                        </td>
                        <td style={S.td}>
                          <input
                            type="text"
                            placeholder="Optional note..."
                            value={adminNote[p.transaction_id] || ''}
                            onChange={e => setAdminNote({ ...adminNote, [p.transaction_id]: e.target.value })}
                            style={S.noteInput}
                          />
                        </td>
                        <td style={S.td}>
                          {msg ? (
                            <div style={{ fontSize: 13, fontWeight: 600, color: msg === 'Approved' ? '#2E7D32' : msg === 'Rejected' ? '#C62828' : 'var(--text-secondary)' }}>
                              {msg}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                              <button onClick={() => approveBkash(p.transaction_id)} style={S.approveBtn}>
                                Approve &amp; Credit
                              </button>
                              <button onClick={() => rejectBkash(p.transaction_id)} style={S.rejectBtn}>
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search by student name or description..."
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
              style={{ ...S.noteInput, maxWidth: 380 }}
            />
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Student</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>No transactions found.</td></tr>
                ) : filteredTx.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ ...S.td, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(t.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{t.user_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.user_email}</div>
                    </td>
                    <td style={S.td}>
                      <span style={{
                        ...S.typeBadge,
                        background: t.type === 'recharge' ? '#E8F5E9' : '#FFF3E0',
                        color: t.type === 'recharge' ? '#2E7D32' : '#E65100',
                      }}>
                        {t.type}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: t.type === 'recharge' ? '#2E7D32' : '#C62828' }}>
                      {t.type === 'recharge' ? '+' : '-'}{'\u09f3'}{Number(t.amount).toFixed(2)}
                    </td>
                    <td style={{ ...S.td, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 280 }}>
                      {t.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' },
  heading: { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' },
  sub: { fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 },
  refreshBtn: { padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 },
  tabs: { display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--border-color)' },
  tab: { padding: '10px 22px', borderRadius: '8px 8px 0 0', background: 'transparent', border: '1px solid transparent', borderBottom: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 14, position: 'relative' },
  activeTab: { padding: '10px 22px', borderRadius: '8px 8px 0 0', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderBottom: '2px solid var(--bg-card)', color: 'var(--primary-color, #6C63FF)', cursor: 'pointer', fontWeight: 800, fontSize: 14, marginBottom: -2, position: 'relative' },
  badge: { marginLeft: 8, background: '#e2136e', color: '#fff', borderRadius: 12, padding: '2px 7px', fontSize: 11, fontWeight: 700 },
  settingsCard: {
    background: 'var(--card-bg)', padding: 24, borderRadius: 16,
    boxShadow: 'var(--shadow-md)', marginBottom: 32, border: '1px solid var(--border-color)',
  },
  errorBox: { color: 'var(--danger-color)', background: 'var(--danger-bg)', padding: '16px 20px', borderRadius: 10, fontWeight: 600 },
  emptyBox: { textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border-color)' },
  tableWrap: { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: { padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' },
  td: { padding: '12px 14px', verticalAlign: 'middle', fontSize: 13 },
  amtInput: { width: 90, padding: '7px 10px', borderRadius: 8, border: '2px solid #4CAF50', background: 'var(--bg-input)', color: '#2E7D32', fontWeight: 700, fontSize: 14 },
  noteInput: { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 },
  approveBtn: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2E7D32, #43A047)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  rejectBtn: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #C62828, #E53935)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  typeBadge: { padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' },
};

import React from 'react';
