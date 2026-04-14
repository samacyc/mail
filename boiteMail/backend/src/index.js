require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');

const accountsRouter = require('./routes/accounts');
const emailsRouter = require('./routes/emails');
const authRoutes = require('./routes/auth');
const Account = require('./models/Account');
const graphService = require('./services/graphService');
const EmailCache = require('./models/EmailCache');

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.ENCRYPTION_KEY,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' }
}));

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.APP_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Routes
app.use('/api/accounts', requireAuth, accountsRouter);
app.use('/api/emails', requireAuth, emailsRouter);
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth check
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailapp';

async function syncAllAccounts() {
  try {
    const accounts = await Account.find({ auth_type: 'oauth' });
    for (const account of accounts) {
      try {
        const data = await graphService.fetchEmails(account, 'INBOX');
        let newCount = 0;
        for (const email of data.emails) {
          const { bodyHtml, bodyText, bodyFetched, ...emailMeta } = email;
          const result = await EmailCache.updateOne(
            { accountId: account._id, uid: String(email.uid), folder: 'INBOX' },
            {
              $setOnInsert: { ...emailMeta, accountId: account._id, uid: String(email.uid), folder: 'INBOX' },
              ...(bodyFetched ? { $set: { bodyHtml, bodyText, bodyFetched: true } } : {})
            },
            { upsert: true }
          );
          if (result.upsertedCount > 0) newCount++;
        }
        if (newCount > 0) console.log(`[sync] ${account.email}: ${newCount} new email(s)`);
      } catch (err) {
        console.error(`Background sync failed for ${account.email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Background sync error:', err.message);
  }
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
    // Sync all accounts every 30 seconds
    setInterval(syncAllAccounts, 30000);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
