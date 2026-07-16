"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAdminData } from "@/lib/admin";

type Message = {
  role: "user" | "assistant";
  text: string;
  updates?: Record<string, string | number>;
};

const FIELD_LABELS: Record<string, string> = {
  name: "název",
  tagline: "slogan",
  description: "popis",
  propertyType: "typ",
  pricePerNight: "cena/noc",
  weekendPct: "víkend %",
  maxGuests: "max. hostů",
  amenities: "vybavení",
  contactEmail: "e-mail",
  contactPhone: "telefon",
};

const EXAMPLES = [
  "Zvyš cenu za noc na 3 200 korun",
  "Přepiš uvítací text, ať zní víc podzimně a útulně",
  "Přidej do vybavení gril a půjčení kol",
  "Změň slogan na něco romantičtějšího",
];

// Minimální typy pro Web Speech API (v TS lib chybí)
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export default function AssistantPage() {
  const { slug, site, loading, reload } = useAdminData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "cs-CZ";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript).join(" ");
      setInput(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function toggleMic() {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      setInput("");
      rec.start();
      setListening(true);
    }
  }

  async function send(text?: string) {
    const transcript = (text ?? input).trim();
    if (!transcript || thinking) return;
    recognitionRef.current?.stop();
    setListening(false);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: transcript }]);
    setThinking(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, site: slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Asistent neodpověděl.");
      setMessages((m) => [...m, { role: "assistant", text: data.reply, updates: data.updates }]);
      if (data.updates && Object.keys(data.updates).length > 0) reload();
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: e instanceof Error ? e.message : "Něco se pokazilo, zkus to znovu." },
      ]);
    } finally {
      setThinking(false);
    }
  }

  if (loading) return <p className="py-16 text-center text-soft">Načítám asistenta…</p>;

  // Upsell pro tarif Start
  if (site && site.tier !== "pro") {
    return (
      <div className="ai-chip rise mx-auto mt-8 max-w-lg rounded-3xl p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
          🎙️
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold">
          Hlasový asistent je součástí t<span className="ai-mark">ai</span>ny Pro
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-soft">
          Řekni „zvyš cenu na 3 200 a přepiš uvítací text víc podzimně“ — a tvůj web se upraví sám,
          bez klikání.
        </p>
        <Link href="/admin/web" className="btn-primary mt-6">
          ✨ Aktivovat Pro v nastavení webu
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-160px)] flex-col sm:h-[calc(100dvh-140px)]">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          AI asistent{" "}
          <span className="ai-chip ml-1 rounded-full px-2.5 py-1 align-middle text-xs font-bold">Pro</span>
        </h1>
        <p className="mt-1 text-sm text-soft">
          Podrž mikrofon, řekni, co chceš na webu změnit, a je to.
        </p>
      </div>

      {/* Konverzace */}
      <div ref={logRef} className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface p-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-soft">Zkus třeba:</p>
            <div className="mx-auto mt-3 flex max-w-md flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => send(e)}
                  className="rounded-full border border-line bg-bg px-3.5 py-2 text-left text-xs font-medium text-soft transition hover:border-pine/40 hover:text-ink"
                >
                  „{e}“
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                m.role === "user" ? "bg-ink text-white" : "bg-bg"
              }`}
            >
              {m.text}
              {m.updates && Object.keys(m.updates).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.keys(m.updates).map((k) => (
                    <span key={k} className="ai-chip rounded-full px-2 py-0.5 text-[11px] font-semibold text-ink">
                      ✓ {FIELD_LABELS[k] ?? k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-bg px-4 py-3 text-[15px] text-soft">
              <span className="ai-mark font-semibold">ai</span> přemýšlí…
            </div>
          </div>
        )}
      </div>

      {/* Vstup */}
      <div className="mt-3 flex items-center gap-2.5">
        {speechSupported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? "Zastavit nahrávání" : "Začít mluvit"}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl transition ${
              listening ? "recording bg-coral text-white" : "bg-ink text-white hover:bg-pine"
            }`}
          >
            {listening ? "◼" : "🎙"}
          </button>
        )}
        <input
          className="field !rounded-full !py-3.5"
          placeholder={listening ? "Poslouchám… mluv" : "Napiš nebo řekni pokyn…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          type="button"
          className="btn-primary !px-5 shrink-0"
          disabled={!input.trim() || thinking}
          onClick={() => send()}
        >
          ➤
        </button>
      </div>
      {!speechSupported && (
        <p className="mt-2 text-xs text-soft">
          Tvůj prohlížeč nepodporuje rozpoznávání řeči — asistenta můžeš ovládat psaním (hlas funguje v Chrome a Safari).
        </p>
      )}
    </div>
  );
}
