/* Public catalogue reader. No Auth SDK, session, client lead or admin credential is used here. */
(() => {
  "use strict";
  const config = window.ILSIYAR_CMS_CONFIG || {};
  const enabled = config.enabled === true;
  const origin = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(
    config.supabaseUrl || "",
  )
    ? config.supabaseUrl
    : "";
  const previewBlobs = new Set();
  const originalPictures = new Map();
  const mediaUrl = (path) =>
    origin + "/functions/v1/catalog-media?path=" + encodeURIComponent(path);
  const safePath = (path) =>
    /^(properties\/[a-z0-9-]{1,80}|covers)\/[a-f0-9-]{36}\.webp$/.test(
      path || "",
    );
  function isSafeImage(src) {
    if (previewBlobs.has(src)) return true;
    try {
      const u = new URL(src);
      return (
        enabled &&
        u.origin === origin &&
        u.pathname === "/functions/v1/catalog-media" &&
        safePath(u.searchParams.get("path")) &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  }
  const previewToken = new URLSearchParams(location.search).get("preview");
  const isPreview = !!previewToken && !!window.opener;
  let previewPromise;
  if (isPreview) {
    previewPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error("Предпросмотр закрыт. Откройте его из кабинета.")),
        10000,
      );
      addEventListener("message", function receive(event) {
        if (
          event.origin !== location.origin ||
          event.source !== window.opener ||
          event.data?.type !== "ilsiyar-preview" ||
          event.data.token !== previewToken
        )
          return;
        clearTimeout(timer);
        removeEventListener("message", receive);
        const p = event.data.property;
        for (const image of p.photos || [])
          if (String(image.src).startsWith("blob:" + location.origin + "/"))
            previewBlobs.add(image.src);
        resolve({
          schemaVersion: 1,
          properties: [{ ...p, published: true }],
          reviews: [],
        });
        const banner = document.createElement("p");
        banner.textContent =
          "Предпросмотр черновика · эти данные не опубликованы";
        banner.style.cssText =
          "padding:12px 20px;background:#e9e5f0;color:#332a40;border-radius:12px;margin:0 0 25px";
        document.querySelector("#main")?.prepend(banner);
      });
      window.opener.postMessage(
        { type: "ilsiyar-preview-ready", token: previewToken },
        location.origin,
      );
    });
  }
  async function load() {
    if (isPreview) return previewPromise;
    if (!enabled) return null;
    if (!origin || !config.publishableKey) throw new Error("CMS не настроена");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(origin + "/rest/v1/rpc/public_catalog", {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Каталог временно недоступен");
      const data = await response.json();
      if (
        data.siteId !== config.siteId ||
        data.siteId !== "ilsiyar-catalog-v1" ||
        data.schemaVersion !== 1 ||
        !Array.isArray(data.properties)
      )
        throw new Error("Подключён другой проект CMS");
      data.properties = data.properties.map((p) => ({
        ...p,
        photos: (p.photos || [])
          .filter((f) => safePath(f.path))
          .map((f) => ({ src: mediaUrl(f.path), alt: f.alt || p.title })),
      }));
      applyCovers(data.categories || []);
      return data;
    } catch (error) {
      applyCovers([]);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  function applyCovers(covers) {
    document.querySelectorAll("[data-arc-card]").forEach((card) => {
      const cover = covers.find((c) => c.category === card.dataset.categoryKey);
      const image = card.querySelector("img"),
        picture = card.querySelector("picture");
      if (picture && !originalPictures.has(card.dataset.categoryKey))
        originalPictures.set(card.dataset.categoryKey, picture.innerHTML);
      if (cover?.useIllustration && picture) {
        if (image?.dataset.cmsMode !== "illustration") {
          picture.innerHTML = originalPictures.get(card.dataset.categoryKey);
          const restored = picture.querySelector("img");
          if (restored) restored.dataset.cmsMode = "illustration";
        }
        return;
      }
      picture?.querySelectorAll("source").forEach((s) => s.remove());
      if (!image) return;
      image.removeAttribute("srcset");
      if (cover && safePath(cover.path)) {
        const src = mediaUrl(cover.path);
        if (image.src !== src) image.src = src;
        image.dataset.cmsMode = "managed";
        image.hidden = false;
        image.style.objectPosition = cover.crop_x + "% " + cover.crop_y + "%";
        image.style.scale = String(cover.zoom || 1);
      } else {
        image.removeAttribute("src");
        image.hidden = true;
        image.dataset.cmsMode = "empty";
      }
    });
    const note = document.querySelector(".orbit-fineprint > p");
    if (note)
      note.textContent =
        "Фото иллюстрируют категории, а не конкретные предложения.";
  }
  window.IlsiyarCMS = Object.freeze({
    enabled,
    isPreview,
    load,
    isSafeImage,
    mediaUrl,
  });
  if (enabled)
    addEventListener(
      "error",
      (event) => {
        const image = event.target;
        if (image?.tagName === "IMG" && isSafeImage(image.src))
          image.hidden = true;
      },
      true,
    );
})();
