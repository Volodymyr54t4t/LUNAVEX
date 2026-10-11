const API_PREFIX = '/api/radiation';

// Перемикання вкладок
function switchRadiationTab(tab) {
  document.querySelectorAll('[id^="radiationTab-"]').forEach(btn => btn.classList.remove('active-tab'));
  document.getElementById(`radiationTab-${tab}`).classList.add('active-tab');
  
  document.getElementById('radiationBasic').classList.toggle('hidden', tab !== 'basic');
  document.getElementById('radiationAdvanced').classList.toggle('hidden', tab !== 'advanced');
  document.getElementById('radiationAstronaut').classList.toggle('hidden', tab !== 'astronaut');
}

// Глобальний масив для шарів
let radiationLayers = [{ material: 'Алюміній', thickness: 5 }];

// Додання нового шару
function addRadiationLayer() {
  radiationLayers.push({ material: 'Алюміній', thickness: 5 });
  renderLayers();
}

// Рендер шарів
function renderLayers() {
  const container = document.getElementById('layersContainer');
  container.innerHTML = radiationLayers.map((layer, i) => `
    <div class="glass-card p-4 rounded-xl flex gap-4 items-end">
      <div class="flex-1">
        <label class="block text-purple-300 text-sm mb-2">Шар ${i + 1}: Матеріал</label>
        <select onchange="radiationLayers[${i}].material = this.value" class="input-cosmic w-full">
          <option ${layer.material === 'Алюміній' ? 'selected' : ''}>Алюміній</option>
          <option ${layer.material === 'Вода' ? 'selected' : ''}>Вода</option>
          <option ${layer.material === 'Реголіт' ? 'selected' : ''}>Реголіт</option>
        </select>
      </div>
      <div class="flex-1">
        <label class="block text-purple-300 text-sm mb-2">Товщина (см)</label>
        <input type="number" value="${layer.thickness}" step="0.1" onchange="radiationLayers[${i}].thickness = parseFloat(this.value)" class="input-cosmic w-full">
      </div>
      <button type="button" onclick="radiationLayers.splice(${i}, 1); renderLayers()" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg">🗑️</button>
    </div>
  `).join('');
}

// Розрахунок многошарової захисту
async function calculateMultiLayer() {
  try {
    const response = await fetch(`${API_PREFIX}/multi-layer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: radiationLayers })
    });
    
    const data = await response.json();
    const resultDiv = document.getElementById('multiLayerResult');
    
    resultDiv.innerHTML = `
      <h4 class="text-xl font-bold text-purple-300 mb-4">📊 Результати многошарової захисту</h4>
      <div class="space-y-3">
        <p class="text-sm"><strong>Композиція:</strong> ${data.composition}</p>
        <p class="text-sm"><strong>Загальна товщина:</strong> ${data.total_thickness_cm} см</p>
        <div class="bg-black/40 p-4 rounded-lg mt-4">
          <p class="text-cyan-400 text-lg"><strong>Проникнення радіації: ${data.total_penetration_percent}%</strong></p>
          <p class="text-emerald-400 text-lg"><strong>Ефективність захисту: ${data.shielding_effectiveness}%</strong></p>
          <p class="text-2xl font-bold mt-4 ${data.safety_level === '✅ Надійний' ? 'text-emerald-400' : data.safety_level === '⚡ Середній' ? 'text-yellow-400' : 'text-red-400'}">${data.safety_level}</p>
        </div>
      </div>
    `;
    resultDiv.classList.remove('hidden');
  } catch (err) {
    console.error('Помилка:', err);
    alert('Помилка розрахунку');
  }
}

// Розрахунок дози для космонавта
async function calculateAstronautDose(event) {
  event.preventDefault();
  
  try {
    const response = await fetch(`${API_PREFIX}/astronaut-dose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material: document.getElementById('astronautMaterial').value,
        thickness: parseFloat(document.getElementById('astronautThickness').value),
        mission_days: parseInt(document.getElementById('missionDays').value),
        radiation_level: 100
      })
    });
    
    const data = await response.json();
    const resultDiv = document.getElementById('astronautResult');
    
    resultDiv.innerHTML = `
      <h4 class="text-xl font-bold text-purple-300 mb-4">👨‍🚀 Дозова еквівалент</h4>
      <div class="grid grid-cols-2 gap-4">
        <div class="glass-card p-4 rounded-lg">
          <p class="text-sm text-gray-400">Щодобова експозиція</p>
          <p class="text-2xl font-bold text-cyan-400">${data.daily_exposure.toFixed(2)} mrem</p>
        </div>
        <div class="glass-card p-4 rounded-lg">
          <p class="text-sm text-gray-400">Загальна доза (місія)</p>
          <p class="text-2xl font-bold text-purple-300">${data.total_dose_mrem.toFixed(2)} mrem</p>
        </div>
        <div class="glass-card p-4 rounded-lg">
          <p class="text-sm text-gray-400">Доза у Зівертах</p>
          <p class="text-2xl font-bold text-cyan-400">${data.total_dose_sv.toFixed(5)} Sv</p>
        </div>
        <div class="glass-card p-4 rounded-lg">
          <p class="text-sm text-gray-400">Безпечний ліміт</p>
          <p class="text-2xl font-bold text-yellow-400">${data.max_safe_dose_sv} Sv</p>
        </div>
      </div>
      <div class="mt-4 p-4 rounded-lg ${data.health_risk === '🔴 ВИСОКИЙ РИЗИК' ? 'bg-red-950/30 border-l-4 border-red-500' : data.health_risk === '🟡 ПОМІРНИЙ РИЗИК' ? 'bg-yellow-950/30 border-l-4 border-yellow-500' : 'bg-green-950/30 border-l-4 border-green-500'}">
        <p class="text-lg font-bold">${data.health_risk}</p>
        <p class="text-sm mt-2">Маржа безпеки: ${data.safety_margin_percent.toFixed(1)}%</p>
      </div>
    `;
    resultDiv.classList.remove('hidden');
  } catch (err) {
    console.error('Помилка:', err);
    alert('Помилка розрахунку');
  }
}

