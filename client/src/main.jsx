import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// THE TWO TYPEFACES, BUNDLED (feat/ui-refresh): Source Sans 3 for text and
// Merriweather 700 for titles, from node_modules via Fontsource — never a
// CDN, the demo runs on a phone hotspot. Latin subset and only the weights
// the type scale uses (index.css: 400, 600, 700; `medium` is 600). Each file
// is `font-display: swap`, so text paints in the system fallback first.
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-400-italic.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/source-sans-3/latin-700.css'
import '@fontsource/merriweather/latin-700.css'
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
