"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * **What a script adds to a drawer, and nothing a drawer needs** (ADR-0010): the keyboard.
 *
 * The drawer is a page with a panel open on it and every way out is a link (`./drawer`), so
 * it works with nothing running. Where a script is running, two things a dialog is expected
 * to do are added on top: the panel takes the focus when it opens, so the keyboard starts
 * inside it rather than behind the scrim, and `Escape` closes it — by going where the close
 * link goes, so the two can never disagree about what closing means.
 */
export function DrawerKeys({ panel, closesTo }: { panel: string; closesTo: string }) {
  const router = useRouter();

  useEffect(() => {
    // Only when nothing inside already has the focus: a refused form comes back with its
    // panel open and the field the refusal is about may have claimed it.
    const opened = document.getElementById(panel);
    if (opened && !opened.contains(document.activeElement)) opened.focus({ preventScroll: true });

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      router.push(closesTo, { scroll: false });
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, closesTo, router]);

  return null;
}
