import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Local wiki Markdown only — authored in config/docs. Raw HTML is not
// enabled, and Tailwind classes keep the site's terminal styling.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="grid gap-4 text-sm leading-6 text-muted-foreground sm:text-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-display text-lg font-semibold text-foreground">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="leading-6">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/60 pl-4 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="border border-border bg-background/60 px-1 py-0.5 text-xs text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto border border-border bg-background/60 p-3 text-xs">
              {children}
            </pre>
          ),
          hr: () => <hr className="border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ''} className="max-w-full border border-border" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
