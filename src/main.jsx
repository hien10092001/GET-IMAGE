import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PublicLookup from './pages/PublicLookup.jsx'

const isPublicLookup = window.location.pathname.replace(/\/+$/, '').endsWith('/tra-cuu')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicLookup ? <PublicLookup /> : <App />}
  </StrictMode>,
)
