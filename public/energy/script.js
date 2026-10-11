let experiments = [];
let angleChart = null;
let timeChart = null;
let compareBarChart = null;
let compareRadarChart = null;
const API_PREFIX = '/api/energy';

// Перемикання теми
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const body = document.body;
    if (body.dataset.theme === "dark") {
      body.dataset.theme = "light";
      body.classList.remove("bg-[#05070f]", "text-white");
      body.classList.add("bg-gray-100", "text-gray-900");
      themeToggle.textContent = "☀️";
      document.querySelectorAll(".glass-card").forEach((el) => {
        el.style.background = "rgba(255,255,255,0.75)";
        el.style.borderColor = "rgba(59,130,246,0.3)";
      });
    } else {
      body.dataset.theme = "dark";
      body.classList.remove("bg-gray-100", "text-gray-900");
      body.classList.add("bg-[#05070f]", "text-white");
      themeToggle.textContent = "🌙";
      document.querySelectorAll(".glass-card").forEach((el) => {
        el.style.background = "rgba(15,23,42,0.65)";
        el.style.borderColor = "rgba(103,232,249,0.2)";
      });
    }
  });
}

// Перемикання вкладок
function switchTab(tabIndex) {
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab${tabIndex}`).classList.add("active");

  document.getElementById("tabContent0").classList.toggle("hidden", tabIndex !== 0);
  document.getElementById("tabContent1").classList.toggle("hidden", tabIndex !== 1);
  document.getElementById("tabContent2").classList.toggle("hidden", tabIndex !== 2);
  document.getElementById("tabContent3").classList.toggle("hidden", tabIndex !== 3);
  document.getElementById("tabContent4").classList.toggle("hidden", tabIndex !== 4);

  if (tabIndex === 1) updateAnalytics();
  if (tabIndex === 2) loadCompareOptions();
}

// Завантаження експериментів
async function loadExperiments() {
  try {
    const res = await fetch(`${API_PREFIX}/experiments`);
    if (!res.ok) throw new Error("Помилка завантаження історії");
    experiments = await res.json();
    renderHistoryTable();
  } catch (err) {
    console.error(err);
  }
}

// Рендер таблиці історії
function renderHistoryTable() {
  const table = document.getElementById("historyTable");
  if (!table) return;

  table.innerHTML = `
    <thead>
      <tr class="bg-black/40 text-cyan-300 text-sm uppercase tracking-wider">
        <th class="p-4">ID</th>
        <th class="p-4">Кут (°)</th>
        <th class="p-4">Світло</th>
        <th class="p-4">Темп. (°C)</th>
        <th class="p-4">Пил</th>
        <th class="p-4">Ефективність</th>
        <th class="p-4">Дата</th>
      </tr>
    </thead>
    <tbody>
      ${experiments
        .map(
          (exp) => `
        <tr class="hover:bg-cyan-950/30 transition-colors">
          <td class="p-4 text-center">${exp.id}</td>
          <td class="p-4 text-center">${exp.angle}</td>
          <td class="p-4 text-center">${exp.sunlight}</td>
          <td class="p-4 text-center">${exp.temperature}</td>
          <td class="p-4 text-center">${exp.dust}</td>
          <td class="p-4 text-center font-bold text-emerald-400">${(exp.efficiency * 100).toFixed(2)}%</td>
          <td class="p-4 text-center text-gray-400 text-sm">${new Date(exp.created_at).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" })}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  `;
}

// Автооновлення історії кожні 15 секунд
setInterval(loadExperiments, 15000);

// Валідація форми в реальному часі
const inputs = {
  angle: document.getElementById("angle"),
  sunlight: document.getElementById("sunlight"),
  dust: document.getElementById("dust"),
};

Object.keys(inputs).forEach((key) => {
  inputs[key].addEventListener("input", () => validateField(key));
});

function validateField(field) {
  const input = inputs[field];
  const errorEl = document.getElementById(`${field}Error`);
  let valid = true;
  let message = "";

  if (field === "angle") {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val > 90) {
      valid = false;
      message = "Кут має бути від 0 до 90°";
    }
  } else if (field === "sunlight") {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val > 1) {
      valid = false;
      message = "Значення від 0 до 1";
    }
  } else if (field === "dust") {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0 || val > 1) {
      valid = false;
      message = "Значення від 0 до 1";
    }
  }

  if (!valid) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
    input.classList.add("border-red-500");
  } else {
    errorEl.classList.add("hidden");
    input.classList.remove("border-red-500");
  }

  return valid;
}

