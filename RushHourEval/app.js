const state = {
  records: [],
  performance: {},
  plots: {},
  answers: { entries: {}, counts: {} },
  selected: null,
  selectedModel: "GPT-5",
  replay: null,
  frame: 0,
  timer: null,
  tableMode: "combined",
  datasetPage: 0,
};

const replayModels = ["GPT-5", "Gemini-2.5-Pro", "DeepSeek-V3"];
const pageSize = 18;
const $ = (id) => document.getElementById(id);
const els = {
  totalCount: $("totalCount"), answerCount: $("answerCount"), lastUpdated: $("lastUpdated"),
  replayGrid: $("replayGrid"), puzzleSelect: $("puzzleSelect"), modelPicker: $("modelPicker"),
  puzzleEyebrow: $("puzzleEyebrow"), puzzleTitle: $("puzzleTitle"), board: $("board"),
  resetButton: $("resetButton"), prevButton: $("prevButton"), playButton: $("playButton"),
  nextButton: $("nextButton"), speedSelect: $("speedSelect"), stepCounter: $("stepCounter"),
  moveTimeline: $("moveTimeline"), outcomeBadge: $("outcomeBadge"), answerSource: $("answerSource"),
  attemptTitle: $("attemptTitle"), outcomeSummary: $("outcomeSummary"), attemptMetrics: $("attemptMetrics"),
  validationNote: $("validationNote"), currentMove: $("currentMove"), answerText: $("answerText"),
  promptText: $("promptText"), solutionText: $("solutionText"), referenceMoves: $("referenceMoves"),
  performanceTables: $("performanceTables"), gridFilter: $("gridFilter"),
  difficultyFilter: $("difficultyFilter"), movesFilter: $("movesFilter"), puzzleSearch: $("puzzleSearch"),
  sampleSummary: $("sampleSummary"), sampleGrid: $("sampleGrid"), prevPage: $("prevPage"),
  nextPage: $("nextPage"), pageLabel: $("pageLabel"), plotGrid: $("plotGrid"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function labelDifficulty(value) {
  const text = String(value || "unknown");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function key(position) {
  return `${position[0]},${position[1]}`;
}

function targetFor(record) {
  if (record.exit_position) return [record.exit_position];
  const match = record.prompt.match(/TARGET zone at positions \[(\d+),(\d+)\] and \[(\d+),(\d+)\]/i);
  return match ? [[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])]] : [];
}

function parseMove(move) {
  const piece = move.match(/Step\s+\d+\s*:\s*([A-Za-z0-9_-]+)/i)?.[1]?.toUpperCase();
  const parts = move.split(/\s*->\s*/);
  if (!piece || parts.length !== 2) return null;
  const extract = (text) => [...text.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  const start = extract(parts[0]);
  const end = extract(parts[1]);
  return start.length && start.length === end.length ? { piece, start, end } : null;
}

function initialPositions(record) {
  return Object.fromEntries(Object.entries(record.pieces).map(([name, piece]) => [
    name.toUpperCase(),
    (piece.positions || [piece.position]).map((position) => [...position]),
  ]));
}

function clonePositions(positions) {
  return Object.fromEntries(Object.entries(positions).map(([name, cells]) => [name, cells.map((cell) => [...cell])]));
}

function attemptsFor(record = state.selected) {
  return record ? (state.answers.entries[record.id] || []) : [];
}

function currentAttempt() {
  return attemptsFor().find((attempt) => attempt.model === state.selectedModel) || null;
}

function buildReplay(record, attempt) {
  const positions = initialPositions(record);
  const frames = [{ positions: clonePositions(positions), move: null, invalidPiece: null }];
  if (!attempt) return { frames, attempt: null };

  attempt.moves.forEach((move, index) => {
    const parsed = parseMove(move);
    if (index < attempt.valid_steps && parsed) {
      positions[parsed.piece] = parsed.end.map((cell) => [...cell]);
      frames.push({ positions: clonePositions(positions), move, invalidPiece: null });
    } else if (index === attempt.valid_steps && attempt.outcome === "illegal") {
      frames.push({ positions: clonePositions(positions), move, invalidPiece: parsed?.piece || null });
    }
  });
  return { frames, attempt };
}

function stopPlayback() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  els.playButton.textContent = "Play";
}

function setFrame(nextFrame) {
  if (!state.replay) return;
  state.frame = Math.max(0, Math.min(nextFrame, state.replay.frames.length - 1));
  renderFrame();
}

function renderBoard() {
  const record = state.selected;
  const replayFrame = state.replay?.frames[state.frame];
  if (!record || !replayFrame) return;
  const size = Number(record.grid_size[0]);
  const targetKeys = new Set(targetFor(record).map(key));

  if (els.board.dataset.puzzleId !== record.id) {
    els.board.dataset.puzzleId = record.id;
    els.board.style.setProperty("--size", size);
    els.board.replaceChildren();
    for (let row = 1; row <= size; row += 1) {
      for (let col = 1; col <= size; col += 1) {
        const cell = document.createElement("div");
        cell.className = `boardCell${targetKeys.has(`${row},${col}`) ? " target" : ""}`;
        cell.setAttribute("aria-hidden", "true");
        els.board.appendChild(cell);
      }
    }
    Object.keys(replayFrame.positions).forEach((piece, index) => {
      const element = document.createElement("div");
      element.dataset.piece = piece;
      element.textContent = piece;
      element.className = `piece ${piece === "C" ? "car" : `blocker-${index % 5}`}`;
      els.board.appendChild(element);
    });
  }

  Object.entries(replayFrame.positions).forEach(([piece, positions], index) => {
    const element = els.board.querySelector(`[data-piece="${piece}"]`);
    if (!element) return;
    const rows = positions.map((position) => position[0]);
    const cols = positions.map((position) => position[1]);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    element.style.left = `${((minCol - 1) / size) * 100}%`;
    element.style.top = `${((minRow - 1) / size) * 100}%`;
    element.style.width = `${((maxCol - minCol + 1) / size) * 100}%`;
    element.style.height = `${((maxRow - minRow + 1) / size) * 100}%`;
    element.className = `piece ${piece === "C" ? "car" : `blocker-${index % 5}`}${replayFrame.invalidPiece === piece ? " invalid" : ""}`;
  });
  const target = targetFor(record).map((position) => `[${position.join(",")}]`).join(" + ");
  els.board.setAttribute("aria-label", `${record.grid_size} Puzzle ${record.puzzle_number}. Target ${target}. Replay step ${state.frame}.`);
}

function renderFrame() {
  const attempt = currentAttempt();
  const replayFrame = state.replay?.frames[state.frame];
  renderBoard();
  const total = Math.max(0, (state.replay?.frames.length || 1) - 1);
  els.stepCounter.textContent = state.frame === 0 ? `Start · ${total} replay step${total === 1 ? "" : "s"}` : `Step ${state.frame} / ${total}`;
  els.currentMove.textContent = replayFrame?.move || "Initial state";
  els.prevButton.disabled = state.frame === 0;
  els.resetButton.disabled = state.frame === 0;
  els.nextButton.disabled = state.frame >= total;
  [...els.moveTimeline.querySelectorAll("button")].forEach((button, index) => {
    button.classList.toggle("active", index + 1 === state.frame);
  });
  if (attempt && state.frame === state.replay.frames.length - 1 && state.timer) stopPlayback();
}

function renderTimeline(attempt) {
  els.moveTimeline.replaceChildren();
  if (!attempt?.moves.length) {
    els.moveTimeline.innerHTML = '<span class="aggregateOnly">No parseable moves to replay</span>';
    return;
  }
  attempt.moves.forEach((move, index) => {
    const parsed = parseMove(move);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = parsed ? `${index + 1} · ${parsed.piece}` : `${index + 1} · ?`;
    button.title = move;
    if (index >= attempt.valid_steps && attempt.outcome === "illegal") button.classList.add("failed");
    button.addEventListener("click", () => setFrame(Math.min(index + 1, state.replay.frames.length - 1)));
    els.moveTimeline.appendChild(button);
  });
}

function outcomeCopy(attempt, optimalMoves) {
  if (!attempt) return "No per-puzzle response is stored for this model and puzzle.";
  if (attempt.outcome === "optimal") return `Solved legally in ${attempt.move_count} moves, exactly matching the reference optimum.`;
  if (attempt.outcome === "suboptimal") return `Reached the target legally, but used ${attempt.move_count - optimalMoves} extra move${attempt.move_count - optimalMoves === 1 ? "" : "s"}.`;
  if (attempt.outcome === "unsolved") return "Every proposed move is legal, but the final car position misses the target.";
  if (attempt.outcome === "parse-failure") return "The response could not be parsed into a move sequence, so no solution can be validated.";
  return `The validator accepts ${attempt.valid_steps} move${attempt.valid_steps === 1 ? "" : "s"}, then rejects the attempt.`;
}

function renderAttempt() {
  stopPlayback();
  const record = state.selected;
  const attempt = currentAttempt();
  state.replay = buildReplay(record, attempt);
  state.frame = 0;
  els.puzzleEyebrow.textContent = `${record.grid_size} · ${labelDifficulty(record.difficulty)} · target ${targetFor(record).map((position) => `[${position.join(",")}]`).join(" + ")}`;
  els.puzzleTitle.textContent = `Puzzle ${record.puzzle_number}`;
  els.promptText.textContent = record.prompt;
  els.solutionText.textContent = record.solution;
  els.referenceMoves.textContent = `${record.total_moves_in_solution} optimal moves`;
  els.attemptTitle.textContent = `${state.selectedModel} attempt`;
  els.outcomeBadge.className = `outcomeBadge ${attempt?.outcome || "unavailable"}`;
  els.outcomeBadge.textContent = (attempt?.outcome || "unavailable").replace("parse-failure", "parse failure");
  els.outcomeSummary.textContent = outcomeCopy(attempt, record.total_moves_in_solution);
  els.answerText.textContent = attempt?.answer || "No stored per-puzzle response is available.";
  els.answerSource.href = attempt?.source_url || "https://github.com/MustafaAH10/rushhoureval";
  els.answerSource.textContent = attempt ? "source JSON ↗" : "repository ↗";
  els.attemptMetrics.innerHTML = `
    <div><span>Proposed</span><strong>${attempt?.move_count ?? "—"}</strong></div>
    <div><span>Valid prefix</span><strong>${attempt?.valid_steps ?? "—"}</strong></div>
    <div><span>Optimal</span><strong>${record.total_moves_in_solution}</strong></div>
  `;
  const isBad = ["illegal", "parse-failure"].includes(attempt?.outcome);
  const isWarn = ["suboptimal", "unsolved"].includes(attempt?.outcome);
  els.validationNote.className = `validationNote${isBad ? " bad" : isWarn ? " warn" : ""}`;
  els.validationNote.textContent = attempt?.error || (attempt ? "All moves are legal, the target is reached, and the move count is optimal." : "This repository contains aggregate scores for the model, but not this raw response.");
  renderTimeline(attempt);
  renderBoard();
  renderFrame();
}

function renderModelPicker() {
  const available = new Set(attemptsFor().map((attempt) => attempt.model));
  if (!available.has(state.selectedModel)) state.selectedModel = replayModels.find((model) => available.has(model)) || replayModels[0];
  els.modelPicker.replaceChildren();
  const label = document.createElement("span");
  label.textContent = "Answer";
  els.modelPicker.appendChild(label);
  replayModels.forEach((model) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = model.replace("Gemini-2.5-Pro", "Gemini 2.5").replace("DeepSeek-V3", "DeepSeek V3");
    button.classList.toggle("active", model === state.selectedModel);
    button.disabled = !available.has(model);
    button.title = available.has(model) ? `Replay ${model}` : `${model} response is not present for this puzzle`;
    button.addEventListener("click", () => {
      state.selectedModel = model;
      renderModelPicker();
      renderAttempt();
    });
    els.modelPicker.appendChild(button);
  });
}

