import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// Hlasový AI asistent (tier tainy Pro): dostane přepis hlasového pokynu
// a aktuální obsah webu, vrátí odpověď + sadu úprav, které rovnou aplikujeme.

const nullable = (type: string) => ({ type: [type, "null"] });

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Krátká přátelská odpověď v češtině shrnující, co asistent udělal nebo proč nic neměnil.",
    },
    updates: {
      type: "object",
      description: "Pole webu, která se mají změnit. Nezměněná pole nech null.",
      properties: {
        name: nullable("string"),
        tagline: nullable("string"),
        description: nullable("string"),
        propertyType: nullable("string"),
        pricePerNight: nullable("integer"),
        weekendPct: nullable("integer"),
        maxGuests: nullable("integer"),
        amenities: nullable("string"),
        contactEmail: nullable("string"),
        contactPhone: nullable("string"),
      },
      required: [
        "name", "tagline", "description", "propertyType", "pricePerNight",
        "weekendPct", "maxGuests", "amenities", "contactEmail", "contactPhone",
      ],
      additionalProperties: false,
    },
  },
  required: ["reply", "updates"],
  additionalProperties: false,
} as const;

type Updates = Record<string, string | number | null>;

function demoFallback(transcript: string, site: { pricePerNight: number }): { reply: string; updates: Updates } {
  // Bez API klíče zvládne asistent alespoň změnu ceny, aby šlo demo vyzkoušet.
  const priceMatch = transcript.match(/cen\w*\D{0,20}?(\d[\d\s]{2,})/i);
  if (priceMatch) {
    const price = Number(priceMatch[1].replace(/\s/g, ""));
    if (Number.isFinite(price) && price > 0) {
      return {
        reply: `Ukázkový režim: měním cenu za noc z ${site.pricePerNight} Kč na ${price} Kč. Pro plné AI úpravy textů nastav ANTHROPIC_API_KEY v souboru .env.`,
        updates: { pricePerNight: price },
      };
    }
  }
  return {
    reply:
      "Běžím v ukázkovém režimu bez AI klíče – zvládnu teď jen změnu ceny (např. „změň cenu na 3200“). Pro plné hlasové úpravy webu nastav ANTHROPIC_API_KEY v souboru .env a restartuj server.",
    updates: {},
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const transcript = String(body.transcript ?? "").trim();
  const slug = String(body.site ?? "");
  if (!transcript) return NextResponse.json({ error: "Prázdný pokyn." }, { status: 400 });

  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });
  if (site.tier !== "pro") {
    return NextResponse.json(
      { error: "Hlasový asistent je součástí tarifu tainy Pro." },
      { status: 403 }
    );
  }

  let result: { reply: string; updates: Updates };

  if (!process.env.ANTHROPIC_API_KEY) {
    result = demoFallback(transcript, site);
  } else {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system:
        "Jsi hlasový asistent aplikace tainy pro majitele ubytování. Majitel ti hlasem diktuje úpravy svého prezentačního webu. " +
        "Na základě pokynu uprav příslušná pole webu – piš přirozenou, prodejní češtinou v duchu stávajícího tónu webu. " +
        "Měň pouze to, o co majitel žádá; ostatní pole nech null. Ceny jsou v Kč (celá čísla). " +
        "Pole weekendPct je víkendová přirážka v procentech pro noci pátek–neděle (0 = bez přirážky). " +
        "Pokud pokyn není úprava webu, nic neměň a v poli reply stručně vysvětli, co umíš.",
      messages: [
        {
          role: "user",
          content:
            `Aktuální obsah webu (JSON):\n${JSON.stringify({
              name: site.name,
              tagline: site.tagline,
              description: site.description,
              propertyType: site.propertyType,
              pricePerNight: site.pricePerNight,
              pricingMode: site.pricingMode,
              weekendPct: site.weekendPct,
              maxGuests: site.maxGuests,
              amenities: site.amenities,
              contactEmail: site.contactEmail,
              contactPhone: site.contactPhone,
            })}\n\nHlasový pokyn majitele: „${transcript}“`,
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { reply: "Tenhle pokyn nemůžu provést. Zkus to prosím formulovat jinak.", updates: {}, site },
        { status: 200 }
      );
    }
    const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
    try {
      result = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Asistent vrátil neplatnou odpověď, zkus to znovu." }, { status: 502 });
    }
  }

  // Aplikace úprav (jen ne-null hodnoty)
  const data: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(result.updates ?? {})) {
    if (value === null || value === undefined) continue;
    if (["pricePerNight", "maxGuests"].includes(key)) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) data[key] = Math.round(n);
    } else if (key === "weekendPct") {
      const n = Number(value);
      if (Number.isFinite(n)) data[key] = Math.max(-90, Math.min(500, Math.round(n)));
    } else {
      data[key] = String(value);
    }
  }

  const updated =
    Object.keys(data).length > 0
      ? await prisma.site.update({ where: { slug }, data })
      : site;

  return NextResponse.json({
    reply: result.reply ?? "Hotovo.",
    updates: data,
    site: updated,
  });
}
