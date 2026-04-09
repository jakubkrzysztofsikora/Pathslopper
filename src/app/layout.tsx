import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pathfinder Nexus — AI Game Master",
  description:
    "Deterministic state-driven storytelling for Pathfinder 1e and 2e.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          {children}
        </div>
      </body>
    </html>
  );
}
