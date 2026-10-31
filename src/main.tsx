import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker for offline play
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Pixel Breaker update available');
  },
  onOfflineReady() {
    console.log('Pixel Breaker ready for offline play');
  },
});

createRoot(document.getElementById('root')!).render(<App />);