function renderReplaySelectors() {
  const record = state.selected;
  els.replayGrid.value = record.grid_size;
  const records = state.records.filter((item) => item.grid_size === record.grid_size);
  els.puzzleSelect.innerHTML = records.map((item) => `<option value="${item.id}">Puzzle ${item.puzzle_number} · ${escapeHtml(labelDifficulty(item.difficulty))} · ${item.total_moves_in_solution} move${item.total_moves_in_solution === 1 ? "" : "s"}</option>`).join("");
  els.puzzleSelect.value = record.id;
}

function setSelected(record, scroll = false) {
  if (!record) return;
  stopPlayback();
  state.selected = record;
  els.board.dataset.puzzleId = "";
  renderReplaySelectors();
  renderModelPicker();
  renderAttempt();
  renderDataset();
  if (scroll) document.getElementById("replay").scrollIntoView({ behavior: "smooth", block: "start" });
}

function distribution(row) {
  const total = Number(row.total_puzzles || 1);
  const optimal = (row.legal_optimal / total) * 100;
  const suboptimal = (row.legal_suboptimal / total) * 100;
  const unsolved = (row.legal_no_target / total) * 100;
  const illegal = (row.illegal_moves / total) * 100;
  return `<div class="distBar" aria-hidden="true"><i class="optimal" style="width:${optimal}%"></i><i class="suboptimal" style="width:${suboptimal}%"></i><i class="unsolved" style="width:${unsolved}%"></i><i class="illegal" style="width:${illegal}%"></i></div>`;
}

