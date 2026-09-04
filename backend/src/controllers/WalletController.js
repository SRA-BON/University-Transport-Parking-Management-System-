const Wallet = require('../models/Wallet');
const PendingPayment = require('../models/PendingPayment');
const SystemSetting = require('../models/SystemSetting');
const SSLCommerzService = require('../services/sslcommerzService');
const NotificationService = require('../services/NotificationService');
const User = require('../models/User');
const pool = require('../config/db');
const crypto = require('crypto');

const FRONTEND_URL = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets
// ─────────────────────────────────────────────────────────────────────────────
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    let wallet = await Wallet.findByUserId(userId);

    if (!wallet) {
      await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [userId]);
      wallet = await Wallet.findByUserId(userId);
    }

    res.status(200).json(wallet);
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/transactions
// ─────────────────────────────────────────────────────────────────────────────
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT t.* FROM transactions t JOIN wallets w ON t.wallet_id = w.id WHERE w.user_id = $1 ORDER BY t.created_at DESC',
      [userId]
    );
    res.status(200).json({ transactions: result.rows });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/all-transactions
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllTransactions = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const result = await pool.query(`
      SELECT t.*, u.name as user_name, u.email as user_email, 
      COALESCE(s.student_id, m.manager_id, b.bus_attendant_id, p.parking_attendant_id) as student_id
      FROM transactions t 
      JOIN wallets w ON t.wallet_id = w.id 
      JOIN users u ON w.user_id = u.id 
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN managers m ON m.user_id = u.id
      LEFT JOIN bus_attendants b ON b.user_id = u.id
      LEFT JOIN parking_attendants p ON p.user_id = u.id
      ORDER BY t.created_at DESC
    `);
    res.status(200).json({ transactions: result.rows });
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/recharge
// ─────────────────────────────────────────────────────────────────────────────
exports.rechargeWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, method } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Generate a unique transaction ID
    const transactionId = crypto.randomBytes(16).toString('hex');

    // Store pending payment record
    await PendingPayment.create(userId, transactionId, amount, 'sslcommerz', 'pending');

    // Fetch user details for SSLCommerz customer fields
    const user = await User.findById(userId);

    // Build callback URLs
    const successCallbackUrl = `${process.env.BASE_URL}/api/wallets/success/${transactionId}`;
    const failCallbackUrl    = `${process.env.BASE_URL}/api/wallets/fail/${transactionId}`;
    const cancelCallbackUrl  = `${process.env.BASE_URL}/api/wallets/cancel/${transactionId}`;
    const notifyUrl          = `${process.env.BASE_URL}/api/wallets/ipn/${transactionId}`;

    // Initialize payment with SSLCommerz
    const paymentResult = await SSLCommerzService.createPayment(
      amount,
      transactionId,
      user,
      successCallbackUrl,
      failCallbackUrl,
      cancelCallbackUrl,
      notifyUrl
    );

    if (!paymentResult || !paymentResult.GatewayPageURL) {
      return res.status(502).json({ error: 'SSLCommerz did not return a payment URL. Check server logs.' });
    }

    res.status(200).json({
      message:    'Payment initialized',
      paymentUrl: paymentResult.GatewayPageURL,
      payment_url: paymentResult.GatewayPageURL,  // alias used by frontend
      sessionkey: paymentResult.sessionkey,
      transactionId,
    });
  } catch (error) {
    console.error('[Wallet] Recharge error:', error);
    res.status(400).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/query/:sessionKey
// ─────────────────────────────────────────────────────────────────────────────
exports.queryTransaction = async (req, res) => {
  try {
    const { sessionKey } = req.params;
    if (!sessionKey) {
      return res.status(400).json({ error: 'Missing sessionKey' });
    }

    const result = await SSLCommerzService.queryTransactionBySession(sessionKey);
    res.status(200).json(result);
  } catch (error) {
    console.error('[Wallet] Query transaction error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/success/:transactionId
// SSLCommerz redirects the customer browser here on successful payment.
// Must call Order Validation API and verify amount before crediting wallet.
// ─────────────────────────────────────────────────────────────────────────────
exports.handlePaymentSuccess = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const paymentData = req.body; // SSLCommerz POST body: val_id, tran_id, amount, bank_tran_id, ...

    console.log('[Wallet] Success callback — tran_id:', transactionId);
    console.log('[Wallet] SSLCommerz POST fields:', {
      val_id:       paymentData.val_id,
      tran_id:      paymentData.tran_id,
      amount:       paymentData.amount,
      currency:     paymentData.currency,
      status:       paymentData.status,
      bank_tran_id: paymentData.bank_tran_id,
    });

    // 1. Find pending payment record
    const pendingPayment = await PendingPayment.findByTransactionId(transactionId);
    if (!pendingPayment) {
      console.error('[Wallet] No pending payment for tran_id:', transactionId);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
    }

    // 2. Idempotency guard
    if (pendingPayment.status !== 'pending') {
      console.warn('[Wallet] Payment already processed:', pendingPayment.status);
      if (pendingPayment.status === 'completed') {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=success&amount=${pendingPayment.amount}`);
      }
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
    }

    // 3. Call the SSLCommerz Order Validation API
    //    GET /validator/api/validationserverAPI.php?val_id=&store_id=&store_passwd=&format=json
    const validationResult = await SSLCommerzService.validatePayment(paymentData);

    console.log('[Wallet] Validation API response:', {
      status:       validationResult.status,
      tran_id:      validationResult.tran_id,
      amount:       validationResult.amount,
      bank_tran_id: validationResult.bank_tran_id,
    });

    // 4. Accept VALID or VALIDATED (VALIDATED = re-call after already validated)
    const isValid = validationResult.status === 'VALID' || validationResult.status === 'VALIDATED';
    if (!isValid) {
      console.error('[Wallet] Validation failed — status:', validationResult.status);
      await PendingPayment.updateStatus(pendingPayment.id, 'failed', validationResult);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
    }

    // 5. Amount verification — prevent price-tampering attacks
    const validatedAmount = parseFloat(validationResult.amount);
    const expectedAmount  = parseFloat(pendingPayment.amount);

    if (Math.abs(validatedAmount - expectedAmount) > 0.01) {
      console.error(`[Wallet] AMOUNT MISMATCH — expected ৳${expectedAmount}, validated ৳${validatedAmount}`);
      await PendingPayment.updateStatus(pendingPayment.id, 'failed', {
        ...validationResult,
        _rejection_reason: 'amount_mismatch',
        _expected_amount:  expectedAmount,
        _validated_amount: validatedAmount,
      });
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
    }

    // 6. All checks passed — credit wallet
    const bankTranId = validationResult.bank_tran_id || transactionId;
    console.log(`[Wallet] ✅ Crediting ৳${expectedAmount} to user ${pendingPayment.user_id} | bank_tran_id: ${bankTranId}`);

    await PendingPayment.updateStatus(pendingPayment.id, 'completed', {
      ...validationResult,
      _bank_tran_id: bankTranId,
    });

    const description = `SSLCommerz recharge ৳${expectedAmount} (Bank TxID: ${bankTranId})`;
    await Wallet.updateBalance(pendingPayment.user_id, expectedAmount, description);

    // Notify user of successful payment
    NotificationService.notifyPaymentSuccess(pendingPayment.user_id, expectedAmount)
      .catch(err => console.error('Failed to notify payment success:', err));

    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=success&amount=${expectedAmount}`
    );

  } catch (error) {
    console.error('[Wallet] Success callback error:', error);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/cancel/:transactionId
// ─────────────────────────────────────────────────────────────────────────────
exports.handlePaymentCancel = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const pendingPayment = await PendingPayment.findByTransactionId(transactionId);

    if (pendingPayment) {
      await PendingPayment.updateStatus(pendingPayment.id, 'cancelled', req.body);
    }

    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=cancelled`);
  } catch (error) {
    console.error('[Wallet] Cancel callback error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/fail/:transactionId
// ─────────────────────────────────────────────────────────────────────────────
exports.handlePaymentFail = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const pendingPayment = await PendingPayment.findByTransactionId(transactionId);

    if (pendingPayment) {
      await PendingPayment.updateStatus(pendingPayment.id, 'failed', req.body);
    }

    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/?payment=failed`);
  } catch (error) {
    console.error('[Wallet] Fail callback error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/ipn/:transactionId
//
// IPN (Instant Payment Notification) — SSLCommerz POSTs here BEFORE the
// customer is redirected back. Implements full 5-step validation per docs:
//
//   IPN POST Parameters:
//     status       – VALID / FAILED / CANCELLED / EXPIRED / UNATTEMPTED
//     tran_date    – Payment completion date
//     tran_id      – Our unique transaction ID (validate against DB)
//     val_id       – Validation ID (use with Order Validation API)
//     amount       – Total amount (validate against DB for security)
//     store_amount – Amount after bank commission (informational)
//     card_type    – Bank gateway selected by customer
//     bank_tran_id – Transaction ID at bank's end
//     verify_sign  – MD5 Data Validation Key (MUST verify before processing)
//     verify_key   – Comma-separated list of field names used in hash
// ─────────────────────────────────────────────────────────────────────────────
exports.handleIPN = async (req, res) => {
  // ALWAYS respond HTTP 200 first — prevents SSLCommerz retry storm
  res.status(200).send('IPN received');

  try {
    const ipnData = req.body;

    // ── Log all IPN fields for audit ──────────────────────────────────────
    console.log('[IPN] Notification received:', {
      status:       ipnData.status,
      tran_id:      ipnData.tran_id,
      val_id:       ipnData.val_id,
      amount:       ipnData.amount,
      store_amount: ipnData.store_amount,
      card_type:    ipnData.card_type,
      bank_tran_id: ipnData.bank_tran_id,
      tran_date:    ipnData.tran_date,
      verify_sign:  ipnData.verify_sign ? '***present***' : 'MISSING',
      verify_key:   ipnData.verify_key,
    });

    // ── STEP 1: Verify IPN signature (verify_sign) ─────────────────────────
    //    Confirms the POST came from SSLCommerz and wasn't tampered.
    const signResult = SSLCommerzService.verifyIPNSign(ipnData);
    if (!signResult.valid) {
      console.error('[IPN] ❌ Signature verification FAILED:', signResult.reason);
      return; // Drop silently — never trust unsigned/tampered IPN
    }
    console.log('[IPN] ✅ Signature verified');

    // ── STEP 2: Pre-filter by IPN status ──────────────────────────────────
    //    Only VALID status proceeds to the Order Validation API call.
    //    FAILED / CANCELLED / EXPIRED / UNATTEMPTED = mark payment and exit.
    if (ipnData.status !== 'VALID') {
      console.warn('[IPN] Non-VALID IPN status:', ipnData.status, '| tran_id:', ipnData.tran_id);

      if (ipnData.tran_id) {
        const pp = await PendingPayment.findByTransactionId(ipnData.tran_id);
        if (pp && pp.status === 'pending') {
          const failStatus = ipnData.status === 'CANCELLED' ? 'cancelled' : 'failed';
          await PendingPayment.updateStatus(pp.id, failStatus, ipnData);
          console.log(`[IPN] Marked ${ipnData.tran_id} as ${failStatus}`);
        }
      }
      return;
    }

    // ── STEP 3: Validate tran_id against our database ─────────────────────
    const tran_id = ipnData.tran_id;
    if (!tran_id) {
      console.error('[IPN] No tran_id in IPN data');
      return;
    }

    const pendingPayment = await PendingPayment.findByTransactionId(tran_id);
    if (!pendingPayment) {
      console.error('[IPN] No pending payment found for tran_id:', tran_id);
      return;
    }

    // Idempotency guard — skip if already processed
    if (pendingPayment.status !== 'pending') {
      console.warn('[IPN] Already processed (status:', pendingPayment.status, ') — skipping');
      return;
    }

    // ── STEP 4: Call Order Validation API with val_id ─────────────────────
    //    GET /validator/api/validationserverAPI.php
    //      ?val_id=<val_id>&store_id=<id>&store_passwd=<pw>&format=json
    const validationResult = await SSLCommerzService.validatePayment(ipnData);
    const isValid = validationResult.status === 'VALID' || validationResult.status === 'VALIDATED';

    if (!isValid) {
      console.error('[IPN] Order Validation API rejected — status:', validationResult.status);
      await PendingPayment.updateStatus(pendingPayment.id, 'failed', validationResult);
      return;
    }

    // ── STEP 5: Verify amount matches our stored record ────────────────────
    //    Docs: "This parameter needs to be validated with your system database
    //    for security"
    const validatedAmount = parseFloat(validationResult.amount);
    const expectedAmount  = parseFloat(pendingPayment.amount);

    if (Math.abs(validatedAmount - expectedAmount) > 0.01) {
      console.error(
        `[IPN] ❌ AMOUNT MISMATCH — expected ৳${expectedAmount}, validated ৳${validatedAmount}`,
        `| store_amount (after commission): ৳${ipnData.store_amount}`
      );
      await PendingPayment.updateStatus(pendingPayment.id, 'failed', {
        ...validationResult,
        _rejection_reason:  'amount_mismatch',
        _expected_amount:   expectedAmount,
        _validated_amount:  validatedAmount,
        _ipn_store_amount:  ipnData.store_amount,
      });
      return;
    }

    // ── All checks passed — credit wallet ─────────────────────────────────
    const bankTranId = validationResult.bank_tran_id || ipnData.bank_tran_id || tran_id;
    const cardType   = ipnData.card_type || 'SSLCommerz';

    console.log(`[IPN] ✅ All checks passed`);
    console.log(`[IPN]    tran_id:       ${tran_id}`);
    console.log(`[IPN]    val_id:        ${ipnData.val_id}`);
    console.log(`[IPN]    amount:        ৳${validatedAmount}`);
    console.log(`[IPN]    store_amount:  ৳${ipnData.store_amount} (after ${cardType} commission)`);
    console.log(`[IPN]    card_type:     ${cardType}`);
    console.log(`[IPN]    bank_tran_id:  ${bankTranId}`);
    console.log(`[IPN]    tran_date:     ${ipnData.tran_date}`);

    await PendingPayment.updateStatus(pendingPayment.id, 'completed', {
      ...validationResult,
      _bank_tran_id: bankTranId,
      _card_type:    cardType,
      _store_amount: ipnData.store_amount,
      _tran_date:    ipnData.tran_date,
    });

    const description = `SSLCommerz ৳${validatedAmount} via ${cardType} (Bank: ${bankTranId}, Date: ${ipnData.tran_date})`;
    await Wallet.updateBalance(pendingPayment.user_id, validatedAmount, description);

    // Notify the user asynchronously
    NotificationService.notifyPaymentSuccess(pendingPayment.user_id, validatedAmount)
      .catch(err => console.error('Failed to notify payment success:', err));

    console.log(`[IPN] 💰 Credited ৳${validatedAmount} to user ${pendingPayment.user_id}`);

  } catch (error) {
    // Catch-all: 200 was already sent, just log for debugging
    console.error('[IPN] Unhandled error:', error.message, error.stack);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/bkash-config
// Returns the admin's personal bKash account number for display in the UI.
// Mutable via system_settings table — admin changes live at runtime without redeploy.
// Also returns auto-verify flag so UI can inform user whether manual verification
// waits for admin approval or is instantly credited.
// ─────────────────────────────────────────────────────────────────────────────
exports.getBkashConfig = async (req, res) => {
  try {
    const [adminBkashNumber, adminBkashName] = await Promise.all([
      SystemSetting.get('bkash.admin_personal_number'),
      SystemSetting.get('bkash.admin_personal_name'),
    ]);
    res.status(200).json({
      adminBkashNumber,
      adminBkashName,
    });
  } catch (error) {
    console.error('[Wallet] bKash config error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/bkash-settings
// Staff only: returns ALL bKash system settings for configuration UI.
// ─────────────────────────────────────────────────────────────────────────────
exports.getBkashSettings = async (req, res) => {
  try {
    if (!['manager', 'super_admin', 'admin', 'developer'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const all = await SystemSetting.getAll();
    res.status(200).json({
      settings: {
        adminPersonalNumber: all['bkash.admin_personal_number'],
        adminPersonalName:  all['bkash.admin_personal_name'],
      },
    });
  } catch (error) {
    console.error('[Wallet] bKash settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/bkash-settings
// Staff only: save admin bKash number / auto-verify preference
// ─────────────────────────────────────────────────────────────────────────────
exports.saveBkashSettings = async (req, res) => {
  try {
    if (!['manager', 'super_admin', 'admin', 'developer'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const { adminPersonalNumber, adminPersonalName } = req.body || {};
    const cleanNum = (adminPersonalNumber || '').toString().replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(cleanNum)) {
      return res.status(400).json({ error: 'bKash number must be 10-15 digits' });
    }
    await SystemSetting.set('bkash.admin_personal_number', cleanNum, req.user.id);
    await SystemSetting.set('bkash.admin_personal_name', String(adminPersonalName || 'Transport Admin'), req.user.id);
    const all = await SystemSetting.getAll();
    res.status(200).json({
      message: 'bKash wallet settings saved.',
      settings: {
        adminPersonalNumber: all['bkash.admin_personal_number'],
        adminPersonalName:  all['bkash.admin_personal_name'],
      },
    });
  } catch (error) {
    console.error('[Wallet] save bKash settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/bkash/submit
// User submits a bKash Send Money transfer they completed from their personal
// bKash wallet to the admin's personal bKash wallet.
//
// AUTO-VERIFY FLOW (default — when bkash.auto_verify = 'true'):
//   Since personal bKash accounts have NO public merchant/Checkout/API, the
//   system cannot programmatically verify Send Money receipts against bKash
//   servers. Instead we trust the TrxID, IMMEDIATELY credit the wallet,
//   and mark the payment as completed with an auto_verified:true flag.
//   Admin retains ability to REVERSE the charge later if the money never actually
//   arrived (via /bkash/reverse/:transactionId endpoint).
//
// MANUAL FLOW (when bkash.auto_verify = 'false'):
//   Original behaviour — write to pending_bkash_verification queue, wait for staff
//   Approve & Credit button on the admin panel.
// ─────────────────────────────────────────────────────────────────────────────
exports.submitBkashPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, userBkashNumber, bkashTransactionId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const cleanBkash = (userBkashNumber || '').toString().replace(/^\+?(?:88)?/, '');
    if (!/^\d{11}$/.test(cleanBkash)) {
      return res.status(400).json({ error: 'Please enter a valid 11-digit bKash account number' });
    }
    if (!bkashTransactionId || bkashTransactionId.length < 4) {
      return res.status(400).json({ error: 'Please enter the bKash Transaction ID (TrxID)' });
    }

    const transactionId = 'BK' + crypto.randomBytes(12).toString('hex').toUpperCase();
    const adminBkashNumber = await SystemSetting.get('bkash.admin_personal_number');
    const adminBkashName  = await SystemSetting.get('bkash.admin_personal_name');

    const initialStatus = 'pending_bkash_verification';
    const payment = await PendingPayment.create(userId, transactionId, amount, 'bkash_manual', initialStatus);

    const meta = {
      method: 'bkash_manual',
      user_bkash_number: cleanBkash,
      bkash_transaction_id: bkashTransactionId,
      admin_bkash_number: adminBkashNumber,
      admin_bkash_name:   adminBkashName,
      submitted_at: new Date().toISOString(),
    };

    // ── MANUAL: queue for admin review ─────────────────────────────────────
    await PendingPayment.updateStatus(payment.id, 'pending_bkash_verification', meta);
    return res.status(201).json({
      message: 'bKash payment submitted for manual verification. Wallet will be recharged once admin confirms the Send Money receipt.',
      transactionId,
      status: 'pending_bkash_verification',
      autoVerify: false,
      expectedAmount: amount,
      adminBkashNumber,
    });
  } catch (error) {
    console.error('[Wallet] Submit bKash payment error:', error);
    res.status(400).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/bkash/reverse/:transactionId
// Staff only: undo/revert an auto-credited (or admin-approved) bKash payment.
// Used when admin checks their personal bKash SMS/statement and discovers
// the user never actually sent the money (fraudulent TrxID claim).
// Deducts the full amount from the user's wallet (blocks if insufficient,
// or allows negative with a wallet-debt note if balance cannot cover reversal).
// ─────────────────────────────────────────────────────────────────────────────
exports.reverseBkashPayment = async (req, res) => {
  try {
    if (!['manager', 'super_admin', 'admin', 'developer'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const { transactionId } = req.params;
    const { adminNote, force = false } = req.body || {};

    const pending = await PendingPayment.findByTransactionId(transactionId);
    if (!pending) return res.status(404).json({ error: 'Payment not found' });
    if (pending.method !== 'bkash_manual') return res.status(400).json({ error: 'Not a bKash manual payment' });
    if (pending.status === 'reversed') return res.status(400).json({ error: 'Payment already reversed' });
    if (pending.status === 'pending_bkash_verification') {
      // If still pending, just mark cancelled
      await PendingPayment.updateStatus(pending.id, 'cancelled', {
        ...(pending.gateway_response || {}),
        cancelled_by: req.user.id,
        cancelled_at: new Date().toISOString(),
        admin_note: adminNote || 'Rejected without prior credit',
      });
      return res.status(200).json({ message: 'Pending payment cancelled — wallet was never touched.' });
    }
    if (pending.status !== 'completed') {
      return res.status(400).json({ error: `Cannot reverse status=${pending.status}` });
    }

    const amount = parseFloat(pending.amount);
    // Try to debit wallet; allow overdraft if force=true
    const negative_ = await (async () => {
      try {
        return await Wallet.updateBalance(pending.user_id, -amount,
          `bKash reversal of ${pending.transaction_id} reversed ৳${amount} (admin: ${req.user.name || 'Admin'}${adminNote ? ' — ' + adminNote : ''})`);
      } catch (e) {
        if (force) {
          // Fallback: force-update bypass. Actually Wallet.updateBalance balance to allow negative
          const walletRow = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [pending.user_id]);
          if (walletRow.rows.length) {
            await pool.query(
              `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
              [amount, walletRow.rows[0].id]
            );
            await pool.query(
              `INSERT INTO transactions (user_id, wallet_id, amount, description, transaction_type, created_at)
               VALUES ($1, $2, -$3, $4, 'reversal', NOW())`,
              [pending.user_id, walletRow.rows[0].id, amount,
                `Forced bKash reversal ৳${amount} by ${req.user.name || 'Admin'}${adminNote ? ' — ' + adminNote : ''}`]
            );
            return { balance_after: 'debt_created' };
          }
          throw e;
        }
        throw e;
      }
    })();

    await PendingPayment.updateStatus(pending.id, 'reversed', {
      ...(pending.gateway_response || {}),
      reversed_by_user_id: req.user.id,
      reversed_by_name:  req.user.name,
      reversed_at:  new Date().toISOString(),
      admin_note: adminNote || null,
    });
    return res.status(200).json({
      message: `Reversed — ৳${amount} debited from user wallet.`,
      wallet: negative_,
    });
  } catch (error) {
    console.error('[Wallet] bKash reverse error:', error);
    res.status(400).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/reverse-direct
// Staff-only generic reversal helper (used by "Completed bKash reversable" UI) —
// deducts arbitrary amount from a user wallet and writes a reversal transaction.
// Designed for undoing recharges that don't have a matching pending_payment row
// (e.g. test-mode recharges, or bKash rows that were marked completed before
//  the admin notices they were never actually paid on their personal statement).
// ─────────────────────────────────────────────────────────────────────────────
exports.reverseDirect = async (req, res) => {
  try {
    if (!['manager', 'super_admin', 'admin', 'developer'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const { user_id, amount, reference, force = false } = req.body || {};
    const amtNum = parseFloat(amount);
    if (!user_id || !amtNum || amtNum <= 0) {
      return res.status(400).json({ error: 'user_id and positive amount are required' });
    }

    let wallet;
    try {
      wallet = await Wallet.updateBalance(
        user_id,
        -amtNum,
        reference || `Direct reversal ৳${amtNum} by ${req.user?.name || 'Admin'}`
      );
    } catch (e) {
      if (force) {
        const row = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [user_id]);
        if (row.rows.length) {
          await pool.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amtNum, row.rows[0].id]);
          await pool.query(
            `INSERT INTO transactions (user_id, wallet_id, amount, description, transaction_type, created_at)
             VALUES ($1, $2, -$3, $4, 'reversal', NOW())`,
            [user_id, row.rows[0].id, amtNum,
              `Forced direct reversal ৳${amtNum} by ${req.user?.name || 'Admin'}${reference ? ' — ' + reference : ''}`]
          );
          wallet = { balance_after: 'debt_created' };
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    res.status(200).json({ message: 'Reversal applied.', wallet });
  } catch (error) {
    console.error('[Wallet] reverseDirect error:', error);
    res.status(400).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wallets/bkash/pending
// Manager/Admin only. Lists all bKash manual payments awaiting verification.
// ─────────────────────────────────────────────────────────────────────────────
exports.listPendingBkashPayments = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    const rows = await PendingPayment.listPendingBkash();
    res.status(200).json({ payments: rows });
  } catch (error) {
    console.error('[Wallet] List pending bKash error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallets/bkash/verify/:transactionId
// Manager/Admin only. Approves or rejects a manually-submitted bKash payment.
// Approve → credits user wallet and pushes success notification + marks completed.
// Reject → marks failed, notifies user of rejection.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyBkashPayment = async (req, res) => {
  try {
    if (!['super_admin', 'admin', 'manager', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const { transactionId } = req.params;
    const { approved, adminNote, creditAmount } = req.body;

    const pending = await PendingPayment.findByTransactionId(transactionId);
    if (!pending) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (pending.status !== 'pending_bkash_verification') {
      return res.status(400).json({ error: `Payment already processed (status: ${pending.status})` });
    }

    // Admin may override the amount to credit (e.g. if student entered wrong amount)
    const submittedAmount = parseFloat(pending.amount);
    const creditAmt = creditAmount && parseFloat(creditAmount) > 0
      ? parseFloat(creditAmount)
      : submittedAmount;
    const now = new Date().toISOString();

    if (approved) {
      await PendingPayment.updateStatus(pending.id, 'completed', {
        ...(pending.gateway_response || {}),
        verified_by_user_id: req.user.id,
        verified_by_name: req.user.name,
        verified_at: now,
        admin_note: adminNote || null,
        submitted_amount: submittedAmount,
        credited_amount: creditAmt,
      });

      const description = `bKash recharge ৳${creditAmt}${creditAmt !== submittedAmount ? ` (you submitted ৳${submittedAmount})` : ''} — verified${adminNote ? ': ' + adminNote : ''}`;
      const wallet = await Wallet.updateBalance(pending.user_id, creditAmt, description);

      NotificationService.notifyPaymentSuccess(pending.user_id, creditAmt)
        .catch(err => console.error('Failed to notify bKash payment success:', err));

      return res.status(200).json({
        message: `Wallet credited ৳${creditAmt} via bKash verification.`,
        wallet,
      });
    }

    await PendingPayment.updateStatus(pending.id, 'failed', {
      ...(pending.gateway_response || {}),
      rejected_by_user_id: req.user.id,
      rejected_by_name: req.user.name,
      rejected_at: now,
      admin_note: adminNote || 'Rejected by admin',
    });

    // Create a transaction record for the rejection so the user sees it in their history
    const walletRow = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [pending.user_id]);
    if (walletRow.rows.length) {
      await pool.query(
        `INSERT INTO transactions (wallet_id, amount, type, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
        [walletRow.rows[0].id, 0, 'rejected', `bKash recharge rejected ৳${submittedAmount} (TrxID: ${pending.transaction_id})${adminNote ? ' — ' + adminNote : ''}`, now]
      );
    }

    return res.status(200).json({
      message: 'bKash payment rejected. Wallet was not credited.',
    });
  } catch (error) {
    console.error('[Wallet] Verify bKash payment error:', error);
    res.status(500).json({ error: error.message });
  }
};
