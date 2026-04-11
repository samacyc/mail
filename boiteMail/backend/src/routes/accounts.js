const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const { encrypt } = require('../utils/crypto');
const { getImapSmtp } = require('../utils/domainDetect');
const { testImapConnection } = require('../services/imapService');

const COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

function pickColor(index) {
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

function sanitizeAccount(account) {
  const obj = account.toObject();
  delete obj.password_encrypted;
  return obj;
}

// GET /api/accounts — list all accounts (no password)
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find({}, { password_encrypted: 0 }).sort({ createdAt: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/add — add a new account
router.post('/add', async (req, res) => {
  try {
    const {
      email,
      password,
      label,
      // Manual IMAP/SMTP config (for unknown domains)
      imap_host: manualImapHost,
      imap_port: manualImapPort,
      smtp_host: manualSmtpHost,
      smtp_port: manualSmtpPort
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Check if already exists
    const existing = await Account.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'This email account is already linked.' });
    }

    // Auto-detect or use manual config
    let imapSmtp = getImapSmtp(email);

    if (!imapSmtp) {
      // Use manually provided config
      if (!manualImapHost || !manualImapPort || !manualSmtpHost || !manualSmtpPort) {
        return res.status(400).json({
          error: 'Unknown email provider. Please provide IMAP/SMTP settings manually.',
          needsManualConfig: true
        });
      }
      imapSmtp = {
        imap_host: manualImapHost,
        imap_port: parseInt(manualImapPort, 10),
        smtp_host: manualSmtpHost,
        smtp_port: parseInt(manualSmtpPort, 10)
      };
    }

    // Encrypt password
    const password_encrypted = encrypt(password);

    // Build a temporary account object to test connection
    const tempAccount = {
      email: email.toLowerCase(),
      password_encrypted,
      imap_host: imapSmtp.imap_host,
      imap_port: imapSmtp.imap_port,
      smtp_host: imapSmtp.smtp_host,
      smtp_port: imapSmtp.smtp_port
    };

    // Test IMAP connection before saving
    try {
      await testImapConnection(tempAccount);
    } catch (connErr) {
      return res.status(400).json({
        error: `Could not connect to IMAP server: ${connErr.message}`
      });
    }

    // Pick a color based on existing account count
    const count = await Account.countDocuments();
    const color = pickColor(count);

    const account = new Account({
      email: email.toLowerCase(),
      label: label || '',
      password_encrypted,
      imap_host: imapSmtp.imap_host,
      imap_port: imapSmtp.imap_port,
      smtp_host: imapSmtp.smtp_host,
      smtp_port: imapSmtp.smtp_port,
      color
    });

    await account.save();
    res.status(201).json(sanitizeAccount(account));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This email account is already linked.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id — remove an account
router.delete('/:id', async (req, res) => {
  try {
    const account = await Account.findByIdAndDelete(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ message: 'Account removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
