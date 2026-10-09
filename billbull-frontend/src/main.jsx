import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@billbull/shared/index.css'
import App from './App.jsx'
import { installGlobalClientLogging } from '@billbull/shared/utils/clientLogger'

installGlobalClientLogging()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
