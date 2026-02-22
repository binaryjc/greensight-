const PRIMARY_STORAGE_KEY = "sustainabilityRows";
const LEGACY_STORAGE_KEY = "sustainabilityMvpRecords";

const EMISSION_FACTORS = {
  electricity: 0.0007,
  fuel: 0.0023,
  paper: 0.001
};

const EMISSION_THRESHOLD_TONS = 1.2;

const chartInstances = {
  electricityTrend: null,
  departmentBreakdown: null,
  topEmitters: null,
  emissionComposition: null
};

// Built-in demo rows keep the dashboard usable when localStorage is empty.
const DASHBOARD_DEMO_RECORDS = [
  { month: "2025-10", department: "HR", electricity: 1180, fuel: 72, paper: 34 },
  { month: "2025-10", department: "Operations", electricity: 4310, fuel: 365, paper: 20 },
  { month: "2025-10", department: "Finance", electricity: 1720, fuel: 95, paper: 41 },
  { month: "2025-10", department: "IT", electricity: 2560, fuel: 120, paper: 18 },
  { month: "2025-11", department: "HR", electricity: 1215, fuel: 70, paper: 32 },
  { month: "2025-11", department: "Operations", electricity: 4485, fuel: 402, paper: 24 },
  { month: "2025-11", department: "Finance", electricity: 1660, fuel: 88, paper: 38 },
  { month: "2025-11", department: "IT", electricity: 2630, fuel: 125, paper: 17 },
  { month: "2025-12", department: "HR", electricity: 1475, fuel: 84, paper: 48 },
  { month: "2025-12", department: "Operations", electricity: 4920, fuel: 455, paper: 26 },
  { month: "2025-12", department: "Finance", electricity: 1715, fuel: 92, paper: 42 },
  { month: "2025-12", department: "IT", electricity: 2810, fuel: 138, paper: 19 }
];

function isValidRecord(record) {
  return (
    record.month &&
    record.department &&
    Number.isFinite(record.electricity) &&
    Number.isFinite(record.fuel) &&
    Number.isFinite(record.paper) &&
    record.electricity >= 0 &&
    record.fuel >= 0 &&
    record.paper >= 0
  );
}

function normalizeRecord(record) {
  return {
    month: String(record.month || "").trim(),
    department: String(record.department || "").trim(),
    electricity: Number(record.electricity),
    fuel: Number(record.fuel),
    paper: Number(record.paper)
  };
}

function parseStoredPayload(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  return [];
}

// parseRows(): reads rows from localStorage and falls back safely to demo data.
function parseRows() {
  const candidates = [
    {
      key: PRIMARY_STORAGE_KEY,
      label: "primary"
    },
    {
      key: LEGACY_STORAGE_KEY,
      label: "legacy"
    }
  ];

  for (const candidate of candidates) {
    const raw = localStorage.getItem(candidate.key);
    if (!raw) continue;

    try {
      const rows = parseStoredPayload(raw).map(normalizeRecord).filter(isValidRecord);
      if (rows.length) {
        return {
          rows,
          sourceKey: candidate.key,
          usedDemo: false,
          noticeMessage:
            candidate.label === "legacy"
              ? `Loaded data from legacy localStorage key "${LEGACY_STORAGE_KEY}".`
              : ""
        };
      }
    } catch (error) {
      console.error(`Failed to parse ${candidate.key}:`, error);
    }
  }

  return {
    rows: DASHBOARD_DEMO_RECORDS.map(normalizeRecord),
    sourceKey: "demo",
    usedDemo: true,
    noticeMessage:
      "No saved localStorage data found (expected key: \"sustainabilityRows\"). Showing demo dataset so the dashboard remains usable."
  };
}

function estimateCarbonFromUsage(electricity, fuel, paper) {
  return (
    electricity * EMISSION_FACTORS.electricity +
    fuel * EMISSION_FACTORS.fuel +
    paper * EMISSION_FACTORS.paper
  );
}

