const { ImapFlow } = require('imapflow');
const axios = require('axios');
const { decrypt, encrypt } = require('../utils/crypto');
const Account = require('../models/Account');

// Refresh an OAuth access token using the stored refresh token, update DB, return new access token
async function refreshAccessToken(account) {
  const decryptedRefreshToken = decrypt(account.refresh_token_encrypted);

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: decryptedRefreshToken,
    grant_type: 'refresh_token',
    scope: 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access'
  });

  const response = await axios.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;

  // Persist refreshed tokens back to DB
  await Account.findByIdAndUpdate(account._id, {
    access_token_encrypted: encrypt(access_token),
    token_expiry: new Date(Date.now() + expires_in * 1000),
    ...(new_refresh_token ? { refresh_token_encrypted: encrypt(new_refresh_token) } : {})
  });

  return access_token;
}

// Return a valid (non-expired) access token for an OAuth account, refreshing if needed
async function getValidAccessToken(account) {
  const now = new Date();
  // Refresh if expired or expiring within 60 seconds
  if (!account.token_expiry || account.token_expiry <= new Date(now.getTime() + 60 * 1000)) {
    return await refreshAccessToken(account);
  }
  return decrypt(account.access_token_encrypted);
}

function createClient(account, authOptions) {
  return new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_port === 993,
    auth: authOptions,
    logger: false,
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function buildImapClient(account) {
  if (account.auth_type === 'oauth') {
    const accessToken = await getValidAccessToken(account);
    // imapflow natively supports OAuth2 via accessToken in the auth object
    return createClient(account, {
      user: account.email,
      accessToken
    });
  }
  // Standard password auth
  const decryptedPassword = decrypt(account.password_encrypted);
  return createClient(account, {
    user: account.email,
    pass: decryptedPassword
  });
}

async function testImapConnection(account) {
  const client = await buildImapClient(account);

  try {
    await client.connect();
    await client.logout();
    return true;
  } catch (err) {
    throw new Error(`IMAP connection failed: ${err.message}`);
  }
}

async function fetchEmails(account, folder = 'INBOX', page = 1, limit = 30) {
  const client = await buildImapClient(account);
  client.on('error', () => {});

  await client.connect();

  // Outlook sometimes uses 'Inbox' instead of 'INBOX'
  let lock;
  try {
    lock = await client.getMailboxLock(folder);
  } catch {
    lock = await client.getMailboxLock('Inbox');
  }

  try {
    const messages = [];

    // Skip fetch if mailbox is empty
    if (!client.mailbox || client.mailbox.exists === 0) {
      return { emails: [], total: 0 };
    }

    for await (const msg of client.fetch('1:*', { envelope: true, flags: true })) {
      messages.push({
        uid: msg.uid,
        fromName: msg.envelope.from?.[0]?.name || '',
        fromEmail: msg.envelope.from?.[0]?.address || '',
        toEmail: msg.envelope.to?.[0]?.address || '',
        subject: msg.envelope.subject || '(no subject)',
        preview: '',
        receivedAt: msg.envelope.date,
        isRead: msg.flags.has('\\Seen'),
        messageId: msg.envelope.messageId || ''
      });
    }

    // Sort newest first, then paginate
    messages.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    const paginated = messages.slice((page - 1) * limit, page * limit);

    return { emails: paginated, total: messages.length };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function fetchEmailBody(account, uid) {
  const client = await buildImapClient(account);
  client.on('error', () => {});

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    let result = null;

    for await (const msg of client.fetch(
      String(uid),
      { source: true, envelope: true },
      { uid: true }
    )) {
      const sourceStr = msg.source ? msg.source.toString() : '';

      // Split headers from body on blank line
      const headerBodySplit = sourceStr.indexOf('\r\n\r\n');
      const rawHeaders = headerBodySplit >= 0 ? sourceStr.slice(0, headerBodySplit) : '';
      const rawBody = headerBodySplit >= 0 ? sourceStr.slice(headerBodySplit + 4) : sourceStr;

      // Try to extract HTML from multipart or plain body
      let html = null;
      let text = null;

      // Look for Content-Type boundary
      const boundaryMatch = rawHeaders.match(/boundary="?([^"\r\n;]+)"?/i);

      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = rawBody.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));

        for (const part of parts) {
          const partHeaderEnd = part.indexOf('\r\n\r\n');
          if (partHeaderEnd < 0) continue;
          const partHeaders = part.slice(0, partHeaderEnd).toLowerCase();
          const partBody = part.slice(partHeaderEnd + 4).trim();

          if (partHeaders.includes('text/html')) {
            html = decodeBody(partBody, partHeaders);
          } else if (partHeaders.includes('text/plain') && !text) {
            text = decodeBody(partBody, partHeaders);
          }
        }
      } else {
        // Not multipart — check if it's HTML or plain text
        const contentTypeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : 'text/plain';

        if (contentType.includes('text/html')) {
          html = decodeBody(rawBody, rawHeaders.toLowerCase());
        } else {
          text = decodeBody(rawBody, rawHeaders.toLowerCase());
        }
      }

      result = {
        html,
        text,
        source: sourceStr,
        subject: msg.envelope.subject || '(no subject)',
        from: msg.envelope.from || [],
        to: msg.envelope.to || [],
        date: msg.envelope.date
      };

      break;
    }

    return result;
  } finally {
    lock.release();
    await client.logout();
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeBody(body, headersLower) {
  if (headersLower.includes('base64')) {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  if (headersLower.includes('quoted-printable')) {
    return decodeQuotedPrintable(body);
  }
  return body;
}

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function markAsRead(account, uid) {
  const client = await buildImapClient(account);
  client.on('error', () => {});

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    await client.messageFlagsAdd({ uid: true, all: false }, ['\\Seen'], { uid: true });
    // Target specific uid
    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

module.exports = { testImapConnection, fetchEmails, fetchEmailBody, markAsRead, getValidAccessToken };
