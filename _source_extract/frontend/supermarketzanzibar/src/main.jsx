import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import "leaflet/dist/leaflet.css";
import App from './App.jsx'

function ensureFieldIdentifiers(root = document) {
  const selector = 'input:not([id]):not([name]),select:not([id]):not([name]),textarea:not([id]):not([name])';
  const nodes = root.querySelectorAll(selector);
  nodes.forEach((node, index) => {
    node.setAttribute('name', `autofill_field_${index + 1}`);
  });
}

ensureFieldIdentifiers();

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const addedNode of mutation.addedNodes) {
      if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
      const element = /** @type {Element} */ (addedNode);
      if (element.matches?.('input,select,textarea')) {
        if (!element.id && !element.getAttribute('name')) {
          element.setAttribute('name', `autofill_field_dynamic_${Date.now()}`);
        }
      }
      ensureFieldIdentifiers(element);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
