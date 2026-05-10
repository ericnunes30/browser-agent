/* ------------------------------------------------------------------ */
/*  File Bridge — handles file read operations via <input type="file"> */
/*  in the content script. Create/save uses chrome.downloads directly  */
/*  in the service worker.                                            */
/* ------------------------------------------------------------------ */

(function () {
  // Guard: prevent double injection
  if ((window as any).__baFileBridgeReady) return;
  (window as any).__baFileBridgeReady = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'file:pick_and_read') {
      handlePickAndRead()
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message || String(err) }));
      return true; // keep channel open for async
    }
  });

  async function handlePickAndRead(): Promise<{
    content: string;
    name: string;
    size: number;
    error?: string;
  }> {
    try {
      return await readFileViaInput();
    } catch (err: any) {
      if (
        err.name === 'AbortError' ||
        err.message?.includes('cancel') ||
        err.message === 'User cancelled'
      ) {
        return { content: '', name: '', size: 0, error: 'User cancelled file selection' };
      }
      return { content: '', name: '', size: 0, error: `Failed to read file: ${err.message || String(err)}` };
    }
  }

  function readFileViaInput(): Promise<{
    content: string;
    name: string;
    size: number;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept =
        '.txt,.md,.json,.js,.ts,.html,.css,.csv,.xml,.yaml,.yml,' +
        '.env,.sh,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.toml,.ini,.cfg,.log';
      input.style.cssText = 'display:none !important';

      const cleanup = () => {
        if (input.parentNode) document.body.removeChild(input);
      };

      input.addEventListener('change', () => {
        cleanup();
        const file = input.files?.[0];
        if (!file) {
          reject(new Error('User cancelled'));
          return;
        }

        // Read as ArrayBuffer first to detect binary
        const arrayReader = new FileReader();
        arrayReader.onload = () => {
          const buffer = arrayReader.result as ArrayBuffer;
          const bytes = new Uint8Array(buffer);

          // Check for null bytes (NUL/0x00) in first 1024 bytes
          // NUL bytes are virtually never present in text files
          const checkLen = Math.min(bytes.length, 1024);
          let isBinary = false;
          for (let i = 0; i < checkLen; i++) {
            if (bytes[i] === 0x00) {
              isBinary = true;
              break;
            }
          }

          if (isBinary) {
            resolve({
              content: '',
              name: file.name,
              size: file.size,
              error: `File is binary (${file.size} bytes). Only text files are supported.`,
            });
            return;
          }

          // Decode as UTF-8 text
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const text = decoder.decode(buffer);
          resolve({
            content: text,
            name: file.name,
            size: file.size,
          });
        };
        arrayReader.onerror = () => reject(new Error('Failed to read file'));
        arrayReader.readAsArrayBuffer(file);
      });

      // Handle cancellation (modern Chrome fires 'cancel' event)
      input.addEventListener('cancel', () => {
        cleanup();
        reject(new Error('User cancelled'));
      });

      document.body.appendChild(input);
      // Programmatic click on <input type="file"> WORKS in Chrome extensions
      input.click();
    });
  }
})();
