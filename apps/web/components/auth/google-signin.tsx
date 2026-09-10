"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthProviders } from "@/hooks/use-auth-providers"
import { signIn, useSession } from "@/lib/auth-client"

const AFTER_SIGN_IN = "/dashboard"

/**
 * Redirect Google sign-in, plus an anonymous "try it" login on localhost.
 *
 * The button only renders once /api/auth/providers confirms this deployment has
 * Google credentials — the client id and secret are Worker secrets, so a build
 * cannot know. Rendering it regardless is how a sign-in ends on better-auth's
 * error page instead of on Google's consent screen.
 */
export function GoogleSignIn() {
  const { data: session } = useSession()
  const { isLoading: providersLoading, providers } = useAuthProviders()
  const router = useRouter()
  const [isLocalhost, setIsLocalhost] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user) router.push(AFTER_SIGN_IN)
  }, [session, router])

  useEffect(() => {
    const { hostname } = window.location
    setIsLocalhost(hostname === "localhost" || hostname === "127.0.0.1")
  }, [])

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)
    // A successful call navigates away, so the loading state is only ever
    // cleared on the failure path.
    const { error: signInError } = await signIn.social({
      callbackURL: AFTER_SIGN_IN,
      provider: "google",
    })
    if (signInError) {
      setError(signInError.message ?? "Could not start Google sign-in.")
      setIsLoading(false)
    }
  }

  const handleDevLogin = async () => {
    setIsLoading(true)
    setError(null)
    const { error: anonError } = await signIn.anonymous()
    if (anonError) {
      setError(anonError.message ?? "Could not start an anonymous session.")
      setIsLoading(false)
      return
    }
    router.push(AFTER_SIGN_IN)
  }

  if (session?.user) return null

  const googleAvailable = providers.includes("google")

  return (
    <div className="flex flex-col gap-4">
      {googleAvailable && (
        <Button onClick={handleGoogleSignIn} size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Sign in with Google
        </Button>
      )}

      {/* Saying so beats an unexplained gap where the button should be. */}
      {!providersLoading && !googleAvailable && (
        <p className="text-center text-sm text-muted-foreground">
          Google sign-in is not configured for this deployment. Use the email link below.
        </p>
      )}

      {isLocalhost && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            onClick={handleDevLogin}
            variant="outline"
            size="lg"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Dev Login (Bypass)
          </Button>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
