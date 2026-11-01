"use strict";

// Public contacts only. Telegram credentials stay exclusively on the backend.
const API_BASE_URL = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
  location.hostname,
)
  ? ""
  : "https://ilsiyar-api.onrender.com";
const SITE_CONFIG = Object.freeze({
  formEndpoint: API_BASE_URL + "/api/lead",
  phone: "tel:+79374848565",
  max: "https://max.ru/u/f9LHodD0cOKs7_oYOS3TB9VatfujTB8eyR0NKQKM1gUh8QtX0KpVJBIRui24",
  whatsapp: "https://wa.me/79374848565",
  telegram: "https://t.me/IlsiyarT",
  instagram: "https://www.instagram.com/ilsiyartuxvatshina/",
  maxChannel: "https://max.ru/join/uustn4TLuKcPvMNIyR5K932BFnBPhkdwYG1FXoGfWsk",
  catalogUrl: "assets/data/catalog.json",
  portrait: "assets/images/photo_2026-08-23_15-43-49.jpg",
});
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const arrow =
  '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("ru-RU").format(value) + " ₽"
    : "Цена по запросу";
const measure = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("ru-RU").format(value)
    : String(value);
const statusLabels = {
  active: "В продаже",
  reserved: "Забронировано",
  sold: "Продано",
};
let catalogPromise;
let inquiryProperty = null;
let inquiryPropertyId = new URLSearchParams(location.search).get("property");
if (!/^[a-z0-9-]{1,80}$/.test(inquiryPropertyId || ""))
  inquiryPropertyId = null;
let lastSuccessInMemory = 0;

