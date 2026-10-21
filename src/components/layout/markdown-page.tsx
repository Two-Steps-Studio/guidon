import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteFooter } from "@/components/layout/site-footer";

function slug(children: React.ReactNode): string {
  return String(Array.isArray(children) ? children.join("") : children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A public page whose whole content is one Markdown source - the same text
 * its Markdown twin (/<page>.md) serves to agents, so the two can't drift.
 * h2s get ids, so sections can be linked to.
 */
export function MarkdownPage({ markdown }: { markdown: string }) {
  return (
    <div className="min-h-screen bg-background/75">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/">
            <Image src="/assets/guidon-wordmark.png" alt="Guidon" width={110} height={41} priority className="dark:invert" />
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:mb-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:scroll-mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-normal [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mb-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => <h2 id={slug(children)}>{children}</h2>,
            // Wide tables scroll on their own instead of widening the page on a phone.
            table: ({ children }) => (
              <div className="mb-4 overflow-x-auto">
                <table className="!mb-0">{children}</table>
              </div>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </main>

      <SiteFooter />
    </div>
  );
}
