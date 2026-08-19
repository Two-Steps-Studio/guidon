"use client"

import { useState } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { OAuthButtons } from "@/components/auth/oauth-buttons"
import { loginLocalAction } from "./actions"

/**
 * `local` is decided server-side (hasDirectDatabase(), see page.tsx) since it
 * depends on DATABASE_URL, which a client component cannot read. In local
 * mode there is no GoTrue to hand the browser a session, so login goes
 * through a Server Action (loginLocalAction) instead of the Supabase SDK's
 * client-side signInWithPassword — and OAuth is hidden entirely, since
 * self-hosted has no provider to redirect to.
 */
export function LoginForm({ local }: { local: boolean }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const message = searchParams.get("message")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (local) {
        const result = await loginLocalAction(email, password)
        if ("error" in result) throw new Error(result.error)
        router.push('/dashboard')
        return
      }

      const supabase = createClient()

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-secondary to-background-tertiary dark:from-background-secondary dark:to-background flex flex-col items-center justify-center gap-6 p-4">
      <Image
        src="/assets/guidon-wordmark.png"
        alt="Guidon"
        width={769}
        height={285}
        priority
        className="h-8 w-auto dark:invert"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          <CardDescription>
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {message && (
            <div className="mb-4 p-3 bg-success/10 dark:bg-success/20 text-success dark:text-success text-sm rounded-md">
              {message}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {!local && (
            <div className="mt-4">
              <OAuthButtons />
            </div>
          )}

          <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
