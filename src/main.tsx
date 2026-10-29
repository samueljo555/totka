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
        <Toaster position="top-center" toastOptions={{ style: { background: '#fff', color: '#536781', borderRadius: '8px', border: '1px solid #dce3ee', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif', fontSize: '12px', boxShadow: '0 7px 25px #15345e17' } }} />
        <App />
      </ConfirmProvider>
    </BrowserRouter>
  </StrictMode>,
)
