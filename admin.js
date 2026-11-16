(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const clone = value => structuredClone(value);
  const sectionNames = { intro: 'Первый экран', benefits: 'Преимущества', 'material-structure': 'Инфографика', technology: 'Технология', products: 'Материалы', applications: 'Применение', team: 'Команда и документы', faq: 'Вопросы и ответы', contact: 'Контакты', tagline: 'Текстовый акцент', media: 'Изображения', specifications: 'Характеристики изделий', settings: 'Название и оформление' };
  let source, defaults, content, version = 0, localMode = false, currentSection = 'intro', dirty = false, busy = false;
  let fields = [], groups = [];
  const draftBackupKey = SiteCMS.draftKey + ':backup';
  const localPublishedKey = SiteCMS.draftKey + ':published';
  function status(message, error = false) { const el = $('#editor-screen').hidden ? $('#login-status') : $('#editor-status'); el.textContent = message; el.classList.toggle('error', error); }
  function readText(el) { const copy = el.cloneNode(true); copy.querySelectorAll('br').forEach(br => br.replaceWith('\n')); return copy.textContent.trim(); }
  function groupFor(el) {
    const section = el.closest('section');
    return section?.id || (section?.classList.contains('tagline-section') ? 'tagline' : 'intro');
  }
  function remember() {
    sessionStorage.setItem(SiteCMS.draftKey, JSON.stringify(content));
    localStorage.setItem(draftBackupKey, JSON.stringify(content));
  }
  function markDirty() {
    dirty = true; remember();
    $('#editor-banner').textContent = localMode ? 'Локальный режим. Изменения видны только в этом браузере и не публикуются в интернете. Есть несохранённые изменения.' : 'Есть неопубликованные изменения. Проверьте их в предпросмотре, затем опубликуйте.';
    const frame = $('#site-preview');
    if (!$('#preview-panel').hidden && frame.contentDocument?.querySelector('main#main')) {
      try { SiteCMS.apply(content, frame.contentDocument); } catch { /* Incomplete URLs remain editable until validation on save. */ }
    }
  }
  function create(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el; }
  function inputField(label, value, update, { multiline = false, type = 'text', help = '', maxLength = 12000 } = {}) {
    const wrap = create('div', 'cms-field'); const id = 'field-' + crypto.randomUUID();
    const labelEl = create('label', 'title-4', label); labelEl.htmlFor = id;
    const input = create(multiline ? 'textarea' : 'input'); input.id = id; if (!multiline) input.type = type;
    input.value = value || ''; input.maxLength = maxLength;
    input.addEventListener('input', () => { update(input.value); markDirty(); });
    wrap.append(labelEl, input); if (help) wrap.append(create('p', 'field-help caption-2', help));
    return { wrap, input };
  }
  async function loadSource() {
    const response = await fetch('./index.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось открыть index.html. Запустите локальный сервер.');
    source = new DOMParser().parseFromString(await response.text(), 'text/html');
    defaults = { texts: {}, images: {}, links: {}, products: clone(window.SITE_PRODUCTS), seo: { title: source.title, description: source.querySelector('meta[name="description"]').content }, accent: '#d5df9f' };
    fields = [...source.querySelectorAll('[data-cms]')].map(el => {
      const id = el.dataset.cms; const value = readText(el); defaults.texts[id] = value;
      return { id, value, section: groupFor(el), heading: /^H/.test(el.tagName) };
    });
    source.querySelectorAll('[data-cms-image]').forEach(el => defaults.images[el.dataset.cmsImage] = { src: el.getAttribute('src'), alt: el.alt });
    source.querySelectorAll('[data-cms-link]').forEach(el => defaults.links[el.dataset.cmsLink] = { href: el.getAttribute('href'), text: el.textContent.trim() });
    groups = [...new Set(fields.map(field => field.section)), 'specifications', 'media', 'settings'];
  }
  function mergeDefaults(value) {
    return { ...clone(defaults), ...value, texts: { ...defaults.texts, ...value.texts }, images: { ...clone(defaults.images), ...value.images }, links: { ...clone(defaults.links), ...value.links }, products: { ...clone(defaults.products), ...value.products }, seo: { ...defaults.seo, ...value.seo } };
  }
  async function loadPublished() {
    if (localMode) {
      const stored = localStorage.getItem(localPublishedKey);
      content = stored ? mergeDefaults(JSON.parse(stored)) : clone(defaults);
      version = 0;
    } else {
      const row = await SiteCMS.read(); SiteCMS.validate(row.content); content = mergeDefaults(row.content); version = row.version;
    }
    dirty = false; remember();
    $('#editor-banner').textContent = localMode ? 'Локальный режим. Сохранение действует только в этом браузере. Для публикации подключите Supabase.' : 'Вы редактируете опубликованную версию. Изменения появятся на сайте после публикации.';
  }
  function renderNav() {
    $('#section-nav').replaceChildren(...groups.map(group => {
      const button = create('button', 'title-4', sectionNames[group] || group); button.type = 'button'; button.dataset.group = group;
      button.addEventListener('click', () => { currentSection = group; renderFields(); }); return button;
    }));
  }
  function renderFields() {
    $('#section-nav').querySelectorAll('button').forEach(button => button.setAttribute('aria-current', String(button.dataset.group === currentSection)));
    $('#fields-title').textContent = sectionNames[currentSection] || currentSection;
    const container = $('#fields'); container.replaceChildren();
    if (currentSection === 'media') {
      Object.entries(content.images).forEach(([id, image], index) => {
        const card = create('article', 'cms-field'); card.append(create('h3', 'title-2', 'Изображение ' + (index + 1)));
        const preview = create('img', 'image-edit-preview'); preview.src = image.src; preview.alt = image.alt;
        preview.addEventListener('error', () => { preview.hidden = true; });
        card.append(preview);
        const urlInput = inputField('Адрес изображения', image.src, value => { image.src = value; if (/^(https:\/\/|\.\/assets\/)/.test(value)) { preview.hidden = false; preview.src = value; } }, { help: 'HTTPS адрес или путь ./assets/имя-файла. Без загрузки файла сайт сохраняет ссылку.' });
        card.append(urlInput.wrap, inputField('Описание для доступности', image.alt, value => image.alt = value, { maxLength: 500 }).wrap);
        const uploadWrap = create('div', 'image-upload'); const label = create('label', 'title-4', 'Загрузить в медиатеку'); const fileInput = create('input'); fileInput.id = 'upload-' + id; label.htmlFor = fileInput.id; fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp,image/avif'; fileInput.disabled = localMode;
        fileInput.addEventListener('change', async () => {
          if (!fileInput.files[0]) return;
          fileInput.disabled = true; status('Загружаем изображение…');
          try { const url = await SiteCMS.upload(fileInput.files[0]); image.src = url; urlInput.input.value = url; preview.src = url; preview.hidden = false; markDirty(); status('Изображение загружено. Опубликуйте изменения, чтобы использовать его на сайте.'); }
          catch (error) { status(error.message, true); }
          finally { fileInput.disabled = false; fileInput.value = ''; }
        });
        uploadWrap.append(label, fileInput, create('p', 'field-help caption-2', localMode ? 'Загрузка файлов доступна после входа через Supabase. Локально положите файл в assets и укажите путь выше.' : 'PNG, JPG, WebP или AVIF до 5 МБ. Загруженный файл станет публично доступен в медиатеке.'));
        card.append(uploadWrap); container.append(card);
      });
    } else if (currentSection === 'specifications') {
      Object.entries(content.products).forEach(([key, product]) => {
        const card = create('article', 'product-edit'); card.append(create('h3', 'title-2', defaults.products[key].title));
        card.append(inputField('Название', product.title, value => product.title = value).wrap, inputField('Описание', product.description, value => product.description = value, { multiline: true }).wrap);
        const rows = create('div', 'cms-field'); rows.append(create('p', 'title-4', 'Характеристики'));
        product.specs.forEach((pair, index) => {
          const row = create('div', 'spec-edit-row');
          pair.forEach((value, column) => { const input = create('input'); input.value = value; input.setAttribute('aria-label', (column ? 'Значение' : 'Характеристика') + ' ' + (index + 1) + ', ' + product.title); input.maxLength = 500; input.addEventListener('input', () => { pair[column] = input.value; markDirty(); }); row.append(input); });
          const remove = create('button', 'button-sm', '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Удалить характеристику ' + (index + 1)); remove.addEventListener('click', () => { product.specs.splice(index, 1); markDirty(); renderFields(); }); row.append(remove); rows.append(row);
        });
        const add = create('button', 'admin-secondary button-sm add-spec', 'Добавить характеристику'); add.type = 'button'; add.disabled = product.specs.length >= 15; add.addEventListener('click', () => { product.specs.push(['Новая характеристика', '']); markDirty(); renderFields(); });
        card.append(rows, add, inputField('Примечание', product.note, value => product.note = value, { multiline: true }).wrap); container.append(card);
      });
    } else if (currentSection === 'settings') {
      container.append(inputField('Название страницы', content.seo.title, value => content.seo.title = value, { maxLength: 250 }).wrap, inputField('Описание для поиска и предпросмотра', content.seo.description, value => content.seo.description = value, { multiline: true, maxLength: 1000, help: 'Социальные сети и поисковые роботы могут использовать исходные метатеги index.html. Для них продублируйте эти изменения в файле перед загрузкой на GitHub.' }).wrap, inputField('Цвет акцента', content.accent, value => content.accent = value, { type: 'color' }).wrap);
    } else {
      fields.filter(field => field.section === currentSection).forEach((field, index) => {
        const label = (field.heading ? 'Заголовок' : 'Текст') + ' ' + (index + 1);
        container.append(inputField(label, content.texts[field.id], value => content.texts[field.id] = value, { multiline: true, help: field.heading ? 'Перенос строки сохранится на странице.' : '' }).wrap);
      });
      if (currentSection === 'contact') Object.entries(content.links).forEach(([key, link]) => {
        container.append(inputField(key === 'email' ? 'Email: подпись' : 'Телефон: подпись', link.text, value => link.text = value).wrap, inputField(key === 'email' ? 'Ссылка email' : 'Ссылка телефона', link.href, value => link.href = value, { help: key === 'email' ? 'Формат: mailto:name@example.com' : 'Формат: tel:+79617033011' }).wrap);
      });
    }
    status('');
  }
  async function openEditor(isLocal) {
    localMode = isLocal;
    $('#auth-screen').hidden = true; $('#editor-screen').hidden = false;
    $('#fields').replaceChildren(create('div', 'editor-skeleton'), create('div', 'editor-skeleton'));
    $('#editor-mode').textContent = localMode ? 'Локальный редактор' : 'Администратор сайта';
    $('#save-content').textContent = localMode ? 'Сохранить локально' : 'Опубликовать изменения';
    $('#save-content').disabled = true;
    try {
      const previousDraft = localStorage.getItem(draftBackupKey);
      await loadSource(); await loadPublished();
      if (previousDraft) {
        try {
          const parsed = JSON.parse(previousDraft); SiteCMS.validate(parsed);
          if (JSON.stringify(parsed) !== JSON.stringify(content)) {
            content = mergeDefaults(parsed); markDirty();
            $('#editor-banner').textContent = 'Восстановлен черновик этого браузера. Проверьте его перед сохранением. Кнопка «Загрузить опубликованное» вернёт текущую версию сайта.';
          }
        } catch { /* A malformed local backup never blocks the published page. */ }
      }
      renderNav(); renderFields(); $('#save-content').disabled = false;
    } catch (error) { status(error.message, true); }
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#login-submit'); button.disabled = true; button.textContent = 'Входим…'; status('Проверяем доступ…');
    try { await SiteCMS.signIn($('#login-email').value.trim(), $('#login-password').value); $('#login-password').value = ''; await openEditor(false); }
    catch (error) { status(error.message, true); }
    finally { button.disabled = !SiteCMS.configured; button.textContent = 'Войти в админку ↗'; }
  });
  $('#open-local').addEventListener('click', () => openEditor(true));
  $('#save-content').addEventListener('click', async () => {
    if (busy || !content) return;
    busy = true; const button = $('#save-content'); button.disabled = true; const label = button.textContent; button.textContent = 'Сохраняем…';
    try {
      const saved = clone(content); SiteCMS.validate(saved);
      if (localMode) { localStorage.setItem(localPublishedKey, JSON.stringify(saved)); remember(); }
      else {
        const result = await SiteCMS.publish(saved, version); version = result.version;
      }
      dirty = JSON.stringify(saved) !== JSON.stringify(content);
      $('#editor-banner').textContent = localMode ? 'Сохранено локально. Главная страница в этом браузере покажет изменения. В интернете сайт не изменился.' : 'Изменения опубликованы. Обновите страницу сайта, чтобы увидеть результат.';
      if (dirty) $('#editor-banner').textContent += ' Есть новые изменения, внесённые во время сохранения.';
      status(localMode ? 'Локальная версия сохранена.' : 'Сайт обновлён.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; button.disabled = false; button.textContent = label; }
  });
  $('#reload-content').addEventListener('click', async () => {
    if (!defaults) { await openEditor(localMode); return; }
    if (dirty && !window.confirm('Загрузить опубликованную версию вместо текущего черновика? При необходимости сначала экспортируйте JSON.')) return;
    try { await loadPublished(); renderFields(); if (!$('#preview-panel').hidden) $('#site-preview').src = './index.html?cms-preview=1'; status('Опубликованная версия загружена.'); } catch (error) { status(error.message, true); }
  });
  $('#export-draft').addEventListener('click', () => {
    if (!content) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = create('a'); link.href = url; link.download = 'teplomaterial-content.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#import-draft').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file || !defaults) return;
    try {
      if (file.size > 1000000) throw new Error('JSON файл должен быть меньше 1 МБ.');
      const value = JSON.parse(await file.text()); SiteCMS.validate(value);
      content = mergeDefaults(value); markDirty(); renderFields(); status('Черновик импортирован. Проверьте его перед сохранением.');
    } catch (error) { status('Не удалось импортировать файл. ' + error.message, true); }
    finally { event.target.value = ''; }
  });
  $('#toggle-preview').addEventListener('click', () => {
    if (!content) return;
    const panel = $('#preview-panel'); panel.hidden = !panel.hidden;
    $('#toggle-preview').setAttribute('aria-expanded', String(!panel.hidden));
    $('.editor-grid').classList.toggle('with-preview', !panel.hidden);
    if (!panel.hidden) { remember(); $('#site-preview').src = './index.html?cms-preview=1'; }
  });
  $('#logout').addEventListener('click', async () => {
    try { if (!localMode) await SiteCMS.signOut(); } catch { /* session is always cleared in finally */ }
    $('#editor-screen').hidden = true; $('#auth-screen').hidden = false; $('#preview-panel').hidden = true; $('#site-preview').src = 'about:blank'; status('Вы вышли из редактора.');
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  $('#setup-notice').hidden = SiteCMS.configured;
  $('#login-submit').disabled = !SiteCMS.configured;
  $('#login-email').disabled = !SiteCMS.configured;
  $('#login-password').disabled = !SiteCMS.configured;
  $('#local-entry').hidden = !SiteCMS.local;
  $('#file-notice').hidden = location.protocol !== 'file:';
})();
