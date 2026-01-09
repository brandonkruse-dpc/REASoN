
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("%cRE:ASoN System: Starting Initialization Protocol...", "color: #3b82f6; font-weight: 900; font-size: 14px;");

const bootApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Critical: Root element 'root' not found in DOM.");
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("%cRE:ASoN System: Successfully rendered UI tree.", "color: #10b981; font-weight: 900;");
  } catch (err) {
    console.error("Critical: React render cycle failed.", err);
  }
};

// Use a small delay to ensure Babel-transpiled components are fully evaluated
setTimeout(bootApp, 10);
