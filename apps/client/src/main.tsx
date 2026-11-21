import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/special-elite/400.css';
import './styles/global.css';
import './styles/mobile.css';
import { App } from './App';

// Preload the card art so the first deal does not flicker.
const preload = ['/assets/textures/table.jpg', '/assets/textures/wear1.webp', '/assets/textures/wear2.webp', '/assets/textures/wear3.webp'];
for (const src of preload) {
  const img = new Image();
  img.src = src;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
