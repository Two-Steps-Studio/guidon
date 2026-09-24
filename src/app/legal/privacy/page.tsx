import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/legal/privacy" },
};

const LAST_UPDATED = "2026-09-24";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/">
            <Image src="/assets/guidon-wordmark.png" alt="Guidon" width={110} height={41} priority />
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_table]:mb-3 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
          <section>
            <p>
              This Privacy Policy explains how we collect, use, and protect personal data when you use Guidon Cloud
              at <strong>useguidon.com</strong>. It applies only to the hosted version we operate - a self-hosted
              instance run by someone else is governed by that operator&apos;s own privacy practices, since we
              never receive that instance&apos;s data.
            </p>
          </section>

          <section>
            <h2>1. Who controls your data</h2>
            <p>
              For data processed through Guidon Cloud, the data controller is Guidon, currently operated as an
              independent, pre-incorporation project (see our{" "}
              <Link href="/legal/terms" className="text-primary underline underline-offset-2">
                Terms of Service
              </Link>
              ). Contact for any privacy request:{" "}
              <a href="mailto:support@useguidon.com" className="text-primary underline underline-offset-2">
                support@useguidon.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2>2. What we collect</h2>
            <ul>
              <li><strong>Account data:</strong> email address, name, avatar, and authentication data (or, if you sign in with Google or Discord, the profile fields those providers share with us).</li>
              <li><strong>Project data:</strong> whatever you and your team create - tasks, comments, decisions, files, roadmap items, and similar content.</li>
              <li><strong>Billing data:</strong> for a paid plan, Stripe collects and stores your payment details directly - we only ever see your subscription status, plan, and billing period, never your card number.</li>
              <li><strong>Usage and log data:</strong> basic request logs and, on the hosted product, aggregate analytics (Google Analytics) and, if we&apos;ve enabled it, error reports (Sentry) - both scoped to keep out sensitive content, see §5.</li>
            </ul>
          </section>

          <section>
            <h2>3. Legal basis (GDPR)</h2>
            <ul>
              <li><strong>Contract:</strong> processing needed to provide the Service you signed up for (accounts, projects, billing).</li>
              <li><strong>Legitimate interest:</strong> keeping the Service secure, debugging errors, and basic product analytics.</li>
              <li><strong>Consent:</strong> optional integrations you turn on yourself (AI features, GitHub, Discord), and any non-essential cookies.</li>
              <li><strong>Legal obligation:</strong> retaining billing records as required by tax law.</li>
            </ul>
          </section>

          <section>
            <h2>4. Who else processes your data</h2>
            <p>We use the following processors for Guidon Cloud. We only share what each one needs to do its job.</p>
            <table>
              <thead>
                <tr>
                  <th>Processor</th>
                  <th>Purpose</th>
                  <th>What they receive</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase</td>
                  <td>Database, authentication, file storage</td>
                  <td>All account and project data</td>
                </tr>
                <tr>
                  <td>Stripe</td>
                  <td>Payment processing</td>
                  <td>Billing/payment details (paid plans only)</td>
                </tr>
                <tr>
                  <td>Resend</td>
                  <td>Transactional email (password reset, invites)</td>
                  <td>Your email address, message content</td>
                </tr>
                <tr>
                  <td>Google Analytics</td>
                  <td>Aggregate, anonymized product usage</td>
                  <td>Page views, device/browser type - no account content</td>
                </tr>
                <tr>
                  <td>Sentry (if enabled)</td>
                  <td>Error monitoring</td>
                  <td>Error messages and stack traces - configured not to include request bodies or cookies</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>5. AI features</h2>
            <p>
              AI features are off unless an organization&apos;s admin turns them on and picks a provider (Anthropic,
              OpenAI, Groq, OpenRouter, Azure OpenAI, a self-hosted Ollama instance, or another compatible endpoint).
              Using an AI feature sends the relevant task/project text to that organization&apos;s chosen provider,
              under that provider&apos;s own privacy and data-use terms - we don&apos;t control what a third-party AI
              provider does with data once it&apos;s sent, beyond what that provider discloses. If your organization
              uses Ollama or another self-hosted model, that data never leaves the infrastructure your organization
              controls.
            </p>
          </section>

          <section>
            <h2>6. Data retention</h2>
            <p>
              We keep your data for as long as your account or organization is active. If you delete your
              organization or account, we delete the associated data within 30 days, except where we&apos;re
              required to keep billing records longer for tax or accounting law, or where data is needed to resolve
              a dispute or enforce our Terms.
            </p>
          </section>

          <section>
            <h2>7. Security</h2>
            <p>
              Data is encrypted in transit (TLS) and at rest where our infrastructure providers support it. Access
              to production data is limited to what&apos;s needed to operate the Service. No system is perfectly
              secure, and we can&apos;t guarantee absolute security - we&apos;ll notify affected users of a
              qualifying data breach as required by GDPR.
            </p>
          </section>

          <section>
            <h2>8. Your rights (GDPR)</h2>
            <p>If you&apos;re in the EU/EEA (and, as a matter of policy, if you&apos;re anywhere else too), you can:</p>
            <ul>
              <li>Request a copy of your personal data (access);</li>
              <li>Correct inaccurate data (rectification);</li>
              <li>Request deletion of your data (erasure), subject to §6&apos;s retention exceptions;</li>
              <li>Get your data in a portable format (portability);</li>
              <li>Object to or restrict certain processing;</li>
              <li>Withdraw consent for anything based on consent, at any time, without affecting past lawful processing;</li>
              <li>Lodge a complaint with your national data protection authority (in Poland, the UODO).</li>
            </ul>
            <p>
              To exercise any of these, email{" "}
              <a href="mailto:support@useguidon.com" className="text-primary underline underline-offset-2">
                support@useguidon.com
              </a>
              . We&apos;ll respond within one month, as GDPR requires.
            </p>
          </section>

          <section>
            <h2>9. Cookies</h2>
            <p>
              We use one essential session cookie to keep you signed in - the Service doesn&apos;t work without it,
              so it&apos;s not subject to consent under GDPR&apos;s ePrivacy rules. Google Analytics, when active,
              sets its own analytics cookies; a future version of this page will add a consent banner for those
              before they&apos;re set, if we haven&apos;t already by the time you&apos;re reading this.
            </p>
          </section>

          <section>
            <h2>10. International transfers</h2>
            <p>
              Some processors above (e.g. certain AI providers, or Supabase&apos;s underlying infrastructure) may
              process data outside the EU/EEA. Where that happens, we rely on that processor&apos;s own compliance
              mechanism (such as Standard Contractual Clauses) for the transfer.
            </p>
          </section>

          <section>
            <h2>11. Children</h2>
            <p>
              The Service is not directed at children, and we do not knowingly collect personal data from anyone
              below the age their country requires for independent consent to online services (in the EU,
              generally 16, or as low as 13 depending on the country) without a parent or guardian&apos;s
              involvement. If you believe a child has provided us data without appropriate consent, contact us and
              we&apos;ll delete it.
            </p>
          </section>

          <section>
            <h2>12. Changes to this policy</h2>
            <p>
              We&apos;ll post updates here with a new &quot;Last updated&quot; date, and notify you by email or
              in-app notice of any material change to how we use your data.
            </p>
          </section>

          <section>
            <h2>13. Contact</h2>
            <p>
              <a href="mailto:support@useguidon.com" className="text-primary underline underline-offset-2">
                support@useguidon.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
