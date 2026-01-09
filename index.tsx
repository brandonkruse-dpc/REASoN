
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("RE:ASoN: Transpilation successful. Starting React mount...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("RE:ASoN: Root element missing!");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("RE:ASoN: Application rendered successfully.");
  } catch (err) {
    console.error("RE:ASoN: React Mount Error:", err);
  }
}