function animate(element, keyframes, options = {}) {
  if (
    reducedMotion.matches ||
    typeof window.Motion?.animate !== "function" ||
    !element
  )
    return null;
  return Motion.animate(element, keyframes, {
    duration: 0.55,
    ease: [0.22, 1, 0.36, 1],
    ...options,
  });
}
function safeImage(src) {
  if (typeof src !== "string") return "";
  if (window.IlsiyarCMS?.isSafeImage(src)) return src;
  // Legacy static assets remain restricted to the same origin.
  try {
    const url = new URL(src, location.href);
    return url.origin === location.origin &&
      /\.(jpe?g|png|webp|avif)$/i.test(url.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function getCatalog() {
  if (!catalogPromise)
    catalogPromise = (async () => {
      const remote = await window.IlsiyarCMS?.load();
      if (remote) return remote;
      const response = await fetch(SITE_CONFIG.catalogUrl, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      return response.json();
    })().then((data) => {
      if (
        data.schemaVersion !== 1 ||
        !Array.isArray(data.properties) ||
        !Array.isArray(data.reviews)
      )
        throw new Error("Invalid catalog");
      const seen = new Set();
      const properties = data.properties
        .filter((p) => {
          if (
            !p ||
            p.published !== true ||
            !/^[a-z0-9-]{1,80}$/.test(p.id) ||
            seen.has(p.id) ||
            typeof p.title !== "string" ||
            !p.title.trim() ||
            p.title.length > 180 ||
            !statusLabels[p.status] ||
            typeof p.type !== "string" ||
            typeof p.city !== "string" ||
            p.city.length > 100
          )
            return false;
          seen.add(p.id);
          return true;
        })
        .map((p) => ({
          ...p,
          photos: (Array.isArray(p.photos) ? p.photos : [])
            .filter((img) => img && safeImage(img.src))
            .map((img) => ({
              src: safeImage(img.src),
              alt: String(img.alt || p.title),
            })),
        }));
      const reviews = data.reviews.filter(
        (r) =>
          r &&
          r.published === true &&
          r.verified === true &&
          typeof r.name === "string" &&
          (typeof r.text === "string" || safeImage(r.image)),
      );
      return { properties, reviews };
    });
  return catalogPromise;
}
function applyConfig() {
  $$("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
  $$("[data-contact]").forEach((el) => {
    if (SITE_CONFIG[el.dataset.contact])
      el.href = SITE_CONFIG[el.dataset.contact];
  });
}

function initHeader() {
  const header = $("[data-header]"),
    toggle = $(".menu-toggle"),
    menu = $("#mobile-menu"),
    nav = $(".desktop-nav"),
    pill = $(".nav-indicator");
  let menuAnimation,
    pillAnimation,
    menuRevision = 0,
    activeLink = null,
    frame;
  const links = $$("[data-nav]", nav);
  nav.classList.add("is-tracked");
  function setMenu(open, restore = false) {
    const revision = ++menuRevision;
    menuAnimation?.stop();
    const from = menu.hidden ? 0 : menu.getBoundingClientRect().height;
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    menu.hidden = false;
    menu.inert = !open;
    menu.style.height = "auto";
    const height = menu.scrollHeight;
    const finish = () => {
      if (revision !== menuRevision) return;
      menu.hidden = !open;
      menu.style.height = "";
      menu.style.opacity = "";
    };
    menuAnimation = animate(
      menu,
      {
        height: [from + "px", (open ? height : 0) + "px"],
        opacity: [open ? 0.4 : 1, open ? 1 : 0],
      },
      { duration: 0.36 },
    );
    if (menuAnimation) menuAnimation.then(finish);
    else finish();
    if (open)
      $$("a:not([hidden])", menu).forEach((link, i) =>
        animate(
          link,
          { opacity: [0, 1], transform: ["translateY(-9px)", "translateY(0)"] },
          { duration: 0.3, delay: 0.06 + i * 0.025 },
        ),
      );
    if (restore) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener("click", () =>
    setMenu(toggle.getAttribute("aria-expanded") !== "true"),
  );
  $$("a", menu).forEach((a) =>
    a.addEventListener("click", () => setMenu(false)),
  );
  document.addEventListener("pointerdown", (e) => {
    if (
      !header.contains(e.target) &&
      toggle.getAttribute("aria-expanded") === "true"
    )
      setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (e.key === "Escape") {
      setMenu(false, true);
      return;
    }
    if (e.key === "Tab") {
      const visible = $$("a,button", header).filter(
        (el) => el.getClientRects().length && !el.closest("[hidden]"),
      );
      if (e.shiftKey && document.activeElement === visible[0]) {
        e.preventDefault();
        visible.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === visible.at(-1)) {
        e.preventDefault();
        visible[0].focus();
      }
    }
  });
  function movePill(link) {
    pillAnimation?.stop();
    links.forEach((item) =>
      item.toggleAttribute("data-highlight", item === link),
    );
    if (!link || !nav.getClientRects().length) {
      pill.style.opacity = "0";
      return;
    }
    const props = {
      transform: "translateX(" + link.offsetLeft + "px)",
      width: link.offsetWidth + "px",
      opacity: 1,
    };
    pillAnimation = animate(pill, props, {
      duration: 0.38,
      ease: [0.16, 1, 0.3, 1],
    });
    if (!pillAnimation) Object.assign(pill.style, props);
  }
  links.forEach((link) => {
    link.addEventListener("pointerenter", () => movePill(link));
    link.addEventListener("focus", () => movePill(link));
  });
  nav.addEventListener("pointerleave", () => movePill(activeLink));
  nav.addEventListener("focusout", (e) => {
    if (!nav.contains(e.relatedTarget)) movePill(activeLink);
  });
  function update() {
    frame = null;
    header.classList.toggle("is-scrolled", scrollY > 72);
    let current = document.body.dataset.page === "home" ? null : links[0];
    if (document.body.dataset.page === "home") {
      let last = -Infinity;
      links.forEach((link) => {
        const id = link.dataset.nav;
        const target = document.getElementById(id);
        if (!target || target.hidden) return;
        const top = target.getBoundingClientRect().top;
        if (top <= Math.max(150, innerHeight * 0.32) && top > last) {
          current = link;
          last = top;
        }
      });
    }
    if (current !== activeLink) {
      activeLink = current;
      links.forEach((l) => {
        if (l === current) l.setAttribute("aria-current", "location");
        else l.removeAttribute("aria-current");
      });
      if (!nav.matches(":hover") && !nav.contains(document.activeElement))
        movePill(current);
    }
  }
  addEventListener(
    "scroll",
    () => {
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
  addEventListener("resize", () => {
    if (innerWidth > 1000 && toggle.getAttribute("aria-expanded") === "true")
      setMenu(false);
    movePill(activeLink);
  });
  document.fonts.ready.then(() => movePill(activeLink));
  update();
}

let selectSignatureService = null;
function scrollToTarget(target) {
  if (!target) return;
  const offset = Math.max(
    96,
    ($(".header-row")?.getBoundingClientRect().height || 74) + 22,
  );
  scrollTo({
    top: Math.max(0, target.getBoundingClientRect().top + scrollY - offset),
    behavior: reducedMotion.matches ? "instant" : "smooth",
  });
}
function openCategoryInquiry(category) {
  if (!Object.hasOwn(CATEGORIES, category)) return;
  inquiryCategory = category;
  inquiryProperty = null;
  inquiryPropertyId = null;
  const option = $('input[name=intent][value="Купить"]');
  if (option) option.checked = true;
  updateInquiryContext();
  const url = new URL(location.href);
  url.searchParams.set("category", category);
  url.searchParams.set("intent", "Купить");
  url.searchParams.delete("property");
  url.hash = "contact-form";
  history.pushState(null, "", url);
  $(".more-directions")?.removeAttribute("open");
  scrollToTarget($("#contact-form"));
}
function initCategoryInquiries() {
  document.addEventListener("click", (event) => {
    const a = event.target.closest("[data-inquiry-category]");
    if (
      !a ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    openCategoryInquiry(a.dataset.inquiryCategory);
  });
}
function initAnchors() {
  function go(hash) {
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    if (["buy", "sell"].includes(id)) {
      selectSignatureService?.(id, false);
      scrollToTarget($("#services"));
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    scrollToTarget(target);
  }
  document.addEventListener("click", (event) => {
    const a = event.target.closest('a[href^="#"]');
    if (
      !a ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    )
      return;
    const hash = a.getAttribute("href");
    if (hash.length < 2 || !document.getElementById(hash.slice(1))) return;
    event.preventDefault();
    history.pushState(null, "", hash);
    go(hash);
  });
  addEventListener("popstate", () => {
    const v = new URLSearchParams(location.search).get("category");
    inquiryCategory = Object.hasOwn(CATEGORIES, v || "") ? v : null;
    updateInquiryContext();
    go(location.hash);
  });
  addEventListener("hashchange", () => go(location.hash));
  if (location.hash)
    document.fonts.ready.then(() =>
      requestAnimationFrame(() => go(location.hash)),
    );
}

function numberTween(from, to, update, duration = 0.8) {
  if (reducedMotion.matches) {
    update(to);
    return null;
  }
  if (typeof window.Motion?.animate === "function")
    return Motion.animate(from, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: update,
    });
  let frame,
    stopped = false,
    start = performance.now();
  function step(now) {
    if (stopped) return;
    const t = Math.min(1, (now - start) / (duration * 1000));
    update(from + (to - from) * (1 - Math.pow(1 - t, 4)));
    if (t < 1) frame = requestAnimationFrame(step);
  }
  frame = requestAnimationFrame(step);
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
function initArcCarousel() {
  const root = $("[data-arc-carousel]");
  if (!root) return;
  const stage = $("[data-arc-stage]", root),
    cards = $$("[data-arc-card]", root),
    count = cards.length,
    controls = $("[data-arc-controls]", root);
  let autoEnabled = true,
    inView = false,
    hover = false,
    autoTimer,
    pauseUntil = 0,
    wheelTimer,
    wheelStart = null;
  const autoButton = $("[data-arc-autoplay]", root);
  let phase = 0,
    selected = 0,
    tween,
    drag = null,
    frame,
    skipClickUntil = 0,
    rx = 400,
    ry = 105;
  const mod = (n) => ((n % count) + count) % count;
  root.classList.add("is-enhanced");
  controls.hidden = false;
  function render(value) {
    phase = value;
    cards.forEach((card, i) => {
      const angle = ((i - phase) * Math.PI * 2) / count,
        c = Math.cos(angle),
        sn = Math.sin(angle),
        x = rx * sn,
        y = ry * (1 - c) - 32;
      const scale = 0.78 + (0.22 * (c + 1)) / 2,
        opacity = c >= 0 ? 0.86 + 0.14 * c : Math.max(0, 0.86 * (1 + c * 2));
      card.style.transform =
        "translate3d(calc(-50% + " +
        x.toFixed(3) +
        "px),calc(-50% + " +
        y.toFixed(3) +
        "px),0) rotate(" +
        (sn * 6).toFixed(3) +
        "deg) scale(" +
        scale.toFixed(4) +
        ")";
      card.style.zIndex = String(Math.round((c + 1) * 100));
      card.style.opacity = String(opacity);
      card.style.pointerEvents = opacity < 0.15 ? "none" : "auto";
      card.dataset.arcAngle = angle.toFixed(5);
      card.dataset.arcX = x.toFixed(3);
      card.dataset.arcY = y.toFixed(3);
    });
  }
  function announce(index) {
    selected = index;
    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === index);
      card.tabIndex = i === index ? 0 : -1;
      card.setAttribute("aria-current", String(i === index));
    });
    const card = cards[index],
      title = $("h3", card).textContent,
      label = $("p", card).textContent;
    $("[data-arc-current]", root).textContent = String(index + 1).padStart(
      2,
      "0",
    );
    $("[data-arc-title]", root).textContent = title;
    $("[data-arc-label]", root).textContent = label;
    const inquiry = $("[data-arc-inquiry]", root);
    inquiry.dataset.inquiryCategory = card.dataset.categoryKey;
    inquiry.href =
      "index.html?intent=" +
      encodeURIComponent("Купить") +
      "&category=" +
      card.dataset.categoryKey +
      "#contact-form";
    $("[data-arc-announcement]", root).textContent =
      title + ", " + (index + 1) + " из " + count;
  }
  function move(target, moving = true) {
    tween?.stop();
    announce(mod(Math.round(target)));
    if (!moving || reducedMotion.matches) {
      render(target);
      return;
    }
    tween = numberTween(phase, target, render, 0.85);
  }
  function select(index) {
    const round = Math.round(phase),
      delta = mod(index - mod(round) + count / 2) - count / 2;
    move(round + delta);
  }
  function resize() {
    rx =
      stage.clientWidth <= 700
        ? Math.min(stage.clientWidth * 0.66, 285)
        : Math.min(stage.clientWidth * 0.34, 445);
    ry = stage.clientWidth <= 700 ? 90 : 100;
    render(phase);
  }
  $("[data-arc-prev]", root).addEventListener("click", () =>
    move(Math.round(phase) - 1),
  );
  $("[data-arc-next]", root).addEventListener("click", () =>
    move(Math.round(phase) + 1),
  );
  stage.addEventListener("click", (event) => {
    const card = event.target.closest("[data-arc-card]");
    if (!card || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (performance.now() < skipClickUntil) return;
    const i = cards.indexOf(card);
    if (i === selected) openCategoryInquiry(card.dataset.categoryKey);
    else select(i);
  });
  root.addEventListener("keydown", (event) => {
    const map = {
      ArrowLeft: Math.round(phase) - 1,
      ArrowRight: Math.round(phase) + 1,
      Home: Math.round(phase) - mod(Math.round(phase)),
      End: Math.round(phase) - mod(Math.round(phase)) + count - 1,
    };
    if (Object.hasOwn(map, event.key)) {
      event.preventDefault();
      move(map[event.key]);
    }
  });
  stage.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    clearTimeout(wheelTimer);
    wheelStart = null;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: phase,
      active: false,
      dx: 0,
    };
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy)) return;
      tween?.stop();
      drag.start = phase;
      drag.active = true;
      stage.setPointerCapture(event.pointerId);
      root.classList.add("is-dragging");
    }
    drag.dx = dx;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (drag?.active)
        render(drag.start - drag.dx / (cards[0].offsetWidth * 0.85));
    });
  });
  function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const active = drag.active,
      was = drag;
    drag = null;
    root.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId))
      stage.releasePointerCapture(event.pointerId);
    if (active) {
      skipClickUntil = performance.now() + 350;
      let target = Math.round(phase);
      if (Math.abs(was.dx) > 45 && target === Math.round(was.start))
        target += was.dx < 0 ? 1 : -1;
      move(target);
    }
  }
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("dragstart", (event) => event.preventDefault());
  addEventListener("resize", resize);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) move(Math.round(phase), false);
  });

  function schedule() {
    clearTimeout(autoTimer);
    if (
      !autoEnabled ||
      !inView ||
      hover ||
      root.contains(document.activeElement) ||
      document.hidden ||
      reducedMotion.matches
    )
      return;
    autoTimer = setTimeout(
      () => {
        move(Math.round(phase) + 1);
        schedule();
      },
      Math.max(5200, pauseUntil - performance.now()),
    );
  }
  function pause() {
    pauseUntil = performance.now() + 9000;
    clearTimeout(autoTimer);
    schedule();
  }
  root.addEventListener("pointerenter", () => {
    hover = true;
    schedule();
  });
  root.addEventListener("pointerleave", () => {
    hover = false;
    schedule();
  });
  root.addEventListener("focusin", () => clearTimeout(autoTimer));
  root.addEventListener("focusout", () => setTimeout(schedule, 0));
  root.addEventListener("pointerdown", pause, { passive: true });
  root.addEventListener("keydown", pause);
  root.addEventListener("click", pause);
  document.addEventListener("visibilitychange", schedule);
  if ("IntersectionObserver" in window)
    new IntersectionObserver(
      (entries) => {
        inView =
          entries[0].isIntersecting && entries[0].intersectionRatio >= 0.35;
        schedule();
      },
      { threshold: 0.35 },
    ).observe(stage);
  autoButton?.addEventListener("click", () => {
    autoEnabled = !autoEnabled;
    autoButton.setAttribute("aria-pressed", String(!autoEnabled));
    autoButton.setAttribute(
      "aria-label",
      autoEnabled
        ? "Приостановить автопереключение"
        : "Включить автопереключение",
    );
    $("[data-autoplay-label]", root).textContent = autoEnabled
      ? "Пауза"
      : "Авто";
    $("[data-autoplay-symbol] path", root).setAttribute(
      "d",
      autoEnabled ? "M5 3v10M11 3v10" : "M4 2.5 13 8 4 13.5Z",
    );
    schedule();
  });
  stage.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      const dx =
        event.shiftKey && Math.abs(event.deltaX) < 1
          ? event.deltaY
          : event.deltaX;
      if (
        Math.abs(dx) < 2 ||
        (!event.shiftKey && Math.abs(dx) <= Math.abs(event.deltaY) * 1.15)
      )
        return;
      event.preventDefault();
      pause();
      tween?.stop();
      if (wheelStart === null) wheelStart = phase;
      const delta =
        dx *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? stage.clientWidth
            : 1);
      render(phase + delta / 420);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        let target = Math.round(phase);
        if (
          target === Math.round(wheelStart) &&
          Math.abs(phase - wheelStart) > 0.08
        )
          target += phase > wheelStart ? 1 : -1;
        wheelStart = null;
        move(target);
      }, 140);
    },
    { passive: false },
  );
  reducedMotion.addEventListener("change", schedule);

  resize();
  announce(0);
}

