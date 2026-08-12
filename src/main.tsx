import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UserProvider } from './context/UserContext';
import './index.css';
import {bootstrapTelegramWebApp} from './utils/telegramWebApp';

bootstrapTelegramWebApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserProvider>
      <App />
    </UserProvider>
  </StrictMode>,
);
