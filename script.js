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
  if (reducedMotion.matches || !window.Motion || !element) return null;
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
    menu = $("#mobile-menu");
  const nav = $(".desktop-nav"),
    pill = $(".nav-indicator");
  let menuAnimation, activeLink, frame;
  function setMenu(open, restore = false) {
    menuAnimation?.stop();
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    menu.style.height = "";
    menu.style.opacity = "";
    menu.hidden = !open;
    if (open) {
      menuAnimation = animate(
        menu,
        { height: [0, menu.scrollHeight + "px"], opacity: [0, 1] },
        { duration: 0.35 },
      );
      menuAnimation?.then(() => {
        menu.style.height = "";
      });
      $("a:not([hidden])", menu)?.focus({ preventScroll: true });
    } else if (restore) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener("click", () =>
    setMenu(toggle.getAttribute("aria-expanded") !== "true"),
  );
  $$("a", menu).forEach((a) =>
    a.addEventListener("click", () => setMenu(false)),
  );
  document.addEventListener("pointerdown", (e) => {
    if (!header.contains(e.target) && !menu.hidden) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    if (e.key === "Escape") {
      setMenu(false, true);
      return;
    }
    if (e.key === "Tab") {
      const links = $$("a,button", header).filter(
        (el) => el.getClientRects().length,
      );
      if (e.shiftKey && document.activeElement === links[0]) {
        e.preventDefault();
        links.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === links.at(-1)) {
        e.preventDefault();
        links[0].focus();
      }
    }
  });
  function movePill(link) {
    if (!link || !nav.getClientRects().length) {
      pill.style.opacity = "0";
      return;
    }
    const props = {
      left: link.offsetLeft + "px",
      width: link.offsetWidth + "px",
      opacity: 1,
    };
    if (!animate(pill, props, { duration: 0.35 }))
      Object.assign(pill.style, props);
  }
  const links = $$("[data-nav]", nav);
  links.forEach((link) => {
    link.addEventListener("pointerenter", () => movePill(link));
    link.addEventListener("focus", () => movePill(link));
    link.addEventListener("click", () => {
      activeLink = link;
      movePill(link);
    });
  });
  nav.addEventListener("pointerleave", () => movePill(activeLink));
  nav.addEventListener("focusout", () => movePill(activeLink));
  function update() {
    frame = null;
    header.classList.toggle("is-scrolled", scrollY > 40);
    let current = document.body.dataset.page !== "home" ? links[0] : null;
    if (document.body.dataset.page === "home") {
      let closestTop = -Infinity;
      links.forEach((link) => {
        const section = document.getElementById(link.dataset.nav);
        if (!section) return;
        const top = section.getBoundingClientRect().top;
        if (
          top < innerHeight * 0.43 &&
          (top > closestTop + 1 ||
            (Math.abs(top - closestTop) <= 1 && link === activeLink))
        ) {
          current = link;
          closestTop = top;
        }
      });
    }
    if (current !== activeLink) {
      activeLink = current;
      links.forEach((l) => {
        if (l === current) l.setAttribute("aria-current", "location");
        else l.removeAttribute("aria-current");
      });
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
    if (innerWidth > 900 && !menu.hidden) setMenu(false);
    movePill(activeLink);
  });
  document.fonts.ready.then(() => movePill(activeLink));
  update();
}
function initReveals() {
  if (reducedMotion.matches || !window.Motion) return;
  $$("[data-hero]").forEach((el, i) =>
    animate(
      el,
      { opacity: [0, 1], transform: ["translateY(20px)", "translateY(0)"] },
      { delay: Math.min(i * 0.055, 0.25), duration: 0.7 },
    ),
  );
  animate(
    $("[data-hero-image]"),
    {
      clipPath: ["inset(5% 0 5% 0 round 22px)", "inset(0% 0 0% 0 round 22px)"],
      opacity: [0, 1],
    },
    { duration: 0.9 },
  );
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        animate(
          target,
          {
            opacity: [0.25, 1],
            transform: ["translateY(24px)", "translateY(0)"],
          },
          { duration: 0.65 },
        );
        observer.unobserve(target);
      });
    },
    { threshold: 0.08 },
  );
  $$("[data-reveal]").forEach((el) => observer.observe(el));
}
function initWorkflow() {
  const track = $("[data-workflow]");
  if (!track) return;
  const cards = $$(".workflow-card", track),
    prev = $("[data-work-prev]"),
    next = $("[data-work-next]");
  let index = 0,
    scrollAnimation;
  $("[data-work-controls]").hidden = false;
  cards.forEach((card, i) => {
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "Этап " + (i + 1) + " из " + cards.length);
  });
  const position = (i) => cards[i].offsetLeft - cards[0].offsetLeft;
  function update() {
    index = cards.reduce(
      (best, card, i) =>
        Math.abs(position(i) - track.scrollLeft) <
        Math.abs(position(best) - track.scrollLeft)
          ? i
          : best,
      0,
    );
    $("[data-work-counter]").textContent =
      String(index + 1).padStart(2, "0") + " / 04";
    prev.disabled = index === 0;
    next.disabled = index === cards.length - 1;
    cards.forEach((card, i) => {
      if (i === index) card.setAttribute("aria-current", "step");
      else card.removeAttribute("aria-current");
    });
    $("[data-work-progress]").style.transform =
      "translateX(" + index * 100 + "%)";
  }
  function go(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    scrollAnimation?.stop();
    if (!reducedMotion.matches && window.Motion) {
      track.style.scrollSnapType = "none";
      scrollAnimation = Motion.animate(track.scrollLeft, position(i), {
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) => {
          track.scrollLeft = v;
        },
      });
      scrollAnimation.then(() => {
        track.style.scrollSnapType = "";
        update();
      });
    } else track.scrollLeft = position(i);
  }
  prev.addEventListener("click", () => go(index - 1));
  next.addEventListener("click", () => go(index + 1));
  track.addEventListener("keydown", (e) => {
    const keys = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: cards.length - 1,
    };
    if (Object.hasOwn(keys, e.key)) {
      e.preventDefault();
      go(keys[e.key]);
    }
  });
  track.addEventListener(
    "pointerdown",
    () => {
      scrollAnimation?.stop();
      track.style.scrollSnapType = "";
    },
    { passive: true },
  );
  track.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();
}
function initFAQ() {
  $$(".faq-list details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (details.open)
        animate(
          $("div", details),
          { opacity: [0, 1], transform: ["translateY(-6px)", "translateY(0)"] },
          { duration: 0.25 },
        );
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
function initCatalog(properties) {
  const featured = $("[data-featured]");
  if (featured && properties.length) {
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
  if (!grid || !properties.length) return;
  const empty = $("[data-empty]"),
    summary = $("[data-catalog-summary]"),
    sort = $("[data-sort]");
  filters.hidden = false;
  summary.hidden = false;
  ["type", "city"].forEach((key) => {
    [...new Set(properties.map((p) => p[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ru"))
      .forEach((v) => {
        $('[name="' + key + '"]', filters).add(new Option(v, v));
      });
  });
  let scheduled;
  function render() {
    const values = Object.fromEntries(new FormData(filters));
    const query = values.query.trim().toLocaleLowerCase("ru");
    let result = properties.filter(
      (p) =>
        (!query ||
          [p.title, p.city, p.district, p.type]
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(query)) &&
        (!values.type || p.type === values.type) &&
        (!values.city || p.city === values.city) &&
        (!values.price ||
          (Number.isFinite(p.price) && p.price <= Number(values.price))),
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
    const oldPositions = new Map(
      $$("[data-property-id]", grid).map((el) => [
        el.dataset.propertyId,
        el.getBoundingClientRect(),
      ]),
    );
    grid.innerHTML = result.map(propertyCard).join("");
    $("[data-result-count]").textContent = "Найдено объектов: " + result.length;
    empty.hidden = result.length > 0;
    if (!result.length) {
      $(".empty-copy h3", empty).textContent = "Пока нет совпадений.";
      $(".empty-copy p", empty).textContent =
        "Измените параметры поиска или обсудите индивидуальный подбор с Ильсияр.";
    }
    $$(".property-card", grid).forEach((el) => {
      const old = oldPositions.get(el.dataset.propertyId),
        rect = el.getBoundingClientRect();
      animate(
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
              : "translateY(16px)",
            "translate(0,0)",
          ],
        },
        { duration: 0.35 },
      );
    });
    initCardTransitions(grid);
  }
  filters.addEventListener("submit", (e) => e.preventDefault());
  filters.addEventListener("input", () => {
    clearTimeout(scheduled);
    scheduled = setTimeout(render, 120);
  });
  filters.addEventListener("change", render);
  filters.addEventListener("reset", () => {
    sort.value = "default";
    requestAnimationFrame(render);
  });
  sort.addEventListener("change", render);
  render();
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
        const box = $("[data-inquiry-context]");
        box.hidden = false;
        $("p", box).textContent = "Объект: " + p.title + " · " + p.city;
        $("[name=comment]").maxLength = Math.max(
          0,
          1000 - propertyContext().length,
        );
        $("[data-clear-context]").addEventListener("click", () => {
          inquiryProperty = null;
          inquiryPropertyId = null;
          box.hidden = true;
          $("[name=comment]").maxLength = 1000;
        });
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
      $(".empty-copy p", empty).textContent =
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
  initHeader();
  initIntentLinks();
  initLeadForm();
  initWorkflow();
  initFAQ();
  initReveals();
  loadPublicContent();
});
