"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { OAuthButtons } from "@/components/auth/oauth-buttons"
import { safeRedirect } from "@/lib/auth/safe-redirect"
import { signupLocalAction } from "./actions"

/** `local` - see login-form.tsx's comment; same reasoning applies here. */
export function SignupForm({ local }: { local: boolean }) {
  const t = useTranslations("auth.signup")
  const tCommon = useTranslations("auth.common")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTarget = safeRedirect(searchParams.get("redirect"))

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (local) {
        const result = await signupLocalAction(email, password, fullName)
        if ("error" in result) throw new Error(result.error)
        router.push(redirectTarget)
        return
      }

      const supabase = createClient()

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          // Without this, Supabase falls back to the project's dashboard
          // "Site URL" setting for the confirmation link - if that's still
          // pointed at a local dev URL, every confirmation email sends a
          // link the recipient's browser can never reach. window.location.origin
          // is always wherever this signup is actually happening (dev,
          // preview, or production), the same fix oauth-buttons.tsx already
          // uses for its own redirectTo. The dashboard's Redirect URLs
          // allow-list still needs this origin added, or Supabase won't
          // honor it.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signUpError) throw signUpError

      // Deliberate choice, not Supabase's default: signUp() against an
      // already-registered, confirmed email returns success with no error
      // (anti-enumeration - it never sends a second email or reveals
      // anything from the error alone). Supabase's own documented way to
      // tell the two cases apart client-side is this exact check - a
      // genuinely new signup's user has a non-empty `identities` array, an
      // existing account's has none. Chosen over staying silent (which is
      // more private but was confusing real users retrying a signup) to
      // match how most mainstream signup forms behave.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error(t("emailAlreadyRegistered"))
      }

      // The profile row is created by private.handle_new_user(), an AFTER
      // INSERT trigger on auth.users (SECURITY DEFINER, runs regardless of
      // email confirmation status). Inserting it again here ran as `anon` -
      // signUp() does not establish a session when email confirmation is
      // required - and anon has no grants on profiles at all, so every
      // signup failed with "permission denied for table profiles". Same
      // class of bug as the duplicate organization/project membership
      // inserts fixed earlier: the trigger already does this.

      router.push(`/auth/login?message=${encodeURIComponent(t("confirmEmailMessage"))}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("somethingWentWrong"))
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
          <CardTitle className="text-2xl font-bold">{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("fullNameLabel")}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("emailLabel")}</Label>
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
              <Label htmlFor="password">{t("passwordLabel")}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creatingAccount") : t("signUp")}
            </Button>
          </form>

          {!local && (
            <div className="mt-4">
              <OAuthButtons redirectTo={redirectTarget} />
            </div>
          )}

          <div className="mt-4 text-center text-sm">
            {t("haveAccount")}{" "}
            <Link href="/auth/login" className="text-primary hover:underline">
              {t("signIn")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
