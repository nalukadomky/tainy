"use client";

import { SiteEditor } from "@/components/SiteEditor";

// Widget na vlastní web — v menu místo „Můj web“ u účtu bez webu v tainy.
export default function WidgetPage() {
  return <SiteEditor area="widget" />;
}
