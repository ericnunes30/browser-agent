/* ------------------------------------------------------------------ */
/*  Accessibility Tree — generates a screen-reader-style tree of page  */
/*  elements. Injects __generateAccessibilityTree into the page.       */
/* ------------------------------------------------------------------ */

(function () {
  const win = window as any;

  if (win.__generateAccessibilityTree) return; // already injected

  win.__claudeElementMap = win.__claudeElementMap || {};
  win.__claudeRefCounter = win.__claudeRefCounter || 0;

  /**
   * Generate an accessibility tree of the page.
   *
   * @param filter 'all' | 'interactive' | 'visible'
   * @param depth  Max tree depth (default 15)
   * @param maxChars Max output characters (default 50000)
   * @param refId  Focus on a specific element by its ref ID
   * @returns { pageContent: string, viewport: { width, height }, error?: string }
   */
  win.__generateAccessibilityTree = function (
    filter: string = 'all',
    depth: number = 15,
    maxChars: number = 50000,
    refId: string | null = null,
  ): { pageContent: string; viewport: { width: number; height: number }; error?: string } {
    try {
      const lines: string[] = [];
      const maxDepth = depth;

      /** Get ARIA role or infer from tag */
      function getRole(el: Element): string {
        const role = el.getAttribute('role');
        if (role) return role;

        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';

        const roleMap: Record<string, string> = {
          a: 'link',
          button: 'button',
          h1: 'heading',
          h2: 'heading',
          h3: 'heading',
          h4: 'heading',
          h5: 'heading',
          h6: 'heading',
          img: 'image',
          nav: 'navigation',
          main: 'main',
          header: 'banner',
          footer: 'contentinfo',
          section: 'region',
          article: 'article',
          aside: 'complementary',
          form: 'form',
          table: 'table',
          ul: 'list',
          ol: 'list',
          li: 'listitem',
          label: 'label',
          select: 'combobox',
          textarea: 'textbox',
        };

        if (tag === 'input') {
          if (type === 'submit' || type === 'button') return 'button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (type === 'file') return 'button';
          return 'textbox';
        }

        return roleMap[tag] || 'generic';
      }

      /** Check if element is sensitive (password, credit card) */
      function isSensitive(el: Element): boolean {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'password' || type === 'hidden') return true;
        const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
        const sensitive = [
          'current-password', 'new-password', 'one-time-code',
          'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
        ];
        return sensitive.some((s) => autocomplete.includes(s));
      }

      /** Get visible text of an element */
      function getTextContent(el: Element): string {
        let text = '';
        for (let i = 0; i < el.childNodes.length; i++) {
          const node = el.childNodes[i];
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || '';
          }
        }
        return text.trim();
      }

      /** Get label/name for an element */
      function getLabel(el: Element): string {
        const tag = el.tagName.toLowerCase();

        // Select with sensitive values
        if (tag === 'select' && isSensitive(el)) {
          const label =
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            (el.id ? getTextContent(document.querySelector(`label[for="${el.id}"]`) as Element) : '');
          if (label?.trim()) return label.trim();
          return '[value redacted]';
        }

        // Selected option
        if (tag === 'select') {
          const select = el as HTMLSelectElement;
          const opt = select.options[select.selectedIndex];
          if (opt?.textContent) return opt.textContent.trim();
        }

        // aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel?.trim()) return ariaLabel.trim();

        // placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder?.trim()) return placeholder.trim();

        // title
        const title = el.getAttribute('title');
        if (title?.trim()) return title.trim();

        // alt
        const alt = el.getAttribute('alt');
        if (alt?.trim()) return alt.trim();

        // Label element
        if (el.id) {
          const labelEl = document.querySelector(`label[for="${el.id}"]`) as Element;
          if (labelEl) {
            const lbl = getTextContent(labelEl);
            if (lbl) return lbl;
          }
        }

        // Input value (for submit buttons)
        if (tag === 'input') {
          const input = el as HTMLInputElement;
          const type = input.type;
          const val = input.value;
          if (type === 'submit' && val?.trim()) return val.trim();
          if (isSensitive(el)) return val ? '[value redacted]' : '';
          if (val && val.length < 50 && val.trim()) return val.trim();
        }

        // Textarea sensitive
        if (tag === 'textarea' && isSensitive(el)) {
          return (el as HTMLTextAreaElement).value ? '[value redacted]' : '';
        }

        // Button, link, summary
        if (['button', 'a', 'summary'].includes(tag)) {
          const text = getTextContent(el);
          if (text.trim()) return text.trim();
        }

        // Headings
        if (tag.match(/^h[1-6]$/)) {
          const h = el.textContent || '';
          return h.trim().substring(0, 100);
        }

        // Image
        if (tag === 'img') return '';

        // Any other text content
        const txt = getTextContent(el);
        if (txt && txt.trim().length >= 3) {
          return txt.trim().length > 100 ? txt.trim().substring(0, 100) + '...' : txt.trim();
        }

        return '';
      }

      /** Check if element is visible */
      function isVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          (el as HTMLElement).offsetWidth > 0 &&
          (el as HTMLElement).offsetHeight > 0
        );
      }

      /** Check if element is interactive */
      function isInteractive(el: Element): boolean {
        const tag = el.tagName.toLowerCase();
        return (
          ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag) ||
          el.getAttribute('onclick') !== null ||
          el.getAttribute('tabindex') !== null ||
          el.getAttribute('role') === 'button' ||
          el.getAttribute('role') === 'link' ||
          el.getAttribute('contenteditable') === 'true'
        );
      }

      /** Check if element is semantic (heading, landmark, etc.) */
      function isSemantic(el: Element): boolean {
        const tag = el.tagName.toLowerCase();
        return (
          ['h1','h2','h3','h4','h5','h6','nav','main','header','footer','section','article','aside'].includes(tag) ||
          el.getAttribute('role') !== null
        );
      }

      /** Should this element be included in the tree? */
      function shouldInclude(el: Element, opts: { filter: string; refId?: string | null; depth: number }): boolean {
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'meta', 'link', 'title', 'noscript'].includes(tag)) return false;

        if (opts.filter !== 'all' && el.getAttribute('aria-hidden') === 'true') return false;
        if (opts.filter !== 'all' && !isVisible(el)) return false;

        // If focused on a ref, only show within that subtree
        if (opts.refId) return true;

        if (opts.filter === 'interactive') return isInteractive(el);
        if (isInteractive(el)) return true;
        if (isSemantic(el)) return true;
        if (getLabel(el).length > 0) return true;

        const role = getRole(el);
        return role !== null && role !== 'generic' && role !== 'image';
      }

      /** Walk the DOM and build tree recursively */
      function walk(
        el: Node,
        indentLevel: number,
        opts: { filter: string; refId?: string | null },
        inSubTree = false,
      ) {
        if (indentLevel > maxDepth) return;
        if (!(el instanceof Element)) {
          for (let i = 0; i < el.childNodes.length; i++) {
            walk(el.childNodes[i], indentLevel, opts, inSubTree);
          }
          return;
        }

        // Check if we're entering the refId subtree
        let onRef = inSubTree;

        if (!inSubTree && opts.refId) {
          // Check if this element IS the ref
          for (const key in win.__claudeElementMap) {
            if (win.__claudeElementMap[key]?.deref() === el) {
              if (key === opts.refId) {
                onRef = true;
              }
            }
          }
        }

        const include = shouldInclude(el, { ...opts, depth: maxDepth });
        if ((include || onRef || opts.refId) && (onRef || !opts.refId)) {
          const role = getRole(el);
          const label = getLabel(el);

          // Get or assign ref ID
          let refIdLocal: string | null = null;
          for (const key in win.__claudeElementMap) {
            if (win.__claudeElementMap[key]?.deref() === el) {
              refIdLocal = key;
              break;
            }
          }
          if (!refIdLocal) {
            refIdLocal = 'ref_' + ++win.__claudeRefCounter;
            win.__claudeElementMap[refIdLocal] = new WeakRef(el);
          }

          let line = '  '.repeat(indentLevel) + role;
          if (label) {
            line += ' "' + label.replace(/\s+/g, ' ').substring(0, 100).replace(/"/g, '\\"') + '"';
          }
          line += ' [' + refIdLocal + ']';

          // Add common attributes
          const href = el.getAttribute('href');
          if (href) line += ' href="' + href + '"';

          const type = el.getAttribute('type');
          if (type) line += ' type="' + type + '"';

          const placehold = el.getAttribute('placeholder');
          if (placehold) line += ' placeholder="' + placehold + '"';

          lines.push(line);

          // For select elements, list options
          if (el.tagName.toLowerCase() === 'select' && !isSensitive(el)) {
            const select = el as HTMLSelectElement;
            for (let i = 0; i < select.options.length; i++) {
              const opt = select.options[i];
              let optLine = '  '.repeat(indentLevel + 1) + 'option';
              if (opt.textContent?.trim()) {
                optLine +=
                  ' "' +
                  opt.textContent.trim().replace(/\s+/g, ' ').substring(0, 100).replace(/"/g, '\\"') +
                  '"';
              }
              if (opt.selected) optLine += ' (selected)';
              if (opt.value && opt.value !== opt.textContent?.trim()) {
                optLine += ' value="' + opt.value.replace(/"/g, '\\"') + '"';
              }
              lines.push(optLine);
            }
          }

          // Recurse children
          if (el.tagName.toLowerCase() !== 'select' || !isSensitive(el)) {
            for (let i = 0; i < el.children.length; i++) {
              walk(el.children[i], onRef ? indentLevel : indentLevel + 1, opts, onRef);
            }
          }
        } else {
          // Still recurse to find the refId target
          for (let i = 0; i < el.children.length; i++) {
            walk(el.children[i], indentLevel, opts, onRef);
          }
        }
      }

      // Find starting element
      if (refId) {
        const ref = win.__claudeElementMap[refId];
        if (!ref) {
          return {
            pageContent: '',
            viewport: { width: window.innerWidth, height: window.innerHeight },
            error:
              "Element with ref_id '" +
              refId +
              "' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          };
        }
        const el = ref.deref();
        if (!el) {
          return {
            pageContent: '',
            viewport: { width: window.innerWidth, height: window.innerHeight },
            error:
              "Element with ref_id '" +
              refId +
              "' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          };
        }
        walk(el, 0, { filter, refId }, true);
      } else if (document.body) {
        walk(document.body, 0, { filter, refId });
      }

      // Clean up dead references
      for (const key in win.__claudeElementMap) {
        if (!win.__claudeElementMap[key]?.deref()) {
          delete win.__claudeElementMap[key];
        }
      }

      const pageContent = lines.join('\n');

      // Check maxChars
      if (maxChars && pageContent.length > maxChars) {
        return {
          pageContent: '',
          viewport: { width: window.innerWidth, height: window.innerHeight },
          error:
            'Output exceeds ' +
            maxChars +
            ' character limit (' +
            pageContent.length +
            ' characters). ' +
            (refId
              ? 'The specified element has too much content. Try specifying a smaller depth parameter or focus on a more specific child element.'
              : depth !== undefined
                ? 'Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.'
                : 'Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.'),
        };
      }

      return {
        pageContent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        pageContent: '',
        viewport: { width: window.innerWidth, height: window.innerHeight },
        error: 'Error generating accessibility tree: ' + msg,
      };
    }
  };
})();
