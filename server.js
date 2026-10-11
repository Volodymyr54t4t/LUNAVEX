require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/contact/send', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !subject || !message) {
      return res.status(400).json({ error: 'Будь ласка, заповніть ім’я, тему та повідомлення.' });
    }

    // Замість Telegram просто підтверджуємо прийом повідомлення
    console.log('Contact form received:', {
      name,
      email: email || 'не вказано',
      subject,
      message
    });

    res.json({ success: true, message: 'Повідомлення успішно отримано.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: error.message || 'Не вдалося обробити повідомлення.' });
  }
});

// ==================== ЕНЕРГЕТИЧНИЙ МОДУЛЬ (LunaEnergy AI) ====================

// POST /api/energy/calculate - Розрахунок ефективності сонячних панелей
app.post('/api/energy/calculate', async (req, res) => {
  const { angle, sunlight, temperature, dust } = req.body;
  
  try {
    // Валідація
    if (angle === undefined || angle < 0 || angle > 90) {
      return res.status(400).json({ error: 'Невірний кут (0-90°)' });
    }
    if (sunlight === undefined || sunlight < 0 || sunlight > 1) {
      return res.status(400).json({ error: 'Невірна інтенсивність (0-1)' });
    }
    if (dust === undefined || dust < 0 || dust > 1) {
      return res.status(400).json({ error: 'Невірний пиловий фактор (0-1)' });
    }

    // Розрахунок ефективності
    const efficiency = Math.cos((angle * Math.PI) / 180) * sunlight * (1 - dust);

    // Збереження в БД
    const result = await pool.query(
      'INSERT INTO energy_experiments (angle, sunlight, temperature, dust, efficiency) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [angle, sunlight, temperature, dust, efficiency]
    );

    res.json({
      success: true,
      efficiency: efficiency * 100,
      experiment: result.rows[0]
    });
  } catch (err) {
    console.error('Помилка енергетичного модуля:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// GET /api/energy/experiments - Отримання всіх енергетичних експериментів
app.get('/api/energy/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM energy_experiments ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// GET /api/energy/stats - Статистика енергетичних експериментів
app.get('/api/energy/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::text AS total,
        COALESCE(ROUND((AVG(efficiency) * 100)::numeric, 2), 0) AS avg_efficiency,
        COALESCE(ROUND((MIN(efficiency) * 100)::numeric, 2), 0) AS min_efficiency,
        COALESCE(ROUND((MAX(efficiency) * 100)::numeric, 2), 0) AS max_efficiency,
        COALESCE(ROUND(AVG(angle)::numeric, 1), 0) AS avg_angle,
        COALESCE(ROUND(AVG(temperature)::numeric, 1), 0) AS avg_temperature
      FROM energy_experiments
    `);

    res.json(result.rows[0] || {
      total: '0',
      avg_efficiency: '0.00',
      min_efficiency: '0.00',
      max_efficiency: '0.00',
      avg_angle: '0.0',
      avg_temperature: '0.0'
    });
  } catch (err) {
    console.error('Помилка обробки статистики:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// POST /api/energy/clear - Очистити енергетичні експерименти
app.post('/api/energy/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM energy_experiments');
    res.json({ success: true, message: 'Усі енергетичні експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// POST /api/energy/compare - Порівняння Земля vs Місяць
app.post('/api/energy/compare', async (req, res) => {
  try {
    const { panelType = 'silicon' } = req.body;
    
    // Дані для різних типів панелей
    const panelData = {
      silicon: { 
        efficiency_earth: 18, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      },
      advanced: { 
        efficiency_earth: 22, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      },
      thin_film: { 
        efficiency_earth: 12, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      }
    };

    const panel = panelData[panelType] || panelData.silicon;
    
    // Розрахунок вироблення енергії
    const energy_earth_base = panel.efficiency_earth * panel.max_irradiance_earth * 0.01;
    const energy_moon_base = panel.efficiency_earth * panel.max_irradiance_moon * 0.01;
    
    // На Місяці немає атмосфери - 14 днів без сонця
    const energy_moon_effective = energy_moon_base * (14/29) * 0.95;
    
    res.json({
      panel_type: panelType,
      earth_generation_per_m2_day: parseFloat(energy_earth_base.toFixed(2)),
      moon_generation_per_m2_day: parseFloat(energy_moon_base.toFixed(2)),
      moon_generation_effective: parseFloat(energy_moon_effective.toFixed(2)),
      advantage_factor: parseFloat((energy_moon_effective / energy_earth_base).toFixed(2)),
      lunar_night_days: 14,
      panel_efficiency_earth: panel.efficiency_earth,
      panel_efficiency_moon: panel.efficiency_earth
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/energy/dust-impact - Вплив пилу на панелі
app.post('/api/energy/dust-impact', async (req, res) => {
  try {
    const { dust_percentage = 50 } = req.body;
    
    // Прогноз накопичення пилу залежно від операції
    const dust_factor = 1 - (dust_percentage / 100);
    const efficiency_loss = (dust_percentage / 100) * 100;
    
    // Час до бажаної чистки
    const dust_accumulation_rate = 0.5; // відсотків на місяць
    const cleanup_interval = (100 - dust_percentage) / dust_accumulation_rate;

    res.json({
      current_dust_percentage: dust_percentage,
      efficiency_factor: parseFloat(dust_factor.toFixed(3)),
      efficiency_loss_percent: parseFloat(efficiency_loss.toFixed(2)),
      recommended_cleanup_interval_months: Math.ceil(cleanup_interval),
      power_generation_reduction_percent: parseFloat((efficiency_loss * 0.95).toFixed(2)),
      recommendation: dust_percentage > 60 
        ? '⚠️ КРИТИЧНО! Потрібна невідкладна чистка панелей!' 
        : dust_percentage > 40 
        ? '⚡ Рекомендується планова чистка' 
        : '✅ Стан нормальний'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/energy/roi - ROI калькулятор для місячної станції
app.post('/api/energy/roi', async (req, res) => {
  try {
    const { 
      panel_cost_usd = 5000, 
      panel_power_w = 300, 
      installation_cost = 10000,
      lunar_power_price_usd = 100 // за кВт
    } = req.body;

    // Розрахунок вироблення енергії за місяць
    const avg_generation_per_day = 50; // kWh за день (сонячна)
    const generation_per_month = avg_generation_per_day * 14; // 14 днів на місяці
    const total_generation_per_month = generation_per_month / 1000; // kWh

    // Ціна та прибуток
    const monthly_revenue = total_generation_per_month * lunar_power_price_usd;
    const total_cost = panel_cost_usd + installation_cost;
    const roi_months = total_cost / monthly_revenue;
    const yearly_profit = (monthly_revenue * 12) - (total_cost / roi_months);

    res.json({
      total_investment_usd: total_cost,
      monthly_revenue_usd: parseFloat(monthly_revenue.toFixed(2)),
      roi_months: parseFloat(roi_months.toFixed(1)),
      roi_years: parseFloat((roi_months / 12).toFixed(2)),
      yearly_profit_usd: parseFloat(yearly_profit.toFixed(2)),
      breakeven_point: `За ${Math.ceil(roi_months)} місяців`,
      viability: roi_months < 36 ? '✅ Високо прибутково!' : '⚠️ Довга окупність'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// ==================== РАДІАЦІЙНИЙ МОДУЛЬ (LunaRadiation AI) ====================

// Коефіцієнти для матеріалів
const radiationCoefficients = {
  'Алюміній': 0.6,
  'Вода': 0.3,
  'Реголіт': 0.1
};

// POST /api/radiation/calculate - Розрахунок радіаційного захисту
app.post('/api/radiation/calculate', async (req, res) => {
  try {
    const { material, thickness, radiationLevel } = req.body;

    // Валідація
    const k = radiationCoefficients[material];
    if (!k) {
      return res.status(400).json({ error: 'Невідомий матеріал' });
    }

    // Розрахунок проникнення радіації
    const penetration = radiationLevel * Math.exp(-k * thickness);

    // Збереження в БД
    const result = await pool.query(
      'INSERT INTO radiation_experiments (material, thickness, radiation_level, penetration) VALUES ($1, $2, $3, $4) RETURNING *',
      [material, thickness, radiationLevel, penetration]
    );

    res.json({
      success: true,
      ...result.rows[0],
      penetration: Number(penetration.toFixed(2))
    });
  } catch (err) {
    console.error('Помилка радіаційного модуля:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// GET /api/radiation/experiments - Отримання радіаційних експериментів
app.get('/api/radiation/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM radiation_experiments ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// POST /api/radiation/clear - Очистити радіаційні експерименти
app.post('/api/radiation/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM radiation_experiments');
    res.json({ success: true, message: 'Усі радіаційні експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// POST /api/radiation/multi-layer - Многошарова захист
app.post('/api/radiation/multi-layer', async (req, res) => {
  try {
    const { layers } = req.body; // [{material, thickness}, ...]
    
    if (!Array.isArray(layers) || layers.length === 0) {
      return res.status(400).json({ error: 'Потрібні дані про шари' });
    }

    let totalPenetration = 100;
    let totalThickness = 0;
    let description = [];

    for (const layer of layers) {
      const k = radiationCoefficients[layer.material] || 0.1;
      totalPenetration *= Math.exp(-k * layer.thickness);
      totalThickness += layer.thickness;
      description.push(`${layer.material}: ${layer.thickness}см`);
    }

    res.json({
      layers: layers,
      total_thickness_cm: totalThickness,
      total_penetration_percent: parseFloat(totalPenetration.toFixed(2)),
      shielding_effectiveness: parseFloat(((100 - totalPenetration) / 100 * 100).toFixed(2)),
      composition: description.join(' + '),
      safety_level: totalPenetration < 5 ? '✅ Надійний' : 
                   totalPenetration < 20 ? '⚡ Середній' : '⚠️ Слабкий'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/radiation/astronaut-dose - Дозова еквівалент для космонавтів
app.post('/api/radiation/astronaut-dose', async (req, res) => {
  try {
    const { 
      material, 
      thickness, 
      mission_days = 180, 
      radiation_level = 100 
    } = req.body;

    const k = radiationCoefficients[material] || 0.1;
    const daily_exposure = radiation_level * Math.exp(-k * thickness);
    const total_dose = daily_exposure * mission_days;
    
    // Розрахунок SV (зівертів) екпозиції
    const dose_sv = total_dose / 1000;
    const max_safe_dose_sv = 1.0;
    const safety_percentage = (max_safe_dose_sv / dose_sv) * 100;

    res.json({
      material,
      thickness,
      mission_days,
      daily_exposure: parseFloat(daily_exposure.toFixed(2)),
      total_dose_mrem: parseFloat(total_dose.toFixed(2)),
      total_dose_sv: parseFloat(dose_sv.toFixed(4)),
      max_safe_dose_sv: max_safe_dose_sv,
      exceeds_limit: dose_sv > max_safe_dose_sv,
      safety_margin_percent: parseFloat(safety_percentage.toFixed(1)),
      health_risk: dose_sv > 1.0 ? '🔴 ВИСОКИЙ РИЗИК' : 
                   dose_sv > 0.5 ? '🟡 ПОМІРНИЙ РИЗИК' : 
                   '🟢 ДОПУСТИМО'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/radiation/optimal-material - Рекомендація оптимального матеріалу
app.post('/api/radiation/optimal-material', async (req, res) => {
  try {
    const { target_penetration = 10, available_space_cm = 50 } = req.body;

    const recommendations = [];

    for (const [material, coeff] of Object.entries(radiationCoefficients)) {
      const required_thickness = -Math.log(target_penetration / 100) / coeff;
      
      if (required_thickness <= available_space_cm) {
        recommendations.push({
          material,
          required_thickness: parseFloat(required_thickness.toFixed(2)),
          efficiency: 100 - target_penetration,
          space_available: available_space_cm,
          space_used: parseFloat(required_thickness.toFixed(2)),
          space_remaining: parseFloat((available_space_cm - required_thickness).toFixed(2)),
          feasible: true
        });
      }
    }

    recommendations.sort((a, b) => a.required_thickness - b.required_thickness);

    res.json({
      target_penetration_percent: target_penetration,
      available_space_cm,
      recommendations,
      best_option: recommendations[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// ==================== ТЕРМОРЕГУЛЯЦІЙНИЙ МОДУЛЬ (LunaThermo AI) ====================

// Коефіцієнти теплопровідності матеріалів
const materialCoefficients = {
  aluminum: 205,
  plastic: 0.2,
  glass: 0.8,
  insulation: 0.04
};

// Функція для розрахунку рекомендацій
function getRecommendation(heatLoss) {
  if (heatLoss > 1000) {
    return 'Високі втрати тепла, рекомендується покращена ізоляція';
  } else if (heatLoss >= 300 && heatLoss <= 1000) {
    return 'Середні втрати тепла, варто покращити ізоляцію';
  } else {
    return 'Матеріал достатньо ефективний';
  }
}

// POST /api/thermo/lunar-cycle - Розрахунок дня/ночі цикл на Місяці
app.post('/api/thermo/lunar-cycle', async (req, res) => {
  try {
    const { material, thickness, area } = req.body;
    
    // Температури на Місяці: день ~127°C, ніч ~-173°C
    const day_temp = 127;
    const night_temp = -173;
    const temp_difference = day_temp - night_temp;

    const coefficient = materialCoefficients[material];
    
    // Розрахунок теплопотерь
    const heat_loss_day = coefficient * area * (day_temp / thickness);
    const heat_loss_night = coefficient * area * (Math.abs(night_temp) / thickness);
    
    // Тепловий стрес (теплові цикли)
    const thermal_stress_factor = temp_difference / 100;

    res.json({
      material,
      thickness,
      area,
      lunar_day_temp_celsius: day_temp,
      lunar_night_temp_celsius: night_temp,
      temperature_range: temp_difference,
      heat_loss_day_side: parseFloat(heat_loss_day.toFixed(2)),
      heat_loss_night_side: parseFloat(heat_loss_night.toFixed(2)),
      thermal_stress_factor: parseFloat(thermal_stress_factor.toFixed(2)),
      cycle_duration_days: 29.5,
      material_recommendation: thermal_stress_factor > 2 ? 'Потрібен матеріал з високою теплостійкістю' : 'Матеріал допустимий'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/thermo/thermal-balance - Тепловий баланс конструкції
app.post('/api/thermo/thermal-balance', async (req, res) => {
  try {
    const { 
      external_heat_source_w = 1000,
      internal_heat_generation_w = 500,
      material,
      thickness,
      area,
      outside_temp = -173
    } = req.body;

    const coefficient = materialCoefficients[material];
    const heat_loss = coefficient * area * (20 - outside_temp) / thickness;
    
    const total_heat_input = external_heat_source_w + internal_heat_generation_w;
    const balance = total_heat_input - heat_loss;
    
    const equilibrium_inside_temp = outside_temp + (total_heat_input * thickness) / (coefficient * area);

    res.json({
      external_heat_source_w,
      internal_heat_generation_w,
      total_heat_input: total_heat_input,
      heat_loss_to_space: parseFloat(heat_loss.toFixed(2)),
      thermal_balance: parseFloat(balance.toFixed(2)),
      equilibrium_temperature: parseFloat(equilibrium_inside_temp.toFixed(2)),
      surface_temp: outside_temp,
      status: balance > 0 ? '🔥 Надлишок тепла - потрібне охолодження' : 
              balance < -100 ? '❄️ Дефіцит тепла - потрібне нагрівання' : 
              '⚖️ Баланс близький до нуля'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/thermo/calculate - Розрахунок теплопередачі
app.post('/api/thermo/calculate', async (req, res) => {
  try {
    const { material, thickness, area, insideTemp, outsideTemp } = req.body;

    // Валідація
    const errors = [];
    if (!material || !materialCoefficients[material]) {
      errors.push('Невалідний матеріал');
    }
    if (!thickness || thickness <= 0) {
      errors.push('Товщина мусить бути більше 0');
    }
    if (!area || area <= 0) {
      errors.push('Площа мусить бути більше 0');
    }
    if (insideTemp === undefined || insideTemp === null) {
      errors.push('Вкажіть внутрішню температуру');
    }
    if (outsideTemp === undefined || outsideTemp === null) {
      errors.push('Вкажіть зовнішню температуру');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Отримання коефіцієнту
    const coefficient = materialCoefficients[material];

    // Розрахунок за формулою: Q = k * area * ((insideTemp - outsideTemp) / thickness)
    const tempDifference = insideTemp - outsideTemp;
    const heatLoss = coefficient * area * (tempDifference / thickness);

    // Отримання рекомендації
    const recommendation = getRecommendation(heatLoss);

    // Збереження в БД
    const result = await pool.query(
      `INSERT INTO thermo_experiments (material, thickness, area, inside_temp, outside_temp, coefficient, heat_loss, recommendation) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [material, thickness, area, insideTemp, outsideTemp, coefficient, heatLoss, recommendation]
    );

    res.json({
      success: true,
      result: {
        material,
        thickness: parseFloat(thickness),
        area: parseFloat(area),
        insideTemp: parseFloat(insideTemp),
        outsideTemp: parseFloat(outsideTemp),
        coefficient,
        heatLoss: parseFloat(heatLoss.toFixed(2)),
        recommendation,
        createdAt: new Date().toLocaleString('uk-UA')
      }
    });
  } catch (error) {
    console.error('Помилка термо модуля:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка при розрахунку. Спробуйте пізніше.'
    });
  }
});

// GET /api/thermo/experiments - Отримання термо експериментів
app.get('/api/thermo/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM thermo_experiments ORDER BY created_at DESC'
    );

    const formattedExperiments = result.rows.map(exp => ({
      ...exp,
      created_at: new Date(exp.created_at).toLocaleString('uk-UA')
    }));

    res.json({
      success: true,
      data: formattedExperiments
    });
  } catch (error) {
    console.error('Помилка при отриманні експериментів:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка при отриманні даних'
    });
  }
});

