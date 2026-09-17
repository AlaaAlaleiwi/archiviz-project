import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ProductShell from './ProductShell.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><ProductShell /></AppErrorBoundary>
  </StrictMode>,
)
