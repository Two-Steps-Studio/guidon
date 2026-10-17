import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("landing");

  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <span>{t("footer.copyright", { year: new Date().getFullYear() })} - Two Steps Studio</span>
        <div className="flex gap-6">
          <Link href="/legal/terms" className="hover:text-foreground">
            {t("footer.terms")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            {t("footer.privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
