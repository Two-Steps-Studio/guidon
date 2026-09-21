"use client";

import { createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Source line (0-based) of the task-list item currently being rendered, for its checkbox. */
const TaskLineContext = createContext<number | null>(null);

function TaskCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle?: (line: number, checked: boolean) => void;
}) {
  const line = useContext(TaskLineContext);
  const interactive = Boolean(onToggle) && line !== null;

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!interactive}
      readOnly={!interactive}
      onChange={(event) => {
        if (onToggle && line !== null) onToggle(line, event.target.checked);
      }}
      className={interactive ? "mr-2 cursor-pointer align-middle" : "mr-2 align-middle"}
    />
  );
}

/**
 * Rendered .md preview for the code workspace - manual `components` styling
 * rather than @tailwindcss/typography (not a dependency here) so headings,
 * links, etc. pick up Guidon's own color tokens instead of prose defaults.
 */
export function MarkdownPreview({
  content,
  onToggleTask,
}: {
  content: string;
  /** When set, task-list checkboxes are clickable; called with the checkbox's source line (0-based). */
  onToggleTask?: (line: number, checked: boolean) => void;
}) {
  return (
    <div className="h-full overflow-auto px-6 py-4 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mb-4 mt-6 text-2xl font-bold first:mt-0" {...props} />,
          h2: (props) => <h2 className="mb-3 mt-6 text-xl font-bold first:mt-0" {...props} />,
          h3: (props) => <h3 className="mb-2 mt-5 text-lg font-semibold first:mt-0" {...props} />,
          h4: (props) => <h4 className="mb-2 mt-4 text-base font-semibold first:mt-0" {...props} />,
          p: (props) => <p className="mb-4 last:mb-0" {...props} />,
          a: (props) => <a className="text-primary underline hover:no-underline" target="_blank" rel="noreferrer" {...props} />,
          ul: ({ className, ...props }) => (
            <ul
              className={
                className?.includes("contains-task-list")
                  ? "mb-4 space-y-1 pl-1"
                  : "mb-4 list-disc space-y-1 pl-6"
              }
              {...props}
            />
          ),
          li: ({ node, className, children, ...props }) => {
            const isTask = className?.includes("task-list-item") ?? false;
            const line = node?.position?.start.line;
            return (
              <li className={isTask ? "list-none" : className} {...props}>
                {isTask && line ? (
                  <TaskLineContext.Provider value={line - 1}>{children}</TaskLineContext.Provider>
                ) : (
                  children
                )}
              </li>
            );
          },
          input: ({ type, checked }) =>
            type === "checkbox" ? <TaskCheckbox checked={Boolean(checked)} onToggle={onToggleTask} /> : null,
          ol: (props) => <ol className="mb-4 list-decimal space-y-1 pl-6" {...props} />,
          blockquote: (props) => (
            <blockquote className="mb-4 border-l-2 border-border pl-4 text-muted-foreground" {...props} />
          ),
          hr: () => <hr className="my-6 border-border" />,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  className="block overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" {...props}>
                {children}
              </code>
            );
          },
          pre: (props) => <pre className="mb-4" {...props} />,
          table: (props) => (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          th: (props) => <th className="border border-border bg-muted px-3 py-1.5 text-left font-medium" {...props} />,
          td: (props) => <td className="border border-border px-3 py-1.5" {...props} />,
          img: ({ alt, ...props }) => (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary repo-relative/external URL from markdown, not a next/image candidate
            <img alt={alt ?? ""} className="max-w-full rounded-md" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
