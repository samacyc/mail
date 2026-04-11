import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import EmailList from '../components/EmailList'
import ComposeBox from '../components/ComposeBox'
import { getAccounts, getEmails, getEmailBody, markAsRead } from '../api'

function formatFullDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString([], {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getAddressStr(addresses) {
  if (!addresses || !addresses.length) return ''
  return addresses
    .map(a => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(', ')
}

export default function InboxPage() {
  const [accounts, setAccounts] = useState([])
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [emailBody, setEmailBody] = useState(null)
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [loadingBody, setLoadingBody] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(null) // null = all inboxes
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [folder, setFolder] = useState('INBOX')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const bodyRef = useRef(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    fetchEmails()
  }, [selectedAccountId, folder, page])

  // Poll for new emails every 30 seconds (silent — no spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEmails(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [selectedAccountId, folder, page])

  async function fetchAccounts() {
    try {
      const res = await getAccounts()
      setAccounts(res.data)
    } catch (err) {
      console.error('Failed to load accounts', err)
    }
  }

  async function fetchEmails(silent = false) {
    if (!silent) setLoadingEmails(true)
    try {
      const res = await getEmails(folder, page, selectedAccountId)
      setEmails(res.data.emails || [])
      setTotal(res.data.total || 0)
    } catch (err) {
      console.error('Failed to load emails', err)
    } finally {
      if (!silent) setLoadingEmails(false)
    }
  }

  async function handleSelectEmail(email) {
    setSelectedEmail(email)
    setEmailBody(null)
    setShowCompose(false)
    setLoadingBody(true)

    try {
      const res = await getEmailBody(email.uid, email.accountId)
      setEmailBody(res.data)

      // Mark as read if not already
      if (!email.isRead) {
        try {
          await markAsRead(email.uid, email.accountId)
          setEmails(prev =>
            prev.map(e =>
              e.uid === email.uid && e.accountId === email.accountId
                ? { ...e, isRead: true }
                : e
            )
          )
        } catch (e) {
          // Non-critical
        }
      }
    } catch (err) {
      setEmailBody({ error: 'Failed to load email body.' })
    } finally {
      setLoadingBody(false)
    }
  }

  function handleAccountFilter(accountId) {
    setSelectedAccountId(accountId)
    setSelectedEmail(null)
    setEmailBody(null)
    setShowCompose(false)
    setPage(1)
  }

  const filteredEmails = searchQuery.trim()
    ? emails.filter(e => {
        const q = searchQuery.toLowerCase()
        return (
          e.subject?.toLowerCase().includes(q) ||
          e.fromName?.toLowerCase().includes(q) ||
          e.fromEmail?.toLowerCase().includes(q) ||
          e.preview?.toLowerCase().includes(q)
        )
      })
    : emails

  // Unread counts
  const totalUnread = emails.filter(e => !e.isRead).length
  const accountUnread = accounts.map(acc => ({
    ...acc,
    unreadCount: emails.filter(e => e.accountId === acc._id && !e.isRead).length
  }))

  const replyTo = selectedEmail
    ? emails.find(e => e.uid === selectedEmail.uid && e.accountId === selectedEmail.accountId)?.fromEmail || ''
    : ''
  const replySubject = selectedEmail
    ? `Re: ${emailBody?.subject || selectedEmail.subject || ''}`
    : ''

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 overflow-hidden">
      {/* Top Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700 mr-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">Mail</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            disabled={loadingEmails}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-700"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loadingEmails ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Accounts
          </Link>
        </div>
      </nav>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {sidebarOpen && (
          <aside className="w-60 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0 overflow-y-auto">
            {/* Compose button */}
            <div className="p-3">
              <button
                onClick={() => { setShowCompose(true); setSelectedEmail(null) }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Compose
              </button>
            </div>

            {/* Folders */}
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-2">Folders</p>
              {['INBOX', 'Sent', 'Drafts', 'Spam', 'Trash'].map(f => (
                <button
                  key={f}
                  onClick={() => { setFolder(f); setPage(1); setSelectedEmail(null) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    folder === f ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {f === 'INBOX' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  )}
                  {f === 'Sent' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                  {f === 'Drafts' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  )}
                  {f === 'Spam' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {f === 'Trash' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  <span className="flex-1 text-left">{f}</span>
                  {f === 'INBOX' && totalUnread > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Accounts */}
            <div className="px-3 py-2 border-t border-gray-700/50 flex-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-2">Accounts</p>

              {/* All Inboxes */}
              <button
                onClick={() => handleAccountFilter(null)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  !selectedAccountId ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <span className="flex-1 text-left">All Inboxes</span>
                {totalUnread > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>

              {accounts.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-gray-600">No accounts linked.</p>
                  <Link to="/admin" className="text-xs text-blue-500 hover:text-blue-400 mt-1 block">
                    + Add account
                  </Link>
                </div>
              ) : (
                accountUnread.map(acc => (
                  <button
                    key={acc._id}
                    onClick={() => handleAccountFilter(acc._id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedAccountId === acc._id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className="flex-1 text-left truncate">{acc.label || acc.email.split('@')[0]}</span>
                    {acc.unreadCount > 0 && (
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center text-white"
                        style={{ backgroundColor: acc.color }}
                      >
                        {acc.unreadCount > 99 ? '99+' : acc.unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Email list panel */}
        <div className="w-80 flex-shrink-0 bg-gray-850 border-r border-gray-700 flex flex-col overflow-hidden" style={{ backgroundColor: '#111827' }}>
          {/* Search bar */}
          <div className="p-3 border-b border-gray-700/50">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full bg-gray-700 border border-gray-600 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Email count info */}
          <div className="px-4 py-2 flex items-center justify-between border-b border-gray-700/30">
            <span className="text-xs text-gray-500">
              {searchQuery ? `${filteredEmails.length} results` : `${emails.length} emails`}
              {total > emails.length && !searchQuery && ` of ${total}`}
            </span>
            {folder === 'INBOX' && !searchQuery && (
              <span className="text-xs text-gray-500">
                {totalUnread > 0 ? `${totalUnread} unread` : 'All read'}
              </span>
            )}
          </div>

          {/* Email list */}
          <EmailList
            emails={filteredEmails}
            selectedUid={selectedEmail?.uid}
            onSelect={handleSelectEmail}
            loading={loadingEmails}
          />

          {/* Load more */}
          {!searchQuery && total > emails.length && (
            <div className="p-3 border-t border-gray-700/50">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loadingEmails}
                className="w-full text-sm text-blue-400 hover:text-blue-300 py-2 rounded-lg hover:bg-blue-600/10 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </div>

        {/* Right panel - email body */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
          {showCompose && !selectedEmail ? (
            // Full compose view
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">New Message</h2>
                <button onClick={() => setShowCompose(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <ComposeBox
                  accountId={selectedAccountId || accounts[0]?._id}
                  onClose={() => setShowCompose(false)}
                  onSent={() => { setShowCompose(false); fetchEmails() }}
                />
              </div>
            </div>
          ) : selectedEmail ? (
            // Email detail view
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Email header */}
              <div className="px-6 py-5 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h1 className="text-xl font-semibold text-white leading-tight flex-1">
                    {emailBody?.subject || selectedEmail.subject || '(no subject)'}
                  </h1>
                  <button
                    onClick={() => { setSelectedEmail(null); setEmailBody(null) }}
                    className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded flex-shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-start gap-3">
                  {/* Sender avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: selectedEmail.accountColor || '#4ECDC4' }}
                  >
                    {(selectedEmail.fromName || selectedEmail.fromEmail || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {selectedEmail.fromName || selectedEmail.fromEmail}
                      </p>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatFullDate(selectedEmail.receivedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="text-gray-600">From: </span>
                      {selectedEmail.fromEmail}
                    </p>
                    {emailBody?.to && emailBody.to.length > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        <span>To: </span>
                        {getAddressStr(emailBody.to)}
                      </p>
                    )}
                    <p className="text-xs mt-0.5">
                      <span className="text-gray-600">Inbox: </span>
                      <span
                        className="font-medium"
                        style={{ color: selectedEmail.accountColor || '#4ECDC4' }}
                      >
                        {selectedEmail.accountEmail}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Email body */}
              <div ref={bodyRef} className="flex-1 overflow-y-auto">
                {loadingBody ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <svg className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <p className="text-sm text-gray-500">Loading email...</p>
                    </div>
                  </div>
                ) : emailBody?.error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-sm">{emailBody.error}</p>
                    </div>
                  </div>
                ) : emailBody?.html ? (
                  <div
                    className="p-6 prose prose-invert max-w-none text-sm"
                    style={{ color: '#d1d5db' }}
                    dangerouslySetInnerHTML={{ __html: emailBody.html }}
                  />
                ) : emailBody?.text ? (
                  <div className="p-6">
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {emailBody.text}
                    </pre>
                  </div>
                ) : emailBody?.source ? (
                  <div className="p-6">
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                      {emailBody.source}
                    </pre>
                  </div>
                ) : null}
              </div>

              {/* Reply / Actions bar */}
              {!showCompose && (
                <div className="px-6 py-3 border-t border-gray-700 flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setShowCompose(true)}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Reply
                  </button>
                  <button
                    onClick={() => {
                      setShowCompose(true)
                    }}
                    className="flex items-center gap-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    Forward
                  </button>
                </div>
              )}

              {/* Compose / Reply box */}
              {showCompose && (
                <div className="flex-shrink-0">
                  <ComposeBox
                    defaultTo={replyTo}
                    defaultSubject={replySubject}
                    accountId={selectedEmail?.accountId}
                    onClose={() => setShowCompose(false)}
                    onSent={() => { setShowCompose(false); fetchEmails() }}
                  />
                </div>
              )}
            </div>
          ) : (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8">
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-500 mb-2">No email selected</p>
              <p className="text-sm text-gray-600 text-center max-w-sm">
                Select an email from the list to read it, or compose a new message.
              </p>
              {accounts.length === 0 && (
                <Link
                  to="/admin"
                  className="mt-6 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Link your first account
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
