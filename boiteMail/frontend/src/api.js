import axios from 'axios'

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  timeout: 60000
})

// Accounts
export function getAccounts() {
  return api.get('/accounts')
}

export function addAccount(data) {
  return api.post('/accounts/add', data)
}

export function deleteAccount(id) {
  return api.delete(`/accounts/${id}`)
}

// Emails
export function getEmails(folder = 'INBOX', page = 1, accountId = null) {
  const params = { folder, page }
  if (accountId) params.accountId = accountId
  return api.get('/emails', { params })
}

export function getEmailBody(uid, accountId) {
  return api.get(`/emails/${uid}/body`, { params: { accountId } })
}

export function sendEmail(data) {
  return api.post('/emails/send', data)
}

export function markAsRead(uid, accountId) {
  return api.patch(`/emails/${uid}/read`, null, { params: { accountId } })
}

// Microsoft OAuth
export function getMicrosoftAuthUrl() {
  return api.get('/auth/microsoft/url')
}

export default api