// Форма розрахунку
document.getElementById("experimentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  let isValid = true;
  Object.keys(inputs).forEach((key) => {
    if (!validateField(key)) isValid = false;
  });

  if (!isValid) {
    alert("Будь ласка, виправте помилки у формі");
    return;
  }

  const payload = {
    angle: parseFloat(document.getElementById("angle").value),
    sunlight: parseFloat(document.getElementById("sunlight").value),
    temperature: parseFloat(document.getElementById("temperature").value),
    dust: parseFloat(document.getElementById("dust").value),
  };

  try {
    const res = await fetch(`${API_PREFIX}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Помилка розрахунку");

    const { efficiency } = await res.json();

    document.getElementById("resultCard").classList.remove("hidden");
    document.getElementById("efficiencyValue").textContent = efficiency.toFixed(2) + "%";

    await loadExperiments();

    if (!document.getElementById("tabContent1").classList.contains("hidden")) {
      await updateAnalytics();
    }
  } catch (err) {
    alert("Помилка: " + err.message);
  }
});

// Очистити всі експерименти
document.getElementById("clearAllBtn")?.addEventListener("click", async () => {
  if (!confirm("Ви впевнені, що хочете видалити ВСІ експерименти?")) return;

  try {
    const res = await fetch(`${API_PREFIX}/clear`, { method: "POST" });
    if (!res.ok) throw new Error("Помилка очищення");
    await loadExperiments();
    alert("Усі експерименти видалено");
  } catch (err) {
    alert("Помилка: " + err.message);
  }
});

// Експорт у CSV
document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
  if (experiments.length === 0) {
    alert("Немає даних для експорту");
    return;
  }

  const headers = ["ID", "Кут", "Світло", "Температура", "Пил", "Ефективність (%)", "Дата"];
  const rows = experiments.map((exp) => [
    exp.id,
    exp.angle,
    exp.sunlight,
    exp.temperature,
    exp.dust,
    (exp.efficiency * 100).toFixed(2),
    new Date(exp.created_at).toLocaleString("uk-UA"),
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "energy_experiments.csv";
  link.click();
  URL.revokeObjectURL(url);
});

async function loadStats() {
  try {
    const res = await fetch(`${API_PREFIX}/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    document.getElementById("value-total").textContent = stats.total || "0";
    document.getElementById("value-avg").textContent = stats.avg_efficiency ? stats.avg_efficiency + "%": "—";
    document.getElementById("value-max").textContent = stats.max_efficiency ? stats.max_efficiency + "%": "—";
    document.getElementById("value-min").textContent = stats.min_efficiency ? stats.min_efficiency + "%": "—";
    document.getElementById("value-avg-temp").textContent = stats.avg_temperature ? stats.avg_temperature + "°C": "—";

    if (experiments.length > 0) {
      const best = experiments.reduce((prev, curr) =>
        prev.efficiency > curr.efficiency ? prev : curr,
      );
      document.getElementById("value-best-angle").textContent = best.angle + "°";
      document.getElementById("recommendation").innerHTML = `
        🌟 <span class="text-purple-300">Найкращий кут на основі всіх даних:</span><br>
        <span class="text-5xl text-cyan-400 mt-4 block">${best.angle}°</span>
        <span class="text-2xl text-emerald-400 mt-2 block">→ ${(best.efficiency * 100).toFixed(1)}%</span>
      `;
      document.getElementById("recommendation").classList.remove("hidden");
    }
  } catch (err) {
    console.error("Помилка статистики:", err);
  }
}

function updateCharts() {
  const sorted = [...experiments].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );

  if (angleChart) angleChart.destroy();
  angleChart = new Chart(document.getElementById("angleChart"), {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Експерименти",
          data: experiments.map((e) => ({ x: e.angle, y: e.efficiency * 100 })),
          backgroundColor: "#67e8f9",
          borderColor: "#a855f7",
          pointRadius: 6,
          pointHoverRadius: 10,
        },
      ],
    },
    options: {
      scales: {
        x: { title: { display: true, text: "Кут нахилу (°)", color: "#a5b4fc" } },
        y: { title: { display: true, text: "Ефективність (%)", color: "#a5b4fc" } },
      },
      plugins: { legend: { labels: { color: "#e5e7eb" } } },
    },
  });

  if (timeChart) timeChart.destroy();
  timeChart = new Chart(document.getElementById("timeChart"), {
    type: "line",
    data: {
      labels: sorted.map((e) => new Date(e.created_at).toLocaleDateString("uk-UA")),
      datasets: [
        {
          label: "Ефективність",
          data: sorted.map((e) => e.efficiency * 100),
          borderColor: "#c084fc",
          backgroundColor: "rgba(192, 132, 252, 0.15)",
          tension: 0.3,
          pointBackgroundColor: "#67e8f9",
          pointBorderColor: "#000",
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      scales: { y: { title: { display: true, text: "Ефективність (%)", color: "#a5b4fc" } } },
      plugins: { legend: { display: false } },
    },
  });
}

async function updateAnalytics() {
  await loadStats();
  updateCharts();
}

function loadCompareOptions() {
  const select = document.getElementById("compareSelect");
  if (!select) return;
  select.innerHTML = "";
  experiments.forEach((exp) => {
    const opt = document.createElement("option");
    opt.value = exp.id;
    opt.textContent = `ID ${exp.id} | ${(exp.efficiency * 100).toFixed(2)}% | Кут ${exp.angle}° | Пил ${exp.dust}`;
    select.appendChild(opt);
  });
}

document.getElementById("compareBtn")?.addEventListener("click", () => {
  const selectedIds = Array.from(document.getElementById("compareSelect").selectedOptions).map((opt) => parseInt(opt.value));
  if (selectedIds.length < 2 || selectedIds.length > 4) {
    alert("Оберіть від 2 до 4 експериментів");
    return;
  }

  const selected = experiments.filter((exp) => selectedIds.includes(exp.id));

  let html = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-black/40 text-cyan-300">
          <th class="p-4">ID</th>
          <th class="p-4">Ефективність</th>
          <th class="p-4">Кут (°)</th>
          <th class="p-4">Світло</th>
          <th class="p-4">Темп. (°C)</th>
          <th class="p-4">Пил</th>
          <th class="p-4">Дата</th>
        </tr>
      </thead>
      <tbody>
        ${selected.map((exp) => `
          <tr class="hover:bg-cyan-950/30">
            <td class="p-4 text-center">${exp.id}</td>
            <td class="p-4 text-center font-bold text-emerald-400">${(exp.efficiency * 100).toFixed(2)}%</td>
            <td class="p-4 text-center">${exp.angle}</td>
            <td class="p-4 text-center">${exp.sunlight}</td>
            <td class="p-4 text-center">${exp.temperature}</td>
            <td class="p-4 text-center">${exp.dust}</td>
            <td class="p-4 text-center text-gray-400 text-xs">${new Date(exp.created_at).toLocaleString("uk-UA")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.getElementById("compareResult").innerHTML = html;
  document.getElementById("compareResult").classList.remove("hidden");

  const ctxBar = document.getElementById("compareBarChart");
  if (compareBarChart) compareBarChart.destroy();
  compareBarChart = new Chart(ctxBar, {
    type: "bar",
    data: {
      labels: selected.map((e) => `Експ. ${e.id}`),
      datasets: [{
        label: "Ефективність (%)",
        data: selected.map((e) => e.efficiency * 100),
        backgroundColor: ["#67e8f9", "#c084fc", "#f472b6", "#fbbf24"],
      }],
    },
    options: { scales: { y: { beginAtZero: true } } },
  });

  const ctxRadar = document.getElementById("compareRadarChart");
  if (compareRadarChart) compareRadarChart.destroy();
  compareRadarChart = new Chart(ctxRadar, {
    type: "radar",
    data: {
      labels: ["Кут (°)", "Світло", "Температура (°C)", "Пил", "Ефективність (%)"],
      datasets: selected.map((e, i) => ({
        label: `Експ. ${e.id}`,
        data: [e.angle, e.sunlight * 100, e.temperature + 200, e.dust * 100, e.efficiency * 100],
        backgroundColor: `rgba(${i * 80 + 100}, ${200 - i * 50}, ${255 - i * 60}, 0.2)`,
        borderColor: ["#67e8f9", "#c084fc", "#f472b6", "#fbbf24"][i],
        borderWidth: 2,
      })),
    },
    options: { scales: { r: { beginAtZero: true } } },
  });

  document.getElementById("compareCharts").classList.remove("hidden");
});

// Початкове завантаження
loadExperiments();
switchTab(0);

// Експорт у CSV
function exportToCSV() {
  if (experiments.length === 0) {
    alert('Немає даних для експорту');
    return;
  }

  const headers = ['ID', 'Кут (°)', 'Сонце', 'Температура (°C)', 'Пил', 'Ефективність (%)', 'Дата'];
  const csvContent = [
    headers.join(','),
    ...experiments.map(exp => [
      exp.id,
      exp.angle,
      exp.sunlight,
      exp.temperature,
      exp.dust,
      (exp.efficiency * 100).toFixed(2),
      new Date(exp.created_at).toLocaleString('uk-UA')
    ].join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `energy_experiments_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== НОВІ РОЗШИРЕНІ ФУНКЦІЇ ====================

// Порівняння Земля vs Місяць
async function loadEarthMoonComparison() {
  try {
    const res = await fetch(`${API_PREFIX}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panelType: 'silicon' })
    });
    
    const data = await res.json();
    
    const html = `
      <div class="grid grid-cols-2 gap-6 mt-6">
        <div class="glass-card p-6 rounded-2xl">
          <h3 class="text-cyan-400 font-bold mb-4">🌍 Земля</h3>
          <div class="space-y-3 text-sm">
            <p>Вироблення: <span class="text-emerald-400 font-bold">${data.earth_generation_per_m2_day} Вт/м²</span></p>
            <p>Максимальна радіація: <span class="text-cyan-300">${data.earth_generation_per_m2_day}</span> Вт/м²</p>
            <p>Умови: Атмосфера, день/ніч</p>
          </div>
        </div>
        
        <div class="glass-card p-6 rounded-2xl">
          <h3 class="text-purple-400 font-bold mb-4">🌙 Місяць</h3>
          <div class="space-y-3 text-sm">
            <p>Вироблення: <span class="text-emerald-400 font-bold">${data.moon_generation_per_m2_day} Вт/м²</span></p>
            <p>Ефективне: <span class="text-cyan-300">${data.moon_generation_effective} Вт/м²</span></p>
            <p>14 днів темряви, без атмосфери</p>
          </div>
        </div>
      </div>
      
      <div class="mt-6 glass-card p-6 rounded-2xl bg-gradient-to-r from-purple-900/30 to-pink-900/30">
        <h3 class="text-yellow-400 font-bold mb-4">⚡ Вивід</h3>
        <p class="text-lg text-cyan-300">
          На Місяці вироблення <span class="text-emerald-400 font-bold">${data.advantage_factor}x</span> більше 
          за ефективне вироблення на Землі, незважаючи на 14 днів темряви!
        </p>
      </div>
    `;
    
    const container = document.getElementById('comparisonContainer') || createAdvancedSection('comparisonContainer', 'Порівняння Земля vs Місяць');
    container.innerHTML = html;
  } catch (err) {
    console.error('Помилка порівняння:', err);
  }
}

// Вплив пилу на панелі
async function loadDustImpact() {
  try {
    const dustPercentage = document.getElementById('dustPercentage')?.value || 50;
    
    const res = await fetch(`${API_PREFIX}/dust-impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dust_percentage: parseInt(dustPercentage) })
    });
    
    const data = await res.json();
    
    const dustBar = (data.current_dust_percentage / 100) * 100;
    const html = `
      <div class="space-y-6 mt-6">
        <div class="glass-card p-6 rounded-2xl">
          <h3 class="text-yellow-400 font-bold mb-4">💨 Рівень забруднення</h3>
          <div class="flex items-center gap-4">
            <div class="w-full bg-black/40 rounded-full h-6">
              <div class="bg-gradient-to-r from-green-500 to-red-500 h-6 rounded-full" style="width: ${dustBar}%"></div>
            </div>
            <span class="text-2xl font-bold text-cyan-400 min-w-max">${data.current_dust_percentage}%</span>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="glass-card p-4 rounded-xl">
            <p class="text-sm text-gray-400">Втрати ефективності</p>
            <p class="text-2xl font-bold text-red-400">${data.efficiency_loss_percent}%</p>
          </div>
          <div class="glass-card p-4 rounded-xl">
            <p class="text-sm text-gray-400">Час до чистки</p>
            <p class="text-2xl font-bold text-cyan-400">${data.recommended_cleanup_interval_months} місяців</p>
          </div>
        </div>
        
        <div class="glass-card p-6 rounded-2xl border-l-4 border-yellow-500 ${data.current_dust_percentage > 60 ? 'bg-red-950/30' : data.current_dust_percentage > 40 ? 'bg-yellow-950/30' : 'bg-green-950/30'}">
          <p class="text-lg font-bold">${data.recommendation}</p>
        </div>
      </div>
    `;
    
    const container = document.getElementById('dustContainer') || createAdvancedSection('dustContainer', 'Вплив космічного пилу');
    container.innerHTML = html;
  } catch (err) {
    console.error('Помилка розрахунку пилу:', err);
  }
}

// ROI калькулятор
async function loadROICalculator() {
  try {
    const res = await fetch(`${API_PREFIX}/roi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panel_cost_usd: 5000,
        panel_power_w: 300,
        installation_cost: 10000,
        lunar_power_price_usd: 100
      })
    });
    
    const data = await res.json();
    
    const html = `
      <div class="space-y-6 mt-6">
        <div class="grid grid-cols-2 gap-4">
          <div class="glass-card p-4 rounded-xl">
            <p class="text-sm text-gray-400">Інвестиція</p>
            <p class="text-2xl font-bold text-cyan-400">\$${data.total_investment_usd}</p>
          </div>
          <div class="glass-card p-4 rounded-xl">
            <p class="text-sm text-gray-400">Щомісячний дохід</p>
            <p class="text-2xl font-bold text-emerald-400">\$${data.monthly_revenue_usd}</p>
          </div>
        </div>
        
        <div class="glass-card p-6 rounded-2xl bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <h3 class="text-yellow-400 font-bold mb-4 text-lg">📊 ROI (Return on Investment)</h3>
          <div class="space-y-3">
            <p class="text-sm">
              <strong>Окупність:</strong> 
              <span class="text-cyan-400 font-bold text-lg">${data.roi_months} місяців</span> 
              (~${data.roi_years} років)
            </p>
            <p class="text-sm">
              <strong>Річний прибуток:</strong> 
              <span class="text-emerald-400 font-bold text-lg">\$${data.yearly_profit_usd}</span>
            </p>
            <p class="text-lg font-bold mt-4 px-4 py-2 bg-black/40 rounded-lg">
              ${data.viability}
            </p>
          </div>
        </div>
      </div>
    `;
    
    const container = document.getElementById('roiContainer') || createAdvancedSection('roiContainer', 'ROI Калькулятор для Місячної Станції');
    container.innerHTML = html;
  } catch (err) {
    console.error('Помилка ROI:', err);
  }
}

// Допоміжна функція для створення нової секції
function createAdvancedSection(id, title) {
  const tabContent = document.getElementById('tabContent4');
  if (!tabContent) return null;
  
  const section = document.createElement('div');
  section.id = id;
  section.className = 'mt-8';
  section.innerHTML = `<h2 class="text-2xl font-bold text-cyan-400 mb-6">${title}</h2>`;
  
  tabContent.appendChild(section);
  return section;
}

// Оновлення при завантаженні
window.addEventListener('load', () => {
  const tabContent4 = document.getElementById('tabContent4');
  if (tabContent4) {
    loadEarthMoonComparison();
    loadDustImpact();
    loadROICalculator();
  }
});
