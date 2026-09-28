const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const WalletService = require('../services/WalletService');

// @desc    Get driver wallet info
// @route   GET /api/wallet/my
// @access  Private (Driver only)
exports.getMyWallet = async (req, res) => {
    try {
        const wallet = await WalletService.getOrCreateWallet(req.user._id);
        
        // Fetch recent transactions (last 50)
        const transactions = await Transaction.find({ walletId: wallet._id })
            .sort({ createdAt: -1 })
            .limit(50);

        // Calculate stats from transactions
        const stats = await Transaction.aggregate([
            { $match: { walletId: wallet._id } },
            {
                $group: {
                    _id: null,
                    totalEarnings: {
                        $sum: { $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0] }
                    },
                    totalDues: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$type", "DEBIT"] }, { $eq: ["$category", "commission"] }] },
                                "$amount",
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            wallet,
            transactions,
            stats: {
                totalEarnings: stats[0] ? stats[0].totalEarnings : 0,
                totalDues: stats[0] ? stats[0].totalDues : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Topup wallet (Mock/Manual for now)
// @route   POST /api/wallet/topup
// @access  Private
exports.topupWallet = async (req, res) => {
    try {
        const { amount, description } = req.body;
        const wallet = await WalletService.getOrCreateWallet(req.user._id);

        wallet.balance += parseFloat(amount);
        wallet.lastUpdated = new Date();
        await wallet.save();

        await Transaction.create({
            walletId: wallet._id,
            driverId: req.user._id,
            amount: parseFloat(amount),
            type: 'CREDIT',
            category: 'topup',
            description: description || 'Wallet topup'
        });

        res.status(200).json({
            success: true,
            message: 'Wallet topped up successfully',
            wallet
        });
    } catch (error) {

        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Settle wallet balance (Payout)
// @route   POST /api/wallet/payout
// @access  Private (Driver only)
exports.payoutWallet = async (req, res) => {
    try {
        const wallet = await WalletService.getOrCreateWallet(req.user._id);

        if (wallet.balance === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Wallet balance is already zero' 
            });
        }

        const amount = Math.abs(wallet.balance);
        const type = wallet.balance > 0 ? 'DEBIT' : 'CREDIT';
        const category = wallet.balance > 0 ? 'withdrawal' : 'topup';
        const description = wallet.balance > 0 
            ? 'Wallet balance settlement (Withdrawal)' 
            : 'Wallet balance settlement (Dues Payment)';

        // Create transaction to reflect the settlement
        await Transaction.create({
            walletId: wallet._id,
            driverId: req.user._id,
            amount: amount,
            type: type,
            category: category,
            description: description
        });

        // Set balance to 0
        wallet.balance = 0;
        wallet.lastUpdated = new Date();
        await wallet.save();

        res.status(200).json({
            success: true,
            message: `Successfully settled ₹${amount.toFixed(2)}`,
            wallet
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
