"use client"

import { useEffect, useState } from "react"
import { GoogleSignIn } from "@/components/auth/google-signin"
import { MagicLinkSignIn } from "@/components/auth/magic-link-signin"
import { Card } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME;

/**
 * A failed OAuth callback lands here rather than on better-auth's built-in
 * error page (see lib/auth/oauth-state.ts), so the reason has to be shown
 * somewhere. Read from `window.location` on mount rather than through
 * `useSearchParams`, which would drag this page into a Suspense boundary for a
 * value that only exists on a redirect.
 */
function useSignInError() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error")
    if (!code) return
    setError(
      code === "state_mismatch"
        ? "That sign-in link expired before it came back. Please try again."
        : `Sign-in failed (${code}). Please try again.`,
    )
  }, [])

  return error
}

export default function LoginPage() {
  const signInError = useSignInError()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
              <Image
                src="/apple-touch-icon.png"
                alt="Logo"
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="text-2xl font-bold">{APP_NAME}</span>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Welcome Back</h1>
            <p className="text-muted-foreground">
              Sign in to access your dashboard
            </p>
          </div>

          <div className="w-full space-y-4">
            {signInError && (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive"
                role="alert"
              >
                {signInError}
              </p>
            )}

            <GoogleSignIn />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <MagicLinkSignIn />
          </div>

          <div className="text-center text-sm text-muted-foreground">
            {/* <Link href="/demo" className="underline hover:text-foreground">
              Try the demo
            </Link> */}
            <Link href="/" className="underline hover:text-foreground">
              Homepage
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
