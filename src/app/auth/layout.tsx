import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: true } };

/** The main landmark for every /auth page - the root layout deliberately has none (see app/layout.tsx). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
