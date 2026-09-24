import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/legal/terms" },
};

const LAST_UPDATED = "2026-09-24";

export default function TermsPage() {
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
        <h1 className="mb-2 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1">
          <section>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of the hosted version of Guidon available at{" "}
              <strong>useguidon.com</strong> (&quot;Guidon Cloud&quot;, &quot;the Service&quot;). By creating an
              account or using the Service, you agree to these Terms.
            </p>
            <p>
              Guidon is also available as open-source, self-hosted software. If you are using a self-hosted
              instance run by someone else - your employer, a hosting provider, or any operator other than
              us - <strong>these Terms do not apply to that instance</strong>. That operator sets its own terms
              and is solely responsible for it; we have no access to, and no responsibility for, self-hosted
              instances we don&apos;t operate.
            </p>
          </section>

          <section>
            <h2>1. Who we are</h2>
            <p>
              Guidon Cloud is currently operated as an independent, pre-incorporation project (&quot;Guidon&quot;,
              &quot;we&quot;, &quot;us&quot;). We have not yet registered as a formal legal entity. Until we do, any
              contract you enter into by using the Service is with the individual(s) operating Guidon, subject to
              applicable law for minors and unregistered businesses. We will update these Terms with our legal
              entity&apos;s details once incorporated. Contact:{" "}
              <a href="mailto:support@useguidon.com" className="text-primary underline underline-offset-2">
                support@useguidon.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2>2. The Service</h2>
            <p>
              Guidon is project management software: task boards, decisions, a knowledge base, project memory, and
              optional integrations with AI providers, GitHub, and Discord. Features, plans, and limits are
              described on the pricing page and may change; we&apos;ll give notice of material changes affecting
              paid plans.
            </p>
          </section>

          <section>
            <h2>3. Accounts and eligibility</h2>
            <ul>
              <li>You must provide accurate information when creating an account and keep your credentials secure.</li>
              <li>You are responsible for activity under your account, including actions by people you invite to your organization or projects.</li>
              <li>
                If you are under the age required by your country&apos;s law to consent to online services on your
                own (in the EU, generally 16, unless your country sets a lower age down to 13), you may only use the
                Service with the involvement and consent of a parent or legal guardian, including for any paid plan.
              </li>
              <li>You must not use the Service if you are barred from receiving it under applicable law (e.g. sanctions lists).</li>
            </ul>
          </section>

          <section>
            <h2>4. Plans, billing, and cancellation</h2>
            <ul>
              <li>Free plan usage is subject to the limits shown on the billing page.</li>
              <li>Paid plans are billed in advance on a recurring basis through Stripe, our payment processor. We never see or store your card details.</li>
              <li>New paid subscriptions include a 14-day free trial. You can cancel anytime before it ends at no charge.</li>
              <li>Cancelling a paid plan takes effect at the end of the current billing period; you keep paid features until then, and are not charged again afterward.</li>
              <li>Fees are non-refundable except where required by law (e.g. EU consumer withdrawal rights, where applicable) or at our discretion.</li>
              <li>If a payment fails and isn&apos;t resolved, we may downgrade your organization to the Free plan and its limits.</li>
            </ul>
          </section>

          <section>
            <h2>5. Your content</h2>
            <p>
              You retain ownership of everything you upload or create in Guidon (&quot;Your Content&quot;). You grant
              us a limited license to host, process, and display Your Content solely to provide the Service to you.
              You&apos;re responsible for having the rights to anything you upload, and for complying with the law
              regarding it.
            </p>
          </section>

          <section>
            <h2>6. AI features</h2>
            <p>
              AI features (task assistance, memory insights) are optional and, for an organization on Guidon Cloud,
              use whichever AI provider that organization&apos;s admin configures. Enabling an AI feature sends the
              relevant project content to that third-party provider under that provider&apos;s own terms - see our{" "}
              <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
                Privacy Policy
              </Link>{" "}
              for details. AI output can be wrong; review it before relying on it.
            </p>
          </section>

          <section>
            <h2>7. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for anything unlawful, or to store or transmit malicious code;</li>
              <li>Attempt to gain unauthorized access to another organization&apos;s data or to the Service&apos;s infrastructure;</li>
              <li>Abuse rate limits, resell the Service without our written agreement, or interfere with its normal operation;</li>
              <li>Use the Service to process data you don&apos;t have the right to process, including that of people who haven&apos;t consented where consent is required.</li>
            </ul>
          </section>

          <section>
            <h2>8. Third-party integrations</h2>
            <p>
              Connecting GitHub, Discord, Google, or an AI provider is optional and governed additionally by that
              provider&apos;s own terms. Disconnecting an integration stops new activity through it but doesn&apos;t
              retroactively delete data already synced, unless you separately request deletion.
            </p>
          </section>

          <section>
            <h2>9. Termination</h2>
            <p>
              You may delete your organization or account at any time from within the app. We may suspend or
              terminate access for a material breach of these Terms, illegal use, or non-payment, generally with
              notice where practical. On termination, we delete your data per our data retention practices
              described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2>10. Disclaimers and limitation of liability</h2>
            <p>
              The Service is provided &quot;as is&quot;, without warranties of any kind, to the maximum extent
              permitted by law. We are not liable for indirect, incidental, or consequential damages, or for lost
              data, profits, or business, arising from your use of the Service. Nothing in these Terms limits
              liability that cannot be limited under applicable law (including certain consumer-protection rights
              in the EU).
            </p>
          </section>

          <section>
            <h2>11. Changes to these Terms</h2>
            <p>
              We may update these Terms as the Service evolves. We&apos;ll post the updated version here with a new
              &quot;Last updated&quot; date, and notify you of material changes by email or in-app notice before
              they take effect for existing paid subscribers.
            </p>
          </section>

          <section>
            <h2>12. Governing law</h2>
            <p>
              These Terms are governed by the laws of Poland, without regard to conflict-of-law principles. If you
              are a consumer resident in the EU, you also retain any mandatory consumer-protection rights of your
              country of residence.
            </p>
          </section>

          <section>
            <h2>13. Contact</h2>
            <p>
              Questions about these Terms:{" "}
              <a href="mailto:support@useguidon.com" className="text-primary underline underline-offset-2">
                support@useguidon.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
