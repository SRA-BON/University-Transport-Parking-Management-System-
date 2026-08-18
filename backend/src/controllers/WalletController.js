const Wallet          = require('../models/Wallet');
const PendingPayment  = require('../models/PendingPayment');
const SSLCommerzService = require('../services/sslcommerzService');
const NotificationService = require('../services/NotificationService');
const User            = require('../models/User');
const pool            = require('../config/db');
const crypto          = require('crypto');

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
    if (!['manager', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await pool.query(
      'SELECT t.*, u.name as user_name, u.email as user_email, u.student_id FROM transactions t JOIN wallets w ON t.wallet_id = w.id JOIN users u ON w.user_id = u.id ORDER BY t.created_at DESC'
    );
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

    // Test / instant mode — skip SSLCommerz gateway
    if (method === 'test') {
      const description  = `Recharge via test (instant)`;
      const updatedWallet = await Wallet.updateBalance(userId, amount, description);
      return res.status(200).json({ message: 'Wallet recharged successfully', wallet: updatedWallet, redirectUrl: null });
    }

    // Generate a unique transaction ID
    const transactionId = crypto.randomBytes(16).toString('hex');

    // Store pending payment record
    await PendingPayment.create(userId, transactionId, amount);

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