function estimateCarbonForRecord(record) {
  return estimateCarbonFromUsage(record.electricity, record.fuel, record.paper);
}

function getEmissionComponentsForRecord(record) {
  const electricityCo2 = record.electricity * EMISSION_FACTORS.electricity;
  const fuelCo2 = record.fuel * EMISSION_FACTORS.fuel;
  const paperCo2 = record.paper * EMISSION_FACTORS.paper;

  return {
    electricityCo2,
    fuelCo2,
    paperCo2,
    totalCo2: electricityCo2 + fuelCo2 + paperCo2
  };
}

function getMonthSortValue(monthLabel) {
  if (/^\d{4}-\d{2}$/.test(monthLabel)) {
    const [year, month] = monthLabel.split("-").map(Number);
    return year * 12 + month;
  }

  const date = new Date(`${monthLabel}-01`);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  return Number.MAX_SAFE_INTEGER;
}

function sortMonths(months) {
  return [...months].sort((a, b) => getMonthSortValue(a) - getMonthSortValue(b) || a.localeCompare(b));
}

function formatNumber(value, maxDigits = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(value);
}

function formatCarbon(value) {
  return `${formatNumber(value, 3)} tCO2e`;
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${formatNumber(value, digits)}%`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderEmptyState(message) {
  const container = document.getElementById("dashboardContent");
  container.innerHTML = `
    <section class="panel">
      <div class="empty-state">
        <p>${message}</p>
        <a class="btn btn-primary" href="index.html">Go to Data Input</a>
      </div>
    </section>
  `;
}

function renderTopNotice(message) {
  if (!message) return;

  const dashboardContent = document.getElementById("dashboardContent");
  if (!dashboardContent) return;

  const notice = document.createElement("section");
  notice.className = "panel panel-soft";
  notice.innerHTML = `
    <div class="section-heading">
      <h2>Data Notice</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;

  dashboardContent.prepend(notice);
}

// computeMonthlyTotals(): aggregates records into month-level totals used by charts and ESG scoring.
function computeMonthlyTotals(rows) {
  const monthMap = new Map();

  for (const row of rows) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, {
        month: row.month,
        electricity: 0,
        fuel: 0,
        paper: 0,
        electricityCo2: 0,
        fuelCo2: 0,
        paperCo2: 0,
        totalCo2: 0
      });
    }

    const monthly = monthMap.get(row.month);
    const components = getEmissionComponentsForRecord(row);
    monthly.electricity += row.electricity;
    monthly.fuel += row.fuel;
    monthly.paper += row.paper;
    monthly.electricityCo2 += components.electricityCo2;
    monthly.fuelCo2 += components.fuelCo2;
    monthly.paperCo2 += components.paperCo2;
    monthly.totalCo2 += components.totalCo2;
  }

  const orderedMonths = sortMonths([...monthMap.keys()]);
  return orderedMonths.map((month) => monthMap.get(month));
}

function buildSummary(rows) {
  return rows.reduce(
    (acc, row) => {
      const components = getEmissionComponentsForRecord(row);
      acc.electricity += row.electricity;
      acc.fuel += row.fuel;
      acc.paper += row.paper;
      acc.electricityCo2 += components.electricityCo2;
      acc.fuelCo2 += components.fuelCo2;
      acc.paperCo2 += components.paperCo2;
      acc.totalCarbon += components.totalCo2;
      return acc;
    },
    {
      electricity: 0,
      fuel: 0,
      paper: 0,
      electricityCo2: 0,
      fuelCo2: 0,
      paperCo2: 0,
      totalCarbon: 0
    }
  );
}

