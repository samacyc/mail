const express = require('express');
const router = express.Router();
const axios = require('axios');
const Account = require('../models/Account');
const { encrypt } = require('../utils/crypto');

const COLOR_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

function pickColor(index) {
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

const GRAPH_SCOPE = 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access openid email';

const REDIRECT_URI = (process.env.MICROSOFT_REDIRECT_URI || '').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').trim();

// GET /api/auth/microsoft/url — generate Microsoft OAuth authorization URL
router.get('/microsoft/url', (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: GRAPH_SCOPE,
      response_mode: 'query',
      prompt: 'consent'
    });
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/microsoft/callback — exchange code for tokens and save account
router.get('/microsoft/callback', async (req, res) => {
  const { code, error: oauthError, error_description, error_codes } = req.query;

  if (oauthError) {
    console.error('OAuth error from Microsoft:', oauthError, error_description, 'codes:', error_codes);
    const msg = encodeURIComponent(error_description || oauthError);
    return res.redirect(`${FRONTEND_URL}/admin?error=${msg}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/admin?error=No+authorization+code+received`);
  }

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: GRAPH_SCOPE
    });

    const tokenResponse = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      tokenParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in, id_token } = tokenResponse.data;

    // Get email from Graph API
    const meResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const email = meResponse.data.mail || meResponse.data.userPrincipalName;

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/admin?error=Could+not+retrieve+email+from+Microsoft`);
    }

    const token_expiry = new Date(Date.now() + expires_in * 1000);
    const access_token_encrypted = encrypt(access_token);
    const refresh_token_encrypted = refresh_token ? encrypt(refresh_token) : undefined;

    const count = await Account.countDocuments();
    const color = pickColor(count);

    const existing = await Account.findOne({ email: email.toLowerCase() });

    if (existing) {
      existing.access_token_encrypted = access_token_encrypted;
      if (refresh_token_encrypted) existing.refresh_token_encrypted = refresh_token_encrypted;
      existing.token_expiry = token_expiry;
      existing.auth_type = 'oauth';
      await existing.save();
    } else {
      await new Account({
        email: email.toLowerCase(),
        label: '',
        imap_host: 'graph',
        imap_port: 443,
        smtp_host: 'graph',
        smtp_port: 443,
        color,
        auth_type: 'oauth',
        access_token_encrypted,
        refresh_token_encrypted: refresh_token_encrypted || undefined,
        token_expiry
      }).save();
    }

    res.redirect(`${FRONTEND_URL}/admin?success=microsoft`);
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err.response?.data || err.message);
    const errorMsg = encodeURIComponent(
      err.response?.data?.error_description || err.message || 'OAuth failed'
    );
    res.redirect(`${FRONTEND_URL}/admin?error=${errorMsg}`);
  }
});

module.exports = router;
