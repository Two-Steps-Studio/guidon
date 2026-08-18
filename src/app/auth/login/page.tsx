import { Suspense } from "react";
import { hasDirectDatabase } from "@/lib/db/pool";
import { LoginForm } from "./login-form";

// hasDirectDatabase() reads process.env.DATABASE_URL, which Docker Compose
// sets at container runtime, not at `npm run build` time (see
// docker-compose.yml — it's under `environment:`, not `build.args:`). Without
// this, Next's static optimizer prerenders this page once at build time, when
// DATABASE_URL is unset, and bakes `local=false` into the HTML forever.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm local={hasDirectDatabase()} />
    </Suspense>
  );
}
