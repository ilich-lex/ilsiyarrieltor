(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const config = window.ILSIYAR_CMS_CONFIG || {};
  const callbackHash = new URLSearchParams(location.hash.slice(1));
  const callbackFailed = callbackHash.has("error");
  let recoveryMode = callbackHash.get("type") === "recovery";
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const categories = {
    apartment: "Квартиры",
    newbuild: "Новостройки",
    house: "Дома",
    land: "Участки",
    commercial: "Коммерция",
    storage: "Парковки и кладовые",
  };
  const types = {
    apartment: "Квартира",
    house: "Дом",
    land: "Земельный участок",
    commercial: "Коммерческая недвижимость",
    storage: "Парковка / кладовая",
  };
  const legacyPhotos = {
    apartment: "category-apartment-480.webp",
    house: "category-house-480.webp",
    land: "category-land-480.webp",
    commercial: "category-commercial-480.webp",
  };
  const form = $("[data-object-form]"),
    editor = $("[data-editor]"),
    coverEditor = $("[data-cover-editor]");
  const state = {
    items: [],
    photos: [],
    covers: [],
    resolved: [],
    editing: null,
    editingPhotos: [],
    dirty: false,
    busy: false,
    ready: false,
    urls: new Map(),
    blobs: new Set(),
    cover: null,
    toastTimer: null,
  };
  function message(selector, text = "", success = false) {
    const node = typeof selector === "string" ? $(selector) : selector;
    node.textContent = text;
    node.classList.toggle("success", success);
  }
  function toast(text) {
    const box = $("[data-toast]");
    box.textContent = text;
    box.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => (box.hidden = true), 5000);
  }
  function errorText(error) {
    if (error?.code === "40001")
      return "Объект изменён в другом окне. Закройте редактор и обновите список перед сохранением.";
    if (error?.code === "42501")
      return "Нет прав на это действие. Войдите разрешённым аккаунтом.";
    const text = String(error?.message || "");
    if (/JWT|session|token.*expired/i.test(text))
      return "Сеанс завершён. Войдите в кабинет снова.";
    if (/network|fetch|timeout/i.test(text))
      return "Не удалось связаться с хранилищем. Данные в форме сохранены. Проверьте соединение и попробуйте снова.";
    if (
      /^Объект|^Для|^Выберите|^Сначала|^Фото|^Не более|^Доступ|^Заполните|^Подтвердите|^Новый пароль|^Пароли|^Файл|^Не удалось открыть|^Слишком/.test(
        text,
      )
    )
      return text;
    return "Не удалось выполнить действие. Данные в форме сохранены. Обновите соединение или обратитесь к владельцу сайта.";
  }
  function loginErrorText(error) {
    if (error?.code === "invalid_credentials")
      return "Неверная почта или пароль. Используйте почту аккаунта, созданного для этого кабинета.";
    if (error?.code === "email_not_confirmed")
      return "Почта аккаунта ещё не подтверждена. Попросите владельца сайта проверить пользователя в Supabase.";
    if (error?.status === 429 || /rate_limit/.test(error?.code || ""))
      return "Слишком много попыток входа. Подождите несколько минут и попробуйте снова.";
    if (error?.status >= 500)
      return "Сервис входа временно недоступен. Попробуйте ещё раз немного позже.";
    if (error?.code === "email_provider_disabled")
      return "Вход по почте отключён в настройках кабинета. Обратитесь к владельцу сайта.";
    if (/network|fetch|timeout/i.test(error?.message || ""))
      return "Не удалось связаться с сервисом входа. Проверьте соединение и повторите попытку.";
    return "Не удалось войти. Попробуйте ещё раз или обратитесь к владельцу сайта.";
  }
  function confirmAction(title, text, yes = "Подтвердить") {
    const dialog = $("[data-confirm]");
    $("[data-confirm-title]").textContent = title;
    $("[data-confirm-text]").textContent = text;
    $("[data-confirm-yes]").textContent = yes;
    dialog.showModal();
    return new Promise((resolve) => {
      const finish = (value) => {
        dialog.close();
        $("[data-confirm-yes]").onclick = null;
        $("[data-confirm-cancel]").onclick = null;
        dialog.oncancel = null;
        resolve(value);
      };
      $("[data-confirm-yes]").onclick = () => finish(true);
      $("[data-confirm-cancel]").onclick = () => finish(false);
      dialog.oncancel = (e) => {
        e.preventDefault();
        finish(false);
      };
    });
  }
  const disabledBeforeBusy = new WeakMap();
  function busy(value) {
    state.busy = value;
    $$("button,input,textarea,select", editor).forEach((b) => {
      if (value) {
        if (!disabledBeforeBusy.has(b)) disabledBeforeBusy.set(b, b.disabled);
        b.disabled = true;
      } else if (disabledBeforeBusy.has(b)) {
        b.disabled = disabledBeforeBusy.get(b);
        disabledBeforeBusy.delete(b);
      }
    });
    editor.setAttribute("aria-busy", String(value));
  }
  const match = (p, key) =>
    key === "newbuild"
      ? p.category === "apartment" && p.market === "newbuild"
      : p.category === key;
  const photoList = (id) =>
    state.photos
      .filter((f) => f.property_id === id)
      .sort((a, b) => a.sort_order - b.sort_order);
  const money = (value) =>
    value == null
      ? "Цена по запросу"
      : new Intl.NumberFormat("ru-RU").format(value) + " ₽";
  let client;
  if (
    !config.enabled ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl || "") ||
    !config.publishableKey ||
    !window.supabase?.createClient
  ) {
    message(
      "[data-login-message]",
      "Кабинет подготовлен, но отдельный проект Supabase ещё не подключён. Публикация пока отключена.",
    );
    $("[data-login-form] button").disabled = true;
    $("[data-reset]").disabled = true;
    return;
  }
  client = window.supabase.createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "ilsiyar-catalog-auth",
      },
    },
  );
  async function rpc(name, args = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  async function previewUrl(path) {
    if (!path) return "";
    const saved = state.urls.get(path);
    if (saved && saved.until > Date.now()) return saved.url;
    const { data, error } = await client.storage
      .from(config.bucket)
      .createSignedUrl(path, 300);
    if (error) throw error;
    state.urls.set(path, { url: data.signedUrl, until: Date.now() + 240000 });
    return data.signedUrl;
  }
  function showLogin(text = "") {
    state.ready = false;
    $("[data-login-view]").hidden = false;
    $("[data-admin-view]").hidden = true;
    $("[data-logout]").hidden = true;
    $("[data-login-form]").hidden = false;
    $("[data-reset]").hidden = false;
    $("[data-password-form]").hidden = true;
    $("[data-auth-title]").textContent = "Войти в кабинет";
    message("[data-login-message]", text);
    if (editor.open) editor.close();
    if (coverEditor.open) coverEditor.close();
  }
  async function boot(session, recovery = false) {
    if (!session?.user) {
      showLogin();
      return;
    }
    try {
      if ((await rpc("cms_identity")) !== "ilsiyar-catalog-v1")
        throw Error("Подключён неверный проект");
      const { data, error } = await client
        .from("cms_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error || !data) {
        await client.auth.signOut();
        showLogin("У этого аккаунта нет доступа к каталогу.");
        return;
      }
      if (recovery || recoveryMode) {
        $("[data-login-view]").hidden = false;
        $("[data-admin-view]").hidden = true;
        $("[data-login-form]").hidden = true;
        $("[data-reset]").hidden = true;
        $("[data-password-form]").hidden = false;
        $("[data-auth-title]").textContent = "Новый пароль";
        return;
      }
      $("[data-login-view]").hidden = true;
      $("[data-admin-view]").hidden = false;
      $("[data-logout]").hidden = false;
      $("[data-account]").textContent = session.user.email;
      state.ready = true;
      await reload();
    } catch (error) {
      showLogin(errorText(error));
    }
  }
  $("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("button", event.target);
    button.disabled = true;
    button.textContent = "Входим…";
    message("[data-login-message]");
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: event.target.email.value.trim(),
        password: event.target.password.value,
      });
      if (error) throw error;
      event.target.password.value = "";
      await boot(data.session);
    } catch (error) {
      message("[data-login-message]", loginErrorText(error));
    } finally {
      button.disabled = false;
      button.textContent = "Войти";
    }
  });
  $("[data-reset]").addEventListener("click", async () => {
    const email = $("[data-login-form]").email;
    if (!email.value || !email.checkValidity()) {
      email.reportValidity();
      email.focus();
      return;
    }
    const b = $("[data-reset]");
    b.disabled = true;
    try {
      const { error } = await client.auth.resetPasswordForEmail(
        email.value.trim(),
        { redirectTo: new URL("/admin/", location.origin).href },
      );
      if (error) throw error;
      message(
        "[data-login-message]",
        ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
          ? "Если аккаунт существует, придёт письмо для смены пароля. Откройте новую ссылку на этом компьютере — кабинет пока работает локально, на телефоне она не откроется."
          : "Если аккаунт существует, придёт ссылка для смены пароля. Если письма нет, попросите владельца сайта проверить настройки почты.",
        true,
      );
    } catch {
      message(
        "[data-login-message]",
        "Не удалось отправить письмо восстановления. Попросите владельца сайта проверить почтовые настройки Supabase.",
      );
    } finally {
      b.disabled = false;
    }
  });
  $("[data-password-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.password.value !== f.confirm.value) {
      message("[data-login-message]", "Пароли не совпадают.");
      return;
    }
    const b = $("button", f);
    b.disabled = true;
    try {
      const { error } = await client.auth.updateUser({
        password: f.password.value,
      });
      if (error) throw error;
      f.reset();
      recoveryMode = false;
      history.replaceState(null, "", location.pathname);
      await client.auth.signOut();
      f.hidden = true;
      $("[data-login-form]").hidden = false;
      $("[data-reset]").hidden = false;
      $("[data-auth-title]").textContent = "Войти в кабинет";
      showLogin("Пароль изменён. Войдите с новым паролем.");
    } catch (error) {
      message("[data-login-message]", errorText(error));
    } finally {
      b.disabled = false;
    }
  });
  $("[data-logout]").onclick = async () => {
    if (
      state.dirty &&
      !(await confirmAction(
        "Выйти?",
        "Несохранённые изменения будут потеряны.",
        "Выйти",
      ))
    )
      return;
    state.dirty = false;
    await client.auth.signOut();
    state.urls.clear();
    state.blobs.forEach(URL.revokeObjectURL);
    state.blobs.clear();
    showLogin();
  };
  $("[data-login-form] button").disabled = false;
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      setTimeout(() => boot(session, true), 0);
    } else if (event === "SIGNED_OUT") showLogin();
  });
  client.auth
    .getSession()
    .then(({ data, error }) => {
      if (callbackFailed || (recoveryMode && error)) {
        history.replaceState(null, "", location.pathname);
        showLogin(
          "Ссылка восстановления недействительна или уже использована. Запросите новое письмо и откройте только последнюю ссылку.",
        );
        return;
      }
      return boot(data.session, recoveryMode);
    })
    .catch(() =>
      showLogin(
        "Не удалось проверить сеанс. Обновите страницу и попробуйте снова.",
      ),
    );
  async function readAll(table) {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      all.push(...data);
      if (data.length < 500) return { data: all };
    }
  }
  async function reload() {
    message("[data-workspace-message]", "Загружаем каталог…", true);
    const [p, f, c, pub] = await Promise.all([
      readAll("catalog_properties"),
      readAll("catalog_photos"),
      client.from("catalog_covers").select("*"),
      rpc("public_catalog"),
    ]);
    for (const r of [p, f, c]) if (r.error) throw r.error;
    state.items = p.data.sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
    state.photos = f.data;
    state.covers = c.data;
    state.resolved = pub.categories;
    renderItems();
    await renderCovers();
    message("[data-workspace-message]");
    const bytes = state.photos.reduce((n, f) => n + f.bytes, 0);
    $("[data-storage-usage]").textContent =
      "Фото объектов: " +
      (bytes / 1048576).toFixed(1) +
      " МБ. Free: 1 ГБ Storage; обложки и неиспользуемые загрузки также занимают место.";
  }
  $("[data-clean-storage]").onclick = async () => {
    const button = $("[data-clean-storage]");
    button.disabled = true;
    try {
      await reload();
      const linked = new Set([
        ...state.photos.map((p) => p.path),
        ...state.covers.filter((c) => c.mode === "upload").map((c) => c.path),
      ]);
      const unused = [];
      async function scan(prefix) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await client.storage
            .from(config.bucket)
            .list(prefix, {
              limit: 1000,
              offset,
              sortBy: { column: "name", order: "asc" },
            });
          if (error) throw error;
          for (const entry of data) {
            const path = prefix ? prefix + "/" + entry.name : entry.name;
            if (
              !entry.id &&
              (/^(properties|covers)$/.test(path) ||
                /^properties\/[a-z0-9-]{1,80}$/.test(path))
            )
              await scan(path);
            else if (
              entry.id &&
              /^(properties\/[a-z0-9-]{1,80}|covers)\/[a-f0-9-]{36}\.(webp|jpe?g)$/.test(
                path,
              ) &&
              !linked.has(path) &&
              Date.now() - Date.parse(entry.created_at) > 86400000
            )
              unused.push(path);
          }
          if (data.length < 1000) break;
        }
      }
      await scan("");
      if (!unused.length) {
        toast("Старых незавершённых загрузок нет.");
        return;
      }
      if (
        !(await confirmAction(
          "Очистить неиспользуемые фото?",
          "Найдено файлов старше суток: " +
            unused.length +
            ". Ни один из них не используется в каталоге или обложках. Удаление освободит место в Storage.",
          "Очистить",
        ))
      )
        return;
      let removed = 0;
      for (let i = 0; i < unused.length; i += 100) {
        const { data, error } = await client.storage
          .from(config.bucket)
          .remove(unused.slice(i, i + 100));
        if (error) throw error;
        removed += data?.length || 0;
      }
      toast(
        "Удалено неиспользуемых файлов: " +
          removed +
          ". Используемые фото защищены правилами базы.",
      );
    } catch (e) {
      message("[data-workspace-message]", errorText(e));
    } finally {
      button.disabled = false;
    }
  };
  async function reloadSafe() {
    try {
      await reload();
    } catch (e) {
      message("[data-workspace-message]", errorText(e));
    }
  }
  $("[data-reload]").onclick = reloadSafe;
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        $$("[data-tab]").forEach((x) =>
          x.toggleAttribute("aria-current", x === b),
        );
        $$("[data-panel]").forEach(
          (p) => (p.hidden = p.dataset.panel !== b.dataset.tab),
        );
        message("[data-workspace-message]");
      }),
  );
  function renderItems() {
    const query = $("[data-search]").value.trim().toLocaleLowerCase("ru"),
      filter = $("[data-filter]").value;
    const items = state.items.filter(
      (p) =>
        (!query ||
          [p.title, p.city, p.address]
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(query)) &&
        (filter === "all" ||
          (filter === "published" && p.is_published) ||
          (filter === "draft" && !p.is_published && p.status !== "sold") ||
          (filter === "sold" && p.status === "sold")),
    );
    $("[data-object-list]").innerHTML = items.length
      ? items
          .map(
            (p) =>
              `<article class="object-row"><div data-object-cover="${escape(p.id)}" class="photo-placeholder">Нет фото</div><div><span class="badge ${p.is_published ? "published" : ""}">${p.status === "sold" ? "Продано" : p.is_published ? (p.status === "reserved" ? "Забронировано" : "Опубликован") : "Черновик / скрыт"}</span><h3>${escape(p.title)}</h3><div class="object-meta"><span>${escape(p.city || "Город не указан")}</span><span>${escape(categories[p.category])}</span><span>${photoList(p.id).length} фото</span></div></div><div class="row-actions"><div class="object-price">${money(p.price)}</div><button class="quiet" data-edit="${escape(p.id)}">Редактировать</button></div></article>`,
          )
          .join("")
      : '<div class="empty"><h3>Объектов пока нет</h3><p>Добавьте объект или измените условия поиска.</p></div>';
    $$("[data-edit]").forEach(
      (b) => (b.onclick = () => openEditor(b.dataset.edit)),
    );
    for (const p of items) {
      const f = photoList(p.id)[0];
      if (f)
        previewUrl(f.path)
          .then((url) => {
            const node = $('[data-object-cover="' + p.id + '"]');
            if (node) {
              const img = document.createElement("img");
              img.src = url;
              img.alt = "Главное фото объекта";
              node.replaceWith(img);
            }
          })
          .catch(() => {});
    }
  }
  $("[data-search]").oninput = renderItems;
  $("[data-filter]").onchange = renderItems;
  function documentData() {
    const values = Object.fromEntries(new FormData(form)),
      number = (k) => (values[k] === "" ? null : Number(values[k]));
    return {
      id: state.editing.id,
      title: values.title.trim() || "Новый объект",
      category: values.category,
      type: values.type.trim() || types[values.category],
      market: values.category === "apartment" ? values.market : "secondary",
      city: values.city.trim(),
      district: values.district.trim(),
      address: values.address.trim(),
      description: values.description.trim(),
      price: number("price"),
      area: number("area"),
      rooms: number("rooms"),
      floor: number("floor"),
      landArea: number("landArea"),
      status: values.status,
      featured: !!values.featured,
      rightsConfirmed: !!values.rightsConfirmed,
      photos: state.editingPhotos.map(
        ({ path, alt, width, height, bytes }) => ({
          path,
          alt,
          width,
          height,
          bytes,
        }),
      ),
    };
  }
  function validate(p, publish) {
    if (publish) {
      if (p.title.length < 5 || p.city.length < 2)
        throw Error("Заполните название (от 5 символов) и город.");
      if (!p.photos.length)
        throw Error("Для публикации нужно хотя бы одно фото.");
      if (!p.rightsConfirmed)
        throw Error("Подтвердите право публикации объекта и фотографий.");
    }
    for (const key of ["title", "city", "district", "address", "description"])
      if (/<\s*\/?\s*[a-z][^>]*>|javascript\s*:/i.test(p[key]))
        throw Error("Заполните описание обычным текстом, без HTML-кода.");
  }
  function openEditor(id) {
    const p = state.items.find((p) => p.id === id);
    state.editing = p
      ? { ...p }
      : { id: crypto.randomUUID(), revision: 0, is_published: false };
    state.editingPhotos = p ? photoList(id).map((f) => ({ ...f })) : [];
    form.reset();
    for (const key of [
      "title",
      "category",
      "type",
      "market",
      "city",
      "district",
      "address",
      "description",
      "price",
      "area",
      "rooms",
      "floor",
      "status",
    ])
      if (p && form.elements[key]) form.elements[key].value = p[key] ?? "";
    form.elements.landArea.value = p?.land_area ?? "";
    form.elements.featured.checked = !!p?.featured;
    form.elements.rightsConfirmed.checked = !!p?.rights_confirmed;
    if (!p) form.elements.type.value = types.apartment;
    form.elements.market.disabled =
      form.elements.category.value !== "apartment";
    state.dirty = false;
    updateEditorStatus();
    message("[data-editor-message]");
    renderPhotos();
    editor.showModal();
    editor.scrollTop = 0;
    form.elements.title.focus({ preventScroll: true });
  }
  function updateEditorStatus() {
    $("[data-editor-title]").textContent = state.editing.revision
      ? state.editing.title || "Объект"
      : "Новый объект";
    $("[data-editor-state]").textContent = state.editing.is_published
      ? "Опубликован"
      : "Черновик / скрыт";
    $("[data-save-draft]").textContent = state.editing.is_published
      ? "Сохранить изменения"
      : "Сохранить черновик";
    $("[data-unpublish]").hidden = !state.editing.is_published;
    $("[data-publish]").hidden =
      state.editing.is_published || form.elements.status.value === "sold";
    $("[data-delete]").hidden = !state.editing.revision;
  }
  $("[data-add]").onclick = () => openEditor();
  form.oninput = () => {
    state.dirty = true;
    updateEditorStatus();
  };
  form.elements.category.onchange = () => {
    form.elements.type.value = types[form.elements.category.value];
    form.elements.market.disabled =
      form.elements.category.value !== "apartment";
  };
  async function closeEditor() {
    if (state.busy) return;
    if (
      state.dirty &&
      !(await confirmAction(
        "Закрыть без сохранения?",
        "Последние изменения и порядок фото не будут сохранены. Загруженные файлы останутся закрытыми.",
        "Закрыть",
      ))
    )
      return;
    state.dirty = false;
    editor.close();
    state.editingPhotos = photoList(state.editing.id).map((f) => ({ ...f }));
    await cleanupUnused();
    await reloadSafe();
  }
  $("[data-close-editor]").onclick = closeEditor;
  editor.oncancel = (e) => {
    e.preventDefault();
    closeEditor();
  };
  addEventListener("beforeunload", (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  async function save(publish, quiet = false) {
    if (state.busy) return;
    const p = documentData();
    validate(p, publish);
    if (!form.reportValidity()) return;
    busy(true);
    message("[data-editor-message]", "Сохраняем…", true);
    try {
      const row = await rpc("cms_save_property", {
        document: p,
        expected_revision: state.editing.revision,
        publish,
      });
      state.editing = row;
      state.dirty = false;
      state.editingPhotos = state.editingPhotos.map((f, i) => ({
        ...f,
        sort_order: i,
        property_id: p.id,
      }));
      updateEditorStatus();
      await cleanupUnused();
      await reload();
      message(
        "[data-editor-message]",
        p.status === "sold"
          ? "Объект отмечен проданным и скрыт с сайта."
          : row.is_published
            ? "Объект опубликован. Изменения доступны на сайте без деплоя."
            : "Черновик сохранён. Он виден только вам.",
        true,
      );
      if (!quiet)
        toast(row.is_published ? "Объект опубликован" : "Черновик сохранён");
      return row;
    } catch (e) {
      message("[data-editor-message]", errorText(e));
      throw e;
    } finally {
      busy(false);
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    save(state.editing.is_published).catch(() => {});
  };
  $("[data-publish]").onclick = () => save(true).catch(() => {});
  $("[data-unpublish]").onclick = async () => {
    if (
      await confirmAction(
        "Снять объект с публикации?",
        "Объект и его фотографии больше не будут доступны посетителям сайта. В кабинете он сохранится.",
        "Снять с публикации",
      )
    )
      save(false).catch(() => {});
  };
  $("[data-delete]").onclick = async () => {
    if (
      !(await confirmAction(
        "Удалить объект?",
        "«" +
          (state.editing.title || "Объект") +
          "» будет удалён вместе с фотографиями. Сначала сохраните резервную копию, если она нужна.",
        "Удалить объект",
      ))
    )
      return;
    busy(true);
    try {
      const paths = await rpc("cms_delete_property", {
        item_id: state.editing.id,
        expected_revision: state.editing.revision,
      });
      state.dirty = false;
      editor.close();
      if (paths.length) {
        const { error } = await client.storage
          .from(config.bucket)
          .remove(paths);
        if (error)
          toast(
            "Объект удалён; очистка файлов не завершена. Их можно убрать из неиспользуемых загрузок позже.",
          );
      }
      await reload();
      toast("Объект удалён");
    } catch (e) {
      message("[data-editor-message]", errorText(e));
    } finally {
      busy(false);
    }
  };
  // Only the processed WebP/JPEG is size-limited and uploaded. Canvas strips EXIF/GPS.
  let heicDecoder;
  async function decodePhoto(file, converted = false) {
    const type = file.type.toLowerCase();
    const extension = /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name);
    if (
      !/^image\/(jpeg|jpg|pjpeg|png|x-png|webp|avif|heic|heif|heic-sequence|heif-sequence)$/.test(
        type,
      ) &&
      !((!type || type === "application/octet-stream") && extension)
    )
      throw Error(
        "Фото должно быть в формате JPEG, PNG, WebP, AVIF или поддерживаемом браузером HEIC/HEIF.",
      );
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        };
      } catch {
        // Some Safari versions decode a phone photo through <img>, but not ImageBitmap.
      }
    }
    const source = new Image();
    const url = URL.createObjectURL(file);
    const close = () => {
      source.src = "";
      URL.revokeObjectURL(url);
    };
    try {
      await new Promise((resolve, reject) => {
        source.onload = resolve;
        source.onerror = reject;
        source.src = url;
      });
      if (!source.naturalWidth || !source.naturalHeight) throw Error();
      return {
        source,
        width: source.naturalWidth,
        height: source.naturalHeight,
        close,
      };
    } catch {
      close();
      if (!converted && /heic|heif/i.test(type + " " + file.name)) {
        try {
          // Self-hosted CSP build; loaded only if native HEIC decoding fails.
          // Conversion stays on this device. No original is sent to a third party.
          heicDecoder ||= import("../assets/vendor/heic-to-1.6.7.js").catch(
            (error) => {
              heicDecoder = null;
              throw error;
            },
          );
          const { heicTo } = await heicDecoder;
          if (typeof createImageBitmap === "function") {
            const bitmap = await heicTo({ blob: file, type: "bitmap" });
            return {
              source: bitmap,
              width: bitmap.width,
              height: bitmap.height,
              close: () => bitmap.close(),
            };
          }
          const jpeg = await heicTo({
            blob: file, type: "image/jpeg", quality: 0.95,
          });
          return await decodePhoto(
            new File([jpeg], "converted.jpg", { type: "image/jpeg" }), true,
          );
        } catch {
          throw Error(
            "Фото HEIC/HEIF не удалось прочитать автоматически. Файл может быть повреждён. Остальные фотографии продолжат загружаться; это фото можно выбрать повторно.",
          );
        }
      }
      throw Error(
        "Фото не удалось открыть: файл повреждён или формат не поддерживается. Остальные фотографии продолжат загружаться.",
      );
    }
  }
  let preferredPhotoType = "image/webp";
  function encodeCanvas(canvas, type, quality) {
    return new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, type, quality);
      } catch {
        resolve(null);
      }
    });
  }
  async function optimize(file) {
    const image = await decodePhoto(file);
    const canvas = document.createElement("canvas");
    try {
      const longest = Math.max(image.width, image.height);
      let edge = Math.min(1920, longest);
      const smallest = Math.min(640, longest);
      while (true) {
        const factor = edge / longest;
        canvas.width = Math.max(1, Math.round(image.width * factor));
        canvas.height = Math.max(1, Math.round(image.height * factor));
        const context = canvas.getContext("2d");
        if (!context)
          throw Error(
            "Фото не удалось обработать. Закройте лишние вкладки и попробуйте ещё раз.",
          );
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        // JPEG has no alpha channel: transparent sources get a neutral background.
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.88, 0.82, 0.76]) {
          let blob = await encodeCanvas(canvas, preferredPhotoType, quality);
          if (
            preferredPhotoType === "image/webp" &&
            (!blob?.size || blob.type !== "image/webp")
          ) {
            // Safari may return PNG instead of WebP. Never label those bytes .webp.
            preferredPhotoType = "image/jpeg";
            blob = await encodeCanvas(canvas, preferredPhotoType, quality);
          }
          if (!blob?.size || blob.type !== preferredPhotoType)
            throw Error(
              "Фото не удалось обработать. Попробуйте загрузить его ещё раз. Остальные фотографии сохранятся.",
            );
          if (blob.size <= 1500000)
            return {
              blob,
              width: canvas.width,
              height: canvas.height,
              bytes: blob.size,
              contentType: blob.type,
              extension: blob.type === "image/webp" ? ".webp" : ".jpg",
            };
        }
        if (edge === smallest) break;
        edge = Math.max(smallest, Math.floor(edge * 0.8));
      }
      throw Error(
        "Фото не удалось уменьшить до 1,5 МБ автоматически. Остальные фотографии сохранятся; это фото можно выбрать повторно.",
      );
    } catch (error) {
      if (error?.message?.startsWith("Фото")) throw error;
      throw Error(
        "Фото не удалось обработать. Закройте лишние вкладки и попробуйте ещё раз.",
      );
    } finally {
      image.close();
      canvas.width = canvas.height = 1;
    }
  }
  const pendingFiles = new Set();
  async function cleanupUnused() {
    for (const path of [...pendingFiles]) {
      if (
        state.editingPhotos.some((p) => p.path === path) ||
        state.covers.some((c) => c.mode === "upload" && c.path === path)
      )
        continue;
      const { error } = await client.storage.from(config.bucket).remove([path]);
      if (!error) pendingFiles.delete(path);
    }
  }
  $("[data-photo-upload]").onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    if (files.length + state.editingPhotos.length > 12) {
      message("[data-editor-message]", "Не более 12 фотографий на объект.");
      return;
    }
    let uploaded = 0;
    const issues = new Map();
    try {
      if (!state.editing.revision) {
        const row = await save(false, true);
        if (!row) return;
      }
      busy(true);
      for (let i = 0; i < files.length; i++) {
        message(
          "[data-editor-message]",
          `Обрабатываем и загружаем фото ${i + 1} из ${files.length}…`,
          true,
        );
        let f;
        try {
          f = await optimize(files[i]);
        } catch (error) {
          const problem = errorText(error);
          issues.set(problem, (issues.get(problem) || 0) + 1);
          continue;
        }
        const path =
          "properties/" +
          state.editing.id +
          "/" +
          crypto.randomUUID() +
          f.extension;
        const { error } = await client.storage
          .from(config.bucket)
          .upload(path, f.blob, {
            contentType: f.contentType,
            upsert: false,
            cacheControl: "0",
          });
        if (error) throw error;
        pendingFiles.add(path);
        state.editingPhotos.push({
          path,
          width: f.width,
          height: f.height,
          bytes: f.bytes,
          alt: form.elements.title.value,
        });
        state.dirty = true;
        uploaded++;
      }
      await renderPhotos();
      message(
        "[data-editor-message]",
        issues.size
          ? `Загружено ${uploaded} из ${files.length}. Не загружено: ${files.length - uploaded}. ${[...issues].slice(0, 2).map(([text, count]) => `${count} фото — ${text}`).join(" ")}${issues.size > 2 ? " Есть и другие неподдерживаемые файлы." : ""}${uploaded ? " Сохраните объект, чтобы применить загруженные фото." : ""}`
          : `Загружено ${uploaded} из ${files.length}. Фотографии загружены в закрытое хранилище. Сохраните объект, чтобы применить изменения.`,
        !issues.size,
      );
    } catch (error) {
      await renderPhotos();
      message(
        "[data-editor-message]",
        `Загружено ${uploaded} из ${files.length}. ${uploaded ? "Эти фото сохранены в редакторе. Сохраните объект. " : ""}Загрузка остальных остановлена. ${errorText(error)}`,
      );
    } finally {
      busy(false);
    }
  };
  async function renderPhotos() {
    const root = $("[data-photos]");
    root.innerHTML = state.editingPhotos
      .map(
        (f, i) =>
          `<div class="photo-tile"><img data-photo-path="${escape(f.path)}" alt="Фото ${i + 1}"><div class="photo-label">${i === 0 ? "Главное фото" : `Фото ${i + 1}`} · ${Math.round(f.bytes / 1024)} КБ</div><div class="photo-controls"><button type="button" data-main-photo="${i}" ${i === 0 ? "disabled" : ""}>Главное</button><button type="button" data-move-photo="${i}" data-direction="-1" aria-label="Фото ${i + 1} левее" ${i === 0 ? "disabled" : ""}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button><button type="button" data-move-photo="${i}" data-direction="1" aria-label="Фото ${i + 1} правее" ${i === state.editingPhotos.length - 1 ? "disabled" : ""}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button><button type="button" data-remove-photo="${i}">Убрать</button></div></div>`,
      )
      .join("");
    for (const f of state.editingPhotos)
      try {
        const url = await previewUrl(f.path);
        const img = $('[data-photo-path="' + f.path + '"]');
        if (img) img.src = url;
      } catch {}
    $$("[data-main-photo]", root).forEach(
      (b) =>
        (b.onclick = () => {
          const [f] = state.editingPhotos.splice(
            Number(b.dataset.mainPhoto),
            1,
          );
          state.editingPhotos.unshift(f);
          state.dirty = true;
          renderPhotos();
        }),
    );
    $$("[data-move-photo]", root).forEach(
      (b) =>
        (b.onclick = () => {
          const i = Number(b.dataset.movePhoto),
            j = i + Number(b.dataset.direction);
          [state.editingPhotos[i], state.editingPhotos[j]] = [
            state.editingPhotos[j],
            state.editingPhotos[i],
          ];
          state.dirty = true;
          renderPhotos();
        }),
    );
    $$("[data-remove-photo]", root).forEach(
      (b) =>
        (b.onclick = () => {
          const [removed] = state.editingPhotos.splice(
            Number(b.dataset.removePhoto),
            1,
          );
          pendingFiles.add(removed.path);
          state.dirty = true;
          renderPhotos();
        }),
    );
  }
  $("[data-preview]").onclick = async () => {
    const p = documentData();
    if (p.title.length < 5 || p.city.length < 2) {
      message(
        "[data-editor-message]",
        "Заполните название и город для предпросмотра.",
      );
      return;
    }
    const token = crypto.randomUUID(),
      popup = window.open(
        "../property.html?id=" + p.id + "&preview=" + token,
        "_blank",
      );
    if (!popup) {
      message(
        "[data-editor-message]",
        "Разрешите открытие новой вкладки для предпросмотра.",
      );
      return;
    }
    const receive = async (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== popup ||
        event.data?.type !== "ilsiyar-preview-ready" ||
        event.data.token !== token
      )
        return;
      removeEventListener("message", receive);
      try {
        const photos = [];
        for (const f of state.editingPhotos) {
          const { data, error } = await client.storage
            .from(config.bucket)
            .download(f.path);
          if (error) throw error;
          const src = URL.createObjectURL(data);
          state.blobs.add(src);
          photos.push({ src, alt: f.alt || p.title });
        }
        popup.postMessage(
          {
            type: "ilsiyar-preview",
            token,
            property: { ...p, photos, published: true },
          },
          location.origin,
        );
      } catch (e) {
        message("[data-editor-message]", errorText(e));
        popup.close();
      }
    };
    addEventListener("message", receive);
    setTimeout(() => removeEventListener("message", receive), 15000);
  };
  function resolvedCover(key) {
    return state.resolved.find((c) => c.category === key);
  }
  async function renderCovers() {
    const root = $("[data-cover-list]");
    root.innerHTML = Object.entries(categories)
      .map(([key, label]) => {
        const c = state.covers.find((c) => c.category === key),
          resolved = resolvedCover(key);
        return `<article class="cover-card"><div class="cover-image"><img data-category-image="${key}" alt="${escape(label)}" hidden><span data-category-empty="${key}">Фото пока нет</span></div><div class="cover-card-body"><h3>${escape(label)}</h3><p>${c?.mode === "upload" ? "Отдельная обложка" : c?.mode === "property" ? "Выбрано фото объекта" : "Автоматически из первого объекта"}${resolved?.path ? "" : " · пока нет опубликованных фото"}</p><button class="quiet" data-edit-cover="${key}">Изменить обложку</button></div></article>`;
      })
      .join("");
    for (const key of Object.keys(categories)) {
      const c = resolvedCover(key);
      if (c?.useIllustration && legacyPhotos[key]) {
        const image = $('[data-category-image="' + key + '"]');
        image.src = "../assets/images/" + legacyPhotos[key];
        image.hidden = false;
        $('[data-category-empty="' + key + '"]').hidden = true;
        const description = image
          .closest(".cover-card")
          .querySelector(".cover-card-body p");
        description.textContent =
          "Текущая иллюстрация. Замените своим фото или опубликуйте объект этой категории.";
      }
      if (c?.path)
        try {
          const src = await previewUrl(c.path);
          const image = $('[data-category-image="' + key + '"]');
          image.src = src;
          image.hidden = false;
          image.style.objectPosition = c.crop_x + "% " + c.crop_y + "%";
          image.style.scale = String(c.zoom);
          $('[data-category-empty="' + key + '"]').hidden = true;
        } catch {}
    }
    $$("[data-edit-cover]").forEach(
      (b) => (b.onclick = () => openCover(b.dataset.editCover)),
    );
  }
  function openCover(key) {
    const c = state.covers.find((c) => c.category === key) || {};
    state.cover = {
      key,
      path: c.path || null,
      propertyId: c.property_id || null,
      mode: c.mode || "auto",
      uploadPath: c.mode === "upload" ? c.path : null,
      previousUploadPath: c.mode === "upload" ? c.path : null,
      newUpload: false,
    };
    $("[data-cover-title]").textContent = categories[key];
    $("[data-cover-preview-title]").textContent = categories[key];
    $("[data-cover-mode]").value = state.cover.mode;
    $("[data-crop-x]").value = c.crop_x ?? 50;
    $("[data-crop-y]").value = c.crop_y ?? 50;
    $("[data-crop-zoom]").value = c.zoom ?? 1;
    $("[data-cover-rights]").checked = false;
    const photos = state.items
      .filter((p) => p.is_published && match(p, key))
      .flatMap((p) => photoList(p.id).map((f, i) => ({ p, f, i })));
    $("[data-cover-property]").innerHTML =
      '<option value="">Выберите фото объекта</option>' +
      photos
        .map(
          ({ p, f, i }) =>
            `<option value="${escape(f.path)}" data-property-id="${escape(p.id)}">${escape(p.title)} · фото ${i + 1}</option>`,
        )
        .join("");
    $("[data-cover-property]").value =
      c.mode === "property" ? c.path || "" : "";
    message("[data-cover-message]");
    coverEditor.showModal();
    coverEditor.scrollTop = 0;
    updateCoverPreview();
  }
  async function updateCoverPreview() {
    if (!state.cover) return;
    state.cover.mode = $("[data-cover-mode]").value;
    $("[data-cover-property-label]").hidden = state.cover.mode !== "property";
    $("[data-cover-upload-label]").hidden = state.cover.mode !== "upload";
    $("[data-cover-rights-label]").hidden = state.cover.mode !== "upload";
    let path = state.cover.path;
    for (const selector of [
      "[data-crop-x]",
      "[data-crop-y]",
      "[data-crop-zoom]",
    ])
      $(selector).disabled = state.cover.mode === "auto";
    if (state.cover.mode === "upload") {
      path = state.cover.uploadPath;
      state.cover.path = path || null;
    }
    if (state.cover.mode === "auto") {
      $("[data-crop-x]").value = 50;
      $("[data-crop-y]").value = 50;
      $("[data-crop-zoom]").value = 1;
      const candidates = state.items
        .filter((p) => p.is_published && match(p, state.cover.key))
        .sort(
          (a, b) =>
            String(a.published_at).localeCompare(String(b.published_at)) ||
            a.id.localeCompare(b.id),
        );
      path = photoList(candidates[0]?.id)[0]?.path;
    }
    if (state.cover.mode === "property") {
      const option = $("[data-cover-property]").selectedOptions[0];
      path = option?.value;
      state.cover.propertyId = option?.dataset.propertyId || null;
      state.cover.path = path || null;
    }
    const image = $("[data-cover-preview] img");
    const illustration =
      state.cover.mode === "auto" &&
      resolvedCover(state.cover.key)?.useIllustration &&
      legacyPhotos[state.cover.key];
    image.hidden = !path && !illustration;
    if (illustration && !path)
      image.src = "../assets/images/" + legacyPhotos[state.cover.key];
    if (path)
      try {
        image.src = await previewUrl(path);
      } catch {
        image.hidden = true;
      }
    image.style.objectPosition =
      $("[data-crop-x]").value + "% " + $("[data-crop-y]").value + "%";
    image.style.scale = $("[data-crop-zoom]").value;
  }
  for (const s of [
    "[data-cover-mode]",
    "[data-cover-property]",
    "[data-crop-x]",
    "[data-crop-y]",
    "[data-crop-zoom]",
  ])
    $(s).oninput = () => {
      updateCoverPreview().catch((e) =>
        message("[data-cover-message]", errorText(e)),
      );
    };
  $("[data-cover-upload]").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    // Keep one cover upload in flight; its category/mode cannot change mid-upload.
    const controls = $$("button,input,select", coverEditor).map((node) => [
      node, node.disabled,
    ]);
    controls.forEach(([node]) => {
      node.disabled = true;
    });
    try {
      message("[data-cover-message]", "Уменьшаем и загружаем фото…", true);
      const image = await optimize(f),
        path = "covers/" + crypto.randomUUID() + image.extension;
      const { error } = await client.storage
        .from(config.bucket)
        .upload(path, image.blob, {
          contentType: image.contentType,
          upsert: false,
          cacheControl: "0",
        });
      if (error) throw error;
      pendingFiles.add(path);
      state.cover.path = path;
      state.cover.uploadPath = path;
      state.cover.newUpload = true;
      await updateCoverPreview();
      message(
        "[data-cover-message]",
        "Фото загружено. Настройте кадрирование и сохраните обложку.",
        true,
      );
    } catch (e) {
      message("[data-cover-message]", errorText(e));
    } finally {
      controls.forEach(([node, disabled]) => {
        node.disabled = disabled;
      });
    }
  };
  $("[data-save-cover]").onclick = async () => {
    const c = state.cover,
      b = $("[data-save-cover]");
    b.disabled = true;
    try {
      if (c.mode !== "auto" && !c.path) throw Error("Выберите фотографию.");
      if (
        c.mode === "upload" &&
        c.newUpload &&
        !$("[data-cover-rights]").checked
      )
        throw Error("Подтвердите право публикации фотографии.");
      await rpc("cms_save_cover", {
        category_key: c.key,
        cover_mode: c.mode,
        media_path: c.mode === "auto" ? null : c.path,
        source_property: c.mode === "property" ? c.propertyId : null,
        x: Number($("[data-crop-x]").value),
        y: Number($("[data-crop-y]").value),
        scale: Number($("[data-crop-zoom]").value),
      });
      if (
        c.previousUploadPath &&
        c.previousUploadPath !== (c.mode === "upload" ? c.path : null)
      )
        pendingFiles.add(c.previousUploadPath);
      await reload();
      await cleanupUnused();
      coverEditor.close();
      toast("Обложка сохранена. Она обновится на главной странице.");
    } catch (e) {
      message("[data-cover-message]", errorText(e));
    } finally {
      b.disabled = false;
    }
  };
  $("[data-close-cover]").onclick = () => {
    coverEditor.close();
    cleanupUnused().catch(() => {});
  };
  function download(blob, name) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function loadZip() {
    if (window.JSZip) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "../assets/vendor/jszip-3.10.1.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  $("[data-export]").onclick = async () => {
    const b = $("[data-export]");
    b.disabled = true;
    const progress = $("[data-export-progress]");
    try {
      await reload();
      await loadZip();
      const date = new Date().toISOString().slice(0, 10),
        data = {
          format: "ilsiyar-cms-backup-v1",
          createdAt: new Date().toISOString(),
          properties: state.items,
          photos: state.photos,
          covers: state.covers,
        };
      const paths = [
        ...new Set([
          ...state.photos.map((p) => p.path),
          ...state.covers.filter((c) => c.mode === "upload").map((c) => c.path),
        ]),
      ];
      let zip = new JSZip(),
        part = 1,
        bytes = 0;
      zip.file("catalog-backup.json", JSON.stringify(data, null, 2));
      for (let i = 0; i < paths.length; i++) {
        progress.textContent = `Сохраняем фотографии: ${i + 1} из ${paths.length}…`;
        const { data: blob, error } = await client.storage
          .from(config.bucket)
          .download(paths[i]);
        if (error) throw error;
        zip.file("photos/" + paths[i], blob);
        bytes += blob.size;
        if (bytes > 30 * 1048576 && i < paths.length - 1) {
          download(
            await zip.generateAsync({ type: "blob", compression: "STORE" }),
            `ilsiyar-backup-${date}-${part++}.zip`,
          );
          zip = new JSZip();
          bytes = 0;
        }
      }
      download(
        await zip.generateAsync({ type: "blob", compression: "STORE" }),
        `ilsiyar-backup-${date}-${part}.zip`,
      );
      progress.textContent =
        "Копия готова. Сохраните все части архива; браузер может попросить разрешить несколько загрузок.";
    } catch (e) {
      progress.textContent = errorText(e);
    } finally {
      b.disabled = false;
    }
  };
})();
