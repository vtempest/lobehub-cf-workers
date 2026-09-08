"use client"

import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Cloud,
  CreditCard,
  Database,
  HardDrive,
  Mail,
  MessageSquare,
  Palette,
  Shield,
  Sparkles,
} from "lucide-react"

import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_NAME } from "@/lib/constants"

const features = [
  {
    body:
      "Conversations stream token by token from Workers AI. Pick a model per thread, stop mid-generation, " +
      "and resume — every turn is persisted, including the ones that fail.",
    icon: MessageSquare,
    title: "Streaming chat",
  },
  {
    body:
      "Inference runs on the AI binding — no third-party API keys, no egress. Route through AI Gateway for " +
      "caching, rate limiting and per-request logs by setting one variable.",
    icon: Sparkles,
    title: "Workers AI",
  },
  {
    body:
      "Users, agents, threads, messages and teams live in D1, queried through Drizzle with migrations checked " +
      "into the repo. There is no second database to run.",
    icon: Database,
    title: "D1 for everything",
  },
  {
    body:
      "Attachments go to R2 under a per-user prefix; only metadata touches the database. KV backs the ISR cache " +
      "and rate limits.",
    icon: HardDrive,
    title: "R2 and KV",
  },
  {
    body:
      "Magic links, verification and team invitations are delivered by Cloudflare Email Routing's send_email " +
      "binding. No mail provider account required.",
    icon: Mail,
    title: "Cloudflare Email",
  },
  {
    body:
      "better-auth with Google OAuth, email links, and anonymous sessions. Sessions, accounts and verification " +
      "tokens are all D1 rows.",
    icon: Shield,
    title: "Authentication",
  },
  {
    body:
      "Organizations, teams, member roles and invitations ship with the base, wired to the same D1 schema as chat.",
    icon: CreditCard,
    title: "Teams and billing",
  },
  {
    body:
      "shadcn/ui on Tailwind v4, 50+ color themes, and system dark mode — themed from a single cookie so the " +
      "first paint is already correct.",
    icon: Palette,
    title: "Themeable UI",
  },
  {
    body:
      "MDX documentation with full-text search and syntax highlighting, served from the same Worker as the app.",
    icon: BookOpen,
    title: "Built-in docs",
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
          <div className="container mx-auto flex max-w-[64rem] flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Cloud className="h-3.5 w-3.5" />
              Runs entirely on Cloudflare Workers
            </span>
            <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
              {APP_NAME} on the edge.
            </h1>
            <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
              An open-source AI chat workspace with one backend: Cloudflare. Workers AI for inference,
              D1 for data, R2 for files, KV for cache, Email Routing for mail.
            </p>
            <div className="space-x-4">
              <Link href="/chat">
                <Button className="h-11 px-8" size="lg">
                  Start chatting
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/docs">
                <Button className="h-11 bg-transparent px-8" size="lg" variant="outline">
                  Documentation
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section
          className="container mx-auto space-y-6 bg-slate-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
          id="features"
        >
          <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
            <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">Features</h2>
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              Every capability below is a Cloudflare binding — nothing else to provision.
            </p>
          </div>
          <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
            {features.map(({ body, icon: Icon, title }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="mb-2 h-10 w-10 text-primary" />
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
