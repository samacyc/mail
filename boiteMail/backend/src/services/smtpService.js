const nodemailer = require('nodemailer');
const { decrypt } = require('../utils/crypto');

async function sendEmail({ account, to, subject, body, html }) {
  const decryptedPassword = decrypt(account.password_encrypted);

  const isStartTLS = account.smtp_port === 587;

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: !isStartTLS, // false for 587 (STARTTLS), true for 465
    auth: {
      user: account.email,
      pass: decryptedPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: account.label
      ? `"${account.label}" <${account.email}>`
      : account.email,
    to,
    subject,
    text: body || '',
    ...(html ? { html } : {})
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = { sendEmail };
