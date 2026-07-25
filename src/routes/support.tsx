import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Heart, Coffee, Building2, Check, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support SiteWatch" },
      {
        name: "description",
        content:
          "Help keep SiteWatch free, independent and ad-free for every community. One-off or monthly support.",
      },
      { property: "og:title", content: "Support SiteWatch" },
      {
        property: "og:description",
        content: "Keep the citizen planning map free and independent for every community.",
      },
    ],
  }),
  component: SupportPage,
});

/**
 * Monetisation is intentionally donation / supporter based — SiteWatch is a civic tool, so
 * features stay free for everyone rather than being paywalled. Wire this up by setting a
 * payment/donation link (Stripe Payment Link, Ko-fi, BuyMeACoffee, GitHub Sponsors…) in env:
 *   VITE_SUPPORT_URL           – default link used by every tier
 *   VITE_SUPPORT_URL_COFFEE    – optional per-tier override (one-off)
 *   VITE_SUPPORT_URL_MONTHLY   – optional per-tier override (monthly)
 *   VITE_SUPPORT_URL_ORG       – optional per-tier override (organisation)
 * No API keys or secrets are needed — Payment Links / donation pages handle checkout.
 */
const BASE = import.meta.env.VITE_SUPPORT_URL as string | undefined;

interface Tier {
  icon: typeof Coffee;
  name: string;
  price: string;
  blurb: string;
  perks: string[];
  href?: string;
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    icon: Coffee,
    name: "Buy us a coffee",
    price: "One-off",
    blurb: "A one-time thank-you that helps cover the hosting bill.",
    perks: ["Keeps the map online", "Our sincere gratitude"],
    href: (import.meta.env.VITE_SUPPORT_URL_COFFEE as string | undefined) ?? BASE,
  },
  {
    icon: Heart,
    name: "Monthly Supporter",
    price: "Monthly",
    blurb: "Sustained support that keeps SiteWatch independent and ad-free.",
    perks: ["Everything above", "Funds moderation & new cities", "Supporter recognition (soon)"],
    href: (import.meta.env.VITE_SUPPORT_URL_MONTHLY as string | undefined) ?? BASE,
    highlight: true,
  },
  {
    icon: Building2,
    name: "Organisation",
    price: "Custom",
    blurb: "For councils, community groups and developers who want to back the map.",
    perks: ["Everything above", "Support your community's map", "Get in touch about partnerships"],
    href: (import.meta.env.VITE_SUPPORT_URL_ORG as string | undefined) ?? BASE,
  },
];

function SupportPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 py-10 space-y-10">
        <div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Back to map
          </Link>
          <div className="mt-4 text-center max-w-xl mx-auto">
            <span className="inline-flex items-center justify-center size-12 rounded-full bg-accent text-accent-foreground mb-4">
              <Heart className="size-6" />
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold">Keep SiteWatch free & independent</h1>
            <p className="mt-3 text-muted-foreground">
              SiteWatch is a free, ad-free civic map — no paywalls, no selling your data. If it's
              useful to you or your community, chip in to help cover hosting and moderation and keep
              it open to every city.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`rounded-lg border bg-card p-5 flex flex-col ${
                t.highlight ? "border-accent ring-1 ring-accent shadow-sm" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center size-9 rounded-md bg-secondary text-primary">
                  <t.icon className="size-4" />
                </span>
                <div>
                  <p className="font-semibold leading-tight">{t.name}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
                    {t.price}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{t.blurb}</p>
              <ul className="mt-3 space-y-1.5 flex-1">
                {t.perks.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs">
                    <Check className="size-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground/80">{p}</span>
                  </li>
                ))}
              </ul>
              {t.href ? (
                <Button asChild className={`mt-4 w-full ${t.highlight ? "btn-cta" : ""}`}>
                  <a href={t.href} target="_blank" rel="noopener noreferrer">
                    Support
                  </a>
                </Button>
              ) : (
                <Button disabled className="mt-4 w-full" title="Support options are being set up">
                  Coming soon
                </Button>
              )}
            </div>
          ))}
        </div>

        {!BASE && (
          <p className="text-center text-[11px] text-muted-foreground font-mono">
            Support links aren't configured yet — set VITE_SUPPORT_URL to your Stripe / Ko-fi /
            BuyMeACoffee link to enable checkout.
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Prefer to help another way?{" "}
          <Link to="/" className="text-primary hover:underline">
            Submit and discuss developments
          </Link>{" "}
          in your city — that's the most valuable contribution of all.
        </p>
      </main>
    </div>
  );
}
