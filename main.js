const STORAGE_KEY = "sustainabilityMvpRecords";

const sampleCsv = `Month,Department,Electricity,Fuel,Paper
2025-10,HR,1180,72,34
2025-10,Operations,4310,365,20
2025-10,Finance,1720,95,41
2025-10,IT,2560,120,18
2025-11,HR,1215,70,32
2025-11,Operations,4485,402,24
2025-11,Finance,1660,88,38
2025-11,IT,2630,125,17
2025-12,HR,1475,84,48
2025-12,Operations,4920,455,26
2025-12,Finance,1715,92,42
2025-12,IT,2810,138,19`;

const csvInput = document.getElementById("csvInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const addManualRowBtn = document.getElementById("addManualRowBtn");
const clearManualRowsBtn = document.getElementById("clearManualRowsBtn");
const loadSampleBtn = document.getElementById("loadSampleBtn");
const statusEl = document.getElementById("inputStatus");
const manualForm = document.getElementById("manualForm");
const manualRowsTableBody = document.querySelector("#manualRowsTable tbody");

let manualRows = [];

function showStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`.trim();
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

function parseCsv(csvText) {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes("month") && firstLine.includes("department")) {
    startIndex = 1;
  }

  const parsed = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const columns = lines[i].split(",").map((part) => part.trim());
    if (columns.length < 5) {
      throw new Error(`CSV row ${i + 1} is incomplete. Expected 5 columns.`);
    }

    const record = normalizeRecord({
      month: columns[0],
      department: columns[1],
      electricity: columns[2],
      fuel: columns[3],
      paper: columns[4]
    });

    if (!isValidRecord(record)) {
      throw new Error(`CSV row ${i + 1} has invalid values. Check month, department, and numeric inputs.`);
    }

    parsed.push(record);
  }

  return parsed;
}

function getManualFormValues() {
  const formData = new FormData(manualForm);
  return normalizeRecord({
    month: formData.get("month"),
    department: formData.get("department"),
    electricity: formData.get("electricity"),
    fuel: formData.get("fuel"),
    paper: formData.get("paper")
  });
}

function manualFormHasAnyInput() {
  return Array.from(manualForm.querySelectorAll("input")).some((input) => String(input.value).trim() !== "");
}

function resetManualForm() {
  manualForm.reset();
}

function renderManualRows() {
  if (!manualRows.length) {
    manualRowsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">No manual rows added yet.</td>
      </tr>
    `;
    return;
  }

  manualRowsTableBody.innerHTML = manualRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.month)}</td>
          <td>${escapeHtml(row.department)}</td>
          <td>${formatNumber(row.electricity)}</td>
          <td>${formatNumber(row.fuel)}</td>
          <td>${formatNumber(row.paper)}</td>
        </tr>
      `
    )
    .join("");
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addCurrentManualRow() {
  const row = getManualFormValues();

  if (!isValidRecord(row)) {
    if (manualFormHasAnyInput()) {
      showStatus("Manual row is incomplete or invalid. Fill all fields with non-negative values before adding.", "error");
    }
    return false;
  }

  manualRows.push(row);
  renderManualRows();
  resetManualForm();
  showStatus("Manual row added.", "success");
  return true;
}

function collectAllRecords() {
  let csvRecords = [];
  if (csvInput.value.trim()) {
    csvRecords = parseCsv(csvInput.value);
  }

  let rows = [...manualRows];

  // If the user filled the form but forgot to click "Add Manual Row",
  // include the current row automatically.
  const currentManual = getManualFormValues();
  if (isValidRecord(currentManual)) {
    rows.push(currentManual);
  } else if (manualFormHasAnyInput()) {
    throw new Error("Manual form contains incomplete values. Add or clear the row before analyzing.");
  }

  return [...csvRecords, ...rows];
}

function saveRecords(records) {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    records
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

addManualRowBtn.addEventListener("click", addCurrentManualRow);

clearManualRowsBtn.addEventListener("click", () => {
  manualRows = [];
  renderManualRows();
  showStatus("Manual rows cleared.", "success");
});

loadSampleBtn.addEventListener("click", () => {
  csvInput.value = sampleCsv;
  showStatus('Sample CSV loaded. Click "Analyze Sustainability" to continue.', "success");
});

analyzeBtn.addEventListener("click", () => {
  try {
    showStatus("");
    const records = collectAllRecords();
    if (!records.length) {
      showStatus("Please enter CSV data or add at least one manual row before analyzing.", "error");
      return;
    }

    saveRecords(records);
    showStatus(`Saved ${records.length} record(s). Redirecting to dashboard...`, "success");
    window.location.href = "dashboard.html";
  } catch (error) {
    showStatus(error.message || "Unable to analyze data. Please check your inputs.", "error");
  }
});

renderManualRows();

// Preload demo CSV so the MVP opens with usable sample data.
if (csvInput && !csvInput.value.trim()) {
  csvInput.value = sampleCsv;
  showStatus('Demo CSV preloaded. Click "Analyze Sustainability" to generate dashboard and AI insights.', "success");
}