function stablePanelHeight(container, panels, kind) {
  let width = 0;
  function measure(force = false) {
    if (!force && width === container.clientWidth) return;
    width = container.clientWidth;
    const min =
      kind === "album"
        ? innerWidth <= 700
          ? 490
          : 400
        : kind === "faq"
          ? innerWidth <= 700
            ? 330
            : innerWidth <= 1000
              ? 420
              : 390
          : innerWidth <= 700
            ? 0
            : innerWidth <= 1000
              ? 490
              : 470;
    let height = min;
    panels.forEach((panel) => {
      const saved = panel.getAttribute("style");
      Object.assign(panel.style, {
        position: "relative",
        inset: "auto",
        height: "auto",
        width: "100%",
        minHeight: min + "px",
      });
      height = Math.max(height, panel.offsetHeight);
      if (saved === null) panel.removeAttribute("style");
      else panel.setAttribute("style", saved);
    });
    container.style.height = Math.ceil(height) + "px";
  }
  measure(true);
  document.fonts.ready.then(() => measure(true));
  if ("ResizeObserver" in window)
    new ResizeObserver(() => measure()).observe(container);
  else addEventListener("resize", () => measure());
}
function clearSceneStyles(panel) {
  panel.style.transform = "";
  panel.style.opacity = "";
  panel.style.zIndex = "";
}
function initServiceScenes() {
  const root = $("[data-services]");
  if (!root) return;
  const panels = $$("[data-service-panel]", root),
    tabs = $$("[data-service-tab]"),
    tablist = $("[data-service-tabs]"),
    marker = $(".service-switch-marker");
  let current = -1,
    animations = [],
    revision = 0,
    pill;
  root.classList.add("is-enhanced");
  tablist.hidden = false;
  stablePanelHeight(root, panels, "service");
  function position() {
    const tab = tabs[current];
    if (!tab) return;
    pill?.stop();
    const props = {
      left: tab.offsetLeft + "px",
      width: tab.offsetWidth + "px",
    };
    pill = animate(marker, props, { duration: 0.36 });
    if (!pill) Object.assign(marker.style, props);
  }
  selectSignatureService = (value, moving = true, syncIntent = true) => {
    const next = value === "sell" ? 1 : 0;
    if (current === next && moving) return;
    const ticket = ++revision;
    animations.forEach((a) => a?.stop());
    animations = [];
    const old = panels[current],
      incoming = panels[next],
      direction = next > current ? 1 : -1;
    current = next;
    panels.forEach((p, i) => {
      p.classList.toggle("is-active", i === next);
      p.classList.remove("is-leaving");
      p.inert = i !== next;
      p.setAttribute("aria-hidden", String(i !== next));
      if (p !== old) clearSceneStyles(p);
    });
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === next));
      tab.tabIndex = i === next ? 0 : -1;
    });
    position();
    const option = $(
      'input[name=intent][value="' + (next ? "Продать" : "Купить") + '"]',
    );
    if (option && syncIntent) option.checked = true;
    if (!moving || !old || reducedMotion.matches) {
      panels.forEach(clearSceneStyles);
      return;
    }
    old.classList.add("is-leaving");
    old.style.zIndex = "2";
    incoming.style.zIndex = "1";
    const leave = animate(
      old,
      {
        opacity: 0,
        transform: "translateY(-22px) scale(.96) rotateX(5deg)",
      },
      { duration: 0.4 },
    );
    const enter = animate(
      incoming,
      {
        opacity: [0.4, 1],
        transform: [
          "translateY(35px) scale(.97) rotateX(-4deg)",
          "translateY(0) scale(1) rotateX(0)",
        ],
      },
      { duration: 0.6 },
    );
    animations.push(
      leave,
      enter,
      animate(
        $(".service-art", incoming),
        {
          transform: [
            "translateY(25px) rotate(4deg)",
            "translateY(0) rotate(0)",
          ],
        },
        { duration: 0.75 },
      ),
    );
    const finish = () => {
      if (ticket !== revision) return;
      old.classList.remove("is-leaving");
      clearSceneStyles(old);
      clearSceneStyles(incoming);
    };
    if (enter) enter.then(finish);
    else finish();
  };
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      selectSignatureService(tab.dataset.serviceTab);
      history.replaceState(null, "", "#" + tab.dataset.serviceTab);
    }),
  );
  tablist.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const value = ["ArrowRight", "End"].includes(event.key) ? "sell" : "buy";
    selectSignatureService(value);
    tabs[value === "sell" ? 1 : 0].focus();
    history.replaceState(null, "", "#" + value);
  });
  const selling =
    location.hash === "#sell" ||
    new URLSearchParams(location.search).get("intent") === "Продать";
  selectSignatureService(selling ? "sell" : "buy", false, false);
  addEventListener("resize", position);
  document.fonts.ready.then(position);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches)
      selectSignatureService(current ? "sell" : "buy", false, false);
  });
}
function initWorkflowAlbum() {
  const stage = $("[data-album]");
  if (!stage) return;
  const pages = $$("[data-album-page]", stage),
    tabs = $$("[data-album-tab]"),
    prev = $("[data-album-prev]"),
    next = $("[data-album-next]"),
    counter = $("[data-album-current]");
  let current = -1,
    animations = [],
    revision = 0,
    touch;
  stage.classList.add("is-enhanced");
  $("[data-album-controls]").hidden = false;
  stablePanelHeight(stage, pages, "album");
  function show(index, moving = true) {
    index = Math.max(0, Math.min(pages.length - 1, index));
    if (index === current && moving) return;
    const ticket = ++revision;
    animations.forEach((a) => a?.stop());
    animations = [];
    const old = pages[current],
      incoming = pages[index],
      direction = index > current ? 1 : -1;
    current = index;
    pages.forEach((p, i) => {
      p.classList.toggle("is-active", i === index);
      p.classList.remove("is-leaving");
      p.inert = i !== index;
      p.setAttribute("aria-hidden", String(i !== index));
      if (p !== old) clearSceneStyles(p);
    });
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-pressed", String(i === index));
      if (i === index) tab.setAttribute("aria-current", "step");
      else tab.removeAttribute("aria-current");
    });
    prev.disabled = index === 0;
    next.disabled = index === pages.length - 1;
    counter.textContent = String(index + 1).padStart(2, "0");
    if (!moving || !old || reducedMotion.matches) {
      pages.forEach(clearSceneStyles);
      return;
    }
    old.classList.add("is-leaving");
    old.style.zIndex = "3";
    incoming.style.zIndex = "2";
    animations.push(
      animate(
        old,
        {
          transform:
            "translateX(" +
            -direction * 65 +
            "px) rotateY(" +
            -direction * 7 +
            "deg) scale(.97)",
          opacity: 0,
        },
        { duration: 0.46 },
      ),
    );
    const enter = animate(
      incoming,
      {
        transform: [
          "translateX(" +
            direction * 95 +
            "px) rotateY(" +
            direction * 8 +
            "deg) scale(.97)",
          "translateY(0) scale(1)",
        ],
        opacity: [0.35, 1],
      },
      { duration: 0.62 },
    );
    animations.push(
      enter,
      animate(
        $(".album-page-copy", incoming),
        {
          transform: ["translateY(" + direction * 18 + "px)", "translateY(0)"],
        },
        { duration: 0.65 },
      ),
    );
    const finish = () => {
      if (ticket !== revision) return;
      old.classList.remove("is-leaving");
      clearSceneStyles(old);
      clearSceneStyles(incoming);
    };
    if (enter) enter.then(finish);
    else finish();
  }
  prev.addEventListener("click", () => show(current - 1));
  next.addEventListener("click", () => show(current + 1));
  tabs.forEach((tab, i) => tab.addEventListener("click", () => show(i)));
  stage.addEventListener("keydown", (event) => {
    const map = {
      ArrowDown: current + 1,
      ArrowRight: current + 1,
      ArrowUp: current - 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: 3,
    };
    if (Object.hasOwn(map, event.key)) {
      event.preventDefault();
      show(map[event.key]);
    }
  });
  stage.addEventListener("pointerdown", (event) => {
    if (event.isPrimary)
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener("pointerup", (event) => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x,
      dy = event.clientY - touch.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3)
      show(current + (dx < 0 ? 1 : -1));
    touch = null;
  });
  stage.addEventListener("pointercancel", () => (touch = null));
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) show(current, false);
  });
  show(0, false);
}
// Adapted from Motion Primitives Accordion (MIT): expanded/collapsed height and opacity states.
function initConsultationIndex() {
  const items = $$(".faq-item");
  const states = new WeakMap();
  function toggle(item, open) {
    const body = $(".faq-answer", item),
      button = $("summary", item),
      state = states.get(item) || {};
    state.animation?.stop();
    const ticket = (state.ticket || 0) + 1;
    state.ticket = ticket;
    states.set(item, state);
    const from = item.open ? body.getBoundingClientRect().height : 0;
    item.open = true;
    body.style.height = "auto";
    const height = body.scrollHeight;
    button.setAttribute("aria-expanded", String(open));
    body.inert = !open;
    const done = () => {
      if (states.get(item).ticket !== ticket) return;
      item.open = open;
      body.style.height = "";
      body.style.opacity = "";
    };
    state.animation = animate(
      body,
      {
        height: [from + "px", (open ? height : 0) + "px"],
        opacity: [open ? 0.3 : 1, open ? 1 : 0],
      },
      { duration: 0.42 },
    );
    if (state.animation) state.animation.then(done);
    else done();
  }
  items.forEach((item, i) => {
    const trigger = $("summary", item),
      body = $(".faq-answer", item);
    body.id = "faq-response-" + i;
    trigger.setAttribute("aria-controls", body.id);
    trigger.setAttribute("aria-expanded", String(item.open));
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      const open = trigger.getAttribute("aria-expanded") !== "true";
      items.forEach((other) => {
        if (other !== item && other.open) toggle(other, false);
      });
      toggle(item, open);
    });
  });
}
function initSignatureMotion(playIntro = false) {
  if (reducedMotion.matches || typeof window.Motion?.animate !== "function")
    return;
  if (playIntro && scrollY < 100 && performance.now() < 2200) {
    $$("[data-hero-lines] span").forEach((el, i) =>
      animate(
        el,
        { opacity: [0.5, 1], transform: ["translateY(22px)", "translateY(0)"] },
        { duration: 0.8, delay: i * 0.1 },
      ),
    );
    animate(
      $(".hero-gallery"),
      {
        clipPath: ["inset(0 0 8% 0)", "inset(0)"],
        transform: [
          "translateY(22px) rotate(1.5deg)",
          "translateY(0) rotate(0)",
        ],
      },
      { duration: 1 },
    );
    animate(
      $(".signature-actions"),
      { transform: ["translateY(15px)", "translateY(0)"], opacity: [0.5, 1] },
      { duration: 0.7, delay: 0.25 },
    );
  }
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        if (target.matches(".personal-layout")) {
          animate(
            $(".personal-portrait", target),
            {
              transform: [
                "translateY(30px) rotate(-5deg)",
                "translateY(0) rotate(-2deg)",
              ],
            },
            { duration: 0.85 },
          );
          animate(
            $(".personal-copy", target),
            {
              transform: ["translateX(25px)", "translateX(0)"],
              opacity: [0.6, 1],
            },
            { duration: 0.75, delay: 0.1 },
          );
        } else
          animate(
            target,
            {
              clipPath: ["inset(0 5% 0 0)", "inset(0)"],
              transform: ["translateY(14px)", "translateY(0)"],
            },
            { duration: 0.65 },
          );
        io.unobserve(target);
      }),
    { threshold: 0.2 },
  );
  $$(
    ".personal-layout,.service-heading,.album-intro,.faq-intro,.contact-heading",
  ).forEach((el) => io.observe(el));
}

