const AI_STORAGE_KEY = "sustainabilityMvpRecords";
const AI_EMISSION_FACTORS = {
  electricity: 0.0007,
  fuel: 0.0023,
  paper: 0.001
};
const AI_DEMO_RECORDS = [
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

function readRecords() {
  const raw = localStorage.getItem(AI_STORAGE_KEY);
  if (!raw) return AI_DEMO_RECORDS;

  try {
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(records)) return AI_DEMO_RECORDS;

    return records
      .map((record) => ({
        month: String(record.month || "").trim(),
        department: String(record.department || "").trim(),
        electricity: Number(record.electricity),
        fuel: Number(record.fuel),
        paper: Number(record.paper)
      }))
      .filter(
        (record) =>
          record.month &&
          record.department &&
          Number.isFinite(record.electricity) &&
          Number.isFinite(record.fuel) &&
          Number.isFinite(record.paper)
      );
  } catch (error) {
    console.error("Failed to read AI records:", error);
    return AI_DEMO_RECORDS;
  }
}

function estimateCarbon(electricity, fuel, paper) {
  return (
    electricity * AI_EMISSION_FACTORS.electricity +
    fuel * AI_EMISSION_FACTORS.fuel +
    paper * AI_EMISSION_FACTORS.paper
  );
}

function estimateCarbonForRecord(record) {
  return estimateCarbon(record.electricity, record.fuel, record.paper);
}

