import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to map
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "City Builds — Citizen Planning Map" },
      {
        name: "description",
        content:
          "Track, submit and discuss construction and urban planning developments in any city on an open community map.",
      },
      { property: "og:title", content: "City Builds — Citizen Planning Map" },
      {
        property: "og:description",
        content: "An open community map for city developments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "City Builds — Citizen Planning Map" },
      { name: "description", content: "A global city map for submitting, discussing, and tracking urban development projects." },
      { property: "og:description", content: "A global city map for submitting, discussing, and tracking urban development projects." },
      { name: "twitter:description", content: "A global city map for submitting, discussing, and tracking urban development projects." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ef8f994a-9852-4376-8a7e-4fbc22aa3c7c/id-preview-367982c5--dbca57b0-1907-4373-b6d4-db2e01f2aa8d.lovable.app-1777034906817.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ef8f994a-9852-4376-8a7e-4fbc22aa3c7c/id-preview-367982c5--dbca57b0-1907-4373-b6d4-db2e01f2aa8d.lovable.app-1777034906817.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
