
const SSLCommerzPayment = require('sslcommerz-lts');
const crypto = require('crypto');
require('dotenv').config();

const store_id     = process.env.SSLCOMMERZ_STORE_ID;
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD;
const is_live      = process.env.SSLCOMMERZ_IS_SANDBOX !== 'true'; // false = sandbox mode

// ── API Endpoints (per SSLCommerz docs) ─────────────────────────────────────
const VALIDATION_URL = is_live
  ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
  : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';

class SSLCommerzService {

  // ────────────────────────────────────────────────────────────────────────────
  // 1. PAYMENT INIT
  //    POST /gwprocess/v4/api.php
  //    Returns GatewayPageURL on success.
  // ────────────────────────────────────────────────────────────────────────────
  static async createPayment(amount, transactionId, user, successUrl, failUrl, cancelUrl, notifyUrl) {
    const data = {
      // ── Mandatory ──────────────────────────────────────────────────────────
      total_amount: parseFloat(amount).toFixed(2),
      currency:     'BDT',
      tran_id:      transactionId,
      success_url:  successUrl,
      fail_url:     failUrl,
      cancel_url:   cancelUrl,

      // ── Optional ───────────────────────────────────────────────────────────
      ipn_url:      notifyUrl,

      // ── Product Info (required by sslcommerz-lts FormData builder) ─────────
      product_name:     'Wallet Recharge',
      product_category: 'Service',
      productcategory:  'Service',   // sslcommerz-lts internal field alias
      product_profile:  'general',
      num_of_item:      1,

      // ── Shipping (NO for digital goods) ───────────────────────────────────
      shipping_method: 'NO',

      // ── Customer Info ─────────────────────────────────────────────────────
      cus_name:     user.name  || 'Customer',
      cus_email:    user.email || 'customer@example.com',
      cus_add1:     'Dhaka',
      cus_city:     'Dhaka',
      cus_state:    'Dhaka',
      cus_postcode: '1000',
      cus_country:  'Bangladesh',
      cus_phone:    user.phone || '01700000000',

      // ── Pass-through: store userId so IPN can look up without URL param ───
      value_a: String(user.id),
    };

    console.log('[SSLCommerz] Initiating payment:', {
      store_id,
      is_sandbox:   !is_live,
      tran_id:      transactionId,
      total_amount: data.total_amount,
      success_url:  successUrl,
      fail_url:     failUrl,
      cancel_url:   cancelUrl,
    });

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    console.log('[SSLCommerz] Init API response status:', apiResponse.status);

    if (!apiResponse || apiResponse.status === 'FAILED') {
      console.error('[SSLCommerz] Payment init failed:', JSON.stringify(apiResponse));
      throw new Error(apiResponse?.failedreason || 'SSLCommerz payment initialization failed');
    }

    return apiResponse;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. ORDER VALIDATION API
  //    GET /validator/api/validationserverAPI.php?val_id=&store_id=&store_passwd=&format=json
  //
  //    Returned status values:
  //      VALID            – Successful, first-time validation
  //      VALIDATED        – Successful but already validated before (idempotent)
  //      INVALID_TRANSACTION – val_id is wrong or expired
  // ────────────────────────────────────────────────────────────────────────────
  static async validatePayment(paymentData) {
    const val_id = paymentData.val_id;

    if (!val_id) {
      console.error('[SSLCommerz] No val_id in paymentData — cannot call Validation API');
      throw new Error('Missing val_id from SSLCommerz gateway callback');
    }

    console.log('[SSLCommerz] Calling Order Validation API — val_id:', val_id);

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const result = await sslcz.validate({ val_id });

    console.log('[SSLCommerz] Validation API response:', {
      status:       result.status,
      tran_id:      result.tran_id,
      amount:       result.amount,
      bank_tran_id: result.bank_tran_id,
    });

    return result;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. TRANSACTION QUERY API (By Session ID)
  //    GET /validator/api/merchantTransIDvalidationAPI.php
  //      ?sessionkey=&store_id=&store_passwd=&v=1&format=json
  //
  //    Returned status values:
  //      VALID   : A successful transaction.
  //      PENDING : The transaction is still not completed.
  //      FAILED  : The transaction failed.
  // ────────────────────────────────────────────────────────────────────────────
  static async queryTransactionBySession(sessionKey) {
    if (!sessionKey) {
      throw new Error('Missing sessionKey for transaction query');
    }

    console.log('[SSLCommerz] Calling Transaction Query API (Session) — sessionkey:', sessionKey);

    try {
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      const result = await sslcz.transactionQueryBySessionId({ sessionkey: sessionKey });

      console.log('[SSLCommerz] Query API response:', {
        status:  result.status,
        tran_id: result.tran_id,
        amount:  result.amount,
      });

      return result;
    } catch (error) {
      console.error('[SSLCommerz] Query API call failed:', error.message);
      throw new Error('SSLCommerz Transaction Query API failed: ' + error.message);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. IPN SIGNATURE VERIFICATION  (verify_sign)
  //
  //    SSLCommerz sends a verify_sign field in every IPN POST.
  //    This is the MD5 hash of sorted key=value pairs (excluding verify_sign
  //    and verify_key itself) using the store password as salt.
  //
  //    Algorithm (per SSLCommerz IPN docs):
  //      1. Get all POST parameters except verify_sign and verify_key.
  //      2. Sort by key name alphabetically.
  //      3. Append store_passwd MD5 at the beginning.
  //      4. Compute MD5 of the concatenated "key=value" string.
  //      5. Compare result to verify_sign.
  //
  //    Returns: { valid: boolean, reason: string }
  // ────────────────────────────────────────────────────────────────────────────
  static verifyIPNSign(postData) {
    // If no verify_sign provided, reject
    if (!postData.verify_sign || !postData.verify_key) {
      return { valid: false, reason: 'Missing verify_sign or verify_key in IPN POST data' };
    }

    try {
      // The verify_key field lists which keys were used to produce the hash (comma-separated)
      const verifyKeys = postData.verify_key.split(',');

      // Build key=value string from the listed keys, sorted alphabetically
      const sortedKeys = verifyKeys.slice().sort();

      // Prepend the MD5 of the store password
      const storeMD5 = crypto.createHash('md5').update(store_passwd).digest('hex');

      const hashStr = storeMD5 + sortedKeys
        .map(key => `${key}=${postData[key] ?? ''}`)
        .join('&');

      const computedHash = crypto.createHash('md5').update(hashStr).digest('hex');

      const isValid = computedHash === postData.verify_sign;

      if (!isValid) {
        console.error('[SSLCommerz] IPN verify_sign MISMATCH:', {
          computed:  computedHash,
          received:  postData.verify_sign,
        });
      }

      return {
        valid:  isValid,
        reason: isValid ? 'OK' : 'verify_sign hash mismatch — possible data tampering',
      };
    } catch (err) {
      console.error('[SSLCommerz] Error computing verify_sign:', err.message);
      return { valid: false, reason: 'Hash computation error: ' + err.message };
    }
  }
}

module.exports = SSLCommerzService;
