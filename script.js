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
  // Current files live on the same origin; an authenticated CMS can publish here later.
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
    catalogPromise = fetch(SITE_CONFIG.catalogUrl, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("Catalog unavailable");
        return r.json();
      })
      .then((data) => {
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
  function setMenu(open, restore = false) {
    const revision = ++menuRevision;
    menuAnimation?.stop();
    const from = menu.hidden ? 0 : menu.getBoundingClientRect().height;
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
    if (!link || !nav.getClientRects().length) {
      pill.style.opacity = "0";
      return;
    }
    const props = {
      left: link.offsetLeft + "px",
      width: link.offsetWidth + "px",
      opacity: 1,
    };
    pillAnimation = animate(pill, props, { duration: 0.36 });
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
        if (
          ["buy", "sell"].includes(id) &&
          id !== $(".service-tabs [aria-selected=true]")?.dataset.serviceTab
        )
          return;
        const target = document.getElementById(
          ["buy", "sell"].includes(id) ? "services" : id,
        );
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
  document.addEventListener("servicechange", update);
  document.fonts.ready.then(() => movePill(activeLink));
  update();
}

function initReveals() {
  if (reducedMotion.matches || typeof window.Motion?.animate !== "function")
    return;
  $$("[data-hero]").forEach((el, i) =>
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0)"] },
      { delay: i * 0.075, duration: 0.7 },
    ),
  );
  animate(
    $("[data-hero-image]"),
    {
      opacity: [0.2, 1],
      transform: ["translateY(20px) scale(.97)", "translateY(0) scale(1)"],
      clipPath: ["inset(0 0 14% 0 round 32px)", "inset(0 0 0% 0 round 32px)"],
    },
    { duration: 0.95, delay: 0.06 },
  );
  animate(
    $(".hero-plane"),
    { transform: ["translateX(28px)", "translateX(0)"], opacity: [0.45, 1] },
    { duration: 0.9 },
  );
  animate(
    $(".portrait-caption"),
    { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
    { duration: 0.45, delay: 0.45 },
  );
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        if (target.hasAttribute("data-reveal-group")) {
          $$("[data-reveal-child]", target).forEach((child, i) =>
            animate(
              child,
              {
                opacity: [0.2, 1],
                transform: [
                  i ? "translateY(24px)" : "translateX(-24px)",
                  "translate(0,0)",
                ],
              },
              { duration: 0.6, delay: i * 0.09 },
            ),
          );
        } else
          animate(
            target,
            {
              opacity: [0.2, 1],
              transform: ["translateY(22px)", "translateY(0)"],
            },
            { duration: 0.55 },
          );
        observer.unobserve(target);
      });
    },
    { threshold: 0.16 },
  );
  $$("[data-reveal],[data-reveal-group]").forEach((el) => observer.observe(el));
}

