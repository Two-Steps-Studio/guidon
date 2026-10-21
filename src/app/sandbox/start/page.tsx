import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { dataClient } from "@/lib/data-client";
import { getCurrentUser } from "@/lib/data/current-user";
import { findSandbox } from "@/lib/api/sandbox";
import { openSandbox } from "./actions";

export const metadata: Metadata = { title: "Your sandbox", robots: { index: false } };

/**
 * The signed-in user's sandbox (src/lib/api/sandbox.ts): a button creates it,
 * and once it exists, links to its board and a reset. Writes go through a
 * form, never on page load, so a prefetch can't create or reset anything.
 */
export default async function SandboxStartPage() {
  const user = await getCurrentUser();
  const sandbox = await findSandbox(dataClient(user.id), user.id);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="mb-3 text-2xl font-bold">Your sandbox</h1>
      <p className="mb-8 text-muted-foreground">
        A separate organization with example tasks for trying the API, the MCP server and agents.{" "}
        <Link href="/sandbox" className="text-primary underline underline-offset-2">How it works</Link>
      </p>
      {sandbox?.project_id ? (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/projects/${sandbox.project_id}/work`}>Open the sandbox board</Link>
          </Button>
          <form action={openSandbox}>
            <input type="hidden" name="reset" value="true" />
            <Button type="submit" variant="outline">Reset to example data</Button>
          </form>
        </div>
      ) : (
        <form action={openSandbox}>
          <Button type="submit">Create my sandbox</Button>
        </form>
      )}
    </main>
  );
}