function scoreCell(row) {
  if (!row) return '<td class="scoreCell center">—</td>';
  return `<td class="scoreCell"><div class="scoreTop"><strong>${percent(row.target_rate)}</strong><span>${percent(row.optimal_rate)}</span></div>${distribution(row)}</td>`;
}

function overallFor(model) {
  const rows = ["3x3", "4x4", "5x5"].map((size) => state.performance[size]?.find((row) => row.model === model)).filter(Boolean);
  const total = rows.reduce((sum, row) => sum + row.total_puzzles, 0);
  const aggregate = {
    total_puzzles: total,
    legal_optimal: rows.reduce((sum, row) => sum + row.legal_optimal, 0),
    legal_suboptimal: rows.reduce((sum, row) => sum + row.legal_suboptimal, 0),
    legal_no_target: rows.reduce((sum, row) => sum + row.legal_no_target, 0),
    illegal_moves: rows.reduce((sum, row) => sum + row.illegal_moves, 0),
  };
  aggregate.target_rate = total ? ((aggregate.legal_optimal + aggregate.legal_suboptimal) / total) * 100 : 0;
  aggregate.optimal_rate = total ? (aggregate.legal_optimal / total) * 100 : 0;
  return aggregate;
}

function renderCombinedTable() {
  const models = [...new Set(Object.values(state.performance).flat().map((row) => row.model))]
    .sort((a, b) => overallFor(b).target_rate - overallFor(a).target_rate);
  els.performanceTables.innerHTML = `
    <table class="combinedTable">
      <thead><tr><th>Model</th><th>Overall<br><small>target / optimal</small></th><th>3x3<br><small>target / optimal</small></th><th>4x4<br><small>target / optimal</small></th><th>5x5<br><small>target / optimal</small></th><th>Answers</th></tr></thead>
      <tbody>${models.map((model, index) => {
        const overall = overallFor(model);
        const cells = ["3x3", "4x4", "5x5"].map((size) => scoreCell(state.performance[size]?.find((row) => row.model === model))).join("");
        const replayable = replayModels.includes(model);
        return `<tr><td class="modelCell"><span class="rank">${index + 1}</span>${escapeHtml(model)}</td>${scoreCell(overall)}${cells}<td>${replayable ? `<button class="replayLink" data-replay-model="${escapeHtml(model)}">Open replay</button>` : '<span class="aggregateOnly">Aggregate only</span>'}<span class="coverage">${overall.total_puzzles} evaluated</span></td></tr>`;
      }).join("")}</tbody>
    </table>`;
}

