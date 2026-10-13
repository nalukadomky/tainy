// Widget na cizí web: majitel s vlastním webem vloží krátký kód a na jeho
// stránce se objeví plovoucí tlačítko „Rezervovat“. Po kliknutí se nad webem
// otevře okno s rezervací (iframe /embed/{slug}). Skript: public/widget.js.

export type WidgetSettings = {
  /** Text plovoucího tlačítka. */
  label: string;
  /** Roh obrazovky, ve kterém tlačítko je. */
  position: "right" | "left";
};

export const WIDGET_DEFAULTS: WidgetSettings = { label: "Rezervovat", position: "right" };

export function parseWidgetSettings(raw: string | null | undefined): WidgetSettings {
  let v: Partial<WidgetSettings> = {};
  try {
    v = JSON.parse(raw || "{}");
  } catch {
    // poškozené nastavení = výchozí
  }
  const label = typeof v.label === "string" ? v.label.trim().slice(0, 30) : "";
  return {
    label: label || WIDGET_DEFAULTS.label,
    position: v.position === "left" ? "left" : "right",
  };
}

export const serializeWidgetSettings = (s: WidgetSettings) => JSON.stringify(parseWidgetSettings(JSON.stringify(s)));

/** Kód, který majitel vloží do svého webu (kamkoli, nejlépe před </body>). */
export const widgetSnippet = (appUrl: string, slug: string) =>
  `<script src="${appUrl}/widget.js" data-tainy="${slug}" async></script>`;
