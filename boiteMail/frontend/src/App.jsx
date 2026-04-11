import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import api from './api'
import InboxPage from './pages/InboxPage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const [auth, setAuth] = useState(null)

  useEffect(() => {
    api.get('/me', { withCredentials: true })
      .then(() => setAuth(true))
      .catch(() => setAuth(false))
  }, [])

  if (auth === null) return null

  if (auth === false) return <LoginPage onLogin={() => setAuth(true)} />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InboxPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
