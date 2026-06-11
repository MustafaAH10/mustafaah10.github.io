const manifestPath = "manifest.json";

const state = {
  records: [],
  performance: {},
  plots: {},
  selected: null,
  solutionVisible: false,
};

const els = {
  lastUpdated: document.getElementById("lastUpdated"),
  totalCount: document.getElementById("totalCount"),
  count3: document.getElementById("count3"),
  count4: document.getElementById("count4"),
  count5: document.getElementById("count5"),
  gridFilter: document.getElementById("gridFilter"),
  difficultyFilter: document.getElementById("difficultyFilter"),
  movesFilter: document.getElementById("movesFilter"),
  visibleCount: document.getElementById("visibleCount"),
  stats: document.getElementById("stats"),
  sampleGrid: document.getElementById("sampleGrid"),
  sampleSummary: document.getElementById("sampleSummary"),
  eyebrow: document.getElementById("eyebrow"),
  puzzleTitle: document.getElementById("puzzleTitle"),
  mainImage: document.getElementById("mainImage"),
  metaGrid: document.getElementById("metaGrid"),
  gridPreview: document.getElementById("gridPreview"),
  promptText: document.getElementById("promptText"),
  solutionButton: document.getElementById("solutionButton"),
  solutionBox: document.getElementById("solutionBox"),
  performanceTables: document.getElementById("performanceTables"),
  plotGrid: document.getElementById("plotGrid"),
};

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function labelDifficulty(value) {
  const text = String(value || "unknown");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function inMoveBand(record) {
  const band = els.movesFilter.value;
  const moves = Number(record.total_moves_in_solution || 0);
  if (band === "short") return moves <= 5;
  if (band === "medium") return moves >= 6 && moves <= 10;
  if (band === "long") return moves >= 11;
  return true;
}

function filteredRecords() {
  return state.records.filter((record) => {
    if (els.gridFilter.value !== "all" && record.grid_size !== els.gridFilter.value) return false;
    if (els.difficultyFilter.value !== "all" && record.difficulty !== els.difficultyFilter.value) return false;
    if (!inMoveBand(record)) return false;
    return true;
  });
}

function renderSummary(records) {
  const all = state.records;
  const counts = all.reduce((acc, record) => {
    acc[record.grid_size] = (acc[record.grid_size] || 0) + 1;
    return acc;
  }, {});
  els.totalCount.textContent = all.length;
  els.count3.textContent = counts["3x3"] || 0;
  els.count4.textContent = counts["4x4"] || 0;
  els.count5.textContent = counts["5x5"] || 0;
  els.visibleCount.textContent = records.length;

  const visibleCounts = records.reduce((acc, record) => {
    acc[record.grid_size] = (acc[record.grid_size] || 0) + 1;
    acc[record.difficulty] = (acc[record.difficulty] || 0) + 1;
    return acc;
  }, {});
  els.stats.innerHTML = `
    <strong>${records.length}</strong> visible puzzles<br>
    3x3: ${visibleCounts["3x3"] || 0}<br>
    4x4: ${visibleCounts["4x4"] || 0}<br>
    5x5: ${visibleCounts["5x5"] || 0}<br>
    Easy: ${visibleCounts.easy || 0}<br>
    Medium: ${visibleCounts.medium || 0}<br>
    Hard: ${visibleCounts.hard || 0}
  `;
  els.sampleSummary.textContent = `${records.length} puzzles match the current filters. Click a card to inspect the image, prompt, and solution.`;
}

function renderGridPreview(record) {
  const grid = record.grid || [];
  els.gridPreview.replaceChildren();
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "gridRow";
    row.style.gridTemplateColumns = `repeat(${grid[rowIndex].length}, 1fr)`;
    for (let colIndex = 0; colIndex < grid[rowIndex].length; colIndex += 1) {
      const cell = document.createElement("div");
      const value = grid[rowIndex][colIndex] || ".";
      const isTarget =
        Array.isArray(record.exit_position) &&
        Number(record.exit_position[0]) === rowIndex + 1 &&
        Number(record.exit_position[1]) === colIndex + 1;
      cell.className = `gridCell${value === "C" ? " car" : ""}${isTarget ? " target" : ""}`;
      cell.textContent = value;
      row.appendChild(cell);
    }
    els.gridPreview.appendChild(row);
  }
}