// ===== ПОДІЯ ЗАВАНТАЖЕННЯ =====/

// Рендер початкових шарів
renderLayers();

// Далі йде оригінальний код
  const form = document.getElementById("calculationForm");
  const resultDiv = document.getElementById("result");
  const tbody = document.querySelector("#historyTable tbody");

  function getSafetyLevel(penetration) {
    if (penetration < 20) return { text: "✅ Безпечно", cls: "safe" };
    if (penetration <= 50) return { text: "⚠️ Середньо", cls: "medium" };
    return { text: "❌ Небезпечно", cls: "danger" };
  }

  async function loadHistory() {
    try {
      const response = await fetch(`${API_PREFIX}/experiments`);
      const experiments = await response.json();

      tbody.innerHTML = "";

      experiments.forEach((exp) => {
        const safety = getSafetyLevel(exp.penetration);
        const date = new Date(exp.created_at).toLocaleString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const row = document.createElement("tr");
        row.innerHTML = `
                    <td>${exp.material}</td>
                    <td>${exp.thickness}</td>
                    <td>${exp.radiation_level}</td>
                    <td>${exp.penetration.toFixed(2)}%</td>
                    <td class="${safety.cls}">${safety.text}</td>
                    <td>${date}</td>
                `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Помилка завантаження історії:", err);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const material = document.getElementById("material").value;
    const thickness = parseFloat(document.getElementById("thickness").value);
    const radiationLevel = parseFloat(document.getElementById("radiationLevel").value);

    try {
      const response = await fetch(`${API_PREFIX}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material, thickness, radiationLevel }),
      });

      const data = await response.json();

      if (!response.ok) {
        resultDiv.innerHTML = `<p style="color:#ff4444;">Помилка: ${data.error}</p>`;
        resultDiv.classList.add("show");
        return;
      }

      const safety = getSafetyLevel(data.penetration);

      resultDiv.innerHTML = `
                <h3>✅ Результати розрахунку</h3>
                <p><strong>Матеріал:</strong> ${data.material}</p>
                <p><strong>Товщина:</strong> ${data.thickness} см</p>
                <p><strong>Проникнення радіації:</strong> <strong>${data.penetration}%</strong></p>
                <p><strong>Рівень безпеки:</strong> <span class="${safety.cls}">${safety.text}</span></p>
            `;
      resultDiv.classList.add("show");

      loadHistory();
    } catch (err) {
      resultDiv.innerHTML = `<p style="color:#ff4444;">Помилка з'єднання з сервером</p>`;
      resultDiv.classList.add("show");
    }
  });

  loadHistory();