// POST /api/thermo/clear - Очистити термо експерименти
app.post('/api/thermo/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM thermo_experiments');
    res.json({ success: true, message: 'Усі термо експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// ==================== ARTEMIS 2 МОДУЛЬ ====================

// POST /api/artemis/compute-dv - Розрахунок delta-v для Artemis 2
app.post('/api/artemis/compute-dv', async (req, res) => {
  try {
    const { payloadMassKg = 0, stageEfficiency = 0.94 } = req.body;

    const baseDeltaV = {
      leo_circularization: 9.0,
      translunar_injection: 3.2,
      lunar_flyby: 0.6,
      return_trans_Earth: 0.8
    };

    const massFactor = 1 + Math.min(0.35, payloadMassKg / 20000);
    const deltaV = Object.values(baseDeltaV).reduce((sum, v) => sum + v, 0) * massFactor / stageEfficiency;
    const missionSegments = Object.entries(baseDeltaV).map(([phase, v]) => ({ phase, delta_v_kms: parseFloat((v * massFactor / stageEfficiency).toFixed(2)) }));

    res.json({
      success: true,
      payloadMassKg,
      stageEfficiency,
      delta_v_total_kms: parseFloat(deltaV.toFixed(2)),
      mission_segments: missionSegments,
      note: 'Архітектура розрахунку заснована на типових delta-v бюджетах для Artemis II та підлаштовується під додаткове навантаження.'
    });
  } catch (err) {
    console.error('Помилка Artemis delta-v:', err);
    res.status(500).json({ error: 'Помилка розрахунку delta-v' });
  }
});

// POST /api/artemis/compute-exposure - Розрахунок дозового впливу в Deep Space
app.post('/api/artemis/compute-exposure', async (req, res) => {
  try {
    const { missionDays = 21, shieldingMassKg = 150, solarActivityIndex = 1.0 } = req.body;
    const baseDoseRate = 0.6; // mSv/день для Deep Space протягом місії
    const shieldingFactor = Math.max(0.25, 1 - Math.min(0.8, shieldingMassKg / 500));
    const totalDose = baseDoseRate * missionDays * shieldingFactor * solarActivityIndex;
    const exposureRisk = totalDose > 50 ? '🔴 Високий ризик' : totalDose > 20 ? '🟡 Середній ризик' : '🟢 Низький ризик';

    res.json({
      success: true,
      missionDays,
      shieldingMassKg,
      solarActivityIndex,
      total_radiation_msv: parseFloat(totalDose.toFixed(2)),
      risk_level: exposureRisk,
      guidance: exposureRisk === '🔴 Високий ризик'
        ? 'Потрібен додатковий шар захисту та оптимізація траєкторії.'
        : 'Стан експозиції знаходиться в межах допустимого для Artemis 2.'
    });
  } catch (err) {
    console.error('Помилка Artemis exposure:', err);
    res.status(500).json({ error: 'Помилка розрахунку експозиції' });
  }
});

// POST /api/artemis/log-mission - Збереження сценарію Artemis
app.post('/api/artemis/log-mission', async (req, res) => {
  try {
    const { missionName, crewSize, missionDurationDays, deltaVTotal, radiationExposure, safetyIndex, missionNotes } = req.body;
    const result = await pool.query(
      `INSERT INTO artemis_missions (mission_name, crew_size, mission_duration_days, delta_v_total, radiation_exposure_msv, safety_index, mission_notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [missionName, crewSize, missionDurationDays, deltaVTotal, radiationExposure, safetyIndex, missionNotes]
    );

    res.json({ success: true, mission: result.rows[0] });
  } catch (err) {
    console.error('Помилка збереження Artemis місії:', err);
    res.status(500).json({ error: 'Помилка збереження місії' });
  }
});

// GET /api/artemis/experiments - Отримання Artemis сценаріїв
app.get('/api/artemis/experiments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM artemis_missions ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Помилка отримання Artemis місій:', err);
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// GET /artemis - Сторінка модуля Artemis
app.get('/artemis', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'artemis', 'index.html'));
});

// GET /api/system/info - Системна інформація
app.get('/api/system/info', (req, res) => {
  const systemInfo = {
    version: '2.0.0-PWA',
    modules: [
      { name: 'LunaEnergy AI', status: 'active', experiments: 'dynamic' },
      { name: 'LunaRadiation AI', status: 'active', experiments: 'dynamic' },
      { name: 'LunaThermo AI', status: 'active', experiments: 'dynamic' },
      { name: 'Artemis 2 Lab', status: 'active', experiments: 'dynamic' }
    ],
    features: [
      'PWA Support',
      'Offline Mode',
      'Cross-platform',
      'Real-time Calculations',
      'Data Export (CSV/JSON)',
      'Advanced Analytics',
      'Mobile Responsive',
      'Global Search'
    ],
    technologies: ['Node.js', 'Express.js', 'PostgreSQL', 'Tailwind CSS', 'Chart.js', 'PWA'],
    last_updated: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    platform: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
  res.json(systemInfo);
});

// GET /api/system/stats - Загальна статистика системи
app.get('/api/system/stats', async (req, res) => {
  try {
    const [energyStats, radiationStats, thermoStats, artemisStats] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM energy_experiments'),
      pool.query('SELECT COUNT(*) as count FROM radiation_experiments'),
      pool.query('SELECT COUNT(*) as count FROM thermo_experiments'),
      pool.query('SELECT COUNT(*) as count FROM artemis_missions')
    ]);

    const stats = {
      total_experiments: 
        parseInt(energyStats.rows[0].count) + 
        parseInt(radiationStats.rows[0].count) + 
        parseInt(thermoStats.rows[0].count) + 
        parseInt(artemisStats.rows[0].count),
      modules: {
        energy: parseInt(energyStats.rows[0].count),
        radiation: parseInt(radiationStats.rows[0].count),
        thermo: parseInt(thermoStats.rows[0].count),
        artemis: parseInt(artemisStats.rows[0].count)
      },
      last_activity: new Date().toISOString(),
      system_health: 'excellent'
    };

    res.json(stats);
  } catch (err) {
    console.error('Помилка отримання статистики:', err);
    res.status(500).json({ error: 'Помилка отримання статистики' });
  }
});

// GET / - Головна сторінка
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/modules - Список усіх модулів
app.get('/api/modules', (req, res) => {
  res.json({
    modules: [
      {
        id: 'energy',
        name: 'LunaEnergy AI',
        description: 'Ефективність сонячних панелей на Місяці',
        icon: '☀️',
        url: '/energy'
      },
      {
        id: 'radiation',
        name: 'LunaRadiation AI',
        description: 'Моделювання захисту від космічної радіації',
        icon: '☢️',
        url: '/radiation'
      },
      {
        id: 'thermo',
        name: 'LunaThermo AI',
        description: 'Моделювання теплопередачі на Місяці',
        icon: '🌡️',
        url: '/thermo'
      },
      {
        id: 'artemis',
        name: 'Artemis 2 Lab',
        description: 'Науковий модуль Artemis II: траєкторія, delta-v та радіація',
        icon: '🚀',
        url: '/artemis'
      }
    ]
  });
});

// Обробка помилок 404
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`
  🌕 ╔════════════════════════════════════════════════╗
  🌕 ║     LUNA AI RESEARCH CENTER UNIFIED 🌕          ║
  🌕 ║        Обєднана система досліджень Місяця       ║
  🌕 ╠════════════════════════════════════════════════╣
  🌕 ║  Сервер запущено на:  http://localhost:${PORT}   
  🌕 ║  
  🌕 ║  Доступні модулі:
  🌕 ║  ☀️  LunaEnergy - http://localhost:${PORT}/energy
  🌕 ║  ☢️  LunaRadiation - http://localhost:${PORT}/radiation
  🌕 ║  🌡️  LunaThermo - http://localhost:${PORT}/thermo
  🌕 ║  🚀  Artemis 2 Lab - http://localhost:${PORT}/artemis
  🌕 ║  
  🌕 ║  API: http://localhost:${PORT}/api
  🌕 ╚════════════════════════════════════════════════╝
  `);
});
