'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    if (tokenHash && type === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) setError('This reset link is invalid or has expired.')
        else setVerified(true)
      })
    } else {
      setError('Invalid reset link.')
    }
  }, [])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      router.push('/?reset=success')
    }
  }

  return (
    <div id="loginScreen">
      <div className="login-logo">
        <h1>ERP <span style={{ color: '#C9A84C' }}>Industrials</span></h1>
        <p>AI Agent Portal</p>
      </div>

      <form
        onSubmit={handleReset}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          maxWidth: 340,
          padding: '0 24px',
        }}
      >
        <div style={{ fontSize: 14, color: '#E8E6E1', fontWeight: 600 }}>Set new password</div>

        {error && (
          <div style={{ fontSize: 12, color: '#E55A4E', textAlign: 'center' }}>{error}</div>
        )}

        {verified && (
          <>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                background: '#161B26',
                border: '1px solid #252D3D',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 14,
                color: '#E8E6E1',
                outline: 'none',
              }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                width: '100%',
                background: '#161B26',
                border: '1px solid #252D3D',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 14,
                color: '#E8E6E1',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading || !password || !confirm}
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </>
        )}

        {!verified && !error && (
          <div style={{ fontSize: 12, color: '#888' }}>Verifying link…</div>
        )}
      </form>
    </div>
  )
}
