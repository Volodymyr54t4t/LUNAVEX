const dvForm = document.getElementById('dvForm');
const radiationForm = document.getElementById('radiationForm');
const missionForm = document.getElementById('missionForm');
const dvResult = document.getElementById('dvResult');
const radiationResult = document.getElementById('radiationResult');
const missionSaveStatus = document.getElementById('missionSaveStatus');
const missionTableBody = document.getElementById('missionTableBody');

const computeDeltaV = (payloadMass, efficiency) => {
  const baseDeltaV = 11000; // базова вимога для обліту Місяця, м/с
  const massFactor = 1 + payloadMass / 12000;
  return ((baseDeltaV * efficiency) / massFactor / 1000).toFixed(2);
};

const computeRadiationDose = (days, shield, solarIndex) => {
  const baseDosePerDay = 1.8; // mSv/day у далекому космосі
  const protectionFactor = Math.max(0.4, 1 - shield / 450);
  const solarFactor = 1 + (solarIndex - 1) * 0.35;
  return (days * baseDosePerDay * protectionFactor * solarFactor).toFixed(1);
};

const riskLevel = (dose) => {
  if (dose < 40) return 'Низький';
  if (dose < 70) return 'Середній';
  return 'Високий';
};

const safetyIndexFromDose = (dose) => {
  const numericDose = Number(dose);
  return Math.max(15, Math.round(100 - numericDose));
};

const formatDate = (timestamp) => new Date(timestamp).toLocaleString('uk-UA', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

const renderMissions = (missions) => {
  if (!missions || !missions.length) {
    missionTableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-3 text-cyan-200">Журнал Artemis поки порожній. Додайте перший сценарій.</td></tr>';
    return;
  }

  missionTableBody.innerHTML = missions.map((mission) => {
    const dvValue = mission.delta_v_total || computeDeltaV(8500, 0.94);
    const doseValue = mission.radiation_exposure_msv || computeRadiationDose(mission.mission_duration_days, 160, 1);
    return `
      <tr class="border-b border-white/10">
        <td class="px-4 py-3">${mission.mission_name}</td>
        <td class="px-4 py-3">${mission.crew_size}</td>
        <td class="px-4 py-3">${dvValue}</td>
        <td class="px-4 py-3">${doseValue}</td>
        <td class="px-4 py-3">${riskLevel(Number(doseValue))}</td>
        <td class="px-4 py-3">${formatDate(mission.created_at)}</td>
      </tr>
    `;
  }).join('');
};

const loadMissions = async () => {
  try {
    const response = await fetch('/api/artemis/experiments');
    const data = await response.json();
    renderMissions(data.data || []);
  } catch (error) {
    missionTableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-3 text-red-300">Не вдалося завантажити журнал місій.</td></tr>';
  }
};

const saveMission = async (mission) => {
  const response = await fetch('/api/artemis/log-mission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mission),
  });
  return response.json();
};

if (dvForm) {
  dvForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const payloadMass = Number(document.getElementById('payloadMass').value);
    const efficiency = Number(document.getElementById('stageEfficiency').value);
    const deltaV = computeDeltaV(payloadMass, efficiency);
    dvResult.classList.remove('hidden');
    dvResult.innerHTML = `
      <p class="font-semibold text-orange-300">Розрахований ΔV:</p>
      <p class="mt-3 text-lg">≈ <span class="text-white">${deltaV}</span> км/с</p>
      <p class="mt-2 text-sm text-cyan-200">Цей бюджет враховує масу корисного навантаження та ефективність ступеня.</p>
    `;
  });
}

if (radiationForm) {
  radiationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const days = Number(document.getElementById('missionDays').value);
    const shield = Number(document.getElementById('shieldingMass').value);
    const solarIndex = Number(document.getElementById('solarIndex').value);
    const dose = computeRadiationDose(days, shield, solarIndex);
    radiationResult.classList.remove('hidden');
    radiationResult.innerHTML = `
      <p class="font-semibold text-orange-300">Оцінка поглиненої дози:</p>
      <p class="mt-3 text-lg">≈ <span class="text-white">${dose}</span> mSv</p>
      <p class="mt-2 text-sm text-cyan-200">Рівень ризику: <strong>${riskLevel(Number(dose))}</strong>.</p>
    `;
  });
}

if (missionForm) {
  missionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const missionDuration = Number(document.getElementById('missionDuration').value);
    const crewSize = Number(document.getElementById('crewSize').value);
    const missionName = document.getElementById('missionName').value;
    const missionNotes = document.getElementById('missionNotes').value;
    const payloadMass = 8500;
    const stageEfficiency = 0.94;
    const shieldingMass = 160;
    const solarIndex = 1.0;

    const deltaV = computeDeltaV(payloadMass, stageEfficiency);
    const radiationExposure = computeRadiationDose(missionDuration, shieldingMass, solarIndex);

    const mission = {
      missionName,
      crewSize,
      missionDurationDays: missionDuration,
      deltaVTotal: Number(deltaV),
      radiationExposure: Number(radiationExposure),
      safetyIndex: safetyIndexFromDose(radiationExposure),
      missionNotes
    };

    missionSaveStatus.classList.remove('hidden');
    missionSaveStatus.textContent = 'Зберігаємо місію...';
    missionSaveStatus.classList.remove('text-emerald-300', 'text-red-300');

    try {
      const result = await saveMission(mission);
      if (result.success) {
        missionSaveStatus.textContent = 'Місія збережена! Журнал оновлено.';
        missionSaveStatus.classList.add('text-emerald-300');
        missionForm.reset();
        loadMissions();
      } else {
        throw new Error(result.error || 'Помилка збереження');
      }
    } catch (error) {
      missionSaveStatus.textContent = 'Сталася помилка при збереженні місії.';
      missionSaveStatus.classList.add('text-red-300');
    }
  });
}

loadMissions();