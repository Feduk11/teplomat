/* Shared, buildless CMS client. Render plain text only; never accept stored HTML. */
window.SiteCMS = (() => {
  const config = window.SITE_CONFIG || {};
  const url = (config.supabaseUrl || '').replace(/\/$/, '');
  const key = config.supabaseKey || '';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const draftKey = 'teplomaterial-draft-v1:' + location.pathname.replace(/[^/]*$/, '');
  let session = null;
  let publicKey = key.startsWith('sb_publishable_');
  if (key.startsWith('eyJ')) {
    try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { publicKey = false; }
  }
  const configured = /^https:\/\/[^/]+$/.test(url) && publicKey;
  function text(el, value) {
    const marker = el.querySelector('.status-dot')?.cloneNode(true);
    el.replaceChildren(...String(value).split('\n').flatMap((line, index) => index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
    if (marker) el.prepend(marker);
  }
  function safeImage(value) {
    if (typeof value !== 'string' || !value || value.length > 2048) return false;
    try { const parsed = new URL(value, location.href); return parsed.protocol === 'https:' || (value.startsWith('./assets/') && !value.includes('..')); } catch { return false; }
  }
  function safeLink(value) {
    try { return ['https:', 'mailto:', 'tel:'].includes(new URL(value, location.href).protocol); } catch { return false; }
  }
  function validate(content) {
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Неверный формат содержимого.');
    if (JSON.stringify(content).length > 500000) throw new Error('Содержимое слишком большое.');
    for (const [id, value] of Object.entries(content.texts || {})) {
      if (!/^text-\d+$/.test(id) || typeof value !== 'string' || value.length > 12000) throw new Error('Неверное текстовое поле.');
    }
    for (const [id, value] of Object.entries(content.images || {})) {
      if (!/^image-\d+$/.test(id) || !value || !safeImage(value.src) || typeof value.alt !== 'string') throw new Error('Используйте HTTPS адрес изображения или путь ./assets/.');
    }
    for (const [id, value] of Object.entries(content.links || {})) {
      if (!['email', 'phone'].includes(id) || !value || !safeLink(value.href) || typeof value.text !== 'string') throw new Error('Неверный адрес ссылки.');
    }
    if (content.products) for (const [id, product] of Object.entries(content.products)) {
      if (!['plate', 'light', 'wall'].includes(id) || !product || typeof product.title !== 'string' || typeof product.description !== 'string' || typeof product.note !== 'string' || !Array.isArray(product.specs) || product.specs.length > 15 || product.specs.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string'))) throw new Error('Проверьте характеристики изделий.');
    }
    if (content.seo && (typeof content.seo.title !== 'string' || typeof content.seo.description !== 'string')) throw new Error('Проверьте название и описание страницы.');
    if (content.accent && !/^#[0-9a-f]{6}$/i.test(content.accent)) throw new Error('Неверный цвет акцента.');
    return content;
  }
  function apply(content, doc = document) {
    validate(content);
    doc.querySelectorAll('[data-cms]').forEach(el => { const value = content.texts?.[el.dataset.cms]; if (typeof value === 'string') text(el, value); });
    doc.querySelectorAll('[data-cms-image]').forEach(el => { const value = content.images?.[el.dataset.cmsImage]; if (value) { el.src = value.src; el.alt = value.alt; } });
    doc.querySelectorAll('[data-cms-link]').forEach(el => { const value = content.links?.[el.dataset.cmsLink]; if (value) { el.href = value.href; el.textContent = value.text; } });
    if (content.seo?.title) doc.title = content.seo.title;
    if (typeof content.seo?.description === 'string') doc.querySelector('meta[name="description"]')?.setAttribute('content', content.seo.description);
    if (content.seo?.title) doc.querySelector('meta[property="og:title"]')?.setAttribute('content', content.seo.title);
    if (typeof content.seo?.description === 'string') doc.querySelector('meta[property="og:description"]')?.setAttribute('content', content.seo.description);
    if (content.accent) doc.documentElement.style.setProperty('--olive', content.accent);
    if (content.products && doc.defaultView?.products) {
      Object.assign(doc.defaultView.products, structuredClone(content.products));
      const active = doc.querySelector('[data-product][aria-selected="true"]');
      if (active) doc.defaultView.selectProduct(active);
    }
  }
  async function request(path, { method = 'GET', body, auth = false, headers = {}, raw = false } = {}) {
    if (!configured) throw new Error('Сначала подключите Supabase в config.js.');
    if (auth) await refresh();
    const response = await fetch(url + path, {
      method,
      headers: { apikey: key, ...(session?.access_token && auth ? { Authorization: 'Bearer ' + session.access_token } : key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), ...(raw ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) throw new Error('Сеанс истёк или неверные данные входа. Войдите снова.');
      if (response.status === 403) throw new Error('Нет доступа. Проверьте назначение администратора и политики базы.');
      if (data?.message?.includes('version_conflict')) throw new Error('Другой администратор уже изменил сайт. Экспортируйте свой черновик и загрузите опубликованную версию.');
      throw new Error(response.status === 400 && path.includes('/auth/') ? 'Не удалось войти. Проверьте email, пароль и подтверждение пользователя.' : 'Запрос не выполнен. Проверьте подключение Supabase и SQL настройки.');
    }
    return data;
  }
  async function refresh() {
    if (!session) throw new Error('Войдите в аккаунт администратора.');
    if (session.expires_at > Date.now() / 1000 + 60) return;
    const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
    session = { ...data, expires_at: Date.now() / 1000 + data.expires_in };
  }
  async function signIn(email, password) {
    const data = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    session = { ...data, expires_at: Date.now() / 1000 + data.expires_in };
    try {
      const allowed = await request('/rest/v1/rpc/is_site_admin', { method: 'POST', body: {}, auth: true });
      if (allowed !== true) throw new Error('У этого пользователя нет прав администратора.');
    } catch (error) { await signOut().catch(() => {}); throw error; }
    return data.user;
  }
  async function signOut() {
    try { if (session) await request('/auth/v1/logout?scope=local', { method: 'POST', auth: true }); }
    finally { session = null; }
  }
  async function read() {
    const rows = await request('/rest/v1/site_content?id=eq.main&select=content,version,updated_at');
    if (!rows?.length) throw new Error('Таблица сайта пуста. Выполните supabase/schema.sql.');
    return rows[0];
  }
  async function publish(content, version) {
    validate(content);
    return request('/rest/v1/rpc/publish_site_content', { method: 'POST', auth: true, body: { new_content: content, expected_version: version } });
  }
  async function upload(file) {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Выберите PNG, JPG, WebP или AVIF до 5 МБ.');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' }[file.type];
    const path = 'images/' + crypto.randomUUID() + '.' + extension;
    await request('/storage/v1/object/site-media/' + path, { method: 'POST', auth: true, raw: true, body: file, headers: { 'Content-Type': file.type, 'x-upsert': 'false' } });
    return url + '/storage/v1/object/public/site-media/' + path;
  }
  return { configured, local, draftKey, apply, validate, signIn, signOut, read, publish, upload };
})();

if (document.querySelector('main#main')) {
  (async () => {
    try {
      // Preview reads only this browser's draft; it never publishes data or grants write access.
      const preview = new URLSearchParams(location.search).get('cms-preview') === '1';
      if (preview) {
        const value = sessionStorage.getItem(SiteCMS.draftKey);
        if (value) SiteCMS.apply(JSON.parse(value));
      } else if (SiteCMS.local && !SiteCMS.configured && localStorage.getItem(SiteCMS.draftKey + ':published')) {
        SiteCMS.apply(JSON.parse(localStorage.getItem(SiteCMS.draftKey + ':published')));
      } else if (SiteCMS.configured) {
        const row = await SiteCMS.read(); SiteCMS.apply(row.content);
      }
    } catch { console.warn('CMS недоступна. Показана встроенная версия сайта.'); }
  })();
}
