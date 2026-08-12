require('dotenv').config();
const { Client } = require('pg');

const BASE = 'http://localhost:5000/api';
const TEST_RFID = 'RF-PARK-TEST-V3-9001';
const TEST_VEHICLE = 'DHAKA-GH-2025-7790';
const TEST_EMAIL = 'parking.test.student.v3@g.bracu.ac.bd';
const NOPROF_EMAIL = 'noprof.v3@g.bracu.ac.bd';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { response: { status: res.status, data } });
  return data;
}
async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { response: { status: res.status, data } });
  return data;
}

const pg = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

(async function main() {
  try {
    console.log('Step 0: Connect to Supabase and clean up prior test user...');
    await pg.connect();
    const cleanupEmails = [TEST_EMAIL, NOPROF_EMAIL];
    for (const em of cleanupEmails) {
      await pg.query(`DELETE FROM parking_sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [em]);
      await pg.query(`DELETE FROM parking_profiles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [em]);
      await pg.query(`DELETE FROM transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email = $1))`, [em]);
      await pg.query(`DELETE FROM wallets WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [em]);
      await pg.query(`DELETE FROM users WHERE email = $1`, [em]);
    }
    console.log('Cleanup done.\n');

    console.log('Step 1: Register a fresh student...');
    const reg = await post('/auth/register', {
      name: 'Parking Test Student V3',
      studentId: 'STU-PARK-V3-001',
      email: TEST_EMAIL,
      password: 'Park@123',
      role: 'student',
      department: 'CSE',
    });
    const userId = reg.user.id;
    const authToken = reg.token;
    console.log(`Created user id=${userId}, email=${TEST_EMAIL}, token-len=${authToken.length}\n`);

    console.log('Step 2: Assign RFID to this user...');
    const rfidReg = await post('/rfid/register', { user_id: userId, rfid_id: TEST_RFID }, authToken);
    console.log(`RFID registered: ${JSON.stringify(rfidReg.user)}\n`);

    console.log('Step 3: Set up PARKING PROFILE (link vehicle registration) — Requirement 2');
    const profile = await post('/parking/profile', { vehicleRegNo: TEST_VEHICLE }, authToken);
    console.log(`Parking profile: ${JSON.stringify(profile.profile)}\n`);

    console.log('Step 4: Top up wallet (so exit can deduct fee)...');
    await pg.query(`UPDATE wallets SET balance = 500.00 WHERE user_id = $1`, [userId]);
    const w = await pg.query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    console.log(`Wallet topped up. Balance = ${w.rows[0].balance} ৳\n`);

    console.log('Step 5: RFID scan at PARKING ENTRANCE — Requirement 1 (student record) + 3 (3-digit digital token)');
    const entry = await post('/rfid/parking/entry', { rfid_id: TEST_RFID });
    console.log(JSON.stringify(entry, null, 2));
    const token = entry.entry.digital_token;
    if (!/^\d{3}$/.test(token)) throw new Error(`Token "${token}" is NOT a 3-digit number`);
    console.log(`\nDIGITAL TOKEN (3-digit): ${token}  ✅\n`);

    console.log('(waiting 3s so exit has a measurable stay duration)...\n');
    await new Promise(r => setTimeout(r, 3000));

    console.log('Step 6: RFID scan at PARKING EXIT — Requirement 4 (duration + bill + auto deduct)');
    const exit = await post('/rfid/parking/exit', { rfid_id: TEST_RFID });
    console.log(JSON.stringify(exit, null, 2));
    console.log(`\nBill summary: ${exit.bill.billed_hours}hr × ${exit.bill.rate_per_hour}৳ = ${exit.bill.total_fee}৳ (${exit.bill.duration_minutes}min stay)`);
    console.log(`Wallet: ${exit.wallet.balance_before} → ${exit.wallet.balance_after}  (deducted ${exit.wallet.deducted}৳)`);
    console.log(`Transaction id: ${exit.transaction.id}\n`);

    // Edge cases: double entry (should fail since session is already done; try to re-entry first)
    console.log('Step 7: Edge cases');
    // 7a. Create ANOTHER active session first (so we can test double-entry rejection)
    console.log('7a. Re-entry while NO active session → should work (create a new session)');
    const entry2 = await post('/rfid/parking/entry', { rfid_id: TEST_RFID });
    console.log(`   ✔ Created session #${entry2.entry.session_id}, token=${entry2.entry.digital_token}`);

    console.log('7b. Double-entry while session IS active → MUST fail');
    let doubleEntryFailed = false;
    try {
      await post('/rfid/parking/entry', { rfid_id: TEST_RFID });
    } catch (e) {
      doubleEntryFailed = true;
      console.log(`   ✔ Double entry correctly blocked: ${e.response?.data?.error || e.message}`);
    }
    if (!doubleEntryFailed) { console.error('   ❌ Double entry should have been rejected!'); process.exit(1); }

    console.log('7c. Double-exit while session IS active → 1st closes, 2nd MUST fail');
    await post('/rfid/parking/exit', { rfid_id: TEST_RFID });
    console.log('   ✔ First exit OK');
    let doubleExitFailed = false;
    try {
      await post('/rfid/parking/exit', { rfid_id: TEST_RFID });
    } catch (e) {
      doubleExitFailed = true;
      console.log(`   ✔ Second exit correctly blocked: ${e.response?.data?.error || e.message}`);
    }
    if (!doubleExitFailed) { console.error('   ❌ Double exit should have been rejected!'); process.exit(1); }

    console.log('7d. Unregistered RFID → MUST fail');
    let badRfidFailed = false;
    try {
      await post('/rfid/parking/entry', { rfid_id: 'UNREGISTERED-RFID-XYZ' });
    } catch (e) {
      badRfidFailed = true;
      console.log(`   ✔ Unknown RFID correctly blocked: ${e.response?.data?.error || e.message}`);
    }
    if (!badRfidFailed) { console.error('   ❌ Unknown RFID should have been rejected!'); process.exit(1); }

    console.log('7e. Parking without a profile → MUST fail');
    // Create new throwaway user + RFID (but NO profile) to test
    const noProf = await post('/auth/register', { name:'No Parking Profile V3', studentId:'STU-NOPROF-V3-01', email:NOPROF_EMAIL, password:'x', role:'student', department:'CSE' });
    await post('/rfid/register', { user_id: noProf.user.id, rfid_id: 'RF-NO-PROFILE-001' }, noProf.token);
    let noProfileFailed = false;
    try {
      await post('/rfid/parking/entry', { rfid_id: 'RF-NO-PROFILE-001' });
    } catch (e) {
      noProfileFailed = true;
      console.log(`   ✔ No-profile entry correctly blocked: ${e.response?.data?.error || e.message}`);
    }
    if (!noProfileFailed) { console.error('   ❌ No-profile should have been rejected!'); process.exit(1); }

    console.log('\nStep 8: Verify session list (student view)...');
    const sessions = await get('/parking/sessions', authToken);
    console.log(`Total sessions returned: ${sessions.sessions.length}`);
    sessions.sessions.slice(0, 3).forEach(s => console.log(`  - #${s.id} ${s.status} ${s.duration_minutes || 0}min fee=${s.fee || 0}৳ token=${s.digital_token}`));

    console.log('\n✅ ALL REQUIREMENTS PASSED END-TO-END');
  } catch (e) {
    console.error('\n❌ TEST FAILED:', e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data)) : e.message);
    if (e.response?.data?.details) console.error('Details:', e.response.data.details);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await pg.end();
  }
})();
