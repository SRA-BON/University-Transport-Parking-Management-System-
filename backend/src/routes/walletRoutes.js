const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/WalletController');
const authMiddleware = require('../middleware/authMiddleware');

// These are callbacks from SSLCommerz, no auth needed
router.post('/success/:transactionId', WalletController.handlePaymentSuccess);
router.post('/fail/:transactionId',    WalletController.handlePaymentFail);
router.post('/cancel/:transactionId',  WalletController.handlePaymentCancel);
router.post('/ipn/:transactionId',     WalletController.handleIPN);

// These routes require authentication
router.get('/', authMiddleware, WalletController.getWalletBalance);
router.get('/transactions', authMiddleware, WalletController.getTransactionHistory);
router.post('/recharge', authMiddleware, WalletController.rechargeWallet);
router.get('/query/:sessionKey', authMiddleware, WalletController.queryTransaction);
router.get('/all-transactions', authMiddleware, WalletController.getAllTransactions);

// bKash Personal Send Money (manual verification) — NOT a merchant gateway
router.get('/bkash-config', authMiddleware, WalletController.getBkashConfig);
router.post('/bkash/submit', authMiddleware, WalletController.submitBkashPayment);
router.get('/bkash/pending', authMiddleware, WalletController.listPendingBkashPayments);
router.post('/bkash/verify/:transactionId', authMiddleware, WalletController.verifyBkashPayment);
router.post('/bkash/reverse/:transactionId', authMiddleware, WalletController.reverseBkashPayment);
router.get('/bkash-settings', authMiddleware, WalletController.getBkashSettings);
router.post('/bkash-settings', authMiddleware, WalletController.saveBkashSettings);
router.post('/reverse-direct', authMiddleware, WalletController.reverseDirect);

module.exports = router;
