(() => {
  'use strict';

  const pages = {
    '/': ['ПЛАТФОРМА', 'LUNAVEX Lunar Research', 'Наукові інструменти для дослідження Місяця'],
    '/explorer': ['МОДУЛЬ 01 · КАРТОГРАФІЯ', 'Lunar Site Explorer', 'Інтерактивна карта південного полюса Місяця'],
    '/illumination': ['МОДУЛЬ 02 · ОСВІТЛЕНІСТЬ', 'Sun & Illumination Analyzer', 'Положення Сонця та часові вікна освітлення'],
    '/earthlink': ['МОДУЛЬ 03 · ЗВ’ЯЗОК', 'EarthLink', 'Видимість Землі з поверхні Місяця'],
    '/energy': ['ЛАБОРАТОРІЯ 01 · ЕНЕРГІЯ', 'LunaEnergy', 'Моделювання сонячної генерації'],
    '/radiation': ['ЛАБОРАТОРІЯ 02 · РАДІАЦІЯ', 'LunaRadiation', 'Оцінка радіаційного захисту'],
    '/thermo': ['ЛАБОРАТОРІЯ 03 · ТЕПЛОВИЙ РЕЖИМ', 'LunaThermo', 'Моделювання теплопередачі'],
    '/artemis': ['ЛАБОРАТОРІЯ 04 · МІСІЇ', 'Artemis Mission Lab', 'Параметри та сценарії місячних місій'],
    '/account': ['ОСОБИСТИЙ ПРОСТІР', 'Профіль дослідника', 'Дані акаунта, статистика й збережені дослідження'],
    '/analytics.html': ['ПЛАТФОРМА', 'Аналітика', 'Огляд розрахунків і збережених даних'],
    '/about.html': ['ПЛАТФОРМА', 'Про LUNAVEX', 'Наукові інструменти для місячних досліджень'],
    '/contact.html': ['ПЛАТФОРМА', 'Контакти', 'Зв’язок із командою LUNAVEX'],
    '/privacy-policy.html': ['ПЛАТФОРМА', 'Політика конфіденційності', 'Як платформа працює з даними']
  };
  const links = [
    ['Головна', '/'], ['Lunar Site Explorer', '/explorer/'], ['Sun & Illumination', '/illumination/'],
    ['EarthLink', '/earthlink/'], ['Енергія', '/energy/'], ['Радіація', '/radiation/'],
    ['Тепловий режим', '/thermo/'], ['Artemis', '/artemis/'], ['Профіль дослідника', '/account/'],
    ['Аналітика', '/analytics.html'], ['Про платформу', '/about.html'], ['Контакти', '/contact.html'],
    ['Політика конфіденційності', '/privacy-policy.html']
  ];
  const path = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
  const page = pages[path] || ['ПЛАТФОРМА', document.title.replace(/\s*[—|·].*$/, ''), 'LUNAVEX · Lunar Intelligence & Exploration'];
  const header = document.querySelector('header');
  if (!header) return;

  if (header.parentElement !== document.body) document.body.insertBefore(header, document.body.firstElementChild);
  header.className = 'lunavex-header';
  header.replaceChildren();

  const brand = document.createElement('a');
  brand.className = 'lunavex-brand';
  brand.href = '/';
  brand.setAttribute('aria-label', 'LUNAVEX — головна');
  brand.innerHTML = '<span class="lunavex-brand-mark" aria-hidden="true">L</span><span class="lunavex-brand-copy"><b>LUNAVEX</b><small>LUNAR INTELLIGENCE &amp; EXPLORATION</small></span>';

  const context = document.createElement('div');
  context.className = 'lunavex-header-context';
  const kicker = document.createElement('span');
  kicker.className = 'lunavex-header-kicker';
  kicker.textContent = page[0];
  const title = document.createElement('strong');
  title.textContent = page[1];
  const subtitle = document.createElement('small');
  subtitle.textContent = page[2];
  context.append(kicker, title, subtitle);

  const nav = document.createElement('nav');
  nav.className = 'platform-navigation';
  nav.setAttribute('aria-label', 'Навігація LUNAVEX');
  const details = document.createElement('details');
  details.className = 'platform-navigation-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Перейти до';
  const menu = document.createElement('div');
  menu.className = 'platform-navigation-menu';
  links.forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    const target = href.replace(/\/$/, '') || '/';
    if (path === target) {
      link.setAttribute('aria-current', 'page');
      link.className = 'is-current';
    }
    menu.append(link);
  });
  details.append(summary, menu);
  nav.append(details);
  header.append(brand, context, nav);

  if (path === '/illumination' || path === '/earthlink') {
    const explorerLink = document.createElement('a');
    explorerLink.id = 'explorerLink';
    explorerLink.href = '/explorer/';
    explorerLink.hidden = true;
    header.append(explorerLink);
  }

  document.addEventListener('click', event => {
    if (!nav.contains(event.target)) details.open = false;
  });
})();
