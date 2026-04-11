const mongoose = require('mongoose');

const emailCacheSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  uid: {
    type: String,
    required: true
  },
  messageId: {
    type: String
  },
  fromName: {
    type: String
  },
  fromEmail: {
    type: String
  },
  toEmail: {
    type: String
  },
  subject: {
    type: String
  },
  preview: {
    type: String
  },
  receivedAt: {
    type: Date
  },
  isRead: {
    type: Boolean,
    default: false
  },
  folder: {
    type: String,
    default: 'INBOX'
  },
  bodyHtml: { type: String },
  bodyText: { type: String },
  bodyFetched: { type: Boolean, default: false }
});

// Compound index to avoid duplicates
emailCacheSchema.index({ accountId: 1, uid: 1, folder: 1 }, { unique: true });

module.exports = mongoose.model('EmailCache', emailCacheSchema);
