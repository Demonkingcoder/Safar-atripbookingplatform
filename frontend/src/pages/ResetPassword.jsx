import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Compass, Eye, EyeOff } from 'lucide-react'
import Button from '../component/ui/Button'
import authService from '../services/authService'

function ResetPassword() {
  const { token } = useParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(token, password)
      setComplete(true)
      setPassword('')
      setConfirmPassword('')
    } catch (requestError) {
      setError(requestError?.response?.status === 400
        ? 'This reset link is invalid, expired, or already used. Request a new one to continue.'
        : 'We could not reset your password right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page px-4 py-12 sm:px-6 sm:py-16">
    <section className="auth-card">
      <Link to="/" className="brand-lockup" aria-label="Safar home"><span className="brand-mark"><Compass size={22} /></span><span className="font-heading text-2xl font-bold text-forest">safar<span className="text-terracotta">.</span></span></Link>
      <p className="eyebrow mt-8">Account recovery</p>
      <h1 className="mt-3 font-heading text-4xl font-semibold text-forest">Set a new password.</h1>
      {complete ? <div className="mt-6 space-y-4" aria-live="polite">
        <p className="notice-success" role="status">Your password has been reset. Please sign in with your new password.</p>
        <Link to="/login" className="inline-flex font-semibold text-forest underline underline-offset-4">Continue to sign in</Link>
      </div> : <>
        <p className="mt-3 text-sm leading-6 text-muted">Choose a new password with at least 8 characters. Your reset link is single-use and expires after 15 minutes.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="field"><label htmlFor="new-password">New password</label><div className="password-wrap"><input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} className="password-toggle" aria-label={showPassword ? 'Hide new password' : 'Show new password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><div className="password-wrap"><input id="confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /><button type="button" onClick={() => setShowConfirmation((shown) => !shown)} className="password-toggle" aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          {error && <p className="notice-error" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>Reset password</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link to="/forgot-password" className="font-bold text-forest underline underline-offset-4">Request a new reset link</Link></p>
      </>}
    </section>
  </main>
}

export default ResetPassword
