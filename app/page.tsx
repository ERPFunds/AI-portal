'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ROLE_CARDS, ROLES, type RoleKey } from '@/lib/data/roles'

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRole) return
    setError('')
    setLoading(true)

    const email = ROLES[selectedRole].email
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail) return
    setError('')
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    setLoading(false)
    if (resetError) {
      setError(resetError.message)
    } else {
      setResetSent(true)
    }
  }

  function openForgot() {
    setForgotMode(true)
    setForgotEmail(selectedRole ? ROLES[selectedRole].email : '')
    setError('')
  }

  function closeForgot() {
    setForgotMode(false)
    setResetSent(false)
    setForgotEmail('')
    setError('')
  }

  return (
    <div id="loginScreen">
      <div className="login-logo">
        <h1>ERP <span style={{ color: '#C9A84C' }}>Industrials</span></h1>
        <p>AI Agent Portal</p>
      </div>

      <div className="login-label">Select your profile to continue</div>

      <div className="role-grid">
        {ROLE_CARDS.filter(card => card.key === 'meghan').map((card) => {
          const role = ROLES[card.key]
          const isSelected = selectedRole === card.key
          return (
            <div
              key={card.key}
              className="role-card"
              onClick={() => {
                setSelectedRole(card.key)
                setError('')
                setPassword('')
              }}
              style={{
                borderColor: isSelected ? '#C9A84C' : undefined,
                transform: isSelected ? 'translateY(-2px)' : undefined,
              }}
            >
              <div
                className="role-avatar"
                style={{ background: role.bg, color: role.color }}
              >
                {role.avatar}
              </div>
              <h3>{role.name}</h3>
              <div
                className="access-badge"
                style={{ background: card.accessBg, color: card.accessColor }}
              >
                {card.accessLabel}
              </div>
            </div>
          )
        })}
      </div>

      {selectedRole && !forgotMode && (
        <form
          onSubmit={handleLogin}
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
          <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
            Signing in as <span style={{ color: '#E8E6E1', fontWeight: 600 }}>{ROLES[selectedRole].name}</span>
          </div>
          <input
            type="password"
            placeholder="Enter password"
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
          {error && (
            <div style={{ fontSize: 12, color: '#E55A4E', textAlign: 'center' }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => { setSelectedRole(null); setPassword(''); setError('') }}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={loading || !password}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </div>
          <button
            type="button"
            onClick={openForgot}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Forgot password?
          </button>
        </form>
      )}

      {forgotMode && (
        <form
          onSubmit={handleForgotPassword}
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
          {resetSent ? (
            <>
              <div style={{ fontSize: 13, color: '#3DAE7A', textAlign: 'center' }}>
                Reset link sent — check your email.
              </div>
              <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={closeForgot}>
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
                Enter the email address on your account
              </div>
              <input
                type="email"
                placeholder="Your email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
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
              {error && (
                <div style={{ fontSize: 12, color: '#E55A4E', textAlign: 'center' }}>{error}</div>
              )}
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeForgot}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading || !forgotEmail}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  )
}
