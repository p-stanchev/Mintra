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
      <nav className="hidden items-center gap-6 text-sm text-slate sm:flex">
        {links.map((l) => (
          <a key={l.href} className="transition hover:text-ink" href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className="relative z-[160] flex items-center justify-center rounded-lg p-2 text-slate transition hover:bg-fog hover:text-ink sm:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-[88px] z-[150] rounded-[24px] border border-line bg-white/95 px-4 py-4 shadow-card backdrop-blur-md sm:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-3 py-3 text-sm font-medium text-slate transition hover:bg-fog hover:text-ink"
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
