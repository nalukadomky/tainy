// Widget na cizí web: majitel s vlastním webem vloží krátký kód a na jeho
// stránce se objeví plovoucí tlačítko „Rezervovat“ (po kliknutí se nad webem
// otevře okno s rezervací, iframe /embed/{slug}), nebo rezervace jako sekce
// přímo v obsahu stránky (<div data-tainy-sekce>, iframe /embed/{slug}?inline=1).
// Skript: public/widget.js.

export type WidgetSettings = {
  /** Text plovoucího tlačítka. */
  label: string;
  /** Roh obrazovky, ve kterém tlačítko je. */
  position: "right" | "left";
  /** button = plovoucí tlačítko s oknem, section = rezervace jako sekce na stránce. */
  mode: "button" | "section";
  /** U sekce zároveň plovoucí tlačítko (na stránkách bez sekce). */
  floating: boolean;
  /** U sekce záložka Dárkový poukaz (když majitel poukazy prodává). */
  gifts: boolean;
};

export const WIDGET_DEFAULTS: WidgetSettings = { label: "Rezervovat", position: "right", mode: "button", floating: false, gifts: true };

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
    mode: v.mode === "section" ? "section" : "button",
    floating: v.floating === true,
    gifts: v.gifts !== false,
  };
}

export const serializeWidgetSettings = (s: WidgetSettings) => JSON.stringify(parseWidgetSettings(JSON.stringify(s)));

/** Kód, který majitel vloží do svého webu (tlačítko: kamkoli, nejlépe před </body>; sekce: tam, kde má rezervace být). */
export const widgetSnippet = (appUrl: string, slug: string, mode: WidgetSettings["mode"] = "button") =>
  (mode === "section" ? "<div data-tainy-sekce></div>\n" : "") + `<script src="${appUrl}/widget.js" data-tainy="${slug}" async></script>`;
