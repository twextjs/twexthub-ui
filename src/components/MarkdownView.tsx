import React from 'react';
import Markdown from 'react-markdown';
import { highlightCode } from '../lib/highlight';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  return (
    <div className="markdown-body">
      <Markdown
        components={{
          code({ className, children }) {
            const match = /language-([\w-]+)/.exec(className || '');
            if (match) {
              const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
              const code = raw.replace(/\n$/, '');
              return (
                <code
                  className={`code-highlight language-${match[1]}`}
                  dangerouslySetInnerHTML={{ __html: highlightCode(code, match[1]) }}
                />
              );
            }
            return <code className={className}>{children}</code>;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
};
