import { hasDirectDatabase } from "@/lib/db/pool";
import { LogoutClient } from "./logout-client";

// See src/app/auth/login/page.tsx for why this must not be statically
// prerendered — DATABASE_URL is a runtime-only env var under Docker Compose.
export const dynamic = "force-dynamic";

export default function LogoutPage() {
  return <LogoutClient local={hasDirectDatabase()} />;
}
