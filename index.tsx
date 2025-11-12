import * as React from 'react';
import { createRoot } from 'react-dom/client';
// Fix: Corrected the import path for the App component by removing the `.tsx` extension. This is standard practice and helps module resolvers correctly locate the file, resolving the "no default export" error.
import App from './App';

// Register Service Worker for offline capabilities
if ('serviceWorker' in navigator) {
  // This block handles service worker updates. When a new worker takes control,
  // it automatically reloads the page to ensure the user has the latest version.
  let isReloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The isReloading flag prevents a potential infinite reload loop.
    if (!isReloading) {
        isReloading = true;
        window.location.reload();
    }
  });


  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        
        // Function to check for updates
        const checkForUpdate = () => {
            console.log('Checking for service worker update...');
            registration.update();
        };

        // 1. Proactively check for an updated service worker on every page load.
        checkForUpdate();
        
        // 2. Set up a periodic check for updates (e.g., every hour)
        // This ensures long-running tabs also get updates.
        setInterval(checkForUpdate, 60 * 60 * 1000); // 1 hour
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