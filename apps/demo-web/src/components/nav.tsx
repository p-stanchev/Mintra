"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/demo-issuer", label: "Demo Issuer" },
  { href: "/protected", label: "Protected" },
  { href: "/playground", label: "Playground" },
  { href: "/zk-age", label: "ZK Proofs" },
  { href: "/relying-party", label: "Relying Party" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  // Close on route change (any click that navigates)
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [open]);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden items-center gap-6 text-sm text-slate sm:flex">
        {links.map((l) => (
          <a key={l.href} className="transition hover:text-ink" href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>

      {/* Mobile hamburger button */}
      <button
        type="button"
        className="flex items-center justify-center rounded-lg p-2 text-slate transition hover:bg-fog hover:text-ink sm:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-[73px] z-[140] rounded-b-2xl border border-line border-t-0 bg-white px-6 py-4 shadow-card sm:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate transition hover:bg-fog hover:text-ink"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
