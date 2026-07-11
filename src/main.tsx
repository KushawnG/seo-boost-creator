import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureAttribution } from './lib/attribution'

// Capture ad UTMs off the initial landing URL before anything renders.
captureAttribution();

createRoot(document.getElementById("root")!).render(<App />);
