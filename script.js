const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const API_BASE_URL = LOCAL_HOSTNAMES.has(window.location.hostname)
  ? ''
  : 'https://ilsiyar-api.onrender.com';

const SITE_CONFIG = {
  expertName: "Ильсияр Тухватшина",
  phoneDisplay: "8 937 484-85-65",
  phoneHref: "+79374848565",
  maxUrl: "https://max.ru/u/f9LHodD0cOKs7_oYOS3TB9VatfujTB8eyR0NKQKM1gUh8QtX0KpVJBIRui24",
  whatsappUrl: "https://wa.me/79374848565",
  telegramUrl: "https://t.me/IlsiyarT",
  instagramUrl: "https://www.instagram.com/ilsiyartuxvatshina/",
  maxChannelUrl: "https://max.ru/join/uustn4TLuKcPvMNIyR5K932BFnBPhkdwYG1FXoGfWsk",
  portraitImage: "assets/images/photo_2026-08-23_15-43-49.jpg",
  portraitAlt: "Ильсияр Тухватшина, эксперт по недвижимости",
  agencyLogo: "", // Например: "assets/images/norma-logo.svg"
  formMode: "backend",
  formEndpoint: `${API_BASE_URL}/api/lead`,
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function applyConfig() {
  $$('[data-expert-name]').forEach((node) => { node.textContent = SITE_CONFIG.expertName; });
  $('[data-year]').textContent = new Date().getFullYear();

  const contactUrls = {
    phone: `tel:${SITE_CONFIG.phoneHref}`,
    max: SITE_CONFIG.maxUrl,
    whatsapp: SITE_CONFIG.whatsappUrl,
    telegram: SITE_CONFIG.telegramUrl,
    instagram: SITE_CONFIG.instagramUrl,
    maxChannel: SITE_CONFIG.maxChannelUrl,
  };
  $$('[data-contact]').forEach((link) => {
    const url = contactUrls[link.dataset.contact];
    if (url) link.href = url;
  });

  if (SITE_CONFIG.portraitImage) {
    const card = $('[data-portrait-zone]');
    const portrait = $('[data-portrait-image]', card);
    card.classList.add('has-image');
    portrait.src = SITE_CONFIG.portraitImage;
    portrait.alt = SITE_CONFIG.portraitAlt;
  }

  if (SITE_CONFIG.agencyLogo) {
    const logo = $('[data-logo-slot]');
    logo.style.background = `center / contain no-repeat url("${SITE_CONFIG.agencyLogo}")`;
    logo.textContent = '';
    logo.style.border = '0';
  }
}

function initHeader() {
  const header = $('[data-header]');
  const toggle = $('.menu-toggle');
  const menu = $('.mobile-menu');
  let lastFocused = null;

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.setAttribute('aria-hidden', String(!open));
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    if (open) {
      lastFocused = document.activeElement;
      requestAnimationFrame(() => $('a', menu)?.focus());
    } else if (lastFocused === toggle) {
      toggle.focus();
    }
  };

  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
    if (event.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
    const focusable = [toggle, ...$$('a', menu)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 18);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initScenarioTabs() {
  const tabs = $$('.scenario-tab');
  const panels = $$('.scenario-panel');

  const activate = (tab, focus = false) => {
    const scenario = tab.dataset.scenario;
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.dataset.panel === scenario;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (focus) tab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      activate(tabs[next], true);
    });
  });
}

function initIntentLinks() {
  $$('[data-intent]').forEach((link) => {
    link.addEventListener('click', () => {
      const option = $(`input[name="intent"][value="${link.dataset.intent}"]`);
      if (option) option.checked = true;
    });
  });
}

function initFAQ() {
  const details = $$('.faq-list details');
  details.forEach((item) => item.addEventListener('toggle', () => {
    if (!item.open) return;
    details.forEach((other) => { if (other !== item) other.open = false; });
  }));
}

function initReveal() {
  const nodes = $$('.reveal');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    nodes.forEach((node) => node.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.07 });
  nodes.forEach((node) => observer.observe(node));
}

function initGlassLight() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.glass-reactive').forEach((item) => {
    item.addEventListener('pointermove', (event) => {
      const bounds = item.getBoundingClientRect();
      item.style.setProperty('--mx', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      item.style.setProperty('--my', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    }, { passive: true });
  });
}

function setFormStatus(status, state = '', title = '', message = '') {
  status.replaceChildren();
  status.removeAttribute('data-state');
  if (!title) return;

  if (!state) {
    status.textContent = title;
    return;
  }

  const heading = document.createElement('strong');
  const description = document.createElement('span');
  heading.textContent = title;
  description.textContent = message;
  status.dataset.state = state;
  status.append(heading, description);
}

function initLeadForm() {
  const form = $('[data-lead-form]');
  const status = $('[data-form-status]');
  const submit = $('button[type="submit"]', form);
  const submitContent = submit.innerHTML;
  let isSubmitting = false;

  form.addEventListener('input', (event) => event.target.classList.remove('is-invalid'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormStatus(status);
    $$('[required]', form).forEach((field) => field.classList.toggle('is-invalid', !field.checkValidity()));
    if (!form.checkValidity()) {
      form.reportValidity();
      setFormStatus(status, '', 'Проверьте обязательные поля.');
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    const payload = buildLeadPayload(data);
    const lastSuccess = Number(sessionStorage.getItem('ilsiyarLeadSentAt') || 0);
    if (Date.now() - lastSuccess < 60000) {
      setFormStatus(
        status,
        'success',
        'Заявка отправлена',
        'Ильсияр получила ваше обращение и свяжется с вами.',
      );
      return;
    }

    isSubmitting = true;
    submit.disabled = true;
    submit.textContent = 'Отправляем…';
    try {
      await sendLead(payload);
      sessionStorage.setItem('ilsiyarLeadSentAt', String(Date.now()));
      setFormStatus(
        status,
        'success',
        'Заявка отправлена',
        'Ильсияр получила ваше обращение и свяжется с вами.',
      );
      form.reset();
    } catch {
      setFormStatus(
        status,
        'error',
        'Не удалось отправить заявку',
        'Попробуйте ещё раз или свяжитесь с Ильсияр напрямую.',
      );
    } finally {
      isSubmitting = false;
      submit.disabled = false;
      submit.innerHTML = submitContent;
    }
  });
}

function buildLeadPayload(data) {
  return {
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    city: String(data.city || '').trim(),
    requestType: String(data.intent || '').trim(),
    comment: String(data.comment || '').trim(),
    source: 'ilsiyar-website',
    consent: data.consent === 'on',
    website: String(data.website || '').trim(),
  };
}

async function sendLead(payload) {
  if (SITE_CONFIG.formMode === 'backend' && SITE_CONFIG.formEndpoint) {
    const response = await fetch(SITE_CONFIG.formEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Request failed');
    const result = await response.json();
    if (!result.ok) throw new Error('Request failed');
    return result;
  }
  throw new Error('Form endpoint is not configured');
}

document.addEventListener('DOMContentLoaded', () => {
  applyConfig();
  initHeader();
  initScenarioTabs();
  initIntentLinks();
  initFAQ();
  initReveal();
  initGlassLight();
  initLeadForm();
});
