const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const EmailCache = require('../models/EmailCache');
const imapService = require('../services/imapService');
const graphService = require('../services/graphService');
const smtpService = require('../services/smtpService');

// Pick the right service based on account type
function getService(account) {
  return account.auth_type === 'oauth' ? graphService : imapService;
}

const syncInProgress = new Set();

async function syncAccountEmails(account, folder = 'INBOX') {
  const key = `${account._id}:${folder}`;
  if (syncInProgress.has(key)) return;
  syncInProgress.add(key);
  try {
    const service = getService(account);
    const data = await service.fetchEmails(account, folder);
    for (const email of data.emails) {
      const { bodyHtml, bodyText, bodyFetched, ...emailMeta } = email;
      await EmailCache.updateOne(
        { accountId: account._id, uid: String(email.uid), folder },
        {
          $setOnInsert: { ...emailMeta, accountId: account._id, uid: String(email.uid), folder },
          ...(bodyFetched ? { $set: { bodyHtml, bodyText, bodyFetched: true } } : {})
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error(`Sync failed for ${account.email}:`, err.response?.data || err.message);
  } finally {
    syncInProgress.delete(key);
  }
}

async function waitForSync(accountId, folder = 'INBOX', timeout = 10000) {
  const key = `${accountId}:${folder}`;
  const start = Date.now();
  while (syncInProgress.has(key) && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

// GET /api/emails — serve from cache instantly, sync in background
router.get('/', async (req, res) => {
  try {
    const { folder = 'INBOX', page = 1, accountId } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limit = 30;

    let accounts;
    if (accountId) {
      const account = await Account.findById(accountId);
      accounts = account ? [account] : [];
    } else {
      accounts = await Account.find({});
    }

    if (accounts.length === 0) {
      return res.json({ emails: [], total: 0 });
    }

    const accountIds = accounts.map((a) => a._id);
    const accountMap = Object.fromEntries(accounts.map((a) => [String(a._id), a]));

    // If cache is empty, do a blocking sync first
    const cacheCount = await EmailCache.countDocuments({ accountId: { $in: accountIds }, folder });
    if (cacheCount === 0) {
      await Promise.allSettled(accounts.map((a) => syncAccountEmails(a, folder)));
    }

    const total = await EmailCache.countDocuments({ accountId: { $in: accountIds }, folder });
    const cached = await EmailCache.find({ accountId: { $in: accountIds }, folder })
      .sort({ receivedAt: -1 })
      .skip((pageNum - 1) * limit)
      .limit(limit)
      .lean();

    const emails = cached.map((e) => {
      const acc = accountMap[String(e.accountId)];
      return { ...e, accountEmail: acc?.email, accountColor: acc?.color, accountLabel: acc?.label };
    });

    res.json({ emails, total });

    // Sync in background
    for (const account of accounts) {
      syncAccountEmails(account, folder);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/emails/:uid/body — fetch full email body (cached)
router.get('/:uid/body', async (req, res) => {
  try {
    const { uid } = req.params;
    const { accountId, folder = 'INBOX' } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId query param is required.' });
    }

    // Serve from cache if already fetched
    const cached = await EmailCache.findOne({ accountId, uid: String(uid), folder }).lean();
    if (cached?.bodyFetched) {
      return res.json({ html: cached.bodyHtml || null, text: cached.bodyText || null, subject: cached.subject, from: [], to: [], date: cached.receivedAt });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    await waitForSync(accountId);

    const service = getService(account);
    const body = await service.fetchEmailBody(account, uid);
    if (!body) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    await EmailCache.updateOne(
      { accountId, uid: String(uid), folder },
      { $set: { bodyHtml: body.html, bodyText: body.text, bodyFetched: true } }
    );

    res.json(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/emails/send
router.post('/send', async (req, res) => {
  try {
    const { accountId, to, subject, body, html } = req.body;

    if (!accountId || !to || !subject) {
      return res.status(400).json({ error: 'accountId, to, and subject are required.' });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (account.auth_type === 'oauth') {
      await graphService.sendEmail({ account, to, subject, body, html });
      return res.json({ message: 'Email sent successfully.' });
    }

    const info = await smtpService.sendEmail({ account, to, subject, body, html });
    res.json({ message: 'Email sent successfully.', messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/emails/:uid/read
router.patch('/:uid/read', async (req, res) => {
  try {
    const { uid } = req.params;
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId query param is required.' });
    }

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const service = getService(account);
    await service.markAsRead(account, uid);
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
