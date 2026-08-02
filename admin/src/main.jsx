import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/features.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