function propertyCard(p) {
  const photo = p.photos[0];
  return (
    '<article class="property-card" data-property-id="' +
    escapeHTML(p.id) +
    '"><a href="property.html?id=' +
    encodeURIComponent(p.id) +
    '" aria-label="' +
    escapeHTML(p.title + ", " + money(p.price)) +
    '">' +
    '<div class="property-media">' +
    (photo
      ? '<img src="' +
        escapeHTML(photo.src) +
        '" alt="' +
        escapeHTML(photo.alt) +
        '" width="800" height="600" loading="lazy">'
      : "") +
    '<span class="property-status">' +
    statusLabels[p.status] +
    '</span></div><div class="property-body"><p class="property-meta">' +
    escapeHTML(p.type) +
    (p.area
      ? " · " + escapeHTML(measure(p.area)) + " м²"
      : p.landArea
        ? " · " + escapeHTML(measure(p.landArea)) + " сот."
        : "") +
    "</p>" +
    "<h3>" +
    escapeHTML(p.title) +
    '</h3><p class="property-location">' +
    escapeHTML([p.city, p.district].filter(Boolean).join(", ")) +
    "</p>" +
    '<div class="property-card-bottom"><span class="property-price">' +
    money(p.price) +
    "</span>" +
    '<span class="property-more">Подробнее' +
    arrow +
    "</span>" +
    "</div></div></a></article>"
  );
}
function initCardTransitions(root) {
  $$(".property-card a", root).forEach((a) => {
    a.addEventListener("click", (e) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.button !== 0 ||
        reducedMotion.matches
      )
        return;
      $$('[style*="view-transition-name"]').forEach(
        (el) => (el.style.viewTransitionName = ""),
      );
      const img = $("img", a);
      if (img) img.style.viewTransitionName = "property-photo";
      try {
        sessionStorage.setItem(
          "ilsiyarViewedProperty",
          a.closest("[data-property-id]").dataset.propertyId,
        );
      } catch {}
    });
  });
}
const CATEGORIES = Object.freeze({
  apartment: {
    label: "Квартиры",
    types: ["квартира", "квартиры", "apartment"],
  },
  newbuild: { label: "Новостройки", types: [] },
  house: { label: "Дома", types: ["дом", "дома", "таунхаус", "house"] },
  land: { label: "Участки", types: ["участок", "земельный участок", "land"] },
  commercial: {
    label: "Коммерция",
    types: [
      "коммерческая недвижимость",
      "коммерция",
      "офис",
      "помещение",
      "commercial",
    ],
  },
  storage: {
    label: "Парковки и кладовые",
    types: [
      "парковка",
      "машиноместо",
      "парковочное место",
      "кладовая",
      "гараж",
      "storage",
    ],
  },
});
let inquiryCategory = Object.hasOwn(
  CATEGORIES,
  new URLSearchParams(location.search).get("category") || "",
)
  ? new URLSearchParams(location.search).get("category")
  : null;
