const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// মেমোরি ডেটাবেজ (সার্ভার রিস্টার্ট না হওয়া পর্যন্ত ডেটা থাকবে)
let usersWallet = {}; // ইউজার ওয়ালেট ব্যালেন্স: { "userId": 1000 }
let rechargesList = []; // রিচার্জ রিকোয়েস্ট লিস্ট
let withdrawalsList = []; // উইথড্রল রিকোয়েস্ট লিস্ট

// অ্যাভিয়েটর গেম কন্ট্রোল স্টেট (অ্যাডমিন কন্ট্রোল করার জন্য)
let aviatorControl = {
    mode: 'auto', // 'auto' অথবা 'manual'
    forcedMultiplier: 2.00 // ম্যানুয়াল মোডে ক্র্যাশ পয়েন্ট কত হবে
};

// রুট রাউট
app.get('/', (req, res) => {
    res.send('Ludo & Aviator Server is Running Successfully!');
});

// ================= 1. ওয়ালেট ও ব্যালেন্স API =================

// ইউজারের ব্যালেন্স দেখার জন্য
app.get('/api/wallet/:userId', (req, res) => {
    const { userId } = req.params;
    const balance = usersWallet[userId] || 0;
    res.status(200).json({ success: true, balance });
});

// ================= 2. ম্যানুয়াল রিচার্জ (Add Money) API =================

