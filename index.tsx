import * as React from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import App from './App';

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