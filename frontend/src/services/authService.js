import api, { unwrapData } from './api'

function saveAuthResult(payload) {
  localStorage.removeItem('safar_access_token')
  return payload?.data ?? payload
}

const authService = {
  async register(userData) {
    const response = await api.post('/auth/register', userData)
    return saveAuthResult(unwrapData(response))
  },
  async verifyEmail(token) {
    const response = await api.get(`/auth/verify-email/${encodeURIComponent(token)}`)
    return response.data
  },
  async resendVerificationEmail(email) {
    const response = await api.post('/auth/resend-verification', { email })
    return response.data
  },
  async login(credentials) {
    const response = await api.post('/auth/login', credentials)
    return saveAuthResult(unwrapData(response))
  },
  async logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // Clear local auth state even if the session has already expired.
    } finally {
      localStorage.removeItem('safar_access_token')
    }
  },
  async getCurrentUser() {
    const response = await api.get('/auth/current-user')
    return unwrapData(response)
  },
  async updateCurrentUser(userData) {
    const response = await api.put('/auth/me', userData)
    return unwrapData(response)
  },
  async changePassword(passwordData) {
    const response = await api.put('/auth/change-password', passwordData)
    return unwrapData(response)
  },
  async requestPasswordReset(email) {
    const response = await api.post('/auth/forgot-password', { email })
    return unwrapData(response)
  },
  async resetPassword(token, password) {
    const response = await api.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password })
    return unwrapData(response)
  },
}

export default authService
