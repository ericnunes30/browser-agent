import { createRoot } from 'react-dom/client';
import './style.css';

function OffscreenApp() {
  // Listen for messages from the service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.url?.includes('offscreen')) return;
    console.log('[Offscreen] Received:', msg);
    sendResponse({ received: true });
  });

  return (
    <div className="offscreen-container">
      <div className="offscreen-status">🔄 BrowserAgent Background</div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<OffscreenApp />);