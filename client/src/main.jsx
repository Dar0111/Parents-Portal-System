import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './pages/settings/theme'

// Applies the stored theme (index.html already did, before this bundle) and
// registers the ONE prefers-color-scheme listener that keeps "System" live.
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