function renderViewer() {
  const record = state.selected;
  if (!record) return;

  els.eyebrow.textContent = `${record.grid_size} · ${labelDifficulty(record.difficulty)} · ${record.total_moves_in_solution} optimal moves`;
  els.puzzleTitle.textContent = `Puzzle ${record.puzzle_number}`;
  els.mainImage.src = record.initial_image;
  els.promptText.textContent = record.prompt;
  els.solutionBox.className = `solutionBox${state.solutionVisible ? " visible" : ""}`;
  els.solutionBox.replaceChildren();
  const solutionPre = document.createElement("pre");
  solutionPre.textContent = record.solution;
  els.solutionBox.appendChild(solutionPre);
  els.solutionButton.textContent = state.solutionVisible ? "Hide solution" : "Reveal solution";
  els.metaGrid.innerHTML = `
    <div class="metric"><span>Grid</span><strong>${record.grid_size}</strong></div>
    <div class="metric"><span>Difficulty</span><strong>${labelDifficulty(record.difficulty)}</strong></div>
    <div class="metric"><span>Blockers</span><strong>${record.num_blockers ?? "-"}</strong></div>
    <div class="metric"><span>Optimal moves</span><strong>${record.total_moves_in_solution ?? "-"}</strong></div>
    <div class="metric"><span>Car start</span><strong>[${(record.car_position || []).join(", ")}]</strong></div>
    <div class="metric"><span>Target</span><strong>[${(record.exit_position || []).join(", ")}]</strong></div>
  `;
  renderGridPreview(record);
  renderCards();
}

function setSelected(record) {
  state.selected = record;
  state.solutionVisible = false;
  renderViewer();
}

function renderCards() {
  const records = filteredRecords();
  renderSummary(records);
  els.sampleGrid.innerHTML = "";
  if (records.length === 0) {
    els.sampleGrid.innerHTML = '<div class="card"><div class="cardBody"><h3>No puzzles match these filters.</h3></div></div>';
    return;
  }
  for (const record of records) {
    const card = document.createElement("article");
    card.className = `card${state.selected?.id === record.id ? " active" : ""}`;
    card.tabIndex = 0;
    card.addEventListener("click", () => setSelected(record));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelected(record);
      }
    });
    card.innerHTML = `
      <img src="${record.initial_image}" alt="${record.id} initial state" loading="lazy">
      <div class="cardBody">
        <h3>${record.grid_size} · Puzzle ${record.puzzle_number}</h3>
        <div class="meta">
          <span class="pill">${record.difficulty}</span>
          <span class="pill">${record.total_moves_in_solution} moves</span><br>
          ${record.num_blockers ?? "-"} blockers · target [${(record.exit_position || []).join(", ")}]
        </div>
      </div>
    `;
    els.sampleGrid.appendChild(card);
  }
  if (!records.includes(state.selected)) {
    setSelected(records[0]);
  }
}

function renderPerformanceTables() {
  els.performanceTables.innerHTML = "";
  for (const size of ["3x3", "4x4", "5x5"]) {
    const rows = state.performance[size] || [];
    const block = document.createElement("section");
    block.className = "tableBlock";
    block.innerHTML = `
      <h3>${size} Dataset Benchmark Results</h3>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Target rate</th>
            <th>Optimal rate</th>
            <th>Suboptimal</th>
            <th>Illegal</th>
            <th>Optimal #</th>
            <th>Suboptimal #</th>
            <th>Illegal #</th>
            <th>Parse fails</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td><strong>${row.model}</strong></td>
                  <td>${formatPercent(row.target_rate)}</td>
                  <td>${formatPercent(row.optimal_rate)}</td>
                  <td>${formatPercent(row.suboptimal_rate)}</td>
                  <td>${formatPercent(row.illegal_rate)}</td>
                  <td>${row.legal_optimal}</td>
                  <td>${row.legal_suboptimal}</td>
                  <td>${row.illegal_moves}</td>
                  <td>${row.parsing_failures}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `;
    els.performanceTables.appendChild(block);
  }
}

function renderPlots() {
  els.plotGrid.innerHTML = "";
  for (const size of ["3x3", "4x4", "5x5"]) {
    for (const plot of state.plots[size] || []) {
      const card = document.createElement("figure");
      card.className = "plotCard";
      card.innerHTML = `
        <img src="${plot.src}" alt="${plot.label}" loading="lazy">
        <p>${plot.label}</p>
      `;
      els.plotGrid.appendChild(card);
    }
  }
}

async function loadManifest() {
  const response = await fetch(manifestPath);
  if (!response.ok) throw new Error(`Could not load ${manifestPath}`);
  const manifest = await response.json();
  state.records = manifest.records || [];
  state.performance = manifest.performance || {};
  state.plots = manifest.plots || {};
  els.lastUpdated.textContent = manifest.last_updated || "August 2025";
  state.records.sort((a, b) => {
    const gridOrder = { "3x3": 0, "4x4": 1, "5x5": 2 };
    return (gridOrder[a.grid_size] ?? 9) - (gridOrder[b.grid_size] ?? 9) || a.puzzle_number - b.puzzle_number;
  });
  renderPerformanceTables();
  renderPlots();
  setSelected(state.records[0]);
}

[els.gridFilter, els.difficultyFilter, els.movesFilter].forEach((el) => {
  el.addEventListener("change", renderCards);
});

els.solutionButton.addEventListener("click", () => {
  state.solutionVisible = !state.solutionVisible;
  renderViewer();
});

loadManifest().catch((error) => {
  els.puzzleTitle.textContent = "Manifest unavailable";
  els.promptText.textContent = error.message;
});