function matchesCategory(p, key) {
  if (!key) return true;
  if (key === "newbuild")
    return p.market === "newbuild" || p.isNewBuild === true;
  return (
    p.category === key ||
    CATEGORIES[key].types.includes(p.type.toLocaleLowerCase("ru").trim())
  );
}
function moveCategoryPill(nav, link) {
  const pill = $(".category-indicator", nav);
  if (!pill || !link) {
    if (pill) pill.style.opacity = "0";
    return;
  }
  pill._animation?.stop();
  const props = {
    left: link.offsetLeft + "px",
    top: link.offsetTop + "px",
    width: link.offsetWidth + "px",
    height: link.offsetHeight + "px",
    opacity: 1,
  };
  pill._animation = animate(pill, props, { duration: 0.34 });
  if (!pill._animation) Object.assign(pill.style, props);
}
let refreshCatalogView = null;
function initCatalog(properties) {
  if (refreshCatalogView) {
    refreshCatalogView(properties);
    return;
  }
  const featured = $("[data-featured]");
  if (featured) {
    const selected = [
      ...properties.filter((p) => p.featured && p.status !== "sold"),
      ...properties.filter((p) => !p.featured && p.status !== "sold"),
    ].slice(0, 3);
    if (selected.length) {
      featured.innerHTML =
        '<div class="property-grid">' +
        selected.map(propertyCard).join("") +
        "</div>";
      initCardTransitions(featured);
    }
  }
  const grid = $("[data-catalog-grid]"),
    filters = $("[data-catalog-filters]");
  if (!grid || !filters) return;
  const empty = $("[data-empty]"),
    sort = $("[data-sort]"),
    nav = $("[data-category-nav]"),
    links = $$("[data-category]", nav);
  let category = "",
    scheduled;
  [...new Set(properties.map((p) => p.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .forEach((city) => filters.elements.city.add(new Option(city, city)));
  function restore() {
    const q = new URLSearchParams(location.search);
    category = Object.hasOwn(CATEGORIES, q.get("category") || "")
      ? q.get("category")
      : "";
    filters.elements.query.value = q.get("q") || "";
    filters.elements.city.value = q.get("city") || "";
    const price = Number(q.get("price"));
    filters.elements.price.value =
      price > 0 && Number.isFinite(price) ? price : "";
    sort.value = ["price-asc", "price-desc"].includes(q.get("sort"))
      ? q.get("sort")
      : "default";
  }
  function writeURL(mode) {
    const url = new URL(location.href),
      v = Object.fromEntries(new FormData(filters));
    const params = {
      category,
      q: v.query.trim(),
      city: v.city,
      price: v.price,
      sort: sort.value === "default" ? "" : sort.value,
    };
    Object.entries(params).forEach(([k, value]) =>
      value ? url.searchParams.set(k, value) : url.searchParams.delete(k),
    );
    if (url.href !== location.href)
      history[mode === "replace" ? "replaceState" : "pushState"](null, "", url);
  }
  function render(mode) {
    if (mode) writeURL(mode);
    links.forEach((l) =>
      l.setAttribute("aria-current", String(l.dataset.category === category)),
    );
    moveCategoryPill(
      nav,
      links.find((l) => l.dataset.category === category),
    );
    const v = Object.fromEntries(new FormData(filters)),
      query = v.query.trim().toLocaleLowerCase("ru");
    let result = properties.filter(
      (p) =>
        matchesCategory(p, category) &&
        (!query ||
          [p.title, p.city, p.district, p.type]
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(query)) &&
        (!v.city || p.city === v.city) &&
        (!v.price || (Number.isFinite(p.price) && p.price <= Number(v.price))),
    );
    if (sort.value === "price-asc")
      result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    else if (sort.value === "price-desc")
      result.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    else
      result.sort(
        (a, b) =>
          ["active", "reserved", "sold"].indexOf(a.status) -
          ["active", "reserved", "sold"].indexOf(b.status),
      );
    const positions = new Map(
      $$("[data-property-id]", grid).map((el) => [
        el.dataset.propertyId,
        el.getBoundingClientRect(),
      ]),
    );
    grid.innerHTML = result.map(propertyCard).join("");
    $("[data-result-count]").textContent =
      (category ? CATEGORIES[category].label + " · " : "") +
      "Найдено объектов: " +
      result.length;
    empty.hidden = result.length > 0;
    $(".empty-copy h3", empty).textContent =
      "По выбранным условиям пока нет опубликованных объектов";
    $(".empty-copy p:not(.section-kicker)", empty).textContent = category
      ? "Категория «" +
        CATEGORIES[category].label +
        "». Измените условия или обсудите подбор с Ильсияр."
      : "Измените условия или расскажите Ильсияр, какой объект вы ищете.";
    $("[data-category-inquiry]", empty).href =
      "index.html?intent=" +
      encodeURIComponent("Купить") +
      (category ? "&category=" + category : "") +
      "#contact-form";
    $$("[data-property-id]", grid).forEach((el) => {
      const old = positions.get(el.dataset.propertyId),
        rect = el.getBoundingClientRect();
      const reflow = animate(
        el,
        {
          opacity: [old ? 0.7 : 0, 1],
          transform: [
            old
              ? "translate(" +
                (old.left - rect.left) +
                "px," +
                (old.top - rect.top) +
                "px)"
              : "translateY(20px)",
            "translate(0,0)",
          ],
        },
        { duration: 0.4 },
      );
      reflow?.then(() =>
        requestAnimationFrame(() => {
          el.style.transform = "";
          el.style.opacity = "";
        }),
      );
    });
    initCardTransitions(grid);
  }
  links.forEach((link) =>
    link.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      clearTimeout(scheduled);
      category = link.dataset.category;
      render("push");
    }),
  );
  filters.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(scheduled);
    render("push");
  });
  filters.addEventListener("input", (e) => {
    if (e.target.tagName === "SELECT") return;
    clearTimeout(scheduled);
    scheduled = setTimeout(() => render("replace"), 200);
  });
  filters.addEventListener("change", (event) => {
    // Text/price input is already debounced. Replacing a card on field blur
    // would remove the pointer target before its click can navigate.
    if (event.target.tagName !== "SELECT") return;
    clearTimeout(scheduled);
    render("push");
  });
  filters.addEventListener("reset", () => {
    clearTimeout(scheduled);
    category = "";
    sort.value = "default";
    requestAnimationFrame(() => render("push"));
  });
  $("[data-reset-filters]")?.addEventListener("click", () => filters.reset());
  sort.addEventListener("change", () => render("push"));
  addEventListener("popstate", () => {
    clearTimeout(scheduled);
    restore();
    render();
  });
  addEventListener("resize", () =>
    moveCategoryPill(
      nav,
      links.find((l) => l.dataset.category === category),
    ),
  );
  refreshCatalogView = (next) => {
    properties = next;
    const selectedCity = filters.elements.city.value;
    filters.elements.city.length = 1;
    [...new Set(properties.map((p) => p.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ru"))
      .forEach((city) => filters.elements.city.add(new Option(city, city)));
    filters.elements.city.value = selectedCity;
    render();
  };
  restore();
  render();
  document.fonts.ready.then(() =>
    moveCategoryPill(
      nav,
      links.find((l) => l.dataset.category === category),
    ),
  );
}
let propertyMissingMarkup = null;
let renderedProperty = "";
function initProperty(properties) {
  const target = $("[data-property-detail]");
  if (!target) return;
  propertyMissingMarkup ??= target.innerHTML;
  const id = new URLSearchParams(location.search).get("id"),
    p = properties.find((p) => p.id === id);
  if (!p) {
    target.innerHTML = propertyMissingMarkup;
    renderedProperty = "";
    return;
  }
  const signature = JSON.stringify(p);
  if (signature === renderedProperty) return;
  renderedProperty = signature;
  document.title = p.title + " — " + p.city + " | Норма";
  $("link[rel=canonical]").href =
    "https://ilsiyar.ru/property.html?id=" + encodeURIComponent(p.id);
  $('meta[property="og:title"]').content = document.title;
  $('meta[property="og:url"]').content = $("link[rel=canonical]").href;
  if (p.photos[0]) $('meta[property="og:image"]').content = p.photos[0].src;
  const crumb = $("[data-property-crumb]");
  crumb.textContent = "/ " + p.title;
  crumb.hidden = false;
  const photos = p.photos;
  const specs = [
    ["Тип", p.type],
    ["Площадь", p.area ? measure(p.area) + " м²" : null],
    ["Комнаты", p.rooms],
    ["Этаж", p.floor],
    ["Участок", p.landArea ? measure(p.landArea) + " сот." : null],
    ["Статус", statusLabels[p.status]],
  ].filter(([, v]) => v != null && v !== "");
  target.innerHTML =
    '<header class="property-heading"><div><p class="section-kicker">' +
    escapeHTML(p.type) +
    " · " +
    statusLabels[p.status] +
    "</p><h1>" +
    escapeHTML(p.title) +
    '</h1><p class="property-location">' +
    escapeHTML([p.city, p.district, p.address].filter(Boolean).join(", ")) +
    '</p></div><p class="property-price">' +
    money(p.price) +
    "</p></header>" +
    (photos.length
      ? '<div class="property-gallery"><div class="gallery-main"><img data-gallery-image src="' +
        escapeHTML(photos[0].src) +
        '" alt="' +
        escapeHTML(photos[0].alt) +
        '" width="1200" height="800" fetchpriority="high" style="view-transition-name:property-photo">' +
        (photos.length > 1
          ? '<div class="gallery-controls"><button class="icon-button" type="button" data-gallery-prev aria-label="Предыдущее фото">' +
            arrow +
            '</button><span class="gallery-counter" data-gallery-counter aria-live="polite">1 / ' +
            photos.length +
            '</span><button class="icon-button" type="button" data-gallery-next aria-label="Следующее фото">' +
            arrow +
            "</button></div>"
          : "") +
        "</div>" +
        (photos.length > 1
          ? '<div class="gallery-thumbs" aria-label="Фотографии объекта">' +
            photos
              .map(
                (img, i) =>
                  '<button class="gallery-thumb" data-photo-index="' +
                  i +
                  '" type="button" aria-label="Фото ' +
                  (i + 1) +
                  '" aria-current="' +
                  (i === 0) +
                  '"><img src="' +
                  escapeHTML(img.src) +
                  '" alt="" width="150" height="100" loading="lazy"></button>',
              )
              .join("") +
            "</div>"
          : "") +
        "</div>"
      : "") +
    '<div class="property-info"><div><dl class="property-specs">' +
    specs
      .map(
        ([k, v]) =>
          "<div><dt>" +
          escapeHTML(k) +
          "</dt><dd>" +
          escapeHTML(v) +
          "</dd></div>",
      )
      .join("") +
    '</dl><h2>Об объекте</h2><p class="property-description">' +
    escapeHTML(
      p.description || "Подробности об объекте можно уточнить у Ильсияр.",
    ) +
    "</p></div>" +
    '<aside class="property-advisor"><div class="advisor-head"><img src="' +
    SITE_CONFIG.portrait +
    '" alt="Ильсияр Тухватшина" width="64" height="64"><div><strong>Ильсияр Тухватшина</strong><span>Эксперт по недвижимости · АН «Норма»</span></div></div>' +
    '<a class="button button-dark" href="index.html?property=' +
    encodeURIComponent(p.id) +
    '&intent=Купить#contact-form">' +
    (p.status === "sold"
      ? "Подобрать похожий объект"
      : "Обсудить этот объект") +
    arrow +
    '</a><a href="' +
    SITE_CONFIG.phone +
    '">8 937 484-85-65</a></aside></div>';
  const main = $(".gallery-main");
  if (!main || photos.length < 2) return;
  main.tabIndex = 0;
  main.setAttribute("role", "region");
  main.setAttribute(
    "aria-label",
    "Галерея объекта. Стрелки влево и вправо меняют фото.",
  );
  main.style.touchAction = "pan-y";
  let index = 0,
    touchX = null;
  function show(i) {
    index = (i + photos.length) % photos.length;
    const image = $("[data-gallery-image]");
    image.src = photos[index].src;
    image.alt = photos[index].alt;
    $("[data-gallery-counter]").textContent = index + 1 + " / " + photos.length;
    $$(".gallery-thumb").forEach((b, i) =>
      b.setAttribute("aria-current", String(i === index)),
    );
    animate(image, { opacity: [0.6, 1] }, { duration: 0.3 });
  }
  $("[data-gallery-prev]").addEventListener("click", () => show(index - 1));
  $("[data-gallery-next]").addEventListener("click", () => show(index + 1));
  $$(".gallery-thumb").forEach((b) =>
    b.addEventListener("click", () => show(Number(b.dataset.photoIndex))),
  );
  main.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      show(index + (e.key === "ArrowRight" ? 1 : -1));
    }
  });
  main.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].clientX;
    },
    { passive: true },
  );
  main.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - touchX;
      if (touchX !== null && Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    },
    { passive: true },
  );
}
function initReviews(reviews) {
  if (!reviews.length) return;
  $$("[data-review-link]").forEach((el) => {
    el.hidden = false;
  });
  const section = $("[data-reviews]");
  if (!section) return;
  section.hidden = false;
  $("[data-review-list]").innerHTML = reviews
    .map(
      (r) =>
        '<article class="review-card">' +
        (safeImage(r.image)
          ? '<img src="' +
            escapeHTML(safeImage(r.image)) +
            '" alt="Отзыв: ' +
            escapeHTML(r.name) +
            '" loading="lazy">'
          : "") +
        (r.text ? "<blockquote>" + escapeHTML(r.text) + "</blockquote>" : "") +
        "<p>" +
        escapeHTML(r.name) +
        "</p><small>" +
        escapeHTML(r.transaction || "") +
        "</small></article>",
    )
    .join("");
  if (reviews.length > 2) {
    const list = $("[data-review-list]");
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Отзывы. Прокручивайте горизонтально.");
    const controls = document.createElement("div");
    controls.className = "slider-controls";
    controls.innerHTML =
      '<button class="icon-button" type="button" aria-label="Предыдущие отзывы" style="transform:rotate(180deg)">' +
      arrow +
      '</button><button class="icon-button" type="button" aria-label="Следующие отзывы">' +
      arrow +
      "</button>";
    $("header", section).append(controls);
    $$("button", controls).forEach((b, i) =>
      b.addEventListener("click", () =>
        list.scrollBy({
          left: (i ? 1 : -1) * list.clientWidth,
          behavior: reducedMotion.matches ? "instant" : "smooth",
        }),
      ),
    );
  }
}
let catalogRefreshing = false;
async function loadPublicContent() {
  if (catalogRefreshing) return;
  catalogRefreshing = true;
  try {
    const { properties, reviews } = await getCatalog();
    initCatalog(properties);
    initProperty(properties);
    initReviews(reviews);
    const requested = new URLSearchParams(location.search).get("property");
    if (requested && $("[data-lead-form]")) {
      const p = properties.find((p) => p.id === requested);
      if (p) {
        inquiryProperty = p;
        updateInquiryContext();
      } else {
        setFormStatus(
          "notice",
          "Предложение больше не опубликовано",
          "Опишите запрос — Ильсияр поможет уточнить наличие или подобрать альтернативу.",
        );
      }
    }
  } catch {
    if (window.IlsiyarCMS?.enabled) {
      if ($("[data-catalog-grid]")) $("[data-catalog-grid]").innerHTML = "";
      if ($("[data-property-detail]") && propertyMissingMarkup) {
        $("[data-property-detail]").innerHTML = propertyMissingMarkup;
        renderedProperty = "";
      }
      if ($("[data-empty]")) $("[data-empty]").hidden = false;
    }
    const empty = $("[data-empty]");
    if (empty) {
      $(".empty-copy h3", empty).textContent = "Каталог временно недоступен.";
      $(".empty-copy p:not(.section-kicker)", empty).textContent =
        "Попробуйте обновить страницу или обсудите подбор напрямую с Ильсияр.";
    }
    if ($("[data-property-detail]"))
      $(".property-missing p:not(.section-kicker)").textContent =
        "Не удалось загрузить сведения. Обновите страницу или свяжитесь с Ильсияр по телефону 8 937 484-85-65.";
    if (
      new URLSearchParams(location.search).has("property") &&
      $("[data-lead-form]")
    ) {
      setFormStatus(
        "notice",
        "Не удалось загрузить выбранный объект",
        "Укажите название объекта в комментарии или свяжитесь с Ильсияр напрямую.",
      );
    }
  } finally {
    catalogRefreshing = false;
  }
}
function initIntentLinks() {
  updateInquiryContext();
  $("[data-clear-context]")?.addEventListener("click", () => {
    inquiryCategory = null;
    inquiryProperty = null;
    inquiryPropertyId = null;
    updateInquiryContext();
  });
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-intent]");
    if (!link || !link.getAttribute("href").startsWith("#")) return;
    const option = $$("input[name=intent]").find(
      (el) => el.value === link.dataset.intent,
    );
    if (option) option.checked = true;
  });
  const intent = new URLSearchParams(location.search).get("intent");
  const option = $$("input[name=intent]").find((el) => el.value === intent);
  if (option) option.checked = true;
}
function propertyContext() {
  return (
    (inquiryCategory
      ? "Категория подбора: " + CATEGORIES[inquiryCategory].label + "\n\n"
      : "") + objectContext()
  );
}
function updateInquiryContext() {
  const box = $("[data-inquiry-context]");
  if (!box) return;
  const parts = [];
  if (inquiryCategory)
    parts.push("Подбор: " + CATEGORIES[inquiryCategory].label);
  if (inquiryProperty)
    parts.push(
      "Объект: " + inquiryProperty.title + " · " + inquiryProperty.city,
    );
  box.hidden = !parts.length;
  $("p", box).textContent = parts.join(". ");
  $("[name=comment]").maxLength = Math.max(0, 1000 - propertyContext().length);
}

