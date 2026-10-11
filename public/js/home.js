(() => {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(item => item.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    items.forEach(item => observer.observe(item));
  }

  const endpoints = [
    { key: 'energy', url: '/api/energy/experiments', name: 'LunaEnergy' },
    { key: 'radiation', url: '/api/radiation/experiments', name: 'LunaRadiation' },
    { key: 'thermo', url: '/api/thermo/experiments', name: 'LunaThermo' },
    { key: 'artemis', url: '/api/artemis/experiments', name: 'Artemis Lab' }
  ];
  const searchInput = document.getElementById('globalSearch');
  const results = document.getElementById('searchResults');
  const resultsContent = document.getElementById('searchResultsContent');
  const exportButton = document.getElementById('exportAllBtn');
  let dataCache;
  let searchTimer;

  async function loadData() {
    if (dataCache) return dataCache;
    const responses = await Promise.all(endpoints.map(async module => {
      const response = await fetch(module.url);
      if (!response.ok) throw new Error(`Request failed: ${module.key}`);
      return [module.key, await response.json()];
    }));
    dataCache = Object.fromEntries(responses);
    return dataCache;
  }

  function recordsFor(data, module) {
    const value = data[module.key];
    if (module.key === 'artemis') return Array.isArray(value?.data) ? value.data : [];
    return Array.isArray(value) ? value : [];
  }

  function resultDescription(module, record) {
    if (module.key === 'energy') return `Ефективність: ${record.efficiency ?? '—'}%, кут: ${record.angle ?? '—'}°`;
    if (module.key === 'radiation') return `Матеріал: ${record.material ?? '—'}, проникнення: ${record.penetration ?? '—'}`;
    if (module.key === 'thermo') return `Матеріал: ${record.material ?? '—'}, тепловтрати: ${record.heat_loss ?? '—'} Вт`;
    return `Місія: ${record.mission_name ?? '—'}, Δv: ${record.delta_v_total ?? '—'} км/с`;
  }

  function displayResults(found) {
    resultsContent.replaceChildren();
    if (!found.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = 'Збігів не знайдено.';
      resultsContent.append(empty);
    } else {
      found.slice(0, 16).forEach(item => {
        const link = document.createElement('a');
        link.className = 'search-result';
        link.href = item.href;
        const title = document.createElement('strong');
        title.textContent = `${item.module} · запис №${item.id ?? '—'}`;
        const arrow = document.createElement('span');
        arrow.textContent = '↗';
        const description = document.createElement('p');
        description.textContent = item.description;
        link.append(title, arrow, description);
        resultsContent.append(link);
      });
    }
    results.hidden = false;
  }

  async function search(query) {
    if (query.trim().length < 2) {
      results.hidden = true;
      return;
    }
    try {
      const data = await loadData();
      const needle = query.trim().toLocaleLowerCase('uk');
      const found = endpoints.flatMap(module => recordsFor(data, module)
        .filter(record => JSON.stringify(record).toLocaleLowerCase('uk').includes(needle))
        .map(record => ({
          module: module.name,
          id: record.id,
          href: `/${module.key}`,
          description: resultDescription(module, record)
        })));
      displayResults(found);
    } catch (error) {
      resultsContent.replaceChildren();
      const message = document.createElement('p');
      message.className = 'search-empty';
      message.textContent = 'Не вдалося завантажити індекс даних. Спробуйте ще раз.';
      resultsContent.append(message);
      results.hidden = false;
    }
  }

  searchInput?.addEventListener('input', event => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => search(event.target.value), 220);
  });
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape') results.hidden = true;
  });

  exportButton?.addEventListener('click', async () => {
    const label = exportButton.innerHTML;
    exportButton.disabled = true;
    exportButton.textContent = 'Готуємо архів…';
    try {
      const data = await loadData();
      const payload = {
        exported_at: new Date().toISOString(),
        luna_energy: data.energy,
        luna_radiation: data.radiation,
        luna_thermo: data.thermo,
        artemis_missions: data.artemis?.data ?? []
      };
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `luna-research-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(blobUrl);
      exportButton.textContent = 'Файл завантажено ✓';
    } catch (error) {
      exportButton.textContent = 'Помилка експорту';
    } finally {
      window.setTimeout(() => { exportButton.innerHTML = label; exportButton.disabled = false; }, 2200);
    }
  });

  Promise.allSettled([
    fetch('/api/system/info').then(response => response.json()),
    fetch('/api/system/stats').then(response => response.json())
  ]).then(([systemResult, statsResult]) => {
    const status = document.getElementById('systemStatus');
    if (systemResult.status === 'fulfilled') {
      const seconds = Math.floor(systemResult.value.uptime || 0);
      const hours = Math.floor(seconds / 3600);
      status.textContent = 'СИСТЕМА АКТИВНА';
      document.getElementById('systemUptime').textContent = `${hours} Г`;
    } else {
      status.textContent = 'СТАН НЕДОСТУПНИЙ';
    }
    if (statsResult.status === 'fulfilled') {
      const values = Object.values(statsResult.value).map(value => Number(value?.count ?? value ?? 0));
      const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
      document.getElementById('totalExperiments').textContent = total.toLocaleString('uk-UA');
    } else {
      loadData().then(data => {
        const total = endpoints.reduce((sum, module) => sum + recordsFor(data, module).length, 0);
        document.getElementById('totalExperiments').textContent = total.toLocaleString('uk-UA');
      }).catch(() => {});
    }
  });
})();
