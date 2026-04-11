# Mail — Multi-Account Email Webapp

A self-hosted multi-account email client built with Node.js, Express, React, and MongoDB.

## Features

- Link multiple email accounts (Gmail, Outlook, Yahoo, or any IMAP provider)
- Read emails from all accounts in a unified inbox
- Send and reply to emails
- Dark-themed three-panel layout
- Passwords stored encrypted with AES-256-CBC

## Prerequisites

- Node.js 18+
- MongoDB running locally (or provide a remote URI)

## Setup

### 1. Generate an Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and set it as `ENCRYPTION_KEY` in `/backend/.env`.

### 2. Configure Environment

Edit `/backend/.env`:
```
MONGODB_URI=mongodb://localhost:27017/emailapp
ENCRYPTION_KEY=<your-64-char-hex-key>
ADMIN_PIN=1234
PORT=3001
```

### 3. Install Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 4. Start the App

In two separate terminals:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open http://localhost:5173 in your browser.

## Linking Email Accounts

Go to http://localhost:5173/admin and link your accounts.

### Gmail
1. Enable 2-Step Verification at myaccount.google.com → Security
2. Create an App Password: myaccount.google.com → Security → App Passwords
3. Use the 16-character App Password (not your Google account password)

### Outlook / Hotmail / Live
1. Enable IMAP in Outlook settings (Settings → Mail → Sync email → IMAP)
2. If you have 2FA, create an App Password at account.microsoft.com → Security → Advanced security → App passwords

### Yahoo
1. Enable "Allow apps that use less secure sign in" OR generate an App Password at account.yahoo.com → Security → Generate app password

### Custom / Unknown Provider
If your email provider isn't auto-detected, the form will show IMAP/SMTP configuration fields. Fill them in manually.

## Project Structure

```
boiteMail/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express app entry point
│   │   ├── models/
│   │   │   ├── Account.js        # Mongoose Account schema
│   │   │   └── EmailCache.js     # Mongoose EmailCache schema
│   │   ├── utils/
│   │   │   ├── crypto.js         # AES-256-CBC encrypt/decrypt
│   │   │   └── domainDetect.js   # Auto-detect IMAP/SMTP from domain
│   │   ├── services/
│   │   │   ├── imapService.js    # IMAP operations via imapflow
│   │   │   └── smtpService.js    # SMTP send via nodemailer
│   │   └── routes/
│   │       ├── accounts.js       # Account management routes
│   │       └── emails.js         # Email fetch/send routes
│   ├── .env
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js                # Axios API helpers
    │   ├── pages/
    │   │   ├── InboxPage.jsx     # Main inbox (three-panel layout)
    │   │   └── AdminPage.jsx     # Account management
    │   └── components/
    │       ├── EmailList.jsx     # Email list items
    │       └── ComposeBox.jsx    # Compose/reply form
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/accounts | List all linked accounts |
| POST | /api/accounts/add | Link a new account |
| DELETE | /api/accounts/:id | Remove an account |
| GET | /api/emails | Fetch emails (all or by accountId) |
| GET | /api/emails/:uid/body | Get full email body |
| POST | /api/emails/send | Send an email |
| PATCH | /api/emails/:uid/read | Mark email as read |
