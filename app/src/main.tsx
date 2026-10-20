import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// Routes live at the host root; only assets sit under /spa/. Old links that
// still carry the /spa prefix land on the same route without it.
if (window.location.pathname === '/spa' || window.location.pathname.startsWith('/spa/')) {
  const path = window.location.pathname.slice(4) || '/'
  window.history.replaceState(null, '', path + window.location.search + window.location.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
