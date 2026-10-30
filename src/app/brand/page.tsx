import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/layout/site-footer";
import { BRAND_COLORS } from "@/lib/brand-colors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPage");
  return {
    title: t("title"), description: t("description"),
    alternates: { canonical: "/brand" },
  };
}

export default async function BrandPage() {
  const t = await getTranslations("brandPage");
  const palette = [
    ["Guidon Blue", BRAND_COLORS.blue, t("blue")],
    ["Electric Blue", BRAND_COLORS.electricBlue, t("electricBlue")],
    ["Midnight Navy", BRAND_COLORS.midnightNavy, t("midnightNavy")],
    ["White", BRAND_COLORS.white, t("white")],
    ["Ink", BRAND_COLORS.ink, t("ink")],
  ];
  const downloadClass = "inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="Guidon"><Image src="/brand/guidon-wordmark-blue.png" alt="Guidon" width={135} height={50} /></Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t("back")}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="border-b border-border py-14 sm:py-20" aria-labelledby="brand-heading">
          <p className="mb-6 text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("eyebrow")}</p>
          <h1 id="brand-heading" className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">{t("intro")}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t("lead")}</p>
        </section>
        <section className="py-12" aria-labelledby="logos-heading">
          <h2 id="logos-heading" className="text-2xl font-semibold">{t("logos")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("logoLead")}</p>
          <div className="mt-8 grid gap-10 md:grid-cols-[2fr_1fr]">
            <div className="min-w-0">
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl border border-border p-8" style={{ backgroundColor: BRAND_COLORS.midnightNavy }}>
                <Image src="/brand/guidon-wordmark-white.png" alt="Guidon" width={769} height={285} className="h-auto w-full max-w-sm" />
              </div>
              <h3 className="mt-5 font-semibold">{t("wordmark")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("wordmarkUse")}</p>
              <div className="mt-3 flex flex-wrap gap-x-6">
                <a download href="/brand/guidon-wordmark-blue.png" className={downloadClass}>{t("downloadBlue")}</a>
                <a download href="/brand/guidon-wordmark-white.png" className={downloadClass}>{t("downloadWhite")}</a>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl border border-border bg-muted p-5">
                <Image src="/brand/social/profile-avatar-dark.png" alt={t("avatar")} width={144} height={144} className="aspect-square h-full w-auto max-w-full rounded-full object-contain" />
              </div>
              <h3 className="mt-5 font-semibold">{t("avatar")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("avatarUse")}</p>
              <div className="mt-3 flex flex-col items-start">
                <a download href="/brand/social/profile-avatar-dark.png" className={downloadClass}>{t("downloadAvatar")}</a>
                <a download href="/brand/guidon-symbol-blue.svg" className={downloadClass}>{t("downloadSymbol")}</a>
              </div>
            </div>
          </div>
        </section>
        <section className="border-y border-border py-12" aria-labelledby="palette-heading">
          <h2 id="palette-heading" className="text-2xl font-semibold">{t("palette")}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("paletteLead")}</p>
          <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {palette.map(([name, hex, usage]) => (
              <div key={hex} className="min-w-0">
                <div className="mb-4 h-24 rounded-lg border border-border" style={{ backgroundColor: hex }} aria-hidden="true" />
                <dt className="font-medium">{name}</dt>
                <dd><code className="mt-1 block text-sm">{hex}</code><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{usage}</p></dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="grid gap-10 py-12 md:grid-cols-2" aria-labelledby="type-heading">
          <div>
            <h2 id="type-heading" className="text-2xl font-semibold">{t("type")}</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{t("typeLead")}</p>
          </div>
          <blockquote className="flex items-center border-l-4 border-primary pl-6 text-3xl font-medium tracking-tight">{t("tagline")}</blockquote>
        </section>
        <section className="border-t border-border py-12" aria-labelledby="rules-heading">
          <h2 id="rules-heading" className="text-2xl font-semibold">{t("rules")}</h2>
          <ul className="mt-5 max-w-3xl list-disc space-y-3 pl-5 leading-relaxed text-muted-foreground">
            <li>{t("ruleOne")}</li><li>{t("ruleTwo")}</li><li>{t("ruleThree")}</li>
          </ul>
          <h3 className="mt-8 font-semibold">{t("preview")}</h3>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">{t("previewText")}</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
