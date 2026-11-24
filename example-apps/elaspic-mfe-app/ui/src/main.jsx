import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { EuiProvider } from '@elastic/eui';
import '@elastic/eui/dist/eui_theme_light.css';
import './app.css';
// Side-effect: register EUI icons for Vite (see icons.js / eui#5463)
import './icons.js';
import { AuthProvider } from '@elaspic/platform-sdk';
import { App } from '@elaspic/shell';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EuiProvider colorMode="light">
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </EuiProvider>
  </StrictMode>,
);