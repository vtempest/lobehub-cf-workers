"use client"

import { useState } from "react"
import { Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signIn } from "@/lib/auth-client"

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }

/**
 * Email sign-in. The link is delivered by Cloudflare Email Routing — see
 * `lib/email/send.ts` — so this is the passwordless path that needs no
 * third-party mail provider.
 */
export function MagicLinkSignIn() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email) return

    setStatus({ kind: "sending" })
    const { error } = await signIn.magicLink({ callbackURL: "/chat", email })

    setStatus(
      error
        ? { kind: "error", message: error.message ?? "Could not send the sign-in link." }
        : { kind: "sent" },
    )
  }

  // Confirming what happens next matters more than a bare success tick: the
  // user has to leave the app to finish signing in.
  if (status.kind === "sent") {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-center text-sm">
        <Mail className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="font-medium">Check {email}</p>
        <p className="mt-1 text-muted-foreground">
          The sign-in link expires in 5 minutes.
        </p>
        <button
          className="mt-3 text-xs underline text-muted-foreground hover:text-foreground"
          onClick={() => setStatus({ kind: "idle" })}
          type="button"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Input
        autoComplete="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        type="email"
        value={email}
      />
      <Button className="w-full" disabled={status.kind === "sending"} size="lg" type="submit" variant="outline">
        {status.kind === "sending" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Mail className="mr-2 h-4 w-4" />
        )}
        Email me a sign-in link
      </Button>
      {status.kind === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
    </form>
  )
}
