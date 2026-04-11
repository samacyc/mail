const axios = require('axios');
const { decrypt, encrypt } = require('../utils/crypto');
const Account = require('../models/Account');

const GRAPH_SCOPE = 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';

async function refreshAccessToken(account) {
  const decryptedRefreshToken = decrypt(account.refresh_token_encrypted);

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: decryptedRefreshToken,
    grant_type: 'refresh_token',
    scope: GRAPH_SCOPE
  });

  const response = await axios.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;

  await Account.findByIdAndUpdate(account._id, {
    access_token_encrypted: encrypt(access_token),
    token_expiry: new Date(Date.now() + expires_in * 1000),
    ...(new_refresh_token ? { refresh_token_encrypted: encrypt(new_refresh_token) } : {})
  });

  return access_token;
}

async function getValidAccessToken(account) {
  if (!account.token_expiry || account.token_expiry <= new Date(Date.now() + 60 * 1000)) {
    return await refreshAccessToken(account);
  }
  return decrypt(account.access_token_encrypted);
}

function graphClient(accessToken) {
  return axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function fetchEmails(account, folder = 'INBOX') {
  const accessToken = await getValidAccessToken(account);
  const client = graphClient(accessToken);

  // Map folder name to Graph folder
  const folderMap = { INBOX: 'inbox', Sent: 'sentitems', Drafts: 'drafts', Trash: 'deleteditems', Spam: 'junkemail' };
  const graphFolder = folderMap[folder] || 'inbox';

  const response = await client.get(`/me/mailFolders/${graphFolder}/messages`, {
    params: {
      $top: 50,
      $select: 'id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,body',
      $orderby: 'receivedDateTime desc'
    }
  });

  const emails = response.data.value.map((msg) => ({
    uid: msg.id,
    fromName: msg.from?.emailAddress?.name || '',
    fromEmail: msg.from?.emailAddress?.address || '',
    toEmail: msg.toRecipients?.[0]?.emailAddress?.address || '',
    subject: msg.subject || '(no subject)',
    preview: msg.bodyPreview || '',
    receivedAt: new Date(msg.receivedDateTime),
    isRead: msg.isRead,
    messageId: msg.id,
    // Include body so sync can cache it immediately
    bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : null,
    bodyText: msg.body?.contentType === 'text' ? msg.body.content : null,
    bodyFetched: true
  }));

  return { emails, total: emails.length };
}

async function fetchEmailBody(account, uid) {
  const accessToken = await getValidAccessToken(account);
  const client = graphClient(accessToken);

  const response = await client.get(`/me/messages/${uid}`, {
    params: { $select: 'subject,from,toRecipients,receivedDateTime,body' }
  });

  const msg = response.data;
  return {
    html: msg.body?.contentType === 'html' ? msg.body.content : null,
    text: msg.body?.contentType === 'text' ? msg.body.content : null,
    subject: msg.subject,
    from: [{ name: msg.from?.emailAddress?.name, address: msg.from?.emailAddress?.address }],
    to: (msg.toRecipients || []).map((r) => ({ address: r.emailAddress?.address })),
    date: msg.receivedDateTime
  };
}

async function markAsRead(account, uid) {
  const accessToken = await getValidAccessToken(account);
  const client = graphClient(accessToken);
  await client.patch(`/me/messages/${uid}`, { isRead: true });
}

async function sendEmail({ account, to, subject, body, html }) {
  const accessToken = await getValidAccessToken(account);
  const client = graphClient(accessToken);

  await client.post('/me/sendMail', {
    message: {
      subject,
      body: {
        contentType: html ? 'HTML' : 'Text',
        content: html || body || ''
      },
      toRecipients: [{ emailAddress: { address: to } }]
    }
  });
}

module.exports = { fetchEmails, fetchEmailBody, markAsRead, sendEmail, getValidAccessToken };
