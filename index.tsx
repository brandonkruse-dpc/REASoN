
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("RE:ASoN: Booting entry point...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("RE:ASoN: Root element missing!");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("RE:ASoN: Render cycle initiated successfully.");
} catch (err) {
  console.error("RE:ASoN: Failed to initialize React tree", err);
  throw err;
}
