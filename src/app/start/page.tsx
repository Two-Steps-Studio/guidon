import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import { createClient } from "@/lib/supabase-server";
import { StartWizard } from "./start-wizard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

async function isSignedIn(): Promise<boolean> {
  if (hasDirectDatabase()) return (await getLocalSessionUserId()) !== null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

/** Onboarding before the account (public route - see proxy.ts). */
export default async function StartPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Guidon">
          <Image src="/assets/guidon-wordmark.png" alt="Guidon" width={769} height={285} priority className="h-7 w-auto dark:invert" />
        </Link>
      </header>
      <StartWizard signedIn={await isSignedIn()} />
    </div>
  );
}
