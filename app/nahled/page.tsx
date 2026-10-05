"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteEditing } from "@/components/EditableText";
import { SiteView, type SiteViewData } from "@/components/SiteView";
import type { BookedRange } from "@/components/DayPicker";
import type { PreviewMessage } from "@/components/LivePreview";
import { Skeleton } from "@/components/Skeleton";

// Vnitřek živého náhledu: běží v iframe v administraci (/admin/web) a vykresluje
// web z neuloženého formuláře, který mu editor posílá přes postMessage.
// Díky iframe platí breakpointy a výška okna jako na skutečném webu.

export default function PreviewFrame() {
  const [data, setData] = useState<{ site: SiteViewData; booked: BookedRange[]; editable: boolean } | null>(null);

  // Builder: úpravy se posílají rodiči, ten je uloží a pošle zpět nová data.
  const editing = useMemo<SiteEditing>(() => {
    const post = (msg: PreviewMessage) => window.parent.postMessage(msg, window.location.origin);
    return {
      text: (field, value) => post({ type: "edit", field, value }),
      open: (section) => post({ type: "select", section }),
    };
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent<PreviewMessage>) {
      if (e.origin !== window.location.origin) return;
      const msg = e.data;
      if (msg?.type === "site") setData({ site: msg.site, booked: msg.booked, editable: !!msg.editable });
      if (msg?.type === "focus") flash(msg.section);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "ready" } satisfies PreviewMessage, window.location.origin);

    // Odkazy mimo stránku (patička, e-mail) by z náhledu odvedly pryč.
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest("a");
      if (a && !a.getAttribute("href")?.startsWith("#")) e.preventDefault();
    }
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!data)
    return (
      <div className="min-h-dvh space-y-6 bg-cream p-6" role="status" aria-label="Načítám náhled">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[50vh] w-full rounded-2xl" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  return <SiteView site={data.site} booked={data.booked} preview editing={data.editable ? editing : undefined} />;
}

/** Plynule odscrolluje na sekci webu a krátce ji zvýrazní. */
function flash(section: string) {
  const el = document.getElementById(section);
  if (!el) return;
  // Jen window.scrollTo — scrollIntoView by posouval i prvky v administraci
  // kolem iframe a web by se v rámu zařízení „utrhl" nahoru.
  const HEADER = 72; // přilepená hlavička webu
  const top = section === "uvod" ? 0 : el.getBoundingClientRect().top + window.scrollY - HEADER;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  el.classList.remove("preview-flash");
  void el.offsetWidth; // restart animace při opakovaném zvýraznění
  el.classList.add("preview-flash");
  window.setTimeout(() => el.classList.remove("preview-flash"), 1500);
}
