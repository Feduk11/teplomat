document.documentElement.classList.add('js');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); reveal.unobserve(entry.target); }
  }), { threshold: .08 });
  document.querySelectorAll('.reveal').forEach(el => reveal.observe(el));
  const tagline = document.querySelector('.tagline');
  if (!reduced) {
    tagline.innerHTML = tagline.innerHTML.split(/(<br\s*\/?>)/i).map(part => /^<br/i.test(part) ? part : part.trim().split(/\s+/).map(word => `<span class="word">${word}</span>`).join(' ')).join('');
    const wordObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        const index = [...tagline.querySelectorAll('.word')].indexOf(entry.target);
        setTimeout(() => entry.target.classList.add('active'), index * 90);
        wordObserver.unobserve(entry.target);
      }
    }), { rootMargin: '0px 0px -12% 0px', threshold: 1 });
    tagline.querySelectorAll('.word').forEach(word => wordObserver.observe(word));
  }
  const navObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      document.querySelectorAll('.desktop-nav a').forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }), { rootMargin: '-15% 0px -55% 0px' });
  document.querySelectorAll('#technology,#products,#team').forEach(section => navObserver.observe(section));
} else document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));

const toggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  mobileNav.classList.toggle('open', open);
  mobileNav.inert = !open;
  document.body.classList.toggle('menu-open', open);
  document.querySelector('main').inert = open;
  if (open) mobileNav.querySelector('a').focus();
}
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', event => {
  if (toggle.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') { setMenu(false); toggle.focus(); }
  if (event.key === 'Tab') {
    const items = [toggle, ...mobileNav.querySelectorAll('a')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); toggle.focus(); }
  }
});
window.matchMedia('(max-width: 760px)').addEventListener('change', event => { if (!event.matches) setMenu(false); });

const products = window.products = structuredClone(window.SITE_PRODUCTS);
const tabs = [...document.querySelectorAll('[data-product]')];
function selectProduct(tab) {
  const product = products[tab.dataset.product];
  tabs.forEach(button => { button.setAttribute('aria-selected', String(button === tab)); button.tabIndex = button === tab ? 0 : -1; });
  document.querySelector('#product-title').textContent = product.title;
  document.querySelector('#product-description').textContent = product.description;
  document.querySelector('#product-specs').replaceChildren(...product.specs.map(([label, value]) => {
    const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
    dt.className = 'caption-2'; dd.className = 'title-2'; dt.textContent = label; dd.textContent = value; row.append(dt, dd); return row;
  }));
  document.querySelector('#product-note').textContent = product.note;
  document.querySelector('#product-details').setAttribute('aria-labelledby', tab.id);
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectProduct(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); tabs[next].focus(); selectProduct(tabs[next]); }
  });
});
