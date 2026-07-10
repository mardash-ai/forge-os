import { createElement, Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '@/lib/markdown';

// Render a markdown string as REAL React nodes (never raw HTML) via the pure lib/markdown AST.
// XSS-safe by construction: every text run is a React text node and every link href was already
// validated against a scheme allowlist in lib/markdown (safeHref), so a note body can't inject
// active markup. Shared by the /notes editor's live preview and the note detail render.

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.t) {
      case 'text':
        return <Fragment key={i}>{node.v}</Fragment>;
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>;
      case 'code':
        return <code key={i}>{node.v}</code>;
      case 'link':
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.t) {
    case 'heading': {
      const level = Math.min(Math.max(block.level, 1), 6);
      return createElement(`h${level}`, { key }, renderInline(block.children));
    }
    case 'paragraph':
      return <p key={key}>{renderInline(block.children)}</p>;
    case 'quote':
      return <blockquote key={key}>{renderInline(block.children)}</blockquote>;
    case 'code':
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case 'list':
      return block.ordered ? (
        <ol key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={className ? `markdown ${className}` : 'markdown'}>
      {blocks.length === 0 ? (
        <p className="markdown-empty">Nothing written yet.</p>
      ) : (
        blocks.map((block, i) => renderBlock(block, i))
      )}
    </div>
  );
}
