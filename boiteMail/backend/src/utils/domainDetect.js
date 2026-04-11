function getImapSmtp(email) {
  if (!email || !email.includes('@')) return null;

  const domain = email.split('@')[1].toLowerCase();

  if (domain === 'gmail.com') {
    return {
      imap_host: 'imap.gmail.com',
      imap_port: 993,
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587
    };
  }

  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
    return {
      imap_host: 'outlook.office365.com',
      imap_port: 993,
      smtp_host: 'smtp.office365.com',
      smtp_port: 587
    };
  }

  if (domain === 'yahoo.com') {
    return {
      imap_host: 'imap.mail.yahoo.com',
      imap_port: 993,
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 587
    };
  }

  // Unknown domain — frontend will ask user for manual config
  return null;
}

module.exports = { getImapSmtp };
