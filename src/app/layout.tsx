import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/shell/app-header";

export const metadata: Metadata = {
  title: "Pathfinder Nexus — Mistrz Gry AI",
  description:
    "Deterministyczna narracja oparta na stanie świata dla Pathfinder 1e i 2e.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="dark">
      <body className="font-sans antialiased">
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