function objectContext() {
  if (!inquiryProperty && inquiryPropertyId)
    return (
      "Объект ID: " +
      inquiryPropertyId +
      "\nhttps://ilsiyar.ru/property.html?id=" +
      encodeURIComponent(inquiryPropertyId) +
      "\n\n"
    );
  if (!inquiryProperty) return "";
  return (
    "Объект: " +
    inquiryProperty.title +
    " (" +
    inquiryProperty.id +
    "), " +
    inquiryProperty.city +
    "\nhttps://ilsiyar.ru/property.html?id=" +
    encodeURIComponent(inquiryProperty.id) +
    "\n\n"
  );
}
function setFormStatus(state = "", title = "", message = "", reference = "") {
  const box = $("[data-form-status]");
  if (!box) return;
  box.replaceChildren();
  delete box.dataset.state;
  if (!title) return;
  box.dataset.state = state;
  const strong = document.createElement("strong"),
    text = document.createElement("span");
  strong.textContent = title;
  text.textContent = message;
  box.append(strong, text);
  if (/^[a-f0-9-]{36}$/i.test(reference)) {
    const code = document.createElement("span");
    code.className = "form-reference";
    code.textContent = "Код заявки: " + reference;
    box.append(code);
  }
  if (state === "error" || state === "notice") {
    const link = document.createElement("a");
    link.href = SITE_CONFIG.max;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Написать Ильсияр в MAX";
    box.append(link);
  }
}
function lastSuccess() {
  try {
    return Math.max(
      lastSuccessInMemory,
      Number(sessionStorage.getItem("ilsiyarLeadSentAt")) || 0,
    );
  } catch {
    return lastSuccessInMemory;
  }
}
function buildLeadPayload(data) {
  return {
    name: String(data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    city: String(data.city || "").trim(),
    requestType: String(data.intent || ""),
    comment: propertyContext() + String(data.comment || "").trim(),
    source: "ilsiyar-website",
    consent: data.consent === "on",
    website: String(data.contact_guard || data.website || "").trim(),
  };
}
const LEAD_ATTEMPT_KEY = "ilsiyarLeadAttempt";
let leadAttemptInMemory = null;
function readLeadAttempt() {
  let attempt = leadAttemptInMemory;
  try {
    attempt ||= JSON.parse(sessionStorage.getItem(LEAD_ATTEMPT_KEY));
  } catch {}
  if (
    !attempt ||
    !/^[a-f0-9-]{36}$/i.test(attempt.id) ||
    !["sending", "unknown"].includes(attempt.state) ||
    Date.now() - attempt.at > 86400000
  )
    return null;
  return attempt;
}
function saveLeadAttempt(attempt) {
  leadAttemptInMemory = attempt;
  try {
    if (attempt)
      sessionStorage.setItem(LEAD_ATTEMPT_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(LEAD_ATTEMPT_KEY);
  } catch {}
}
function newLeadId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}
async function sendLead(payload, leadId) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(SITE_CONFIG.formEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": leadId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    const correlated = result.leadId === leadId;
    if (
      !response.ok ||
      result.ok !== true ||
      result.delivery !== "accepted" ||
      !correlated
    ) {
      const error = new Error("Lead not confirmed");
      error.status = response.status;
      error.code = result.code;
      error.uncertain = !(correlated && result.delivery === "not_sent");
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
function initLeadForm() {
  const form = $("[data-lead-form]");
  if (!form) return;
  const button = $("button[type=submit]", form),
    original = button.innerHTML,
    status = $("[data-form-status]");
  button.disabled = false;
  form.elements.comment.maxLength = Math.max(
    0,
    1000 - propertyContext().length,
  );
  let submitting = false;
  const markup = /<\s*\/?\s*[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html/i;
  form.addEventListener("input", (e) => {
    if (e.target.setCustomValidity) e.target.setCustomValidity("");
    e.target.removeAttribute("aria-invalid");
    e.target.classList.remove("is-invalid");
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormStatus();
    const values = Object.fromEntries(new FormData(form)),
      payload = buildLeadPayload(values);
    ["name", "city", "comment", "phone"].forEach((name) => {
      const field = form.elements[name],
        value = String(values[name] || "").trim();
      field.setCustomValidity("");
      if (field.required && value.length < 2)
        field.setCustomValidity("Заполните поле — минимум 2 символа.");
      else if (value.length > field.maxLength)
        field.setCustomValidity(
          "Сократите текст до " + field.maxLength + " символов.",
        );
      else if (markup.test(value))
        field.setCustomValidity("Введите обычный текст без HTML и скриптов.");
    });
    const phone = form.elements.phone,
      digits = payload.phone.replace(/\D/g, "");
    if (
      !/^[+\d\s().-]+$/.test(payload.phone) ||
      digits.length < 10 ||
      digits.length > 15
    )
      phone.setCustomValidity("Введите номер телефона: от 10 до 15 цифр.");
    $$("input,textarea", form).forEach((el) => {
      el.classList.toggle("is-invalid", !el.checkValidity());
      if (!el.checkValidity()) el.setAttribute("aria-invalid", "true");
    });
    if (!form.checkValidity()) {
      setFormStatus(
        "error",
        "Проверьте поля формы",
        "Укажите имя, телефон, город, тип задачи и согласие на обработку данных.",
      );
      form.reportValidity();
      return;
    }
    if (payload.website) {
      setFormStatus(
        "error",
        "Не удалось отправить форму",
        "Проверка формы не пройдена. Обновите страницу и заполните поля вручную или свяжитесь с Ильсияр напрямую.",
      );
      status.focus({ preventScroll: true });
      status.scrollIntoView({ block: "nearest" });
      return;
    }
    const unresolved = readLeadAttempt();
    if (unresolved) {
      setFormStatus(
        "notice",
        "Результат предыдущей отправки не подтверждён",
        "Заявка могла поступить. Перед повторной отправкой уточните это у Ильсияр, назвав код заявки.",
        unresolved.id,
      );
      status.focus({ preventScroll: true });
      status.scrollIntoView({ block: "nearest" });
      return;
    }
    const remaining = 60000 - (Date.now() - lastSuccess());
    if (remaining > 0) {
      setFormStatus(
        "notice",
        "Повторная заявка не отправлена",
        "После предыдущей отправки подождите ещё " +
          Math.ceil(remaining / 1000) +
          " сек. Или свяжитесь с Ильсияр напрямую.",
      );
      status.focus({ preventScroll: true });
      return;
    }
    const attempt = { id: newLeadId(), state: "sending", at: Date.now() };
    saveLeadAttempt(attempt);
    submitting = true;
    button.disabled = true;
    button.textContent = "Отправляем…";
    form.setAttribute("aria-busy", "true");
    const waiting = setTimeout(() => {
      setFormStatus(
        "notice",
        "Сервер отвечает дольше обычного",
        "Отправка ещё выполняется. Пожалуйста, дождитесь результата; повторно нажимать кнопку не нужно.",
        attempt.id,
      );
    }, 9000);
    try {
      const receipt = await sendLead(payload, attempt.id);
      clearTimeout(waiting);
      saveLeadAttempt(null);
      lastSuccessInMemory = Date.now();
      try {
        sessionStorage.setItem(
          "ilsiyarLeadSentAt",
          String(lastSuccessInMemory),
        );
      } catch {}
      setFormStatus(
        receipt.duplicate ? "notice" : "success",
        receipt.duplicate ? "Эта заявка уже передана" : "Заявка отправлена",
        receipt.duplicate
          ? "Telegram ранее подтвердил отправку этой заявки. Повторное сообщение не отправлялось."
          : "Ильсияр получила ваше обращение и свяжется с вами.",
        attempt.id,
      );
      form.reset();
      inquiryProperty = null;
      inquiryPropertyId = null;
      inquiryCategory = null;
      $("[data-inquiry-context]").hidden = true;
      form.elements.comment.maxLength = 1000;
    } catch (error) {
      clearTimeout(waiting);
      const uncertain = error.uncertain !== false;
      if (uncertain) {
        saveLeadAttempt({ ...attempt, state: "unknown" });
        setFormStatus(
          "error",
          "Не удалось подтвердить отправку",
          "Ответ сервера не подтверждён. Заявка могла поступить. Уточните это у Ильсияр перед повторной отправкой, назвав код заявки.",
          attempt.id,
        );
      } else {
        saveLeadAttempt(null);
        if (error.status === 429)
          setFormStatus(
            "notice",
            "Повторная заявка не отправлена",
            "Сервис ограничил частые обращения. Подождите немного или напишите Ильсияр напрямую.",
            attempt.id,
          );
        else if (["invalid_fields", "form_check_failed"].includes(error.code))
          setFormStatus(
            "error",
            "Проверьте форму",
            "Проверка формы не пройдена. Проверьте поля или обновите страницу. Можно связаться с Ильсияр напрямую.",
            attempt.id,
          );
        else
          setFormStatus(
            "error",
            "Не удалось отправить заявку",
            "Попробуйте ещё раз или свяжитесь с Ильсияр напрямую.",
            attempt.id,
          );
      }
    } finally {
      clearTimeout(waiting);
      submitting = false;
      button.disabled = false;
      button.innerHTML = original;
      form.removeAttribute("aria-busy");
      status.focus({ preventScroll: true });
      status.scrollIntoView({
        behavior: reducedMotion.matches ? "instant" : "smooth",
        block: "nearest",
      });
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  applyConfig();
  initIntentLinks();
  initLeadForm();
  initHeader();
  initCategoryInquiries();
  initArcCarousel();
  initServiceScenes();
  initWorkflowAlbum();
  initConsultationIndex();
  initAnchors();
  if (typeof window.Motion?.animate === "function") initSignatureMotion(true);
  else
    $("#motion-library")?.addEventListener(
      "load",
      () => initSignatureMotion(true),
      { once: true },
    );
  loadPublicContent();
  if (window.IlsiyarCMS?.enabled && !window.IlsiyarCMS.isPreview) {
    const refresh = () => {
      if (document.hidden || catalogRefreshing) return;
      // Category images can refresh without touching a visitor's filled lead form.
      if (document.body.dataset.page === "home") {
        window.IlsiyarCMS.load().catch(() => {});
        return;
      }
      catalogPromise = null;
      loadPublicContent();
    };
    addEventListener("focus", refresh);
    addEventListener("pageshow", (event) => {
      if (event.persisted) refresh();
    });
    setInterval(refresh, 45000);
  }
});
