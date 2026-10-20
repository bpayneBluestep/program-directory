import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// The app routes under "/spa" (the Vite `base`), but the GitSite also serves
// index.html at the bare domain root. Only "/" and "/spa/*" are served, so move
// a root visit into "/spa/" (keeping ?program=…) before the router mounts —
// otherwise in-app links would push URLs that 404 on refresh.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')
if (!window.location.pathname.startsWith(basename + '/') && window.location.pathname !== basename) {
  window.history.replaceState(null, '', basename + '/' + window.location.search + window.location.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
