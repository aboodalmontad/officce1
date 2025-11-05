import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Register Service Worker for offline capabilities
if ('serviceWorker' in navigator) {
  // This block handles service worker updates. When a new worker takes control,
  // the page is reloaded to ensure the latest assets are used.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    console.log('A new version of the application is available. Reloading page...');
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

const container = document.getElementById('root');

// Wrapper component to manage the application's key, allowing for a full remount.
const AppWrapper = () => {
    const [appKey, setAppKey] = React.useState(0);

    // This function, when called, changes the key on the App component,
    // forcing React to unmount the old instance and mount a new one,
    // effectively resetting the entire application's state.
    const handleRefresh = () => {
        setAppKey(prevKey => prevKey + 1);
    };

    return <App key={appKey} onRefresh={handleRefresh} />;
};


if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AppWrapper />
    </React.StrictMode>
  );
} else {
    console.error('Failed to find the root element');
}