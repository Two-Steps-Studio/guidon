import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL } from "@/lib/project-links";
import { BetaBadge } from "@/components/layout/beta-badge";

export async function SiteFooter() {
  const t = await getTranslations("landing");

  return (
    <footer data-site-footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-2"><span>{t("footer.copyright", { year: new Date().getFullYear() })} - Two Steps Studio</span><BetaBadge /></div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/about" className="hover:text-foreground">
            {t("footer.about")}
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            {t("footer.contact")}
          </Link>
          <Link href="/developers" className="hover:text-foreground">
            {t("footer.developers")}
          </Link>
          <a href={SELF_HOSTING_DOCS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            {t("footer.selfHosting")}
          </a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            GitHub
          </a>
          <Link href="/legal/terms" className="hover:text-foreground">
            {t("footer.terms")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            {t("footer.privacy")}
          </Link>
          <Link href="/legal/eula" className="hover:text-foreground">
            {t("footer.eula")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
