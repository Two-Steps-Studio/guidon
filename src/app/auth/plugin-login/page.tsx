import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import { createClient } from "@/lib/supabase-server";
import { authorizePluginLogin } from "./actions";
import { isSafeLoopbackRedirect, pluginClientLabel, resolvePluginClient } from "./loopback";

/**
 * Opened by an editor plugin's browser-based login (currently Unity's
 * GuidonBrowserAuth.cs, the UE5 plugin's GuidonAuth.cpp, the Blender add-on's
 * auth.py, the JetBrains plugin's LoopbackLogin.kt, the Godot plugin's login.gd, the VS Code extension's login.ts;
 * each passes `client` so it gets its own key name) - the plugin starts a local HTTP
 * listener, opens this page with `redirect_uri` pointing back at it plus a
 * `state` nonce, and this page issues a fresh API key once the user
 * approves. Replaces an earlier design where the plugin took a raw
 * email/password form itself - logging in should look and feel like the
 * real Guidon login (password reset, OAuth, everything this page already
 * has), not a reimplementation of it inside the game engine.
 *
 * Under `/auth/` on purpose - proxy.ts already treats that whole prefix as
 * public (unauthenticated requests aren't bounced before this page can run
 * its own check-and-redirect-with-`redirect=`-preserved logic below, unlike
 * getCurrentUser()'s bare `redirect("/auth/login")`, which would otherwise
 * drop redirect_uri/state entirely).
 */

async function isSignedIn(): Promise<boolean> {
  if (hasDirectDatabase()) {
    return (await getLocalSessionUserId()) !== null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

export default async function PluginLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string; state?: string; client?: string }>;
}) {
  const { redirect_uri: redirectUri, state, client: rawClient } = await searchParams;
  const client = resolvePluginClient(rawClient);

  if (!redirectUri || !state || !isSafeLoopbackRedirect(redirectUri)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid request</CardTitle>
            <CardDescription>
              This page is meant to be opened by a Guidon editor plugin (Unity, Unreal Engine, Godot, Blender, JetBrains IDEs, VS Code) - not visited
              directly. If a plugin sent you here, try logging in again from the plugin window.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const returnTo = `/auth/plugin-login?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&client=${client}`;

  if (!(await isSignedIn())) {
    redirect(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  const user = await getCurrentUser();
  const authorize = authorizePluginLogin.bind(null, redirectUri, state, client);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect the Guidon plugin</CardTitle>
          <CardDescription>
            The Guidon {pluginClientLabel(client)} plugin running on this computer wants to view and update tasks as{" "}
            <strong>{user.email}</strong>. It will be able to read your projects and tasks, change
            task status, and post comments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={authorize}>
            <Button type="submit" className="w-full">
              Authorize
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
