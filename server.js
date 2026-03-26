// backend/server.js
console.log('🚀 Server is starting...');

const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');

// Create the server
const app = express();

// Tell express to understand JSON
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/tmp/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Serve uploaded files (so admin can view them)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(session({
    secret: 'cryptosphere-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// MongoDB connection
const url = 'mongodb+srv://aka782003_db_user:Bo99UXftaZW8TUCB@cluster0.9nm0lgd.mongodb.net/?appName=Cluster0&retryWrites=true';
const client = new MongoClient(url);
const dbName = 'cryptosphere';

// Win Mode settings - stored in database
let winModeCache = { winMode: false, profitPercent: 2 };

// Load win mode from database on startup
async function loadWinModeFromDB() {
    try {
        const db = client.db(dbName);
        const settings = db.collection('settings');
        const winModeSetting = await settings.findOne({ key: 'winMode' });
        if (winModeSetting) {
            winModeCache = {
                winMode: winModeSetting.winMode,
                profitPercent: winModeSetting.profitPercent || 2
            };
        }
        console.log(`✅ Loaded win mode from DB: ${winModeCache.winMode ? 'ON' : 'OFF'} (${winModeCache.profitPercent}%)`);
    } catch (error) {
        console.log('Error loading win mode:', error);
    }
}

// Save win mode to database
async function saveWinModeToDB(winMode, profitPercent) {
    try {
        const db = client.db(dbName);
        const settings = db.collection('settings');
        await settings.updateOne(
            { key: 'winMode' },
            { $set: { winMode: winMode, profitPercent: profitPercent, updatedAt: new Date() } },
            { upsert: true }
        );
        winModeCache = { winMode, profitPercent };
        console.log(`💾 Saved win mode to DB: ${winMode ? 'ON' : 'OFF'} (${profitPercent}%)`);
    } catch (error) {
        console.log('Error saving win mode:', error);
    }
}

// Serve your HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin login page
app.get('/admin-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// Serve admin panel (protected)
app.get('/admin-panel', (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin-login');
    }
    res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

// Redirect /admin to login
app.get('/admin', (req, res) => {
    res.redirect('/admin-login');
});

// SIGNUP API
app.post('/api/signup', async (req, res) => {
    try {
        console.log('📝 Signup attempt:', req.body);
        
        const { name, email, password, kycType, kycNumber } = req.body;
        
        if (!name || !email || !password) {
            return res.json({ 
                success: false, 
                message: 'Please fill all fields' 
            });
        }
        
        const db = client.db(dbName);
        const users = db.collection('users');
        
        const existingUser = await users.findOne({ email });
        if (existingUser) {
            return res.json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            name,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            balance: 0,
            status: 'pending',
            frozen: false,
            kyc: {
                type: kycType || 'not_provided',
                number: kycNumber || 'not_provided',
                submittedAt: new Date(),
                status: 'pending'
            },
            approvedAt: null
        };
        
        console.log('📝 New user created with status:', newUser.status);
        
        await users.insertOne(newUser);
        console.log('✅ User created:', email);
        
        res.json({ 
            success: true, 
            message: 'Account created successfully! Pending admin approval.' 
        });
        
    } catch (error) {
        console.log('❌ Signup error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// SIGNUP WITH KYC FILE UPLOAD
app.post('/api/signup-with-kyc', upload.single('kycFile'), async (req, res) => {
    try {
        console.log('📝 Signup attempt with file:', req.body);
        
        const { name, email, password, kycType, kycNumber } = req.body;
        const kycFile = req.file;
        
        if (!name || !email || !password) {
            return res.json({ 
                success: false, 
                message: 'Please fill all fields' 
            });
        }
        
        if (!kycNumber) {
            return res.json({ 
                success: false, 
                message: 'Please enter KYC document number' 
            });
        }
        
        const db = client.db(dbName);
        const users = db.collection('users');
        
        const existingUser = await users.findOne({ email });
        if (existingUser) {
            return res.json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            name,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            balance: 0,
            status: 'pending',
            kyc: {
                type: kycType,
                number: kycNumber,
                documentPath: kycFile ? '/uploads/' + kycFile.filename : null,
                submittedAt: new Date(),
                status: 'pending'
            },
            approvedAt: null
        };
        
        await users.insertOne(newUser);
        console.log('✅ User created with KYC document:', email);
        
        res.json({ 
            success: true, 
            message: 'Account created successfully! Pending admin approval.' 
        });
        
    } catch (error) {
        console.log('❌ Signup error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ADMIN LOGIN API 
app.post('/api/admin/login', async (req, res) => {
    try {
        console.log('🔑 Admin login attempt:', req.body.email);
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.json({ 
                success: false, 
                message: 'Please fill all fields' 
            });
        }
        
        const db = client.db(dbName);
        const users = db.collection('users');
        
        const user = await users.findOne({ email });
        
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'Email not found' 
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.json({ 
                success: false, 
                message: 'Wrong password' 
            });
        }
        
        if (!user.isAdmin) {
            return res.json({ 
                success: false, 
                message: 'Not authorized as admin' 
            });
        }
        
        console.log('✅ Admin login successful:', email);
        
        req.session.admin = {
            name: user.name,
            email: user.email,
            id: user._id,
            isAdmin: true
        };
        
        res.json({ 
            success: true, 
            message: 'Admin login successful!'
        });
        
    } catch (error) {
        console.log('❌ Admin login error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// CHECK ADMIN SESSION
app.get('/api/admin/check', (req, res) => {
    if (req.session.admin) {
        res.json({
            loggedIn: true,
            admin: req.session.admin
        });
    } else {
        res.json({
            loggedIn: false
        });
    }
});

// ADMIN LOGOUT
app.post('/api/admin/logout', (req, res) => {
    req.session.admin = null;
    console.log('👑 Admin logged out');
    res.json({ 
        success: true, 
        message: 'Admin logged out' 
    });
});

// LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔑 Login attempt:', req.body.email);
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.json({ 
                success: false, 
                message: 'Please fill all fields' 
            });
        }
        
        const db = client.db(dbName);
        const users = db.collection('users');
        
        const user = await users.findOne({ email });
        
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'Email not found' 
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({ 
                success: false, 
                message: 'Wrong password' 
            });
        }

        console.log('User status:', user.status);
        if (user.status === 'pending') {
            return res.json({ 
                success: false, 
                message: 'Account pending approval. Please wait 24-48 hours.' 
            });
        }

        if (user.status === 'rejected') {
            return res.json({ 
                success: false, 
                message: 'Account rejected. Please contact support.' 
            });
        }

        if (!user.kyc || user.kyc.status !== 'approved') {
            return res.json({ 
                success: false, 
                message: 'KYC pending approval. Please wait for document verification.' 
            });
        }

        console.log('✅ Login successful:', email);
        
        req.session.user = {
            name: user.name,
            email: user.email,
            id: user._id
        };
        
        console.log('📦 Session created for:', req.session.user.email);
        
        return res.json({ 
            success: true, 
            message: 'Login successful!',
            user: {
                name: user.name,
                email: user.email
            }
        });
        
    } catch (error) {
        console.log('❌ Login error:', error);
        return res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// CHECK SESSION API
app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({
            loggedIn: true,
            user: req.session.user
        });
    } else {
        res.json({
            loggedIn: false
        });
    }
});

// GET USER BALANCE API
app.get('/api/user/balance', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ 
                success: false, 
                message: 'Not logged in' 
            });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const user = await users.findOne({ email: req.session.user.email });
        
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        console.log(`💰 Balance fetched for ${user.email}: $${user.balance || 0}`);

        res.json({ 
            success: true,
            balance: user.balance || 0,
            name: user.name,
            email: user.email
        });

    } catch (error) {
        console.log('❌ Balance error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// GET USER STATUS
app.get('/api/user/status', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Not logged in' });
        }
        
        const db = client.db(dbName);
        const users = db.collection('users');
        
        const user = await users.findOne({ email: req.session.user.email });
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        res.json({ 
            success: true, 
            frozen: user.frozen || false,
            status: user.status
        });
        
    } catch (error) {
        console.log('Error getting user status:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// LOGOUT API
app.post('/api/logout', (req, res) => {
    req.session.user = null;
    console.log('✅ User logged out');
    res.json({ 
        success: true, 
        message: 'Logged out successfully' 
    });
});

// Win Mode API - Get status (anyone can see)
app.get('/api/admin/win-mode', (req, res) => {
    res.json({ success: true, winMode: winModeCache.winMode, profitPercent: winModeCache.profitPercent });
});

// Win Mode API - Set status (admin only)
app.post('/api/admin/win-mode', async (req, res) => {
    if (!req.session.admin) {
        return res.json({ success: false, message: 'Not authorized' });
    }
    const { winMode, profitPercent } = req.body;
    await saveWinModeToDB(winMode, profitPercent);
    console.log(`Win mode set to: ${winMode ? 'ON' : 'OFF'} ${winMode ? `(Profit: ${profitPercent}%)` : ''}`);
    res.json({ success: true });
});

// Function to save transaction history
async function saveTransaction(userEmail, type, amount, status, description) {
    try {
        const db = client.db(dbName);
        const transactions = db.collection('transactions');
        
        await transactions.insertOne({
            userEmail: userEmail,
            type: type,
            amount: amount,
            status: status,
            description: description,
            createdAt: new Date()
        });
        console.log(`Transaction saved: ${type} $${amount} for ${userEmail}`);
    } catch (error) {
        console.log('Error saving transaction:', error);
    }
}

// GET USER TRANSACTION HISTORY
app.get('/api/user/transactions', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Not logged in' });
        }
        
        const db = client.db(dbName);
        const transactions = db.collection('transactions');
        
        const userTransactions = await transactions.find({ userEmail: req.session.user.email })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        
        res.json({ success: true, transactions: userTransactions });
        
    } catch (error) {
        console.log('Error fetching transactions:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// ADMIN: GET ALL USERS API
app.get('/api/admin/users', async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.json({ 
                success: false, 
                message: 'Not authorized' 
            });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const allUsers = await users.find({}).sort({ createdAt: -1 }).toArray();
        
        const safeUsers = allUsers.map(user => ({
            name: user.name,
            email: user.email,
            balance: user.balance || 0,
            status: user.status || 'approved',
            frozen: user.frozen || false,
            kyc: user.kyc || { type: 'none', number: 'none', status: 'none' },
            isAdmin: user.isAdmin || false,
            createdAt: user.createdAt,
            _id: user._id
        }));

        console.log(`👑 Admin fetched ${safeUsers.length} users`);

        res.json({ 
            success: true,
            users: safeUsers
        });

    } catch (error) {
        console.log('❌ Admin error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ADMIN: UPDATE USER BALANCE API
app.post('/api/admin/update-balance', async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.json({ success: false, message: 'Not authorized' });
        }

        const { email, balance } = req.body;
        
        console.log('📝 Update balance request:', { email, balance });
        
        if (!email || balance === undefined) {
            return res.json({ success: false, message: 'Email and balance required' });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const currentUser = await users.findOne({ email: email });
        if (!currentUser) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const oldBalance = currentUser.balance || 0;
        const newBalance = parseFloat(balance);
        const difference = newBalance - oldBalance;
        
        console.log(`💰 Old balance: $${oldBalance}, New balance: $${newBalance}, Difference: $${difference}`);
        
        await users.updateOne(
            { email: email },
            { $set: { balance: newBalance } }
        );
        
        if (difference > 0) {
            console.log('💾 Saving deposit transaction...');
            await saveTransaction(email, 'deposit', difference, 'completed', `Admin deposit: +$${difference}`);
            console.log('✅ Deposit saved');
        } else if (difference < 0) {
            console.log('💾 Saving withdraw transaction...');
            await saveTransaction(email, 'withdraw', Math.abs(difference), 'completed', `Admin withdrawal: -$${Math.abs(difference)}`);
            console.log('✅ Withdraw saved');
        }

        console.log(`💰 Admin ${req.session.admin.email} updated ${email} balance to $${newBalance}`);

        res.json({ 
            success: true, 
            message: 'Balance updated successfully' 
        });

    } catch (error) {
        console.log('❌ Update balance error:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// ADMIN: TOGGLE FREEZE USER
app.post('/api/admin/toggle-freeze', async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.json({ success: false, message: 'Not authorized' });
        }

        const { email, frozen } = req.body;
        
        if (!email || frozen === undefined) {
            return res.json({ success: false, message: 'Email and frozen status required' });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const result = await users.updateOne(
            { email: email },
            { $set: { frozen: frozen } }
        );

        if (result.matchedCount === 0) {
            return res.json({ success: false, message: 'User not found' });
        }

        console.log(`👑 Admin ${req.session.admin.email} ${frozen ? 'froze' : 'unfroze'} user: ${email}`);

        res.json({ 
            success: true, 
            message: `User ${frozen ? 'frozen' : 'unfrozen'} successfully` 
        });

    } catch (error) {
        console.log('❌ Freeze error:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// ADMIN: DELETE USER
app.post('/api/admin/delete-user', async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.json({ 
                success: false, 
                message: 'Not authorized' 
            });
        }

        const { email } = req.body;
        
        if (!email) {
            return res.json({ 
                success: false, 
                message: 'Email required' 
            });
        }

        if (email === req.session.admin.email) {
            return res.json({ 
                success: false, 
                message: 'Cannot delete your own admin account' 
            });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const result = await users.deleteOne({ email: email });

        if (result.deletedCount === 0) {
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        console.log(`👑 Admin ${req.session.admin.email} deleted user: ${email}`);

        res.json({ 
            success: true, 
            message: 'User deleted successfully' 
        });

    } catch (error) {
        console.log('❌ Delete error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ADMIN: APPROVE/REJECT USER
app.post('/api/admin/approve-user', async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.json({ 
                success: false, 
                message: 'Not authorized' 
            });
        }

        const { email, status } = req.body;
        
        if (!email || !status) {
            return res.json({ 
                success: false, 
                message: 'Email and status required' 
            });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        const result = await users.updateOne(
            { email: email },
            { $set: { 
                status: status,
                'kyc.status': status,
                approvedAt: new Date()
            } }
        );

        if (result.matchedCount === 0) {
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        console.log(`👑 Admin ${req.session.admin.email} ${status} user: ${email} (Account + KYC)`);

        res.json({ 
            success: true, 
            message: `User ${status} successfully (Account + KYC)` 
        });

    } catch (error) {
        console.log('❌ Approve error:', error);
        res.json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// USER: UPDATE OWN BALANCE (for trading)
app.post('/api/user/update-balance', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Not logged in' });
        }

        const { email, balance } = req.body;
        
        if (email !== req.session.user.email) {
            return res.json({ success: false, message: 'Not authorized' });
        }

        const db = client.db(dbName);
        const users = db.collection('users');
        
        await users.updateOne(
            { email: email },
            { $set: { balance: parseFloat(balance) } }
        );

        console.log(`💰 User ${email} updated balance to $${balance}`);

        res.json({ 
            success: true, 
            message: 'Balance updated successfully' 
        });

    } catch (error) {
        console.log('❌ Update balance error:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// Save trade to database
app.post('/api/save-trade', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Not logged in' });
        }
        
        const { trade } = req.body;
        
        const db = client.db(dbName);
        const trades = db.collection('trades');
        
        trade.userEmail = req.session.user.email;
        trade.savedAt = new Date();
        
        await trades.insertOne(trade);
        
        res.json({ success: true });
        
    } catch (error) {
        console.log('Error saving trade:', error);
        res.json({ success: false, message: 'Error saving trade' });
    }
});

// Get user's trade history
app.get('/api/get-trades', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: false, message: 'Not logged in' });
        }
        
        const db = client.db(dbName);
        const trades = db.collection('trades');
        
        const userTrades = await trades.find({ userEmail: req.session.user.email })
            .sort({ savedAt: -1 })
            .limit(50)
            .toArray();
        
        res.json({ success: true, trades: userTrades });
        
    } catch (error) {
        console.log('Error fetching trades:', error);
        res.json({ success: false, message: 'Error fetching trades' });
    }
});

// Test MongoDB connection
async function connectToMongo() {
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB successfully!');
        await loadWinModeFromDB();
    } catch (error) {
        console.log('❌ MongoDB connection error:', error);
    }
}

connectToMongo();

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running at: http://localhost:${PORT}`);
});
