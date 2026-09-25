import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { ServerEventsProvider } from './events/useServerEvents'
import './theme/fonts.css'
import './theme/nocturne.css'
import './theme/themes.css'
import './app.css'
import './markdown/markdown.css'
import './attention.css'
import './theme/githubDiff.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServerEventsProvider>
        <App />
      </ServerEventsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
