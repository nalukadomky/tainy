/*
 * tainy — rezervační widget pro vlastní web ubytování.
 *
 *   <script src="https://tainy.cz/widget.js" data-tainy="moje-chata" async></script>
 *
 * Vloží plovoucí tlačítko „Rezervovat“; po kliknutí se nad webem otevře okno
 * s rezervací (iframe /embed/{slug}). Vlastní tlačítka webu otevřou rezervaci
 * atributem data-tainy-open, z JavaScriptu Tainy.open() / Tainy.close().
 * Bez plovoucího tlačítka: data-button="false" na značce <script>.
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
  var cfg = { label: "Rezervovat", color: "#2c5e3f", position: "right", name: "" };

  var host, root, button, overlay, panel, frame, isOpen = false, booked = false, lastFocus = null;

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
    ".btn{bottom:16px;padding:13px 20px;font-size:15px}.btn.right{right:16px}.btn.left{left:16px}}" +
    "@media (prefers-reduced-motion:reduce){.btn,.ov,.panel{transition:none}}" +
    "@media print{.btn,.ov{display:none}}";

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

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
      button.addEventListener("click", open);
      button.addEventListener("pointerenter", preload, { once: true });
      button.addEventListener("focus", preload, { once: true });
      root.appendChild(button);
      paint();
    }
    document.body.appendChild(host);
  }

  function paint() {
    if (!button) return;
    button.style.background = cfg.color;
    button.className = "btn " + cfg.position + (isOpen ? " hidden" : "");
    button.innerHTML = ICON + "<span></span>";
    button.lastChild.textContent = cfg.label;
  }

  // Okno s rezervací se vytvoří dopředu (najetí na tlačítko), ať se po kliknutí otevře hned
  function preload() {
    if (overlay) return;
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
    frame.src = origin + "/embed/" + encodeURIComponent(slug);
    panel.appendChild(frame);
    overlay.appendChild(panel);
    root.appendChild(overlay);
  }

  var scrollLock = "";
  function open() {
    if (isOpen) return;
    preload();
    // Po dokončené rezervaci začne další od začátku
    if (booked) {
      frame.src = origin + "/embed/" + encodeURIComponent(slug);
      booked = false;
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

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || typeof e.data.type !== "string") return;
    if (e.data.type === "tainy:close") close();
    if (e.data.type === "tainy:booked") {
      booked = true;
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
    open();
  });

  window.Tainy = { open: open, close: close };

  function start() {
    mount();
    fetch(origin + "/api/embed/" + encodeURIComponent(slug))
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        cfg.label = data.label || cfg.label;
        cfg.color = data.color || cfg.color;
        cfg.position = data.position === "left" ? "left" : "right";
        cfg.name = data.name || "";
        paint();
        if (panel) panel.style.setProperty("--c", cfg.color);
      })
      .catch(function () {});
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