// ইউজার রিচার্জ রিকোয়েস্ট পাঠাবে
app.post('/api/recharge', (req, res) => {
    try {
        const { userId, amount, orderId } = req.body;

        if (!userId || !amount || !orderId) {
            return res.status(400).json({ success: false, message: 'সব ফিল্ড পূরণ করতে হবে!' });
        }

        const newRecharge = {
            id: 'REC_' + Date.now(),
            userId,
            amount: Number(amount),
            orderId,
            status: 'Pending', // অ্যাডমিন চেক করার পর পাল্টাবে
            createdAt: new Date()
        };

        rechargesList.unshift(newRecharge);
        res.status(200).json({ success: true, message: 'রিচার্জ রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    } catch (err) {
        console.error('Recharge Error:', err);
        res.status(500).json({ success: false, message: 'সার্ভার এরর, পরে চেষ্টা করুন।' });
    }
});

// অ্যাডমিন প্যানেল থেকে পেন্ডিং রিচার্জ দেখা
app.get('/api/admin/recharges', (req, res) => {
    res.status(200).json({ success: true, recharges: rechargesList });
});

// অ্যাডমিন রিচার্জ অ্যাপ্রুভ বা রিজেক্ট করবে (ম্যানুয়াল কন্ট্রোল)
app.post('/api/admin/recharge/action', (req, res) => {
    const { rechargeId, action } = req.body; // action: 'approve' বা 'reject'

    const recharge = rechargesList.find(item => item.id === rechargeId);
    if (!recharge || recharge.status !== 'Pending') {
        return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি বা এটি আগেই প্রসেস করা হয়েছে!' });
    }

    if (action === 'approve') {
        recharge.status = 'Approved';
        
        // অ্যাডমিন ম্যানুয়ালি অ্যাপ্রুভ করার পরেই ইউজারের ওয়ালেটে টাকা অ্যাড হবে
        if (!usersWallet[recharge.userId]) {
            usersWallet[recharge.userId] = 0;
        }
        usersWallet[recharge.userId] += recharge.amount;

        res.status(200).json({ success: true, message: 'রিচার্জ অ্যাপ্রুভ করা হয়েছে এবং ব্যালেন্স যোগ হয়েছে।' });
    } else {
        recharge.status = 'Rejected';
        res.status(200).json({ success: true, message: 'রিচার্জ রিকোয়েস্ট রিজেক্ট করা হয়েছে।' });
    }
});

// ================= 3. উইথড্রল (Withdrawal) API =================

// ইউজার ব্যাংক ডিটেইলস সহ উইথড্রল রিকোয়েস্ট পাঠাবে
app.post('/api/withdraw', (req, res) => {
    try {
        const { userId, amount, fullName, accountNumber, ifscCode, contactNumber, email } = req.body;

        if (!userId || !amount || !fullName || !accountNumber || !ifscCode || !contactNumber) {
            return res.status(400).json({ success: false, message: 'ব্যাংক ডিটেইলস এবং অ্যামাউন্ট সঠিকভাবে দিন!' });
        }

        const withdrawAmount = Number(amount);
        const currentBalance = usersWallet[userId] || 0;

        // ইউজারের অ্যাকাউন্টে পর্যাপ্ত টাকা আছে কি না চেক করা
        if (currentBalance < withdrawAmount) {
            return res.status(400).json({ success: false, message: 'অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!' });
        }

        // উইথড্র রিকোয়েস্ট দেওয়ার সাথে সাথে ব্যালেন্স কেটে নেওয়া বা পেেন্ডিং রাখা (এখানে পেনਡিং রেখে অ্যাপ্রুভ করলে কাটবে)
        const newWithdraw = {
            id: 'WD_' + Date.now(),
            userId,
            amount: withdrawAmount,
            bankDetails: {
                fullName,
                accountNumber,
                ifscCode,
                contactNumber,
                email: email || ''
            },
            status: 'Pending', // অ্যাডমিন টাকা ব্যাংকে পাঠিয়ে অ্যাপ্রুভ করবে
            createdAt: new Date()
        };

        withdrawalsList.unshift(newWithdraw);
        res.status(200).json({ success: true, message: 'উইথড্রল রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    } catch (err) {
        console.error('Withdraw Error:', err);
        res.status(500).json({ success: false, message: 'সার্ভার এরর।' });
    }
});

// অ্যাডমিন প্যানেল থেকে সমস্ত উইথড্রল রিকোয়েস্ট দেখা
app.get('/api/admin/withdrawals', (req, res) => {
    res.status(200).json({ success: true, withdrawals: withdrawalsList });
});

// অ্যাডমিন ব্যাংক অ্যাকাউন্টে টাকা পাঠিয়ে উইথড্রল অ্যাপ্রুভ করবে (ম্যানুয়াল কন্ট্রোল)
app.post('/api/admin/withdraw/action', (req, res) => {
    const { withdrawId, action } = req.body; // action: 'approve' বা 'reject'

    const withdraw = withdrawalsList.find(item => item.id === withdrawId);
    if (!withdraw || withdraw.status !== 'Pending') {
        return res.status(404).json({ success: false, message: 'রিকোয়েস্ট পাওয়া যায়নি!' });
    }

    if (action === 'approve') {
        withdraw.status = 'Approved';
        
        // ইউজারের ওয়ালেট থেকে টাকা কেটে নেওয়া হবে যেহেতু ব্যাংকে পেমেন্ট পাঠানো হয়েছে
        if (usersWallet[withdraw.userId] >= withdraw.amount) {
            usersWallet[withdraw.userId] -= withdraw.amount;
        }

        res.status(200).json({ success: true, message: 'উইথড্রল অ্যাপ্রুভ করা হয়েছে এবং ব্যালেন্স আপডেট হয়েছে।' });
    } else {
        withdraw.status = 'Rejected';
        res.status(200).json({ success: true, message: 'উইথড্রল রিকোয়েস্ট রিজেক্ট করা হয়েছে।' });
    }
});

// ================= 4. অ্যাভিয়েটর গেম কন্ট্রোল API =================

// অ্যাডমিন প্যানেল থেকে অ্যাভিয়েটর গেম মোড সেট করা (Auto / Manual)
app.post('/api/admin/aviator/control', (req, res) => {
    const { mode, forcedMultiplier } = req.body;
    
    if (mode) aviatorControl.mode = mode; // 'auto' বা 'manual'
    if (forcedMultiplier !== undefined) aviatorControl.forcedMultiplier = Number(forcedMultiplier);

    res.status(200).json({ 
        success: true, 
        message: 'Aviator game settings updated successfully!', 
        aviatorControl 
    });
});

// গেমের ফ্রন্টএন্ড থেকে বর্তমান ক্র্যাশ বা মোড চেক করার জন্য
app.get('/api/aviator/status', (req, res) => {
    res.status(200).json({ success: true, aviatorControl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

