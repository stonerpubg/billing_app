import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { installIfBrowser } from './api/http.js';
import './styles/index.css';

// If running in a plain browser (no Electron preload), install the HTTP shim
// that mirrors window.api using fetch against /api/*
const isWeb = installIfBrowser();
// Use BrowserRouter for web (clean URLs) and HashRouter for Electron (file:// friendly)
const Router = isWeb ? BrowserRouter : HashRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </Router>
  </React.StrictMode>
);
