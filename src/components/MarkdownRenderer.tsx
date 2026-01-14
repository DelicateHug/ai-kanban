import React, { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const renderedContent = useMemo(() => {
    if (!content) return '';

    let html = content;

    // Escape HTML to prevent XSS
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks (must be before inline code)
    html = html.replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) => {
        const trimmedCode = code.trim();
        return `<pre class="code-block"><code class="language-${lang || 'text'}">${trimmedCode}</code></pre>`;
      }
    );

    // Inline code
    html = html.replace(
      /`([^`]+)`/g,
      '<code class="inline-code">$1</code>'
    );

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Unordered lists
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li class="ul-item">$1</li>');
    html = html.replace(
      /(<li class="ul-item">.*<\/li>\n?)+/g,
      (match) => `<ul>${match}</ul>`
    );

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ol-item">$1</li>');
    html = html.replace(
      /(<li class="ol-item">.*<\/li>\n?)+/g,
      (match) => `<ol>${match}</ol>`
    );

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

    // Horizontal rules
    html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

    // Line breaks (double newline = paragraph, single newline = br in certain contexts)
    html = html.replace(/\n\n/g, '</p><p>');
    
    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`;
    }

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ol>)/g, '$1');
    html = html.replace(/(<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)/g, '$1');

    return html;
  }, [content]);

  return (
    <div 
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
      style={{
        // Additional inline styles for elements
        ...({} as React.CSSProperties)
      }}
    />
  );
};

// Simpler version for just displaying plain text with basic formatting
export const SimpleMarkdown: React.FC<{ content: string; className?: string }> = ({ 
  content, 
  className = '' 
}) => {
  const lines = content.split('\n');
  
  return (
    <div className={`simple-markdown ${className}`}>
      {lines.map((line, index) => {
        // Check for headers
        if (line.startsWith('### ')) {
          return <h3 key={index} className="text-base font-semibold text-primary mt-4 mb-2">{line.slice(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={index} className="text-lg font-semibold text-primary mt-4 mb-2">{line.slice(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-xl font-bold text-primary mt-4 mb-2">{line.slice(2)}</h1>;
        }
        
        // Check for list items
        if (line.match(/^[\*\-]\s/)) {
          return (
            <div key={index} className="flex gap-2 ml-4 my-1">
              <span className="text-accent-primary">•</span>
              <span>{formatInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        
        // Check for numbered list
        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\./)?.[1];
          return (
            <div key={index} className="flex gap-2 ml-4 my-1">
              <span className="text-muted min-w-[1.5rem]">{num}.</span>
              <span>{formatInlineMarkdown(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          );
        }
        
        // Empty line = paragraph break
        if (!line.trim()) {
          return <div key={index} className="h-3" />;
        }
        
        // Regular paragraph
        return <p key={index} className="my-1">{formatInlineMarkdown(line)}</p>;
      })}
    </div>
  );
};

// Helper to format inline markdown (bold, italic, code, links)
function formatInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-bg-tertiary text-accent-primary rounded text-sm font-mono">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Check for bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Check for links
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a 
          key={key++} 
          href={linkMatch[2]} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-accent-info hover:underline"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Find next special character or take all remaining
    const nextSpecial = remaining.search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special char at start but didn't match any pattern, treat as regular text
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default MarkdownRenderer;
