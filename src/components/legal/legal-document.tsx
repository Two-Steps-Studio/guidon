import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/site-footer";
import { LEGAL_VERSION, legalOperator, type LegalCopy } from "@/lib/legal";

export function OperatorContact() {
  return <address className="not-italic">
    <p>{legalOperator.name || "Guidon - service provider identification pending"}</p>
    {legalOperator.address && <p className="whitespace-pre-line">{legalOperator.address}</p>}
    <p>{legalOperator.country}</p>
    {legalOperator.phone && <p>{legalOperator.phone}</p>}
    <a className="text-primary underline" href={`mailto:${legalOperator.email}`}>{legalOperator.email}</a>
  </address>;
}

export function LegalDocument({ copy, templateCredit = true }: { copy: LegalCopy; templateCredit?: boolean }) {
  return <div className="min-h-screen bg-background">
    <header className="border-b"><div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
      <Link href="/"><Image src="/assets/guidon-wordmark.png" alt="Guidon" width={110} height={41} priority className="dark:invert" /></Link>
      <Link href="/" className="text-sm underline">Back to home</Link>
    </div></header>
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Version / last revised: {LEGAL_VERSION}</p>
      <nav aria-label="Legal documents" className="my-6 flex flex-wrap gap-4 text-sm underline">
        <Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/refunds">Refunds</Link>
        <Link href="/legal/cookies">Cookies</Link><Link href="/legal/eula">App licence</Link>
      </nav>
      <p className="mb-8 leading-relaxed">{copy.introduction}</p>
      <section aria-labelledby="operator-contact" className="mb-8 rounded-lg border p-4">
        <h2 id="operator-contact" className="mb-2 font-semibold">Service provider and contact</h2><OperatorContact />
      </section>
      <div className="space-y-8 leading-relaxed">
        {copy.sections.map((section, index) => <section key={section.heading}>
          <h2 className="mb-3 text-xl font-semibold">{index + 1}. {section.heading}</h2>
          {section.paragraphs?.map(p => <p key={p} className="mb-3">{p}</p>)}
          {section.items && <ul className="list-disc space-y-2 pl-6">{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>)}
      </div>
      {templateCredit && <p className="mt-12 border-t pt-4 text-sm text-muted-foreground">
        Adapted using <a className="underline" href="https://github.com/General-Legal/legal-templates">General Legal templates</a> (CC0 1.0).
        Guidon-specific changes have not been reviewed or endorsed by General Legal.
      </p>}
    </main><SiteFooter />
  </div>;
}
