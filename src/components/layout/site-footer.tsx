import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GITHUB_REPO_URL, SELF_HOSTING_DOCS_URL } from "@/lib/project-links";
import styles from "@/components/landing/landing.module.css";
import { comparison } from "@/lib/compare";

// The most-searched rivals; every comparison is on /compare.
const FOOTER_COMPARISONS = ["plane", "linear", "jira", "notion", "trello", "codecks"];

/** The one footer of every page - the landing page, public pages and the app. */
export async function SiteFooter() {
  const t = await getTranslations("landing");
  const d = await getTranslations("landing.design");
  const groups = [
    {
      title: d("footerProduct"),
      links: [
        { href: "/#product", label: d("navProduct") },
        { href: "/#features", label: d("navFeatures") },
        { href: "/#integrations", label: d("navIntegrations") },
        { href: "/start", label: t("getStarted") },
      ],
    },
    {
      title: d("footerResources"),
      links: [
        { href: "/developers", label: t("footer.developers") },
        { href: SELF_HOSTING_DOCS_URL, label: t("footer.selfHosting") },
        { href: GITHUB_REPO_URL, label: "GitHub" },
        { href: "/contact", label: t("footer.contact") },
        { href: "/brand", label: t("footer.brand") },
      ],
    },
    {
      title: d("footerCompare"),
      links: [
        ...FOOTER_COMPARISONS.map((slug) => ({ href: `/compare/${slug}`, label: `Guidon vs ${comparison(slug)?.name ?? slug}` })),
        { href: "/compare", label: d("footerAllComparisons") },
      ],
    },
    {
      title: d("footerLegal"),
      links: [
        { href: "/legal/terms", label: t("footer.terms") },
        { href: "/legal/privacy", label: t("footer.privacy") },
        { href: "/legal/refunds", label: t("footer.refunds") },
        { href: "/legal/eula", label: t("footer.eula") },
        { href: "/legal/cookies", label: t("footer.cookies") },
      ],
    },
  ];

  return (
    <footer data-site-footer className={`${styles.siteFooter} ${styles.footer}`}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div className={styles.footerBrand}>
          <Link href="/" className={styles.logo} aria-label="Guidon">
            <Image src="/brand/guidon-wordmark-blue.png" alt="Guidon" width={200} height={74} className="dark:hidden" />
            <Image src="/brand/guidon-wordmark-white.png" alt="Guidon" width={200} height={74} className="hidden dark:block" />
          </Link>
          <p>{d("footerDescription")}</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link prefetch={false} href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={`${styles.container} ${styles.footerBottom}`}>
        <span>{t("footer.copyright", { year: new Date().getFullYear() })} · Two Steps Studio</span>
        <Link href="/about">{t("footer.about")}</Link>
      </div>
    </footer>
  );
}
