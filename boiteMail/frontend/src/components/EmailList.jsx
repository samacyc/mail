import React from 'react'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

function getInitials(name, email) {
  const source = name || email || '?'
  const words = source.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export default function EmailList({ emails, selectedUid, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-4 border-b border-gray-700/50 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-700 flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-700 rounded w-12" />
                </div>
                <div className="h-3.5 bg-gray-700 rounded w-2/3" />
                <div className="h-3 bg-gray-700 rounded w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8">
        <svg className="w-14 h-14 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-sm font-medium">No emails found</p>
        <p className="text-xs mt-1 text-gray-700">Your inbox is empty or no accounts are linked.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {emails.map((email) => {
        const isSelected = selectedUid === email.uid && email.accountId
        const initials = getInitials(email.fromName, email.fromEmail)

        return (
          <div
            key={`${email.accountId}-${email.uid}`}
            onClick={() => onSelect(email)}
            className={`relative px-4 py-3.5 border-b border-gray-700/50 cursor-pointer transition-colors group ${
              isSelected
                ? 'bg-blue-600/15 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-700/40 border-l-2 border-l-transparent'
            }`}
            style={{
              borderLeftColor: isSelected ? undefined : email.accountColor
            }}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                style={{ backgroundColor: email.accountColor || '#4ECDC4' }}
              >
                {initials}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm truncate ${email.isRead ? 'text-gray-400 font-normal' : 'text-white font-semibold'}`}>
                    {email.fromName || email.fromEmail || 'Unknown'}
                  </span>
                  <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                    {formatDate(email.receivedAt)}
                  </span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${email.isRead ? 'text-gray-500' : 'text-gray-200'}`}>
                  {email.subject}
                </p>
                {email.preview && (
                  <p className="text-xs text-gray-600 truncate mt-0.5">{email.preview}</p>
                )}
              </div>

              {/* Unread dot */}
              {!email.isRead && (
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