function aggregateByDepartment(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.department)) {
      map.set(row.department, {
        department: row.department,
        electricity: 0,
        fuel: 0,
        paper: 0,
        electricityCo2: 0,
        fuelCo2: 0,
        paperCo2: 0,
        carbon: 0
      });
    }

    const dept = map.get(row.department);
    const components = getEmissionComponentsForRecord(row);

    dept.electricity += row.electricity;
    dept.fuel += row.fuel;
    dept.paper += row.paper;
    dept.electricityCo2 += components.electricityCo2;
    dept.fuelCo2 += components.fuelCo2;
    dept.paperCo2 += components.paperCo2;
    dept.carbon += components.totalCo2;
  }

  return [...map.values()].sort((a, b) => b.carbon - a.carbon || a.department.localeCompare(b.department));
}

function buildEmissionComposition(summary) {
  return {
    labels: ["Electricity", "Fuel", "Paper"],
    values: [summary.electricityCo2, summary.fuelCo2, summary.paperCo2]
  };
}

function buildMonthlyElectricityTrend(monthlyTotals) {
  return {
    labels: monthlyTotals.map((row) => row.month),
    values: monthlyTotals.map((row) => row.electricity)
  };
}

function safeMoMPercent(currentValue, previousValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue <= 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

function scoreMoMChange(changePercent) {
  if (changePercent === null) return 15;
  if (changePercent < 0) return 25;
  if (changePercent >= -2 && changePercent <= 2) return 18;
  if (changePercent > 2 && changePercent <= 10) return 10;
  if (changePercent > 10) return 5;
  return 15;
}

function getCoefficientOfVariation(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (clean.length < 3) return null;

  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  if (mean <= 0) return null;

  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / mean;
}

function scoreTrendStability(cv) {
  if (cv === null) return 15;
  if (cv <= 0.05) return 25;
  if (cv <= 0.1) return 18;
  if (cv <= 0.2) return 10;
  return 5;
}

function getEsgLevel(score) {
  if (score <= 29) return { level: 1, label: "Initial" };
  if (score <= 49) return { level: 2, label: "Developing" };
  if (score <= 69) return { level: 3, label: "Defined" };
  if (score <= 84) return { level: 4, label: "Managed" };
  return { level: 5, label: "Optimized" };
}

function getRiskBand(score, totalMoMPercent) {
  const totalIncrease = Number.isFinite(totalMoMPercent) ? totalMoMPercent : 0;

  if (score < 50 || totalIncrease > 10) {
    return "High";
  }

  if ((score >= 50 && score <= 69) || (totalIncrease >= 5 && totalIncrease <= 10)) {
    return "Moderate";
  }

  if (score >= 70 && totalIncrease < 5) {
    return "Low";
  }

  return "Moderate";
}

function getTrendArrow(totalMoMPercent) {
  if (!Number.isFinite(totalMoMPercent)) {
    return { arrow: "→", label: "No prior month", className: "flat" };
  }
  if (totalMoMPercent > 1) {
    return { arrow: "↑", label: `Up ${formatPercent(totalMoMPercent)}`, className: "up" };
  }
  if (totalMoMPercent < -1) {
    return { arrow: "↓", label: `Down ${formatPercent(totalMoMPercent)}`, className: "down" };
  }
  return { arrow: "→", label: `Flat ${formatPercent(totalMoMPercent)}`, className: "flat" };
}

// computeESGScore(): applies the requested 4-pillar scoring framework (0-25 each).
function computeESGScore(monthlyTotals) {
  const latest = monthlyTotals[monthlyTotals.length - 1] || null;
  const previous = monthlyTotals[monthlyTotals.length - 2] || null;

  const energyChangePct = latest && previous ? safeMoMPercent(latest.electricityCo2, previous.electricityCo2) : null;
  const fuelChangePct = latest && previous ? safeMoMPercent(latest.fuelCo2, previous.fuelCo2) : null;
  const paperChangePct = latest && previous ? safeMoMPercent(latest.paperCo2, previous.paperCo2) : null;
  const totalChangePct = latest && previous ? safeMoMPercent(latest.totalCo2, previous.totalCo2) : null;

  const recentSixMonths = monthlyTotals.slice(-6);
  const cv = getCoefficientOfVariation(recentSixMonths.map((row) => row.totalCo2));

  const pillars = {
    energyEfficiency: {
      label: "Energy Efficiency",
      score: scoreMoMChange(energyChangePct),
      max: 25,
      changePct: energyChangePct
    },
    fuelImpact: {
      label: "Fuel Impact",
      score: scoreMoMChange(fuelChangePct),
      max: 25,
      changePct: fuelChangePct
    },
    paperEfficiency: {
      label: "Paper Efficiency",
      score: scoreMoMChange(paperChangePct),
      max: 25,
      changePct: paperChangePct
    },
    trendStability: {
      label: "Trend Stability",
      score: scoreTrendStability(cv),
      max: 25,
      coefficientOfVariation: cv
    }
  };

  const rawScore =
    pillars.energyEfficiency.score +
    pillars.fuelImpact.score +
    pillars.paperEfficiency.score +
    pillars.trendStability.score;

  const score = clamp(rawScore, 0, 100);
  const level = getEsgLevel(score);
  const riskBand = getRiskBand(score, totalChangePct);
  const trendIndicator = getTrendArrow(totalChangePct);

  return {
    score,
    level,
    riskBand,
    pillars,
    latestMonth: latest ? latest.month : "N/A",
    previousMonth: previous ? previous.month : "N/A",
    totalMoMPercent: totalChangePct,
    recentMonthsUsed: recentSixMonths.length,
    cv,
    trendIndicator
  };
}

function getRiskBandClass(riskBand) {
  const normalized = String(riskBand || "").toLowerCase();
  if (normalized === "low") return "low";
  if (normalized === "moderate") return "moderate";
  return "high";
}

function renderESGCard(esgScore) {
  const riskClass = getRiskBandClass(esgScore.riskBand);
  const trendText =
    esgScore.previousMonth === "N/A"
      ? "Awaiting previous month for trend comparison"
      : `MoM total CO2 trend (${esgScore.previousMonth} to ${esgScore.latestMonth}): ${formatPercent(esgScore.totalMoMPercent)}`;

  return `
    <article class="metric-card metric-card-icon esg-kpi-card">
      <div class="metric-card-head">
        <span class="metric-icon metric-icon-esg" aria-hidden="true">ESG</span>
        <div>
          <div class="metric-label">ESG Maturity Score</div>
          <div class="metric-value">${formatNumber(esgScore.score, 0)}/100</div>
        </div>
      </div>
      <div class="metric-note">
        Level ${esgScore.level.level} - ${escapeHtml(esgScore.level.label)}
      </div>
      <div class="esg-kpi-meta">
        <span class="esg-risk-badge ${riskClass}">${escapeHtml(esgScore.riskBand)} Risk</span>
        <span class="esg-trend-indicator ${esgScore.trendIndicator.className}" title="${escapeHtml(trendText)}">
          <span aria-hidden="true">${esgScore.trendIndicator.arrow}</span>
          <span>${escapeHtml(esgScore.trendIndicator.label)}</span>
        </span>
      </div>
    </article>
  `;
}

function renderSummaryCards(summary, esgScore) {
  const cards = [
    renderESGCard(esgScore),
    `
      <article class="metric-card metric-card-icon">
        <div class="metric-card-head">
          <span class="metric-icon" aria-hidden="true">⚡</span>
          <div>
            <div class="metric-label">Total Electricity</div>
            <div class="metric-value">${formatNumber(summary.electricity)} kWh</div>
          </div>
        </div>
        <div class="metric-note">${formatCarbon(summary.electricityCo2)} from electricity</div>
      </article>
    `,
    `
      <article class="metric-card metric-card-icon">
        <div class="metric-card-head">
          <span class="metric-icon" aria-hidden="true">⛽</span>
          <div>
            <div class="metric-label">Total Fuel</div>
            <div class="metric-value">${formatNumber(summary.fuel)} L</div>
          </div>
        </div>
        <div class="metric-note">${formatCarbon(summary.fuelCo2)} from fuel</div>
      </article>
    `,
    `
      <article class="metric-card metric-card-icon">
        <div class="metric-card-head">
          <span class="metric-icon" aria-hidden="true">📄</span>
          <div>
            <div class="metric-label">Total Paper</div>
            <div class="metric-value">${formatNumber(summary.paper)} kg</div>
          </div>
        </div>
        <div class="metric-note">${formatCarbon(summary.paperCo2)} from paper</div>
      </article>
    `,
    `
      <article class="metric-card metric-card-icon">
        <div class="metric-card-head">
          <span class="metric-icon" aria-hidden="true">🌍</span>
          <div>
            <div class="metric-label">Total Carbon</div>
            <div class="metric-value">${formatCarbon(summary.totalCarbon)}</div>
          </div>
        </div>
        <div class="metric-note">Electricity + fuel + paper CO2e</div>
      </article>
    `
  ];

  const summaryCards = document.getElementById("summaryCards");
  summaryCards.innerHTML = cards.join("");
}

// renderScoreBreakdown(): shows pillar-level scores and a short method note.
function renderScoreBreakdown(esgScore) {
  const container = document.getElementById("esgScoreBreakdown");
  if (!container) return;

  const pillarRows = [
    esgScore.pillars.energyEfficiency,
    esgScore.pillars.fuelImpact,
    esgScore.pillars.paperEfficiency,
    esgScore.pillars.trendStability
  ];

  container.innerHTML = `
    <div class="esg-breakdown-header">
      <div>
        <h3>Score Breakdown</h3>
        <p>Based on month-over-month changes and 6-month stability.</p>
      </div>
      <div class="esg-breakdown-summary">
        <span class="esg-breakdown-score">${formatNumber(esgScore.score, 0)}/100</span>
        <span class="esg-breakdown-level">Level ${esgScore.level.level} - ${escapeHtml(esgScore.level.label)}</span>
      </div>
    </div>
    <div class="esg-pillar-list">
      ${pillarRows
        .map((pillar) => {
          const widthPct = (pillar.score / pillar.max) * 100;
          let detail = "No previous month available";

          if (Object.prototype.hasOwnProperty.call(pillar, "changePct")) {
            detail = pillar.changePct === null ? "No previous month available" : `MoM: ${formatPercent(pillar.changePct)}`;
          } else if (Object.prototype.hasOwnProperty.call(pillar, "coefficientOfVariation")) {
            detail =
              pillar.coefficientOfVariation === null
                ? "Need at least 3 months for stability scoring"
                : `CV: ${formatNumber(pillar.coefficientOfVariation, 3)}`;
          }

          return `
            <div class="esg-pillar-row">
              <div class="esg-pillar-meta">
                <span class="esg-pillar-name">${escapeHtml(pillar.label)}</span>
                <span class="esg-pillar-score">${pillar.score}/${pillar.max}</span>
              </div>
              <div class="esg-pillar-bar" aria-hidden="true">
                <span class="esg-pillar-fill" style="width: ${widthPct}%"></span>
              </div>
              <div class="esg-pillar-detail">${escapeHtml(detail)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDepartmentTable(rows) {
  const tbody = document.querySelector("#departmentTable tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.department)}</td>
          <td>${formatNumber(row.electricity)}</td>
          <td>${formatNumber(row.fuel)}</td>
          <td>${formatNumber(row.paper)}</td>
          <td>${formatCarbon(row.carbon)}</td>
        </tr>
      `
    )
    .join("");
}

function buildFlaggedDepartments(departmentRows, threshold = EMISSION_THRESHOLD_TONS) {
  const average = departmentRows.length
    ? departmentRows.reduce((sum, row) => sum + row.carbon, 0) / departmentRows.length
    : 0;

  const flagged = departmentRows
    .filter((row) => row.carbon > threshold)
    .map((row) => ({
      ...row,
      threshold,
      average,
      percentAboveAverage: average > 0 ? ((row.carbon - average) / average) * 100 : 0
    }))
    .sort((a, b) => b.carbon - a.carbon || a.department.localeCompare(b.department));

  return { threshold, average, flagged };
}

function getCanvasOrFallback(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (typeof Chart === "undefined") {
    const wrapper = canvas.parentElement;
    wrapper.innerHTML = `<div class="empty-state"><p>Chart.js could not be loaded. Check your internet connection and refresh.</p></div>`;
    return null;
  }

  return canvas;
}

function replaceChart(chartKey, canvas, config) {
  if (chartInstances[chartKey]) {
    chartInstances[chartKey].destroy();
  }
  chartInstances[chartKey] = new Chart(canvas, config);
}

function renderElectricityChart(trend) {
  const canvas = getCanvasOrFallback("electricityTrendChart");
  if (!canvas) return;

  replaceChart("electricityTrend", canvas, {
    type: "line",
    data: {
      labels: trend.labels,
      datasets: [
        {
          label: "Electricity (kWh)",
          data: trend.values,
          borderColor: "#2e7d32",
          backgroundColor: "rgba(46, 125, 50, 0.14)",
          tension: 0.25,
          fill: true,
          borderWidth: 2.2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top"
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatNumber(value);
            }
          }
        }
      }
    }
  });
}

function renderDepartmentBreakdownChart(departmentRows) {
  const canvas = getCanvasOrFallback("departmentBreakdownChart");
  if (!canvas) return;

  replaceChart("departmentBreakdown", canvas, {
    type: "bar",
    data: {
      labels: departmentRows.map((row) => row.department),
      datasets: [
        {
          label: "Electricity CO2e",
          data: departmentRows.map((row) => row.electricityCo2),
          backgroundColor: "rgba(46, 125, 50, 0.85)",
          borderColor: "#2e7d32",
          borderWidth: 1
        },
        {
          label: "Fuel CO2e",
          data: departmentRows.map((row) => row.fuelCo2),
          backgroundColor: "rgba(245, 124, 0, 0.8)",
          borderColor: "#ef6c00",
          borderWidth: 1
        },
        {
          label: "Paper CO2e",
          data: departmentRows.map((row) => row.paperCo2),
          backgroundColor: "rgba(30, 136, 229, 0.8)",
          borderColor: "#1e88e5",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top"
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${formatCarbon(context.parsed.y || 0)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatNumber(value, 2);
            }
          },
          title: {
            display: true,
            text: "tCO2e"
          }
        }
      }
    }
  });
}

const horizontalBarValueLabelsPlugin = {
  id: "horizontalBarValueLabels",
  afterDatasetsDraw(chart, args, pluginOptions) {
    if (!pluginOptions || !pluginOptions.enabled) return;
    if (chart.config.type !== "bar" || chart.options.indexAxis !== "y") return;

    const dataset = chart.data.datasets[0];
    if (!dataset) return;

    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 12px Segoe UI";
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    meta.data.forEach((bar, index) => {
      const value = Number(dataset.data[index] || 0);
      ctx.fillText(formatNumber(value, 3), bar.x + 8, bar.y);
    });

    ctx.restore();
  }
};

function renderTopEmittersChart(departmentRows) {
  const canvas = getCanvasOrFallback("topEmittersChart");
  if (!canvas) return;

  const rankedRows = [...departmentRows].sort((a, b) => b.carbon - a.carbon || a.department.localeCompare(b.department));
  const backgroundColors = rankedRows.map((_, index) =>
    index === 0 ? "rgba(183, 28, 28, 0.92)" : "rgba(46, 125, 50, 0.65)"
  );
  const borderColors = rankedRows.map((_, index) => (index === 0 ? "#8e0000" : "#2e7d32"));

  replaceChart("topEmitters", canvas, {
    type: "bar",
    data: {
      labels: rankedRows.map((row) => row.department),
      datasets: [
        {
          label: "Total CO2e",
          data: rankedRows.map((row) => row.carbon),
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1.2,
          borderRadius: 6
        }
      ]
    },
    plugins: [horizontalBarValueLabelsPlugin],
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          right: 48
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `Total CO2e: ${formatCarbon(context.parsed.x || 0)}`;
            }
          }
        },
        horizontalBarValueLabels: {
          enabled: true
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return formatNumber(value, 2);
            }
          },
          title: {
            display: true,
            text: "tCO2e"
          }
        },
        y: {
          ticks: {
            autoSkip: false
          }
        }
      }
    }
  });
}

function renderEmissionCompositionChart(composition) {
  const canvas = getCanvasOrFallback("emissionCompositionChart");
  if (!canvas) return;

  replaceChart("emissionComposition", canvas, {
    type: "doughnut",
    data: {
      labels: composition.labels,
      datasets: [
        {
          data: composition.values,
          backgroundColor: ["#2e7d32", "#ef6c00", "#1e88e5"],
          borderColor: "#ffffff",
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.parsed || 0);
              const total = composition.values.reduce((sum, item) => sum + Number(item || 0), 0);
              const percent = total > 0 ? (value / total) * 100 : 0;
              return `${context.label}: ${formatCarbon(value)} (${formatNumber(percent, 1)}%)`;
            }
          }
        }
      }
    }
  });
}

function renderFlagRiskSection(flagData) {
  const container = document.getElementById("flagRiskSection");
  if (!container) return;

  if (!flagData.flagged.length) {
    container.innerHTML = `
      <div class="flag-empty">
        <p>No departments currently exceed the threshold of ${formatCarbon(flagData.threshold)}.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <p class="muted small">
      Threshold: <strong>${formatCarbon(flagData.threshold)}</strong> | Department average: <strong>${formatCarbon(flagData.average)}</strong>
    </p>
    <div class="flag-list">
      ${flagData.flagged
        .map(
          (row) => `
            <article class="flag-card">
              <div class="flag-card-head">
                <div class="flag-card-title">
                  <span class="warning-icon" aria-hidden="true">!</span>
                  <h3>${escapeHtml(row.department)}</h3>
                </div>
                <span class="warning-badge">High Emission</span>
              </div>
              <p class="flag-metric">Total CO2e: <strong>${formatCarbon(row.carbon)}</strong></p>
              <p class="flag-metric">% Above Average: <strong>${formatNumber(row.percentAboveAverage, 1)}%</strong></p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function initDashboard() {
  const parsed = parseRows();
  const rows = parsed.rows;

  if (!rows.length) {
    renderEmptyState("No sustainability data found in localStorage. Add data on the input page first.");
    return;
  }

  const monthlyTotals = computeMonthlyTotals(rows);
  const summary = buildSummary(rows);
  const departmentRows = aggregateByDepartment(rows);
  const electricityTrend = buildMonthlyElectricityTrend(monthlyTotals);
  const emissionComposition = buildEmissionComposition(summary);
  const flagData = buildFlaggedDepartments(departmentRows);
  const esgScore = computeESGScore(monthlyTotals);

  renderSummaryCards(summary, esgScore);
  renderScoreBreakdown(esgScore);
  renderDepartmentTable(departmentRows);
  renderElectricityChart(electricityTrend);
  renderDepartmentBreakdownChart(departmentRows);
  renderTopEmittersChart(departmentRows);
  renderEmissionCompositionChart(emissionComposition);
  renderFlagRiskSection(flagData);

  if (parsed.noticeMessage) {
    renderTopNotice(parsed.noticeMessage);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
