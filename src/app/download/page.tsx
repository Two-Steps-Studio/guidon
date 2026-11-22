import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";
import { GITHUB_REPO_URL } from "@/lib/project-links";
import { publicOpenGraph } from "@/lib/public-open-graph";
import { pickDesktopDownloads, type DesktopDownloads, type InstallerKind, type Release } from "@/lib/desktop/desktop-release-core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("downloadPage");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/download" },
    openGraph: publicOpenGraph("/download"),
  };
}

const RELEASES_API = GITHUB_REPO_URL.replace("https://github.com/", "https://api.github.com/repos/") + "/releases?per_page=30";

/** The newest desktop release, refreshed hourly; null when none is out yet or GitHub can't be reached. */
async function latestDesktopRelease(): Promise<DesktopDownloads | null> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "guidon-download-page" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return pickDesktopDownloads((await response.json()) as Release[]);
  } catch {
    return null;
  }
}

const PLATFORMS: { title: "windows" | "linux"; primary: InstallerKind; others: InstallerKind[] }[] = [
  { title: "windows", primary: "windowsSetup", others: ["windowsMsi"] },
  { title: "linux", primary: "appImage", others: ["deb", "rpm"] },
];

/** Guidon Desktop for Windows and Linux: the installers of the newest release on GitHub. */
export default async function DownloadPage() {
  const [t, format, release] = await Promise.all([getTranslations("downloadPage"), getFormatter(), latestDesktopRelease()]);
  const size = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="Guidon"><Image src="/brand/guidon-wordmark-blue.png" alt="Guidon" width={135} height={50} /></Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t("back")}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="py-14 sm:py-20" aria-labelledby="download-heading">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">Guidon Desktop</p>
          <h1 id="download-heading" className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{t("heading")}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t("lead")}</p>
          {release && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("version", { version: release.version })}
              {release.publishedAt && <> · {format.dateTime(new Date(release.publishedAt), { dateStyle: "long" })}</>}
              {" · "}
              <a href={release.notesUrl} className="text-primary underline underline-offset-4">{t("notes")}</a>
            </p>
          )}
        </section>

        {release ? (
          <section className="grid gap-6 md:grid-cols-2" aria-label={t("installers")}>
            {PLATFORMS.map((platform) => {
              const primary = release.installers[platform.primary];
              const others = platform.others.flatMap((kind) => {
                const installer = release.installers[kind];
                return installer ? [{ kind, ...installer }] : [];
              });
              return (
                <div key={platform.title} className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-xl font-semibold">{t(`platform.${platform.title}`)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`requirements.${platform.title}`)}</p>
                  {primary && (
                    <a
                      href={primary.url}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Download className="size-4" aria-hidden />
                      {t(`kind.${platform.primary}`)} <span className="opacity-80">({size(primary.size)})</span>
                    </a>
                  )}
                  {others.length > 0 && (
                    <ul className="mt-4 space-y-1 text-sm">
                      {others.map((installer) => (
                        <li key={installer.kind}>
                          <a href={installer.url} className="inline-flex min-h-9 items-center text-primary underline underline-offset-4">
                            {t(`kind.${installer.kind}`)} ({size(installer.size)})
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-card p-6" aria-live="polite">
            <h2 className="text-xl font-semibold">{t("comingTitle")}</h2>
            <p className="mt-2 text-muted-foreground">{t("comingBody")}</p>
            <Link href="/start" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("useWeb")}</Link>
          </section>
        )}

        <section className="mt-14" aria-labelledby="desktop-features">
          <h2 id="desktop-features" className="text-2xl font-semibold">{t("featuresTitle")}</h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {(t.raw("features") as { title: string; body: string }[]).map((feature) => (
              <li key={feature.title} className="rounded-xl border border-border p-5">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