function formatNumber(value, maxDigits = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(value);
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${formatNumber(value, 1)}%`;
}

function formatCarbon(value) {
  return `${formatNumber(value, 3)} tCO2e`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function nextMonthLabel(monthLabel) {
  if (/^\d{4}-\d{2}$/.test(monthLabel)) {
    const [year, month] = monthLabel.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    date.setMonth(date.getMonth() + 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return "Next Month";
}

function renderEmptyState(message) {
  const container = document.getElementById("aiContent");
  container.innerHTML = `
    <section class="panel">
      <div class="empty-state">
        <p>${message}</p>
        <a class="btn btn-primary" href="index.html">Go to Data Input</a>
      </div>
    </section>
  `;
}

function buildMonthlyTotals(records) {
  const map = new Map();

  for (const record of records) {
    if (!map.has(record.month)) {
      map.set(record.month, {
        month: record.month,
        electricity: 0,
        fuel: 0,
        paper: 0,
        carbon: 0
      });
    }
    const row = map.get(record.month);
    row.electricity += record.electricity;
    row.fuel += record.fuel;
    row.paper += record.paper;
    row.carbon += estimateCarbonForRecord(record);
  }

  const sortedMonths = sortMonths([...map.keys()]);
  return sortedMonths.map((month) => map.get(month));
}

function buildDepartmentMonthly(records) {
  const deptMonthMap = new Map();

  for (const record of records) {
    const key = `${record.department}__${record.month}`;
    if (!deptMonthMap.has(key)) {
      deptMonthMap.set(key, {
        department: record.department,
        month: record.month,
        electricity: 0,
        fuel: 0,
        paper: 0,
        carbon: 0
      });
    }
    const row = deptMonthMap.get(key);
    row.electricity += record.electricity;
    row.fuel += record.fuel;
    row.paper += record.paper;
    row.carbon += estimateCarbonForRecord(record);
  }

  return [...deptMonthMap.values()];
}

function getActualMonthOverMonthTrend(monthlyTotals) {
  const latest = monthlyTotals[monthlyTotals.length - 1];
  const previous = monthlyTotals[monthlyTotals.length - 2];

  if (!latest) {
    return {
      latestMonth: "N/A",
      previousMonth: "N/A",
      latestCarbon: 0,
      previousCarbon: 0,
      percentChange: 0
    };
  }

  if (!previous || previous.carbon <= 0) {
    return {
      latestMonth: latest.month,
      previousMonth: "N/A",
      latestCarbon: latest.carbon,
      previousCarbon: 0,
      percentChange: 0
    };
  }

  return {
    latestMonth: latest.month,
    previousMonth: previous.month,
    latestCarbon: latest.carbon,
    previousCarbon: previous.carbon,
    percentChange: ((latest.carbon - previous.carbon) / previous.carbon) * 100
  };
}

function getPerformancePosition(trendPercent) {
  if (trendPercent <= -3) {
    return {
      label: "improving",
      className: "improving",
      riskDescriptor: "contained",
      trajectoryLabel: "declining emissions trajectory"
    };
  }

  if (trendPercent >= 3) {
    return {
      label: "deteriorating",
      className: "deteriorating",
      riskDescriptor: "elevated",
      trajectoryLabel: "rising emissions trajectory"
    };
  }

  return {
    label: "stable",
    className: "stable",
    riskDescriptor: "moderate",
    trajectoryLabel: "stable emissions trajectory"
  };
}

function determineSustainabilityRating(totalCarbon, trendPercent, topDeptSharePercent) {
  let riskScore = 0;

  // Emission scale risk (absolute footprint)
  if (totalCarbon > 20) riskScore += 40;
  else if (totalCarbon > 12) riskScore += 30;
  else if (totalCarbon > 6) riskScore += 20;
  else if (totalCarbon > 3) riskScore += 10;

  // Trend risk (month-over-month change)
  if (trendPercent > 10) riskScore += 30;
  else if (trendPercent > 5) riskScore += 22;
  else if (trendPercent > 2) riskScore += 12;
  else if (trendPercent < -8) riskScore -= 8;
  else if (trendPercent < -3) riskScore -= 4;

  // Concentration risk (single department share)
  if (topDeptSharePercent > 45) riskScore += 18;
  else if (topDeptSharePercent > 35) riskScore += 10;
  else if (topDeptSharePercent > 25) riskScore += 5;

  if (riskScore <= 12) return { grade: "A", label: "Excellent" };
  if (riskScore <= 30) return { grade: "B", label: "Stable" };
  if (riskScore <= 55) return { grade: "C", label: "Moderate Risk" };
  return { grade: "D", label: "High Risk" };
}

function buildOperationalRiskStatement(position, trendPercent, topDepartment, topDeptSharePercent) {
  const roundedShare = formatNumber(topDeptSharePercent, 1);

  if (position.label === "deteriorating") {
    return `Current trajectory creates elevated cost and ESG reporting risk if controls are not tightened, particularly in ${topDepartment} where emissions concentration remains high at ${roundedShare}% of total output.`;
  }

  if (position.label === "improving") {
    return `Current trajectory lowers near-term cost and ESG reporting pressure, but concentrated emissions in ${topDepartment} (${roundedShare}% of total output) should still be managed to protect reporting resilience.`;
  }

  if (Math.abs(trendPercent) < 1.5) {
    return `Current trajectory indicates manageable short-term cost exposure, but ESG reporting risk remains moderate because emissions have plateaued and concentration in ${topDepartment} should be monitored closely.`;
  }

  return `Current trajectory indicates moderate operational and ESG reporting risk; maintaining controls in ${topDepartment} is important because it contributes ${roundedShare}% of total emissions.`;
}

function buildExecutiveSummaryMetrics(records, monthlyTotals) {
  const departmentTotals = aggregateByDepartment(records);
  const totalCarbon = departmentTotals.reduce((sum, row) => sum + row.carbon, 0);
  const topDepartment = departmentTotals[0] || {
    department: "N/A",
    carbon: 0
  };
  const topDeptSharePercent = totalCarbon > 0 ? (topDepartment.carbon / totalCarbon) * 100 : 0;
  const trend = getActualMonthOverMonthTrend(monthlyTotals);
  const position = getPerformancePosition(trend.percentChange);
  const rating = determineSustainabilityRating(totalCarbon, trend.percentChange, topDeptSharePercent);

  return {
    totalCarbon,
    departmentTotals,
    topDepartment,
    topDeptSharePercent,
    trend,
    position,
    rating,
    operationalRiskStatement: buildOperationalRiskStatement(
      position,
      trend.percentChange,
      topDepartment.department,
      topDeptSharePercent
    )
  };
}

function generateExecutiveSummary(records, monthlyTotals) {
  const metrics = buildExecutiveSummaryMetrics(records, monthlyTotals);
  const trendWord = metrics.trend.percentChange > 0 ? "increased" : metrics.trend.percentChange < 0 ? "decreased" : "remained flat";
  const trendAbs = formatNumber(Math.abs(metrics.trend.percentChange), 1);

  const headline = `The organization shows ${metrics.position.label} sustainability performance, with a ${metrics.position.trajectoryLabel} and a current overall rating of ${metrics.rating.grade} (${metrics.rating.label}).`;

  const bullets = [
    `Month-over-month estimated emissions ${trendWord}${metrics.trend.previousMonth === "N/A" ? "" : ` by ${trendAbs}%`} ${metrics.trend.previousMonth === "N/A" ? "based on the latest available reporting period." : `from ${metrics.trend.previousMonth} to ${metrics.trend.latestMonth}, indicating ${metrics.position.label} environmental performance momentum.`}`,
    `${metrics.topDepartment.department} is the highest-emitting department and contributes ${formatNumber(metrics.topDeptSharePercent, 1)}% of total emissions, creating a clear concentration risk that should be prioritized in operational planning.`,
    metrics.operationalRiskStatement
  ];

  return {
    headline,
    bullets,
    rating: metrics.rating,
    trendClass: metrics.position.className
  };
}

function renderExecutiveSummary(summary) {
  const container = document.getElementById("executiveSummaryContainer");
  if (!container) return;

  container.innerHTML = `
    <article class="executive-summary-card executive-summary-${summary.trendClass}">
      <div class="executive-summary-header">
        <div>
          <p class="executive-summary-kicker">Board Report Ready</p>
          <p class="executive-summary-headline"><strong>${escapeHtml(summary.headline)}</strong></p>
        </div>
        <div class="executive-rating-badge rating-${summary.rating.grade.toLowerCase()}" aria-label="Sustainability rating ${summary.rating.grade}">
          <span class="executive-rating-grade">${summary.rating.grade}</span>
          <span class="executive-rating-label">${escapeHtml(summary.rating.label)}</span>
        </div>
      </div>
      <ul class="executive-summary-list">
        ${summary.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function buildForecast(monthlyTotals) {
  const last = monthlyTotals[monthlyTotals.length - 1];
  const previous = monthlyTotals[monthlyTotals.length - 2];

  let percentChange;
  if (!last) {
    percentChange = 5;
  } else if (!previous || previous.carbon <= 0) {
    percentChange = 5;
  } else {
    const rawTrend = ((last.carbon - previous.carbon) / previous.carbon) * 100;
    // Damp and clamp trend to keep MVP projection stable.
    percentChange = Math.max(-15, Math.min(15, rawTrend * 0.8));
    if (Math.abs(percentChange) < 1) percentChange = rawTrend >= 0 ? 5 : -5;
  }

  const baseCarbon = last ? last.carbon : 0;
  const projectedCarbon = baseCarbon * (1 + percentChange / 100);

  return {
    lastMonthLabel: last ? last.month : "N/A",
    projectedMonthLabel: last ? nextMonthLabel(last.month) : "Next Month",
    previousCarbon: previous ? previous.carbon : baseCarbon,
    currentCarbon: baseCarbon,
    projectedCarbon,
    percentChange
  };
}

function renderForecast(forecast, monthlyTotals) {
  const volatility = calculateVolatilityScore(monthlyTotals);
  const cards = [
    {
      label: `Predicted Carbon (${forecast.projectedMonthLabel})`,
      value: formatCarbon(forecast.projectedCarbon),
      note: `Projected from ${forecast.lastMonthLabel} trend`
    },
    {
      label: "% Change vs Previous Month",
      value: formatPercent(forecast.percentChange),
      note: "Deterministic trend projection (dummy AI)"
    },
    {
      label: "Latest Recorded Carbon",
      value: formatCarbon(forecast.currentCarbon),
      note: `Based on ${forecast.lastMonthLabel || "latest month"}`
    },
    {
      label: "Volatility Indicator",
      value: `${formatNumber(volatility, 1)} / 100`,
      note: "Higher values imply more unstable monthly emissions"
    }
  ];

  const container = document.getElementById("forecastCards");
  container.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value">${card.value}</div>
          <div class="metric-note">${card.note}</div>
        </article>
      `
    )
    .join("");
}

function calculateVolatilityScore(monthlyTotals) {
  if (monthlyTotals.length < 2) return 10;
  const values = monthlyTotals.map((row) => row.carbon);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length || 0;
  if (!mean) return 10;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return Math.min(100, (stdDev / mean) * 100);
}

function generateAnomalies(records, monthlyTotals, departmentMonthlyRows) {
  const anomalies = [];
  const sortedMonths = monthlyTotals.map((m) => m.month);
  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const previousMonth = sortedMonths[sortedMonths.length - 2];

  if (latestMonth) {
    const latestRows = departmentMonthlyRows.filter((row) => row.month === latestMonth);
    const deptNames = [...new Set(latestRows.map((row) => row.department))].sort((a, b) => a.localeCompare(b));

    for (const dept of deptNames) {
      const deptRows = departmentMonthlyRows
        .filter((row) => row.department === dept)
        .sort((a, b) => getMonthSortValue(a.month) - getMonthSortValue(b.month));

      const latestDeptRow = deptRows[deptRows.length - 1];
      const historicalRows = deptRows.slice(0, -1);
      if (!latestDeptRow) continue;

      const metrics = [
        { key: "electricity", label: "Electricity usage", unit: "kWh" },
        { key: "fuel", label: "Fuel consumption", unit: "L" },
        { key: "paper", label: "Paper usage", unit: "kg" }
      ];

      for (const metric of metrics) {
        if (!historicalRows.length) continue;

        const avg =
          historicalRows.reduce((sum, row) => sum + row[metric.key], 0) / historicalRows.length;
        const latestValue = latestDeptRow[metric.key];
        if (avg <= 0) continue;

        const pct = ((latestValue - avg) / avg) * 100;
        if (Math.abs(pct) >= 15) {
          anomalies.push({
            severity: Math.abs(pct),
            message: `${metric.label} in ${dept} ${pct > 0 ? "increased" : "decreased"} ${formatNumber(Math.abs(pct), 1)}% vs historical average (${formatNumber(avg, 1)} ${metric.unit}).`
          });
        }
      }
    }
  }

  if (latestMonth && previousMonth) {
    const latest = monthlyTotals.find((row) => row.month === latestMonth);
    const previous = monthlyTotals.find((row) => row.month === previousMonth);

    if (latest && previous) {
      const metrics = [
        { key: "electricity", label: "Total electricity usage" },
        { key: "fuel", label: "Total fuel consumption" },
        { key: "paper", label: "Total paper usage" },
        { key: "carbon", label: "Estimated carbon footprint" }
      ];

      for (const metric of metrics) {
        if (!previous[metric.key]) continue;
        const pct = ((latest[metric.key] - previous[metric.key]) / previous[metric.key]) * 100;
        if (Math.abs(pct) >= 10) {
          anomalies.push({
            severity: Math.abs(pct) - 1,
            message: `${metric.label} ${pct > 0 ? "moved up" : "dropped"} ${formatNumber(Math.abs(pct), 1)}% from ${previousMonth} to ${latestMonth}.`
          });
        }
      }
    }
  }

  if (!anomalies.length) {
    const highestRecord = [...records].sort(
      (a, b) => estimateCarbonForRecord(b) - estimateCarbonForRecord(a)
    )[0];
    if (highestRecord) {
      anomalies.push({
        severity: 20,
        message: `Highest estimated single-entry emissions occurred in ${highestRecord.department} (${highestRecord.month}), driven by combined electricity and fuel usage.`
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of anomalies.sort((a, b) => b.severity - a.severity || a.message.localeCompare(b.message))) {
    if (!seen.has(item.message)) {
      seen.add(item.message);
      unique.push(item);
    }
  }

  return unique.slice(0, 3);
}

function renderAnomalies(anomalies) {
  const list = document.getElementById("anomalyList");
  if (!anomalies.length) {
    list.innerHTML = `<li>No significant anomalies detected with the current dataset.</li>`;
    return;
  }

  list.innerHTML = anomalies.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("");
}

function aggregateByDepartment(records) {
  const map = new Map();
  for (const record of records) {
    if (!map.has(record.department)) {
      map.set(record.department, {
        department: record.department,
        electricity: 0,
        fuel: 0,
        paper: 0,
        carbon: 0
      });
    }
    const row = map.get(record.department);
    row.electricity += record.electricity;
    row.fuel += record.fuel;
    row.paper += record.paper;
    row.carbon += estimateCarbonForRecord(record);
  }
  return [...map.values()].sort((a, b) => b.carbon - a.carbon || a.department.localeCompare(b.department));
}

function buildRecommendations(records, monthlyTotals) {
  const deptTotals = aggregateByDepartment(records);
  const grandTotals = records.reduce(
    (acc, record) => {
      acc.electricity += record.electricity;
      acc.fuel += record.fuel;
      acc.paper += record.paper;
      return acc;
    },
    { electricity: 0, fuel: 0, paper: 0 }
  );

  const totalCarbon = estimateCarbon(grandTotals.electricity, grandTotals.fuel, grandTotals.paper);
  const volatilityScore = calculateVolatilityScore(monthlyTotals);

  const highestDept = deptTotals[0]?.department || "Operations";
  const electricityImpact = estimateCarbon(grandTotals.electricity * 0.12, 0, 0);
  const fuelImpact = estimateCarbon(0, grandTotals.fuel * 0.1, 0);
  const paperImpact = estimateCarbon(0, 0, grandTotals.paper * 0.2);
  const monitoringImpact = totalCarbon * Math.min(0.08, Math.max(0.03, volatilityScore / 1000));
  const remoteMeetingImpact = estimateCarbon(0, grandTotals.fuel * 0.07, 0);

  const recommendations = [
    {
      id: "led",
      title: "LED Lighting Conversion",
      category: "Electricity",
      reason: `Electricity is a major driver of estimated emissions. Prioritize LED retrofits in ${highestDept} and other high-load areas.`,
      impact: electricityImpact,
      priorityScore: electricityImpact + 1.2
    },
    {
      id: "paper",
      title: "Reduce Paper Usage via Duplex Policy",
      category: "Paper",
      reason: `Paper consumption contributes a smaller but avoidable share of emissions. Enforce duplex printing defaults and print approval thresholds.`,
      impact: paperImpact,
      priorityScore: paperImpact + 0.4
    },
    {
      id: "remote",
      title: "Remote Meeting Policy",
      category: "Fuel",
      reason: `Fuel consumption suggests travel and logistics opportunities. Shift internal meetings to remote-first to reduce transport-related fuel use.`,
      impact: remoteMeetingImpact,
      priorityScore: remoteMeetingImpact + 0.8
    },
    {
      id: "monitoring",
      title: "Energy Monitoring System",
      category: "Controls",
      reason: `Monthly volatility score is ${formatNumber(volatilityScore, 1)}. Sub-metering and alerts can catch spikes earlier.`,
      impact: monitoringImpact,
      priorityScore: monitoringImpact + 0.6
    },
    {
      id: "maintenance",
      title: "Fuel Efficiency & Preventive Maintenance Program",
      category: "Fuel",
      reason: `Fuel usage remains a high carbon contributor. Maintenance scheduling and route optimization can improve efficiency.`,
      impact: fuelImpact,
      priorityScore: fuelImpact + 0.7
    }
  ];

  return recommendations.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);
}

function renderRecommendations(recommendations) {
  const grid = document.getElementById("recommendationsGrid");
  grid.innerHTML = recommendations
    .map(
      (item, index) => `
        <article class="recommendation-card">
          <div class="badge">Priority ${index + 1} - ${escapeHtml(item.category)}</div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.reason)}</p>
          <div class="recommendation-meta">Estimated impact potential (dummy): ${formatCarbon(item.impact)}</div>
        </article>
      `
    )
    .join("");
}

function buildFlaggedDepartments(records) {
  const rows = aggregateByDepartment(records);
  const totalCarbon = rows.reduce((sum, row) => sum + row.carbon, 0);
  const averageCarbon = rows.length ? totalCarbon / rows.length : 0;
  const threshold = averageCarbon * 1.15; // 15% above average department emissions

  const tableRows = rows.map((row) => {
    const share = totalCarbon ? (row.carbon / totalCarbon) * 100 : 0;
    return {
      ...row,
      share,
      flagged: row.carbon > threshold
    };
  });

  return { rows: tableRows, threshold, totalCarbon };
}

function renderFlaggedDepartments(data) {
  const tbody = document.querySelector("#flaggedDepartmentsTable tbody");
  if (!data.rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">No department data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.rows
    .map(
      (row) => `
        <tr class="${row.flagged ? "row-flagged" : ""}">
          <td>${escapeHtml(row.department)}</td>
          <td>${formatCarbon(row.carbon)}</td>
          <td>${formatNumber(row.share, 1)}%</td>
          <td>
            <span class="status-pill ${row.flagged ? "alert" : "ok"}">
              ${row.flagged ? "Above Threshold" : "Within Range"}
            </span>
          </td>
        </tr>
      `
    )
    .join("");

  const flaggedCount = data.rows.filter((row) => row.flagged).length;
  const note = document.getElementById("thresholdNote");
  note.textContent = `Threshold = ${formatCarbon(data.threshold)} (15% above average department emissions). ${flaggedCount} of ${data.rows.length} department(s) flagged.`;
}

function initAiResults() {
  const records = readRecords();
  if (!records.length) {
    renderEmptyState("No sustainability data found in localStorage. Please enter data first.");
    return;
  }

  const monthlyTotals = buildMonthlyTotals(records);
  const departmentMonthly = buildDepartmentMonthly(records);
  const executiveSummary = generateExecutiveSummary(records, monthlyTotals);
  const forecast = buildForecast(monthlyTotals);
  const anomalies = generateAnomalies(records, monthlyTotals, departmentMonthly);
  const recommendations = buildRecommendations(records, monthlyTotals);
  const flaggedDepartments = buildFlaggedDepartments(records);

  renderExecutiveSummary(executiveSummary);
  renderForecast(forecast, monthlyTotals);
  renderAnomalies(anomalies);
  renderRecommendations(recommendations);
  renderFlaggedDepartments(flaggedDepartments);

  if (!localStorage.getItem(AI_STORAGE_KEY)) {
    const aiContent = document.getElementById("aiContent");
    const demoNotice = document.createElement("section");
    demoNotice.className = "panel panel-soft";
    demoNotice.innerHTML = `
      <div class="section-heading">
        <h2>Demo Data Active</h2>
        <p>These insights are generated from built-in dummy data because no saved dataset was found yet.</p>
      </div>
    `;
    const executiveSection = aiContent.querySelector("section");
    if (executiveSection && executiveSection.nextSibling) {
      aiContent.insertBefore(demoNotice, executiveSection.nextSibling);
    } else {
      aiContent.appendChild(demoNotice);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAiResults);
} else {
  initAiResults();
}
