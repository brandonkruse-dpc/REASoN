
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("%cRE:ASoN: System Initializing...", "color: #3b82f6; font-weight: bold;");

const mount = () => {
  const container = document.getElementById('root');
  if (!container) {
    console.error("RE:ASoN: Failed to find mount point '#root'");
    return;
  }

  try {
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("%cRE:ASoN: UI Mounted Successfully.", "color: #10b981; font-weight: bold;");
  } catch (error) {
    console.error("RE:ASoN: Critical UI Render Error:", error);
    container.innerHTML = `<div style="padding:20px; color:red;">React failed to render. Check console for details.</div>`;
  }
};

// Execute mount after a short tick to ensure DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
