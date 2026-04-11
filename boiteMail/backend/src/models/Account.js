const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    lowercase: true,
    trim: true
  },
  label: {
    type: String,
    trim: true
  },
  password_encrypted: {
    type: String
  },
  imap_host: {
    type: String,
    required: true
  },
  imap_port: {
    type: Number,
    required: true
  },
  smtp_host: {
    type: String,
    required: true
  },
  smtp_port: {
    type: Number,
    required: true
  },
  color: {
    type: String,
    default: '#4ECDC4'
  },
  // OAuth fields
  auth_type: {
    type: String,
    default: 'password',
    enum: ['password', 'oauth']
  },
  access_token_encrypted: {
    type: String
  },
  refresh_token_encrypted: {
    type: String
  },
  token_expiry: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Account', accountSchema);
