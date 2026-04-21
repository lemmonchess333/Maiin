import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/register-sw'
import { initErrorMonitoring } from './lib/errorReporting'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline support
registerServiceWorker()

// Attach window.error and unhandledrejection listeners. captureError is
// already called at known failure sites throughout the app; this catches
// the long tail of uncaught errors that would otherwise never reach
// errorReporting's Firestore sink.
initErrorMonitoring()
