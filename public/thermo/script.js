const API_PREFIX = '/api/thermo';

const materialNames = {
    aluminum: 'Алюміній',
    plastic: 'Пластик',
    glass: 'Скло',
    insulation: 'Ізоляція'
};

const form = document.getElementById('calculatorForm');
const errorMessage = document.getElementById('errorMessage');
const resultCard = document.getElementById('resultCard');

const resultMaterial = document.getElementById('resultMaterial');
const resultCoefficient = document.getElementById('resultCoefficient');
const resultThickness = document.getElementById('resultThickness');
const resultArea = document.getElementById('resultArea');
const resultTempDiff = document.getElementById('resultTempDiff');
const resultHeatLoss = document.getElementById('resultHeatLoss');
const resultRecommendation = document.getElementById('resultRecommendation');

const experimentsTable = document.getElementById('experimentsTable');
const experimentsTableBody = document.getElementById('experimentsTableBody');
const noDataMessage = document.getElementById('noDataMessage');
const loadingMessage = document.getElementById('loadingMessage');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    errorMessage.style.display = 'none';
    errorMessage.innerHTML = '';

    const material = document.getElementById('material').value;
    const thickness = document.getElementById('thickness').value;
    const area = document.getElementById('area').value;
    const insideTemp = document.getElementById('insideTemp').value;
    const outsideTemp = document.getElementById('outsideTemp').value;

    const errors = validateForm(material, thickness, area, insideTemp, outsideTemp);
    if (errors.length > 0) {
        showError(errors);
        return;
    }

    try {
        const response = await fetch(`${API_PREFIX}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                material,
                thickness: parseFloat(thickness),
                area: parseFloat(area),
                insideTemp: parseFloat(insideTemp),
                outsideTemp: parseFloat(outsideTemp)
            })
        });

        const data = await response.json();

        if (!data.success) {
            showError(data.errors || [data.error || 'Невідома помилка']);
            return;
        }

        displayResult(data.result);
        await loadExperiments();

    } catch (error) {
        console.error('Помилка:', error);
        showError(['Помилка при з\'єднанні з сервером.']);
    }
});

function validateForm(material, thickness, area, insideTemp, outsideTemp) {
    const errors = [];

    if (!material) {
        errors.push('Будь ласка, виберіть матеріал');
    }

    if (!thickness || parseFloat(thickness) <= 0) {
        errors.push('Товщина повинна бути більше 0');
    }

    if (!area || parseFloat(area) <= 0) {
        errors.push('Площа повинна бути більше 0');
    }

    if (insideTemp === '' || insideTemp === null || isNaN(parseFloat(insideTemp))) {
        errors.push('Вкажіть внутрішню температуру');
    }

    if (outsideTemp === '' || outsideTemp === null || isNaN(parseFloat(outsideTemp))) {
        errors.push('Вкажіть зовнішню температуру');
    }

    return errors;
}

function showError(errors) {
    if (!Array.isArray(errors)) {
        errors = [errors];
    }

    let errorHTML = '<strong>Помилка!</strong><br>';
    errors.forEach(error => {
        errorHTML += `• ${error}<br>`;
    });

    errorMessage.innerHTML = errorHTML;
    errorMessage.style.display = 'block';

    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

function displayResult(result) {
    resultMaterial.textContent = materialNames[result.material] || result.material;
    resultCoefficient.textContent = `${result.coefficient} Вт/(м·К)`;
    resultThickness.textContent = `${result.thickness} м`;
    resultArea.textContent = `${result.area} м²`;
    
    const tempDiff = result.insideTemp - result.outsideTemp;
    resultTempDiff.textContent = `${tempDiff}°C`;
    
    resultHeatLoss.textContent = `${result.heatLoss.toFixed(2)} Вт`;
    resultRecommendation.textContent = result.recommendation;

    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function loadExperiments() {
    try {
        loadingMessage.style.display = 'block';
        experimentsTable.style.display = 'none';
        noDataMessage.style.display = 'none';
        experimentsTableBody.innerHTML = '';

        const response = await fetch(`${API_PREFIX}/experiments`);
        const data = await response.json();

        loadingMessage.style.display = 'none';

        if (!data.success || !data.data || data.data.length === 0) {
            noDataMessage.style.display = 'block';
            return;
        }

        data.data.forEach((experiment, index) => {
            const row = document.createElement('tr');
            const tempDiff = experiment.inside_temp - experiment.outside_temp;
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${materialNames[experiment.material] || experiment.material}</td>
                <td>${experiment.thickness}</td>
                <td>${experiment.area}</td>
                <td>${tempDiff}</td>
                <td>${experiment.coefficient}</td>
                <td>${experiment.heat_loss.toFixed(2)}</td>
                <td>${experiment.recommendation}</td>
                <td>${experiment.created_at}</td>
            `;

            experimentsTableBody.appendChild(row);
        });

        experimentsTable.style.display = 'table';

    } catch (error) {
        console.error('Помилка при завантаженні експериментів:', error);
        loadingMessage.style.display = 'none';
        noDataMessage.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadExperiments();
});

