import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SUPPORT_EMAIL } from "@/lib/project-links";
import { LegalNotice, OperatorContact } from "@/components/legal/legal-document";
import { LEGAL_VERSION, legalRobots } from "@/lib/legal";

export const metadata: Metadata = {
  title: "End User License Agreement",
  alternates: { canonical: "/legal/eula" },
  robots: legalRobots,
};

const LAST_UPDATED = LEGAL_VERSION;

export default function EulaPage() {
  return (
    <div className="min-h-screen bg-background/75">
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
        <LegalNotice />
        <h1 className="mb-2 text-3xl font-bold">End User License Agreement</h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 leading-relaxed text-foreground [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1">
          <section>
            <p>
              This End User License Agreement (&quot;EULA&quot;) covers the Guidon apps you install on your own
              device: the Guidon mobile app for iOS and Android, Guidon Desktop, and the Guidon editor plugins
              (Unity, Unreal Engine, Godot, Blender, JetBrains IDEs, VS Code) - together, &quot;the App&quot;. By
              installing or using the App you agree to this EULA. Your use of the Guidon service the App connects to
              is governed by the <Link href="/legal/terms" className="text-primary underline underline-offset-2">Terms of Service</Link> and
              the <Link href="/legal/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2>1. Parties</h2>
            <OperatorContact />
            <p>
              This EULA is between you and the operator of Guidon (&quot;we&quot;, &quot;us&quot;) - see section 1
              of the Terms of Service. If you got the App from the Apple App Store or Google Play, Apple or Google is
              not a party to this EULA and is not responsible for the App or its content.
            </p>
          </section>

          <section>
            <h2>2. License</h2>
            <p>
              We grant you a non-exclusive, non-transferable license to install and use the App for your personal or business work
              on devices you own or control, for as long as you comply with this EULA. If you got it from the App
              Store, you may use it on any Apple-branded device you own or control, as permitted by the App
              Store&apos;s Usage Rules; Family Sharing and volume-purchasing users may also use it as those rules allow.
            </p>
            <p>
              Where a component is supplied under a separate licence, including an open-source licence,
              that licence governs that component, and nothing in this EULA limits the rights
              it gives you.
            </p>
          </section>

          <section>
            <h2>3. Restrictions</h2>
            <p>Except where an open-source license or the law allows it, you may not:</p>
            <ul>
              <li>rent, lease, sell, or sublicense the App;</li>
              <li>use the App to break the law, to access accounts or data you are not authorized to access, or to interfere with the Guidon service or other people&apos;s use of it;</li>
              <li>remove notices of ownership or license from the App.</li>
            </ul>
          </section>

          <section>
            <h2>4. Your account and data</h2>
            <p>
              Depending on the client, the App can store authentication material and cached project data on your
              device. Offline support and sign-out cleanup differ by client; check that client&apos;s documentation
              and revoke unwanted keys through your account controls. Do not assume that signing out erases
              every external or cached copy. Everything you create remains yours or your licensors&apos;, as
              described in the Terms of Service.
            </p>
          </section>

          <section>
            <h2>5. Maintenance and support</h2>
            <p>
              We are solely responsible for any maintenance and support of the App, as described in this EULA or as
              required by law. Apple and Google have no obligation to provide maintenance or support for the App.
              For help, write to <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline underline-offset-2">{SUPPORT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2>6. Warranty</h2>
            <p>
              To the extent the law allows, the App is provided &quot;as is&quot;, without warranties of any kind.
              If the App fails to conform to any warranty that does apply by law, and you got it from the App Store,
              you may notify Apple, and Apple will refund the purchase price (if any) you paid for the App. To the
              maximum extent permitted by law, Apple has no other warranty obligation with respect to the App, and
              any other claims, losses, liabilities, damages, costs or expenses attributable to a failure to conform
              to a warranty are our responsibility, not Apple&apos;s.
            </p>
          </section>

          <section>
            <h2>7. Product claims</h2>
            <p>
              We, not Apple or Google, are responsible for addressing any claims by you or a third party relating to
              the App or your possession and use of it, including (a) product liability claims, (b) claims that the
              App fails to conform to any applicable legal or regulatory requirement, and (c) claims arising under
              consumer protection, privacy, or similar legislation.
            </p>
          </section>

          <section>
            <h2>8. Intellectual property</h2>
            <p>
              If a third party claims that the App or your possession and use of it infringes their intellectual
              property rights, we, not Apple or Google, are solely responsible for the investigation, defense,
              settlement and discharge of that claim.
            </p>
          </section>

          <section>
            <h2>9. Legal compliance</h2>
            <p>
              You represent that you are not located in a country subject to a U.S. Government embargo or designated
              by the U.S. Government as a &quot;terrorist supporting&quot; country, and that you are not listed on any
              U.S. Government list of prohibited or restricted parties.
            </p>
          </section>

          <section>
            <h2>10. Third-party terms</h2>
            <p>
              You must comply with the terms of any third-party service you use with the App (for example your
              wireless data provider, or the services you connect to Guidon, such as GitHub or Discord).
            </p>
          </section>

          <section>
            <h2>11. Termination</h2>
            <p>
              You may stop using and uninstall the App at any time. We may terminate this licence for a material
              breach, subject to applicable notice, remedy and consumer rights. Uninstalling does not itself
              cancel a paid subscription or delete your hosted account. Sections 6-8 and 12-13 survive as applicable.
            </p>
          </section>

          <section>
            <h2>12. Third-party beneficiaries</h2>
            <p>
              Apple and its subsidiaries are third-party beneficiaries of this EULA, and once you accept it, Apple
              has the right (and is deemed to have accepted the right) to enforce it against you as a third-party
              beneficiary.
            </p>
          </section>

          <section>
            <h2>13. Governing law and contact</h2>
            <p>
              This EULA is governed by the laws of Poland, without regard to conflict-of-law principles. If you are a
              consumer resident in the EU, you keep any mandatory consumer-protection rights of your country of
              residence. Questions about this EULA: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline underline-offset-2">{SUPPORT_EMAIL}</a>.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
