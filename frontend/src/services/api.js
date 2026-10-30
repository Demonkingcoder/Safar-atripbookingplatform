import axios from 'axios'
import { canRefreshRequest, createRefreshCoordinator } from './authRefresh'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

const refreshOnce = createRefreshCoordinator(
  () => api.post('/auth/refresh-token', {}, { _skipAuthRefresh: true }),
  () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('safar_access_token')
      window.dispatchEvent(new Event('safar:session-expired'))
    }
  },
)

api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config
  if (!canRefreshRequest(error)) return Promise.reject(error)

  originalRequest._safarRetried = true
  try {
    await refreshOnce()
    return api(originalRequest)
  } catch {
    return Promise.reject(error)
  }
})

export function unwrapData(response) {
  return response?.data?.data ?? response?.data ?? response
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
}

export default api
