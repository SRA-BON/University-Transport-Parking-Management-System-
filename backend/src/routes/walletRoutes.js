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

module.exports = router;