setInterval(loadExperiments, 30000);

// ==================== РОЗШИРЕНІ ФУНКЦІЇ ====================

// Розрахунок дня/ночі цикл на Місяці
async function calculateLunarCycle() {
    try {
        const material = document.getElementById('material').value || 'aluminum';
        const thickness = parseFloat(document.getElementById('thickness').value) || 0.1;
        const area = parseFloat(document.getElementById('area').value) || 10;
        
        const response = await fetch(`${API_PREFIX}/lunar-cycle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ material, thickness, area })
        });
        
        const data = await response.json();
        
        const html = `
            <div class="space-y-6 mt-6">
                <div class="grid grid-cols-2 gap-4">
                    <div class="glass-card p-4 rounded-xl">
                        <p class="text-sm text-gray-400">День на Місяці</p>
                        <p class="text-3xl font-bold text-red-400">${data.lunar_day_temp_celsius}°C</p>
                    </div>
                    <div class="glass-card p-4 rounded-xl">
                        <p class="text-sm text-gray-400">Ніч на Місяці</p>
                        <p class="text-3xl font-bold text-blue-400">${data.lunar_night_temp_celsius}°C</p>
                    </div>
                </div>
                
                <div class="glass-card p-6 rounded-2xl bg-gradient-to-r from-purple-900/30 to-pink-900/30">
                    <h3 class="text-yellow-400 font-bold mb-4">⚙️ Тепловий стрес</h3>
                    <p class="text-lg mb-3">
                        Перепад температур: <span class="text-cyan-400 font-bold">${data.temperature_range}°C</span>
                    </p>
                    <p class="text-sm text-gray-300 mb-4">Коефіцієнт стресу: ${data.thermal_stress_factor}</p>
                    <p class="text-lg font-bold text-yellow-300">${data.material_recommendation}</p>
                </div>
                
                <div class="glass-card p-4 rounded-xl">
                    <p class="text-sm text-gray-400">День (теплопотоки)</p>
                    <p class="text-2xl font-bold text-red-400">${data.heat_loss_day_side.toFixed(2)} Вт</p>
                </div>
                <div class="glass-card p-4 rounded-xl">
                    <p class="text-sm text-gray-400">Ніч (охолодження)</p>
                    <p class="text-2xl font-bold text-blue-400">${data.heat_loss_night_side.toFixed(2)} Вт</p>
                </div>
            </div>
        `;
        
        const container = document.getElementById('lunarCycleContainer') || createThermoSection('lunarCycleContainer', '🌙 Månові День/Ніч Цикл');
        container.innerHTML = html;
    } catch (err) {
        console.error('Помилка:', err);
    }
}

// Розрахунок теплового балансу
async function calculateThermalBalance() {
    try {
        const material = document.getElementById('material').value || 'aluminum';
        const thickness = parseFloat(document.getElementById('thickness').value) || 0.1;
        const area = parseFloat(document.getElementById('area').value) || 10;
        
        const response = await fetch(`${API_PREFIX}/thermal-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                external_heat_source_w: 1000,
                internal_heat_generation_w: 500,
                material,
                thickness,
                area,
                outside_temp: -173
            })
        });
        
        const data = await response.json();
        
        const balancePercent = Math.min(100, Math.max(0, (data.thermal_balance + 500) / 10));
        
        const html = `
            <div class="space-y-6 mt-6">
                <div class="glass-card p-6 rounded-2xl">
                    <h3 class="text-cyan-400 font-bold mb-4">⚖️ Тепловий баланс конструкції</h3>
                    <div class="space-y-4">
                        <div>
                            <p class="text-sm text-gray-400 mb-2">Вхідна енергія</p>
                            <div class="bg-black/40 p-3 rounded-lg">
                                <p>🌞 Зовнішнього джерела: <strong class="text-yellow-400">${data.external_heat_source_w} Вт</strong></p>
                                <p>⚙️ Внутрішнього генерування: <strong class="text-orange-400">${data.internal_heat_generation_w} Вт</strong></p>
                                <p class="mt-2 pt-2 border-t border-gray-600">Разом: <strong class="text-emerald-400">${data.total_heat_input} Вт</strong></p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <p class="text-sm text-gray-400">Теплопотерь у космос</p>
                    <div class="bg-black/40 p-4 rounded-xl">
                        <p class="text-2xl font-bold text-red-400">${data.heat_loss_to_space.toFixed(2)} Вт</p>
                    </div>
                </div>
                
                <div class="glass-card p-6 rounded-2xl ${data.balance > 0 ? 'border-l-4 border-red-500 bg-red-950/20' : data.balance < -100 ? 'border-l-4 border-blue-500 bg-blue-950/20' : 'border-l-4 border-green-500 bg-green-950/20'}">
                    <h3 class="font-bold mb-3 text-lg">${data.status}</h3>
                    <div class="space-y-2">
                        <p class="text-sm">
                            <strong>Баланс:</strong> 
                            <span class="${data.balance > 0 ? 'text-red-400' : data.balance < -100 ? 'text-blue-400' : 'text-green-400'} font-bold">
                                ${data.balance > 0 ? '+' : ''}${data.balance.toFixed(2)} Вт
                            </span>
                        </p>
                        <p class="text-sm">
                            <strong>Рівноважна температура:</strong> 
                            <span class="text-cyan-400 font-bold">${data.equilibrium_temperature.toFixed(2)}°C</span>
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        const container = document.getElementById('thermalBalanceContainer') || createThermoSection('thermalBalanceContainer', '⚖️ Тепловий баланс');
        container.innerHTML = html;
    } catch (err) {
        console.error('Помилка:', err);
    }
}

// Допоміжна функція для створення нової секції
function createThermoSection(id, title) {
    const section = document.createElement('div');
    section.id = id;
    section.className = 'glass-card p-8 rounded-3xl mt-8';
    section.innerHTML = `<h2 class="text-2xl font-bold text-orange-400 mb-6">${title}</h2>`;
    
    const container = document.querySelector('.glass-card:last-of-type');
    if (container) {
        container.parentNode.insertBefore(section, container.nextSibling);
    }
    
    return section;
}

// Оновлення при завантаженні
window.addEventListener('load', () => {
    calculateLunarCycle();
    calculateThermalBalance();
    
    // Оновлення при зміні параметрів
    document.getElementById('material')?.addEventListener('change', () => {
        calculateLunarCycle();
        calculateThermalBalance();
    });
    document.getElementById('thickness')?.addEventListener('input', () => {
        calculateLunarCycle();
        calculateThermalBalance();
    });
    document.getElementById('area')?.addEventListener('input', () => {
        calculateLunarCycle();
        calculateThermalBalance();
    });
});