function initWorkflow() {
  const stage = $("[data-workflow]");
  if (!stage) return;
  const panels = $$(".workflow-panel", stage),
    tabs = $$("[data-work-tab]", stage),
    prev = $("[data-work-prev]"),
    next = $("[data-work-next]");
  let index = 0,
    animations = [],
    touch = null;
  stage.classList.add("is-enhanced");
  $(".workflow-tabs", stage).hidden = false;
  $("[data-work-controls]").hidden = false;
  function show(i, moving = true, focus = false) {
    i = Math.max(0, Math.min(panels.length - 1, i));
    const direction = i >= index ? 1 : -1;
    if (i === index && moving) return;
    animations.forEach((a) => a?.stop());
    animations = [];
    index = i;
    panels.forEach((p, n) => {
      p.classList.toggle("is-active", n === i);
      p.inert = n !== i;
      p.setAttribute("aria-hidden", String(n !== i));
    });
    tabs.forEach((t, n) => {
      t.setAttribute("aria-selected", String(n === i));
      t.tabIndex = n === i ? 0 : -1;
    });
    prev.disabled = i === 0;
    next.disabled = i === panels.length - 1;
    $("[data-work-counter]").textContent =
      String(i + 1).padStart(2, "0") + " / 04";
    if (focus) tabs[i].focus({ preventScroll: true });
    if (moving) {
      animations.push(
        animate(
          $(".step-content", panels[i]),
          {
            opacity: [0, 1],
            transform: [
              "translateX(" + direction * 26 + "px)",
              "translateX(0)",
            ],
          },
          { duration: 0.4 },
        ),
      );
      animations.push(
        animate(
          $(".scene", panels[i]),
          {
            opacity: [0.2, 1],
            transform: [
              "translateX(" + direction * 38 + "px) scale(.96)",
              "translateX(0) scale(1)",
            ],
          },
          { duration: 0.43 },
        ),
      );
      $$("[data-piece]", panels[i]).forEach((piece, n) =>
        animations.push(
          animate(
            piece,
            {
              opacity: [0, 1],
              transform: ["translateY(12px)", "translateY(0)"],
            },
            { delay: 0.09 + n * 0.04, duration: 0.32 },
          ),
        ),
      );
    }
  }
  tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  stage.addEventListener("keydown", (e) => {
    const map = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: 3,
    };
    if (Object.hasOwn(map, e.key)) {
      e.preventDefault();
      show(map[e.key], true, e.target.matches("[role=tab]"));
    }
  });
  stage.addEventListener(
    "touchstart",
    (e) => {
      touch = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch.x,
        dy = e.changedTouches[0].clientY - touch.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4)
        show(index + (dx < 0 ? 1 : -1));
      touch = null;
    },
    { passive: true },
  );
  show(0, false);
}
let selectService = null;
function initServices() {
  const group = $(".service-panels");
  if (!group) return;
  const tabs = $$("[data-service-tab]"),
    panels = $$(".service-panel", group),
    pill = $(".service-indicator"),
    tablist = $(".service-tabs");
  let selected = "buy",
    animations = [],
    pillAnimation;
  group.classList.add("is-enhanced");
  tablist.hidden = false;
  function positionPill() {
    const tab = tabs.find((t) => t.dataset.serviceTab === selected);
    pillAnimation?.stop();
    const props = {
      left: tab.offsetLeft + "px",
      width: tab.offsetWidth + "px",
    };
    pillAnimation = animate(pill, props, { duration: 0.34 });
    if (!pillAnimation) Object.assign(pill.style, props);
  }
  selectService = (value, moving = true) => {
    if (!["buy", "sell"].includes(value)) return;
    animations.forEach((a) => a?.stop());
    animations = [];
    const direction = value === "sell" ? 1 : -1;
    selected = value;
    tabs.forEach((t) => {
      const active = t.dataset.serviceTab === value;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
    });
    panels.forEach((p) => {
      const active = p.id === "service-" + value;
      p.classList.toggle("is-active", active);
      p.inert = !active;
      p.setAttribute("aria-hidden", String(!active));
    });
    positionPill();
    const p = $("#service-" + value);
    if (moving) {
      animations.push(
        animate(
          $(".service-copy", p),
          {
            opacity: [0, 1],
            transform: [
              "translateX(" + direction * 22 + "px)",
              "translateX(0)",
            ],
          },
          { duration: 0.38 },
        ),
      );
      animations.push(
        animate(
          $(".service-art", p),
          {
            opacity: [0.1, 1],
            transform: ["translateY(16px)", "translateY(0)"],
          },
          { duration: 0.42 },
        ),
      );
    }
    document.dispatchEvent(new Event("servicechange"));
  };
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      selectService(t.dataset.serviceTab);
      history.replaceState(null, "", "#" + t.dataset.serviceTab);
    }),
  );
  tablist.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const value = ["ArrowLeft", "Home"].includes(e.key) ? "buy" : "sell";
      selectService(value);
      tabs.find((t) => t.dataset.serviceTab === value).focus();
      history.replaceState(null, "", "#" + value);
    }
  });
  const intent = new URLSearchParams(location.search).get("intent");
  selectService(
    location.hash === "#sell" || intent === "Продать" ? "sell" : "buy",
    false,
  );
  addEventListener("resize", positionPill);
  document.fonts.ready.then(positionPill);
}
function initAnchors() {
  function go(hash, scroll = true) {
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    if (["buy", "sell"].includes(id)) selectService?.(id);
    const target = document.getElementById(
      ["buy", "sell"].includes(id) ? "services" : id,
    );
    if (!target) return;
    if (scroll) {
      const row = $(".header-row"),
        offset = Math.max(98, row.getBoundingClientRect().height + 44);
      scrollTo({
        top: Math.max(0, target.getBoundingClientRect().top + scrollY - offset),
        behavior: reducedMotion.matches ? "instant" : "smooth",
      });
    }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey)
      return;
    const hash = a.getAttribute("href");
    if (hash.length < 2 || !document.getElementById(hash.slice(1))) return;
    e.preventDefault();
    history.pushState(null, "", hash);
    go(hash);
  });
  addEventListener("popstate", () => go(location.hash));
  addEventListener("hashchange", () => go(location.hash));
  if (location.hash)
    document.fonts.ready.then(() =>
      requestAnimationFrame(() => go(location.hash)),
    );
}

