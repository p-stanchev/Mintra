import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Mintra — Reusable Verification for Mina",
  description:
    "Verify once, prove what matters. Mintra bridges KYC providers into the Mina attestations layer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={plusJakartaSans.variable}>
        <div className="site-shell">
          <div className="site-orb site-orb-left" aria-hidden="true" />
          <div className="site-orb site-orb-right" aria-hidden="true" />
          <div className="site-grid" aria-hidden="true" />
        </div>
        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-8">
          <header className="glass-panel relative mb-10 flex items-center justify-between border-b border-line/80 pb-5">
            <a href="/" className="text-lg font-semibold tracking-tight text-ink">
              Mintra
            </a>
            <Nav />
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-16 border-t border-line/80 pt-5 text-sm text-slate">
            Mintra bridges verified identity claims into Mina credentials. Built on{" "}
            <a
              className="font-medium text-ink transition hover:text-slate"
              href="https://github.com/zksecurity/mina-attestations"
              target="_blank"
              rel="noreferrer"
            >
              mina-attestations
            </a>
            .
          </footer>
        </div>
      </body>
    </html>
  );
}
