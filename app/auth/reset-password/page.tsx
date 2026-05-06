'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function ResetPasswordForm() {
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
    // Supabase can send reset links in two formats:
    // 1. PKCE flow: ?token_hash=xxx&type=recovery
    // 2. Implicit flow: #access_token=xxx&type=recovery (in URL hash)
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const code = searchParams.get('code')

    if (tokenHash && type === 'recovery') {
      // PKCE / token_hash flow
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) setError('This reset link is invalid or has expired.')
        else setVerified(true)
      })
    } else if (code) {
      // PKCE code exchange flow
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError('This reset link is invalid or has expired.')
        else setVerified(true)
      })
    } else {
      // Check URL hash for implicit flow (access_token in hash)
      const hash = window.location.hash
      if (hash.includes('access_token') && hash.includes('type=recovery')) {
        // The Supabase client picks up the session automatically from the hash
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) setVerified(true)
          else setError('Invalid reset link.')
        })
      } else {
        setError('Invalid reset link.')
      }
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
  )
}

export default function ResetPasswordPage() {
  return (
    <div id="loginScreen">
      <div className="login-logo">
        <h1>ERP <span style={{ color: '#0D2D52' }}>Funds</span></h1>
        <p>AI Agent Portal</p>
      </div>
      <Suspense fallback={<div style={{ fontSize: 12, color: '#888' }}>Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
