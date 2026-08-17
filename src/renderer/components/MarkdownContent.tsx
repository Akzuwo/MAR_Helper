import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownContent({ children }: { children: string }) {
  return <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: linkChildren }) => <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>,
        code: ({ className, children: codeChildren }) => <code className={className}>{codeChildren}</code>
      }}
    >{children}</ReactMarkdown>
  </div>;
}