function compactMetric(rate, count) {
  return `<td class="compactMetric"><strong>${percent(rate)}</strong><small>${count} / 150</small></td>`;
}

function renderIndividualTables() {
  els.performanceTables.innerHTML = `<div class="individualTables">${["3x3", "4x4", "5x5"].map((size) => `
    <section class="tableBlock"><h3>${size} benchmark</h3><table><thead><tr><th>Model</th><th>Target</th><th>Optimal</th><th>Sub-optimal</th><th>Illegal*</th><th>Parse fails</th></tr></thead><tbody>
    ${(state.performance[size] || []).map((row, index) => `<tr><td class="modelCell"><span class="rank">${index + 1}</span>${escapeHtml(row.model)}</td>${compactMetric(row.target_rate, row.legal_optimal + row.legal_suboptimal)}${compactMetric(row.optimal_rate, row.legal_optimal)}${compactMetric(row.suboptimal_rate, row.legal_suboptimal)}${compactMetric(row.illegal_rate, row.illegal_moves)}<td class="compactMetric"><strong>${row.parsing_failures}</strong><small>included in illegal</small></td></tr>`).join("")}
    </tbody></table></section>`).join("")}</div>`;
}

function renderPerformanceTables() {
  if (state.tableMode === "combined") renderCombinedTable();
  else renderIndividualTables();
  els.performanceTables.querySelectorAll("[data-replay-model]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModel = button.dataset.replayModel;
      const availableRecord = state.records.find((record) => attemptsFor(record).some((attempt) => attempt.model === state.selectedModel));
      setSelected(availableRecord || state.selected, true);
    });
  });
}

