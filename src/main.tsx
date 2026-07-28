import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AIProvider } from './lib/ai-context.tsx';
import { ActivationGate } from './features/activation';

// ActivationGate wraps the whole app: until this computer is activated — or the
// user has chosen to work unconnected — no shell renders. Gating here rather
// than inside App keeps the activation screen free of every provider, tab and
// store subscription the main window needs.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivationGate>
      <AIProvider>
        <App />
      </AIProvider>
    </ActivationGate>
  </StrictMode>,
);