function initFAQ() {
  $$(".faq-list details").forEach((details) => {
    const summary = $("summary", details);
    let animation,
      revision = 0,
      opened = details.open;
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      opened = !opened;
      const ticket = ++revision;
      animation?.stop();
      const from = details.getBoundingClientRect().height;
      details.style.height = "";
      details.open = true;
      const to = opened
        ? details.getBoundingClientRect().height
        : summary.getBoundingClientRect().height + 2;
      summary.setAttribute("aria-expanded", String(opened));
      const finish = () => {
        if (ticket !== revision) return;
        details.open = opened;
        details.style.height = "";
      };
      animation = animate(
        details,
        { height: [from + "px", to + "px"] },
        { duration: 0.32 },
      );
      if (animation) animation.then(finish);
      else finish();
    });
  });
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
function initCatalog(properties) {
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
      "#contact";
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
      reflow?.then(() => {
        el.style.transform = "";
        el.style.opacity = "";
      });
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
  filters.addEventListener("change", () => {
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
  restore();
  render();
  document.fonts.ready.then(() =>
    moveCategoryPill(
      nav,
      links.find((l) => l.dataset.category === category),
    ),
  );
}
function initProperty(properties) {
  const target = $("[data-property-detail]");
  if (!target) return;
  const id = new URLSearchParams(location.search).get("id"),
    p = properties.find((p) => p.id === id);
  if (!p) return;
  document.title = p.title + " — " + p.city + " | Norma";
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
    '&intent=Купить#contact">' +
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
async function loadPublicContent() {
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
function setFormStatus(state = "", title = "", message = "") {
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
    website: String(data.website || "").trim(),
  };
}
async function sendLead(payload) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(SITE_CONFIG.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error("Request failed");
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    if (result.ok !== true) throw new Error("Request not confirmed");
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
    if (payload.website) return;
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
    submitting = true;
    button.disabled = true;
    button.textContent = "Отправляем…";
    form.setAttribute("aria-busy", "true");
    try {
      await sendLead(payload);
      lastSuccessInMemory = Date.now();
      try {
        sessionStorage.setItem(
          "ilsiyarLeadSentAt",
          String(lastSuccessInMemory),
        );
      } catch {}
      setFormStatus(
        "success",
        "Заявка отправлена",
        "Ильсияр получила ваше обращение и свяжется с вами.",
      );
      form.reset();
      inquiryProperty = null;
      inquiryPropertyId = null;
      inquiryCategory = null;
      $("[data-inquiry-context]").hidden = true;
      form.elements.comment.maxLength = 1000;
    } catch (error) {
      if (error.status === 429)
        setFormStatus(
          "notice",
          "Повторная заявка не отправлена",
          "Сервис ограничил частые обращения. Подождите немного или напишите Ильсияр напрямую.",
        );
      else if (error.name === "AbortError")
        setFormStatus(
          "error",
          "Не удалось подтвердить отправку",
          "Сервер не ответил вовремя. Заявка могла поступить. Свяжитесь с Ильсияр напрямую, чтобы уточнить.",
        );
      else
        setFormStatus(
          "error",
          "Не удалось отправить заявку",
          "Попробуйте ещё раз или свяжитесь с Ильсияр напрямую.",
        );
    } finally {
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
  initServices();
  initHeader();
  initAnchors();
  initIntentLinks();
  initLeadForm();
  initWorkflow();
  initFAQ();
  initReveals();
  loadPublicContent();
});