function inMoveBand(record) {
  const moves = Number(record.total_moves_in_solution || 0);
  if (els.movesFilter.value === "short") return moves <= 5;
  if (els.movesFilter.value === "medium") return moves >= 6 && moves <= 10;
  if (els.movesFilter.value === "long") return moves >= 11;
  return true;
}

function filteredRecords() {
  const query = els.puzzleSearch.value.toLowerCase().trim().replaceAll("×", "x");
  return state.records.filter((record) => {
    if (els.gridFilter.value !== "all" && record.grid_size !== els.gridFilter.value) return false;
    if (els.difficultyFilter.value !== "all" && record.difficulty !== els.difficultyFilter.value) return false;
    if (!inMoveBand(record)) return false;
    if (query && !`${record.id} ${record.grid_size} puzzle ${record.puzzle_number} ${record.difficulty}`.includes(query)) return false;
    return true;
  });
}

function renderDataset() {
  const records = filteredRecords();
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  state.datasetPage = Math.min(state.datasetPage, pages - 1);
  const visible = records.slice(state.datasetPage * pageSize, (state.datasetPage + 1) * pageSize);
  els.sampleSummary.textContent = `${records.length} matching puzzle${records.length === 1 ? "" : "s"} · ${attemptsFor().length} answers on the selected puzzle`;
  els.sampleGrid.replaceChildren();
  if (!visible.length) {
    els.sampleGrid.innerHTML = '<div class="emptyState">No puzzles match these filters.</div>';
  } else {
    visible.forEach((record) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `puzzleCard${state.selected?.id === record.id ? " active" : ""}`;
      card.innerHTML = `<img src="${escapeHtml(record.initial_image)}" alt="${escapeHtml(record.id)} initial state" loading="lazy"><div><strong>${record.grid_size} · Puzzle ${record.puzzle_number}</strong><span>${escapeHtml(record.difficulty)} · ${record.total_moves_in_solution} optimal moves</span></div>`;
      card.addEventListener("click", () => setSelected(record, true));
      els.sampleGrid.appendChild(card);
    });
  }
  els.pageLabel.textContent = `Page ${state.datasetPage + 1} / ${pages}`;
  els.prevPage.disabled = state.datasetPage === 0;
  els.nextPage.disabled = state.datasetPage >= pages - 1;
}

function openLightbox(src, label) {
  let overlay = $("plotLightbox");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "plotLightbox";
    overlay.className = "lightbox";
    overlay.innerHTML = '<div class="lightboxInner"><img id="lightboxImg" alt=""><p id="lightboxLabel"></p><button id="lightboxClose" type="button">Close ×</button></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.classList.remove("open"); });
    $("lightboxClose").addEventListener("click", () => overlay.classList.remove("open"));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") overlay.classList.remove("open"); });
  }
  $("lightboxImg").src = src;
  $("lightboxImg").alt = label;
  $("lightboxLabel").textContent = label;
  overlay.classList.add("open");
}

