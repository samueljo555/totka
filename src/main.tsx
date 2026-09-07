import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ConfirmProvider } from './contexts/ConfirmContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfirmProvider>
        <Toaster position="top-center" toastOptions={{ style: { background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', color: '#333', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.5)' } }} />
        <App />
      </ConfirmProvider>
    </BrowserRouter>
  </StrictMode>,
)
