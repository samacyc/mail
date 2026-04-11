import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAccounts, addAccount, deleteAccount, getMicrosoftAuthUrl } from '../api'

const KNOWN_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com']

function isKnownDomain(email) {
  if (!email || !email.includes('@')) return true // don't show manual fields yet
  const domain = email.split('@')[1]?.toLowerCase()
  return KNOWN_DOMAINS.includes(domain)
}

export default function AdminPage() {
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({
    email: '',
    password: '',
    label: '',
    imap_host: '',
    imap_port: '',
    smtp_host: '',
    smtp_port: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text: '' }
  const [deletingId, setDeletingId] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [msLoading, setMsLoading] = useState(false)

  const location = useLocation()

  useEffect(() => {
    fetchAccounts()

    // Handle OAuth redirect params
    const params = new URLSearchParams(location.search)
    const success = params.get('success')
    const error = params.get('error')

    if (success === 'microsoft') {
      setMessage({ type: 'success', text: 'Microsoft account connected successfully!' })
      fetchAccounts()
      // Clean the URL without reloading
      window.history.replaceState({}, '', '/admin')
    } else if (error) {
      setMessage({ type: 'error', text: `Microsoft sign-in failed: ${decodeURIComponent(error)}` })
      window.history.replaceState({}, '', '/admin')
    }
  }, [])

  async function fetchAccounts() {
    try {
      const res = await getAccounts()
      setAccounts(res.data)
    } catch (err) {
      console.error('Failed to load accounts', err)
    }
  }

  const needsManual = !isKnownDomain(form.email)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setMessage(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setMessage({ type: 'error', text: 'Email and password are required.' })
      return
    }
    if (needsManual && (!form.imap_host || !form.imap_port || !form.smtp_host || !form.smtp_port)) {
      setMessage({ type: 'error', text: 'Please fill in all IMAP/SMTP fields for this domain.' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const payload = {
        email: form.email,
        password: form.password,
        label: form.label
      }
      if (needsManual) {
        payload.imap_host = form.imap_host
        payload.imap_port = parseInt(form.imap_port, 10)
        payload.smtp_host = form.smtp_host
        payload.smtp_port = parseInt(form.smtp_port, 10)
      }

      await addAccount(payload)
      setMessage({ type: 'success', text: `Account ${form.email} linked successfully!` })
      setForm({ email: '', password: '', label: '', imap_host: '', imap_port: '', smtp_host: '', smtp_port: '' })
      fetchAccounts()
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to link account. Check your credentials.'
      setMessage({ type: 'error', text: errMsg })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id, email) {
    if (!window.confirm(`Remove ${email} from your accounts?`)) return
    setDeletingId(id)
    try {
      await deleteAccount(id)
      setAccounts(prev => prev.filter(a => a._id !== id))
    } catch (err) {
      alert('Failed to remove account.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleMicrosoftLogin() {
    setMsLoading(true)
    setMessage(null)
    try {
      const res = await getMicrosoftAuthUrl()
      window.location.href = res.data.url
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to start Microsoft sign-in. Check server configuration.' })
      setMsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Mail</span>
          <span className="text-gray-400 text-sm ml-2">/ Admin</span>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          Inbox
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">Email Accounts</h1>
        <p className="text-gray-400 text-sm mb-8">
          Link your email accounts to access them in one place. Use App Passwords for Gmail/Outlook with 2FA enabled.
        </p>

        {/* Add account form */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-5">Link New Account</h2>

          {/* Microsoft OAuth button */}
          <div className="mb-5">
            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={msLoading}
              className="w-full flex items-center justify-center gap-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-900 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              {msLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Redirecting to Microsoft...
                </>
              ) : (
                <>
                  {/* Microsoft "M" logo (four colored squares) */}
                  <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Connect Microsoft / Outlook Account
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Signs in via OAuth — no password stored
            </p>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 border-t border-gray-700" />
            <span className="text-xs text-gray-500">or link with password</span>
            <div className="flex-1 border-t border-gray-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Email address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@gmail.com"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  autoComplete="off"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Label <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  name="label"
                  value={form.label}
                  onChange={handleChange}
                  placeholder="Work, Personal..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Password / App Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Your email password or app password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Manual IMAP/SMTP config for unknown providers */}
            {needsManual && form.email.includes('@') && (
              <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600 space-y-4">
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Unknown provider — please enter your IMAP/SMTP settings manually.</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">IMAP Host</label>
                    <input
                      type="text"
                      name="imap_host"
                      value={form.imap_host}
                      onChange={handleChange}
                      placeholder="imap.example.com"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">IMAP Port</label>
                    <input
                      type="number"
                      name="imap_port"
                      value={form.imap_port}
                      onChange={handleChange}
                      placeholder="993"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      name="smtp_host"
                      value={form.smtp_host}
                      onChange={handleChange}
                      placeholder="smtp.example.com"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">SMTP Port</label>
                    <input
                      type="number"
                      name="smtp_port"
                      value={form.smtp_port}
                      onChange={handleChange}
                      placeholder="587"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Status message */}
            {message && (
              <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {message.type === 'success' ? (
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span>{message.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testing connection...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Link Account
                </>
              )}
            </button>
          </form>
        </div>

        {/* Linked accounts list */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Linked Accounts
            {accounts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({accounts.length})</span>
            )}
          </h2>

          {accounts.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-sm">No accounts linked yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map(account => (
                <div
                  key={account._id}
                  className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 hover:border-gray-600 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: account.color }}
                    >
                      {account.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{account.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {account.label && (
                          <span className="text-xs text-gray-400">{account.label}</span>
                        )}
                        <span className="text-xs text-gray-600">{account.imap_host}</span>
                        {account.auth_type === 'oauth' && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5">OAuth</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(account._id, account.email)}
                    disabled={deletingId === account._id}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-400/10 opacity-0 group-hover:opacity-100"
                    title="Remove account"
                  >
                    {deletingId === account._id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help info */}
        <div className="mt-10 bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 text-sm text-gray-400 space-y-2">
          <p className="font-medium text-gray-300 mb-3">Setup Tips</p>
          <p><span className="text-gray-300">Microsoft / Outlook:</span> Use the "Connect Microsoft Account" button above for OAuth sign-in — no App Password needed.</p>
          <p><span className="text-gray-300">Gmail:</span> Enable 2FA and create an App Password at myaccount.google.com → Security → App Passwords</p>
          <p><span className="text-gray-300">Outlook (password):</span> Enable IMAP in Outlook settings. Use an App Password if 2FA is active.</p>
          <p><span className="text-gray-300">Yahoo:</span> Generate an App Password at account.yahoo.com → Security → App Password.</p>
        </div>
      </div>
    </div>
  )
}
