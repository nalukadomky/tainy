/*
 * tainy — rezervační widget pro vlastní web ubytování.
 *
 *   <script src="https://tainy.cz/widget.js" data-tainy="moje-chata" async></script>
 *
 * Vloží plovoucí tlačítko „Rezervovat“ (a nad něj „Dárkový poukaz“, když majitel
 * poukazy prodává); po kliknutí se nad webem otevře okno s rezervací nebo
 * poukazy (iframe /embed/{slug}). Vlastní tlačítka webu je otevřou atributem
 * data-tainy-open (data-tainy-open="poukaz" rovnou na poukazy), z JavaScriptu
 * Tainy.open() / Tainy.open("poukaz") / Tainy.close().
 * Bez plovoucích tlačítek: data-button="false" na značce <script>.
 * Sekce přímo ve stránce: <div data-tainy-sekce></div> kdekoli v obsahu — na jeho
 * místo se vloží rezervace (iframe /embed/{slug}?inline=1), výšku si řídí sama.
 * Plovoucí tlačítko se pak ukáže, jen když ho majitel u sekce zapnul.
 * Po dokončení rezervace přijde na window událost „tainy:booked“ (a do
 * Google Tag Manageru dataLayer událost „tainy_booking“).
 */
(function () {
  if (window.Tainy) return;
  var script = document.currentScript || document.querySelector("script[data-tainy]");
  if (!script) return;
  var slug = script.getAttribute("data-tainy");
  if (!slug) return;
  var origin = new URL(script.src, location.href).origin;
  var showButton = script.getAttribute("data-button") !== "false";
  var cfg = { label: "Rezervovat", color: "#2c5e3f", position: "right", name: "", gifts: false, mode: "button", floating: false, loaded: false };
  var sections = [];

  var host, root, button, giftButton, frameTab = "rezervace", frameReady = false, stale = false, overlay, panel, frame, isOpen = false, booked = false, lastFocus = null;

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".btn{position:fixed;bottom:20px;z-index:2147483000;display:inline-flex;align-items:center;gap:9px;padding:14px 22px;border:0;border-radius:999px;" +
    "font:600 16px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:.01em;color:#fff;cursor:pointer;" +
    "box-shadow:0 10px 30px -8px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.15);transition:transform .18s ease,box-shadow .18s ease,opacity .2s ease}" +
    ".btn:hover{transform:translateY(-2px);box-shadow:0 14px 34px -8px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.15)}" +
    ".btn:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
    ".btn svg{width:19px;height:19px;flex:none}" +
    ".btn.right{right:20px}.btn.left{left:20px}" +
    ".btn.hidden{opacity:0;pointer-events:none;transform:translateY(8px)}" +
    ".gift{bottom:84px;padding:10px 16px;font-size:14px;gap:7px;background:#fff}" +
    ".gift svg{width:16px;height:16px}" +
    ".ov{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:24px;" +
    "background:rgba(18,24,20,.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .22s ease}" +
    ".ov[hidden]{display:none}.ov.open{opacity:1}" +
    ".panel{position:relative;width:min(1180px,100%);height:min(900px,100%);border-radius:24px;overflow:hidden;background:#fdfbf6;" +
    "box-shadow:0 30px 80px -20px rgba(0,0,0,.5);transform:translateY(16px) scale(.98);transition:transform .26s cubic-bezier(.2,.8,.2,1)}" +
    ".ov.open .panel{transform:none}" +
    ".panel iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent}" +
    ".spin{position:absolute;top:50%;left:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border:3px solid rgba(0,0,0,.1);border-top-color:var(--c);" +
    "border-radius:50%;animation:s .8s linear infinite}" +
    "@keyframes s{to{transform:rotate(360deg)}}" +
    "@media (max-width:639px){.ov{align-items:flex-end;padding:0}.panel{width:100%;height:92%;border-radius:22px 22px 0 0;transform:translateY(40px)}" +
    ".btn{bottom:16px;padding:13px 20px;font-size:15px}.btn.right{right:16px}.btn.left{left:16px}.gift{bottom:74px;padding:9px 14px;font-size:13px}}" +
    "@media (prefers-reduced-motion:reduce){.btn,.ov,.panel{transition:none}}" +
    "@media print{.btn,.ov{display:none}}";

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

  var GIFT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';

  function mount() {
    host = document.createElement("div");
    host.setAttribute("data-tainy-widget", slug);
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    if (showButton) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "btn " + cfg.position;
      button.setAttribute("aria-haspopup", "dialog");
      button.addEventListener("click", function () {
        open();
      });
      button.addEventListener("pointerenter", function () { preload(); }, { once: true });
      button.addEventListener("focus", function () { preload(); }, { once: true });
      root.appendChild(button);
      paint();
    }
    document.body.appendChild(host);
  }

  // Plovoucí tlačítko: v režimu tlačítka vždy, u sekce jen když ho majitel zapnul
  var floatingOn = function () {
    return cfg.loaded && (cfg.mode !== "section" || cfg.floating);
  };

  function paint() {
    if (!button) return;
    button.style.background = cfg.color;
    button.className = "btn " + cfg.position + (isOpen || !floatingOn() ? " hidden" : "");
    button.innerHTML = ICON + "<span></span>";
    button.lastChild.textContent = cfg.label;
    // Menší tlačítko „Dárkový poukaz“ nad hlavním — jen když majitel poukazy prodává
    if (cfg.gifts && !giftButton) {
      giftButton = document.createElement("button");
      giftButton.type = "button";
      giftButton.setAttribute("aria-haspopup", "dialog");
      giftButton.innerHTML = GIFT + "<span>Dárkový poukaz</span>";
      giftButton.addEventListener("click", function () {
        open("poukaz");
      });
      giftButton.addEventListener("pointerenter", function () { preload("poukaz"); }, { once: true });
      root.appendChild(giftButton);
    }
    if (giftButton) {
      giftButton.style.color = cfg.color;
      giftButton.className = "btn gift " + cfg.position + (isOpen || !cfg.gifts || !floatingOn() ? " hidden" : "");
    }
  }

  // Okno s rezervací se vytvoří dopředu (najetí na tlačítko), ať se po kliknutí otevře hned
  var embedUrl = function (tab) {
    return origin + "/embed/" + encodeURIComponent(slug) + (tab === "poukaz" ? "?tab=poukaz" : "");
  };

  function preload(tab) {
    if (overlay) return;
    frameTab = tab === "poukaz" ? "poukaz" : "rezervace";
    overlay = document.createElement("div");
    overlay.className = "ov";
    overlay.hidden = true;
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Rezervace");
    panel.style.setProperty("--c", cfg.color);
    panel.innerHTML = '<div class="spin"></div>';
    frame = document.createElement("iframe");
    frame.title = "Rezervace";
    frame.allow = "clipboard-write";
    frame.addEventListener("load", function () {
      frameReady = true;
    });
    frame.src = embedUrl(frameTab);
    panel.appendChild(frame);
    overlay.appendChild(panel);
    root.appendChild(overlay);
  }

  var scrollLock = "";
  function open(tab) {
    tab = tab === "poukaz" ? "poukaz" : "rezervace";
    if (isOpen) return;
    var fresh = !overlay;
    preload(tab);
    // Po dokončené rezervaci začne další od začátku
    if (booked || stale) {
      frame.src = embedUrl(tab);
      frameTab = tab;
      booked = stale = false;
    } else if (!fresh && frameReady) {
      // Okno už je načtené — jen přepne záložku (rozepsané zůstane)
      frameTab = tab;
      try {
        frame.contentWindow.postMessage({ type: "tainy:tab", tab: tab }, origin);
      } catch (e) {}
    } else if (!fresh && frameTab !== tab) {
      // Ještě se načítá (jen najetí myší) — načte rovnou správnou záložku
      frameTab = tab;
      frame.src = embedUrl(tab);
    }
    isOpen = true;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    scrollLock = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add("open");
      });
    });
    paint();
    setTimeout(function () {
      frame.focus();
    }, 50);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("open");
    document.documentElement.style.overflow = scrollLock;
    setTimeout(function () {
      if (!isOpen) overlay.hidden = true;
    }, 230);
    paint();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Sekce ve stránce: <div data-tainy-sekce> nahradí iframe s rezervací (data-tainy-sekce="poukaz" = rovnou poukazy)
  function mountSections() {
    var els = document.querySelectorAll("[data-tainy-sekce]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute("data-tainy-ready")) continue;
      el.setAttribute("data-tainy-ready", "1");
      var f = document.createElement("iframe");
      f.title = "Rezervace";
      f.allow = "clipboard-write";
      f.setAttribute("scrolling", "no");
      f.style.cssText = "display:block;width:100%;height:720px;border:0;background:transparent;color-scheme:normal";
      f.src = origin + "/embed/" + encodeURIComponent(slug) + "?inline=1" + (el.getAttribute("data-tainy-sekce") === "poukaz" ? "&tab=poukaz" : "");
      el.appendChild(f);
      sections.push(f);
    }
  }
  var sectionOf = function (win) {
    for (var i = 0; i < sections.length; i++) if (sections[i].contentWindow === win) return sections[i];
    return null;
  };

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || typeof e.data.type !== "string") return;
    var sec = sectionOf(e.source);
    if (sec) {
      if (e.data.type === "tainy:height" && e.data.height > 0) sec.style.height = Math.min(e.data.height, 20000) + "px";
    } else {
      if (e.data.type === "tainy:close") close();
      // Okno odešlo z rezervace jinam (objednávka poukazu) — příště se otevře znovu od začátku
      if (e.data.type === "tainy:away") stale = true;
    }
    if (e.data.type === "tainy:booked") {
      if (!sec) booked = true;
      var detail = { slug: slug, total: e.data.total };
      window.dispatchEvent(new CustomEvent("tainy:booked", { detail: detail }));
      if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: "tainy_booking", value: e.data.total, currency: "CZK" });
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
  // Vlastní tlačítka a odkazy webu: <a href="#" data-tainy-open>Rezervovat</a>
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("[data-tainy-open]");
    if (!el) return;
    e.preventDefault();
    open(el.getAttribute("data-tainy-open"));
  });

  window.Tainy = { open: open, close: close, mount: mountSections };

  function start() {
    mount();
    mountSections();
    fetch(origin + "/api/embed/" + encodeURIComponent(slug))
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        cfg.loaded = true;
        if (!data) return paint();
        cfg.label = data.label || cfg.label;
        cfg.color = data.color || cfg.color;
        cfg.position = data.position === "left" ? "left" : "right";
        cfg.name = data.name || "";
        cfg.gifts = !!data.gifts;
        cfg.mode = data.mode === "section" ? "section" : "button";
        cfg.floating = !!data.floating;
        paint();
        if (panel) panel.style.setProperty("--c", cfg.color);
      })
      .catch(function () {
        cfg.loaded = true;
        paint();
      });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
