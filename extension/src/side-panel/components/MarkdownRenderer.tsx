import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`ba-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style headings
          h1: ({ children }) => (
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: '16px 0 8px', color: 'var(--color-text-000)' }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '14px 0 6px', color: 'var(--color-text-000)' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 4px', color: 'var(--color-text-100)' }}>
              {children}
            </h3>
          ),
          // Style paragraphs
          p: ({ children }) => (
            <p style={{ margin: '8px 0', lineHeight: 1.6 }}>{children}</p>
          ),
          // Style bold
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700, color: 'var(--color-text-000)' }}>{children}</strong>
          ),
          // Style lists
          ul: ({ children }) => (
            <ul style={{ margin: '8px 0', paddingLeft: 20, listStyleType: 'disc' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '8px 0', paddingLeft: 20, listStyleType: 'decimal' }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ margin: '4px 0', lineHeight: 1.5 }}>{children}</li>
          ),
          // Style tables
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                border: '1px solid var(--color-border-200)',
                borderRadius: 6,
              }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: 'var(--color-bg-300)' }}>{children}</thead>
          ),
          th: ({ children }) => (
            <th style={{
              padding: '8px 10px',
              textAlign: 'left',
              fontWeight: 600,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: 'var(--color-text-300)',
              borderBottom: '1px solid var(--color-border-200)',
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--color-border-100)',
              color: 'var(--color-text-100)',
            }}>
              {children}
            </td>
          ),
          // Style code blocks
          code: ({ inline, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  style={{
                    background: 'var(--color-bg-300)',
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontSize: '0.9em',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    color: 'var(--color-text-000)',
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre
                style={{
                  background: 'var(--color-bg-300)',
                  padding: '12px 14px',
                  borderRadius: 8,
                  overflowX: 'auto',
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  color: 'var(--color-text-100)',
                  border: '1px solid var(--color-border-200)',
                  margin: '10px 0',
                }}
                {...props}
              >
                <code>{children}</code>
              </pre>
            );
          },
          // Style blockquotes
          blockquote: ({ children }) => (
            <blockquote style={{
              margin: '10px 0',
              padding: '8px 12px',
              borderLeft: '3px solid var(--color-brand)',
              background: 'var(--color-bg-300)',
              borderRadius: '0 6px 6px 0',
              color: 'var(--color-text-200)',
              fontStyle: 'italic',
            }}>
              {children}
            </blockquote>
          ),
          // Style links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-brand)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {children}
            </a>
          ),
          // Style horizontal rules
          hr: () => (
            <hr style={{
              border: 'none',
              borderTop: '1px solid var(--color-border-200)',
              margin: '16px 0',
            }} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
