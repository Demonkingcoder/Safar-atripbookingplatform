
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../component/ui/Button'
import authService from '../services/authService'
import { getErrorMessage } from '../services/api'

function Register() {
  const { register } = useAuth()

  const [form, setForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    password: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationStatus, setRegistrationStatus] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  function handleChange(event) {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const fullName = form.fullName.trim()
    const mobile = form.mobile.trim()
    const email = form.email.trim().toLowerCase()
    const password = form.password

    if (fullName.length < 2) {
      setError('Please enter your full name (at least 2 characters).')
      return
    }

    const normalizedMobile = mobile.replace(/[\s()-]/g, '')

    if (!/^\+?[0-9]{10,15}$/.test(normalizedMobile)) {
      setError('Please enter a valid mobile number, including country code if needed.')
      return
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      await register({
        fullName,
        mobile: normalizedMobile,
        email,
        password,
      })
      setRegisteredEmail(email)
      setRegistrationStatus('sent')
    } catch (err) {
      const responseMessage = err?.response?.data?.message || ''
      if (err?.response?.status === 503 && /account created, but the verification email could not be sent/i.test(responseMessage)) {
        setRegisteredEmail(email)
        setRegistrationStatus('email-failed')
        return
      }
      setError(
        getErrorMessage(
          err,
          'Unable to create your account. Please try again.'
        )
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResending(true)
    setResendError('')
    setResendMessage('')
    try {
      await authService.resendVerificationEmail(registeredEmail)
      setResendMessage('If this email belongs to an account that still needs verification, a verification email will be sent. Please check your inbox and spam folder.')
    } catch (err) {
      setResendError(getErrorMessage(err, 'We could not resend the verification email. Please try again later.'))
    } finally {
      setResending(false)
      setResendCooldown(30)
    }
  }

  return (
    <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
      <section className="auth-card">
        <Link to="/" className="brand-lockup" aria-label="Safar home">
          <span className="brand-mark">
            <Compass size={22} />
          </span>

          <span className="font-heading text-2xl font-bold text-forest">
            safar<span className="text-terracotta">.</span>
          </span>
        </Link>

        <p className="eyebrow mt-8">Start exploring</p>

        <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">
          Make room for wonder.
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted">
          Create an account to save your plans and manage your bookings.
        </p>

        {registrationStatus ? (
          <div className="mt-7 space-y-4" aria-live="polite">
            <p role={registrationStatus === 'sent' ? 'status' : 'alert'} className={registrationStatus === 'sent' ? 'notice-success' : 'notice-error'}>
              {registrationStatus === 'sent'
                ? "Account created successfully! We've sent a verification email to your registered email address. Please check your inbox (and spam folder) and verify your email before logging in."
                : "Your account has been created, but we couldn't send the verification email. Please try resending it."}
            </p>
            <p className="break-words text-sm text-muted">Registered email: <strong className="text-forest">{registeredEmail}</strong></p>
            {resendError && <p role="alert" className="notice-error">{resendError}</p>}
            {resendMessage && <p role="status" className="notice-success">{resendMessage}</p>}
            <Button
              type="button"
              size="lg"
              className="w-full"
              loading={resending}
              disabled={resendCooldown > 0}
              onClick={handleResendVerification}
            >
              {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend verification email'}
            </Button>
          </div>
        ) : <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div className="field">
            <label htmlFor="register-fullname">Full name</label>
            <input
              id="register-fullname"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              value={form.fullName}
              onChange={handleChange}
              placeholder="Your full name"
            />
          </div>

          <div className="field">
            <label htmlFor="register-mobile">Mobile number</label>
            <input
              id="register-mobile"
              name="mobile"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              value={form.mobile}
              onChange={handleChange}
              placeholder="Enter your mobile number"
            />
            <p className="field-hint">
              Include your country code if needed, e.g. +91.
            </p>
          </div>

          <div className="field">
            <label htmlFor="register-email">Email address</label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
            />
          </div>

          <div className="field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={handleChange}
              placeholder="At least 8 characters"
            />
            <p className="field-hint">
              Use at least 8 characters.
            </p>
          </div>

          {error && (
            <p role="alert" className="notice-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={loading}
          >
            Create account <span aria-hidden="true">↗</span>
          </Button>
        </form>}

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-bold text-forest underline decoration-terracotta underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}

export default Register
