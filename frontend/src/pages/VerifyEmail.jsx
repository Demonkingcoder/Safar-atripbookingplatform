import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Compass } from 'lucide-react'
import authService from '../services/authService'
import Button from '../component/ui/Button'
import { getErrorMessage } from '../services/api'

function VerifyEmail() {
  const { token } = useParams()
  const verificationRequest = useRef(null)
  const [status, setStatus] = useState(token ? 'verifying' : 'error')
  const [message, setMessage] = useState(token ? 'Verifying your email address…' : 'The verification link is missing its token.')
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('The verification link is missing its token.')
      return undefined
    }

    if (!verificationRequest.current || verificationRequest.current.token !== token) {
      verificationRequest.current = {
        token,
        promise: authService.verifyEmail(token),
      }
    }

    let active = true
    setStatus('verifying')
    setMessage('Verifying your email address…')

    verificationRequest.current.promise
      .then((response) => {
        if (!active) return
        setStatus('verified')
        setMessage(response?.message || 'Your email address has been verified.')
      })
      .catch((error) => {
        if (!active) return
        setStatus('error')
        setMessage(getErrorMessage(error, 'We could not verify this email address.'))
      })

    return () => { active = false }
  }, [token])

  async function handleResend(event) {
    event.preventDefault()
    setResendMessage('')
    setResendError('')
    setResending(true)

    try {
      const response = await authService.resendVerificationEmail(email.trim().toLowerCase())
      setResendMessage(response?.message || 'If the account exists and needs verification, a verification email will be sent.')
    } catch (error) {
      setResendError(getErrorMessage(error, 'We could not request a new verification email. Please try again.'))
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
      <section className="auth-card">
        <Link to="/" className="brand-lockup" aria-label="Safar home">
          <span className="brand-mark"><Compass size={22} /></span>
          <span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span>
        </Link>

        <p className="eyebrow mt-8">Email verification</p>
        <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">
          {status === 'verified' ? 'You’re ready to explore.' : status === 'verifying' ? 'Verifying your email.' : 'Verification needs attention.'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted" role={status === 'error' ? 'alert' : 'status'}>
          {message}
        </p>

        {status === 'verified' ? (
          <Link to="/login" className="button-primary mt-7">Continue to sign in</Link>
        ) : status === 'error' ? (
          <form onSubmit={handleResend} className="mt-7 space-y-4">
            <div className="field">
              <label htmlFor="verification-email">Email address</label>
              <input
                id="verification-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {resendError && <p className="notice-error" role="alert">{resendError}</p>}
            {resendMessage && <p className="notice-success" role="status">{resendMessage}</p>}
            <Button type="submit" size="lg" className="w-full" loading={resending}>
              Resend verification email
            </Button>
          </form>
        ) : null}

        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/" className="font-bold text-forest underline underline-offset-4">Return to Safar</Link>
        </p>
      </section>
    </main>
  )
}

export default VerifyEmail