function renderPlots() {
  els.plotGrid.replaceChildren();
  ["3x3", "4x4", "5x5"].forEach((size) => (state.plots[size] || []).forEach((plot) => {
    const card = document.createElement("figure");
    card.className = "plotCard";
    card.innerHTML = `<img src="${escapeHtml(plot.src)}" alt="${escapeHtml(plot.label)}" loading="lazy"><figcaption>${escapeHtml(plot.label)}</figcaption>`;
    card.addEventListener("click", () => openLightbox(plot.src, plot.label));
    els.plotGrid.appendChild(card);
  }));
}

function play() {
  if (!state.replay || state.replay.frames.length <= 1) return;
  if (state.timer) { stopPlayback(); return; }
  if (state.frame >= state.replay.frames.length - 1) setFrame(0);
  els.playButton.textContent = "Pause";
  state.timer = window.setInterval(() => {
    if (state.frame >= state.replay.frames.length - 1) stopPlayback();
    else setFrame(state.frame + 1);
  }, Number(els.speedSelect.value));
}

async function loadData() {
  const [manifestResponse, answerResponse] = await Promise.all([fetch("manifest.json"), fetch("answer_index.json")]);
  if (!manifestResponse.ok || !answerResponse.ok) throw new Error("Could not load the benchmark data.");
  const [manifest, answers] = await Promise.all([manifestResponse.json(), answerResponse.json()]);
  state.records = manifest.records || [];
  state.performance = manifest.performance || {};
  state.plots = manifest.plots || {};
  state.answers = answers;
  state.records.sort((a, b) => ["3x3", "4x4", "5x5"].indexOf(a.grid_size) - ["3x3", "4x4", "5x5"].indexOf(b.grid_size) || a.puzzle_number - b.puzzle_number);
  els.totalCount.textContent = state.records.length.toLocaleString();
  els.answerCount.textContent = answers.generated_from_responses.toLocaleString();
  els.lastUpdated.textContent = manifest.last_updated || "August 2025";
  renderPerformanceTables();
  renderPlots();
  setSelected(state.records[0]);
}

els.replayGrid.addEventListener("change", () => setSelected(state.records.find((record) => record.grid_size === els.replayGrid.value)));
els.puzzleSelect.addEventListener("change", () => setSelected(state.records.find((record) => record.id === els.puzzleSelect.value)));
els.resetButton.addEventListener("click", () => { stopPlayback(); setFrame(0); });
els.prevButton.addEventListener("click", () => { stopPlayback(); setFrame(state.frame - 1); });
els.nextButton.addEventListener("click", () => { stopPlayback(); setFrame(state.frame + 1); });
els.playButton.addEventListener("click", play);
els.speedSelect.addEventListener("change", () => { if (state.timer) { stopPlayback(); play(); } });

document.querySelectorAll("[data-table-mode]").forEach((button) => button.addEventListener("click", () => {
  state.tableMode = button.dataset.tableMode;
  document.querySelectorAll("[data-table-mode]").forEach((item) => item.classList.toggle("active", item === button));
  renderPerformanceTables();
}));

[els.gridFilter, els.difficultyFilter, els.movesFilter].forEach((element) => element.addEventListener("change", () => { state.datasetPage = 0; renderDataset(); }));
els.puzzleSearch.addEventListener("input", () => { state.datasetPage = 0; renderDataset(); });
els.prevPage.addEventListener("click", () => { state.datasetPage -= 1; renderDataset(); document.getElementById("dataset").scrollIntoView({ behavior: "smooth" }); });
els.nextPage.addEventListener("click", () => { state.datasetPage += 1; renderDataset(); document.getElementById("dataset").scrollIntoView({ behavior: "smooth" }); });

loadData().catch((error) => {
  els.outcomeSummary.textContent = error.message;
  els.validationNote.className = "validationNote bad";
  els.validationNote.textContent = "The benchmark files could not be loaded. Please refresh or open the GitHub repository.";
});
