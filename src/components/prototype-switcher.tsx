"use client";

// PROTOTYPE — throwaway. Not part of the design being evaluated, and not shipped: it
// renders nothing in a production build. Delete this file with the variants it switches.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type PrototypeVariant = { key: string; name: string };

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: readonly PrototypeVariant[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const at = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  );
  const step = (by: number) => {
    const next = variants[(at + by + variants.length) % variants.length];
    const params = new URLSearchParams(search.toString());
    params.set("variant", next.key);
    return `${pathname}?${params.toString()}`;
  };

  // Arrow keys cycle too, except while something is being typed into.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key === "ArrowLeft") router.replace(step(-1), { scroll: false });
      if (event.key === "ArrowRight") router.replace(step(1), { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const arrow =
    "flex h-9 w-9 items-center justify-center rounded-full text-base leading-none hover:bg-muted";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <nav className="pointer-events-auto flex items-center gap-1 rounded-full border-2 border-foreground bg-background px-2 py-1.5 shadow-lg">
        <Link
          href={step(-1)}
          scroll={false}
          replace
          className={arrow}
          aria-label="Previous variant"
        >
          ←
        </Link>
        <span className="px-2 font-mono text-xs uppercase tracking-eyebrow">
          {variants[at].key} — {variants[at].name}
        </span>
        <Link href={step(1)} scroll={false} replace className={arrow} aria-label="Next variant">
          →
        </Link>
      </nav>
    </div>
  );
}
