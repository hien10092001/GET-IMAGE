import axios from 'axios'
import { getActiveScope, clearSession } from './sectionAuth'

const baseURL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

const api = axios.create({
  baseURL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = String(err.config?.url || '').includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      const scope = getActiveScope()
      if (scope) clearSession(scope)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('activeScope')
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(err)
  }
)

export default api
