const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const COLORS = { "512": "#2855a6", "1024": "#b65318" };
let data;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));
}

function number(value, digits = 3, signed = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  const n = Number(value);
  return `${signed && n > 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function percent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return `${(100 * Number(value)).toFixed(digits)}%`;
}

function smooth(rows, field, radius = 3) {
  return rows.map((row, index) => {
    const values = rows.slice(Math.max(0, index - radius), index + radius + 1)
      .map((item) => Number(item[field]))
      .filter(Number.isFinite);
    return {
      x: Number(row.step),
      y: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    };
  });
}

function svgLinePlot(title, series, { percentage = false, zero = true, note = "", selected = false } = {}) {
  const width = 520;
  const height = 290;
  const margin = { left: 60, right: 15, top: 22, bottom: 42 };
  const points = series.flatMap((item) => item.points).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  if (zero) {
    minY = Math.min(0, minY);
    maxY = Math.max(0, maxY);
  }
  const pad = Math.max((maxY - minY) * .09, percentage ? .005 : .001);
  minY -= pad;
  maxY += pad;
  const x = (value) => margin.left + (width - margin.left - margin.right) * (value - minX) / Math.max(1, maxX - minX);
  const y = (value) => margin.top + (height - margin.top - margin.bottom) * (maxY - value) / Math.max(1e-9, maxY - minY);
  const formatY = (value) => percentage ? `${(100 * value).toFixed(0)}%` : number(value, Math.abs(value) < .1 ? 3 : 2, true);

  const yTicks = Array.from({ length: 5 }, (_, index) => minY + index * (maxY - minY) / 4);
  const xTicks = maxX >= 900
    ? [...new Set([minX, 250, 500, 750, maxX])].filter((value) => value >= minX && value <= maxX)
    : Array.from({ length: 5 }, (_, index) => minX + index * (maxX - minX) / 4);
  const grid = yTicks.map((value) => `<line class="grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text x="${margin.left - 7}" y="${y(value) + 3}" text-anchor="end">${formatY(value)}</text>`).join("");
  const xLabels = xTicks.map((value) => `<text x="${x(value)}" y="${height - 12}" text-anchor="middle">${Math.round(value)}</text>`).join("");
  const zeroLine = zero && minY < 0 && maxY > 0 ? `<line class="zero" x1="${margin.left}" x2="${width - margin.right}" y1="${y(0)}" y2="${y(0)}"/>` : "";

  const paths = series.map((item) => {
    const d = item.points.map((point, index) => `${index ? "L" : "M"}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(" ");
    const selectedStep = selected ? data.runs[item.key]?.final?.selected_step : null;
    const selection = selectedStep !== null && selectedStep !== undefined && selectedStep >= minX && selectedStep <= maxX
      ? `<line x1="${x(selectedStep)}" x2="${x(selectedStep)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="${item.color}" stroke-width=".8" stroke-dasharray="3 3" opacity=".6"/>`
      : "";
    return `${selection}<path class="series" d="${d}" stroke="${item.color}"/>`;
  }).join("");
  const legend = series.map((item, index) => `<line x1="${margin.left + index * 125}" x2="${margin.left + 17 + index * 125}" y1="9" y2="9" stroke="${item.color}" stroke-width="2"/><text class="legend-label" x="${margin.left + 23 + index * 125}" y="12">${item.label}</text>`).join("");

  return `<div class="plot"><h4>${escapeHtml(title)}</h4><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">${grid}${zeroLine}<line class="axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}"/><line class="axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>${paths}${xLabels}${legend}<text class="axis-label" x="${(margin.left + width - margin.right) / 2}" y="${height - 1}" text-anchor="middle">Step</text></svg>${note ? `<p class="plot-note">${escapeHtml(note)}</p>` : ""}</div>`;
}

function renderTrainingPlots() {
  const plot = (field, title, percentage = false) => svgLinePlot(
    title,
    ["512", "1024"].map((key) => ({
      key,
      label: data.runs[key].short_label,
      color: COLORS[key],
      points: smooth(data.runs[key].training.train, field),
    })),
    { percentage },
  );
  $("#reward-training-plot").innerHTML = plot(
    "reward", "Strict uncovered-token reward during training",
  );
  $("#surface-coverage-plot").innerHTML = plot(
    "surface_coverage", "Recognizable target coverage in sampled redundancy", true,
  );
}

function renderHeldoutPlots() {
  const plot = (field, title) => svgLinePlot(
    title,
    ["512", "1024"].map((key) => ({
      key,
      label: data.runs[key].short_label,
      color: COLORS[key],
      points: smooth(data.runs[key].training.heldout, field, 1),
    })),
  );
  $("#heldout-uncovered-plot").innerHTML = plot(
    "uncovered", "Held-out benefit on tokens absent from redundancy",
  );
  $("#frozen-heldout-plot").innerHTML = plot(
    "frozen_uncovered", "Uncovered-token benefit under the untouched decoder",
  );
}

function conditionMap(run) {
  return Object.fromEntries((run.final.conditions || []).map((row) => [row.condition, row]));
}

function svgGroupedBars(title, categories, groups, { percentage = false } = {}) {
  const width = 520;
  const height = 280;
  const margin = { left: 105, right: 15, top: 18, bottom: 36 };
  const values = groups.flatMap((group) => group.values).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(.001, ...values);
  const x0 = margin.left + (width - margin.left - margin.right) * (0 - min) / Math.max(1e-9, max - min);
  const x = (value) => margin.left + (width - margin.left - margin.right) * (value - min) / Math.max(1e-9, max - min);
  const rowH = (height - margin.top - margin.bottom) / categories.length;
  const barH = Math.min(9, rowH / (groups.length + .6));
  const rows = categories.map((category, categoryIndex) => {
    const center = margin.top + categoryIndex * rowH + rowH / 2;
    const label = `<text x="${margin.left - 8}" y="${center + 3}" text-anchor="end">${escapeHtml(category)}</text>`;
    const bars = groups.map((group, groupIndex) => {
      const value = group.values[categoryIndex];
      const top = center - (groups.length * barH + (groups.length - 1) * 3) / 2 + groupIndex * (barH + 3);
      const left = Math.min(x0, x(value));
      const w = Math.max(1, Math.abs(x(value) - x0));
      return `<rect x="${left}" y="${top}" width="${w}" height="${barH}" fill="${group.color}"/>`;
    }).join("");
    return label + bars;
  }).join("");
  const ticks = Array.from({ length: 5 }, (_, index) => min + index * (max - min) / 4);
  const grid = ticks.map((value) => `<line class="grid" x1="${x(value)}" x2="${x(value)}" y1="${margin.top}" y2="${height - margin.bottom}"/><text x="${x(value)}" y="${height - 15}" text-anchor="middle">${percentage ? `${(100 * value).toFixed(0)}%` : number(value, 2, true)}</text>`).join("");
  const legend = groups.map((group, index) => `<rect x="${margin.left + index * 95}" y="2" width="11" height="7" fill="${group.color}"/><text class="legend-label" x="${margin.left + 15 + index * 95}" y="9">${group.label}</text>`).join("");
  return `<div class="plot"><h4>${escapeHtml(title)}</h4><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">${grid}<line class="zero" x1="${x0}" x2="${x0}" y1="${margin.top}" y2="${height - margin.bottom}"/>${rows}${legend}</svg></div>`;
}

function renderFinalPlots() {
  const names = ["Random redundancy", "Document tail", "Top-K surprisal", "Short summary", "Learned redundancy"];
  const maps = Object.fromEntries(["512", "1024"].map((key) => [key, conditionMap(data.runs[key])]));
  const conditions = svgGroupedBars("Overall ΔNLL by redundancy strategy", names.map((name) => name.replace(" redundancy", "")), ["512", "1024"].map((key) => ({
    label: data.runs[key].short_label,
    color: COLORS[key],
    values: names.map((name) => Number(maps[key][name]?.nll_reduction || 0)),
  })));
  const mechanism = svgGroupedBars("Learned-redundancy gain by target coverage", ["covered positions", "uncovered positions"], ["512", "1024"].map((key) => ({
    label: data.runs[key].short_label,
    color: COLORS[key],
    values: [Number(data.runs[key].final.surface_covered_delta), Number(data.runs[key].final.surface_uncovered_delta)],
  })));
  const quartiles = svgGroupedBars("Strict uncovered-token gain by deletion position", ["Q1", "Q2", "Q3", "Q4"], ["512", "1024"].map((key) => ({
    label: data.runs[key].short_label,
    color: COLORS[key],
    values: data.runs[key].final.quartiles.map(Number),
  })));
  $("#condition-final-plot").innerHTML = conditions;
  $("#mechanism-final-plot").innerHTML = mechanism;
  $("#quartile-final-plot").innerHTML = quartiles;
}

function renderFinalTables() {
  const keep = ["No redundancy", "Random redundancy", "Document tail", "Top-K surprisal", "Short summary", "Learned redundancy", "Frozen decoder / no redundancy", "Frozen decoder / learned redundancy"];
  $("#final-tables").innerHTML = ["512", "1024"].map((key) => {
    const run = data.runs[key];
    const rows = run.final.conditions.filter((row) => keep.includes(row.condition)).map((row) => `<tr><td>${escapeHtml(row.condition)}</td><td>${number(row.nll, 3)}</td><td class="${row.nll_reduction > 0 ? "positive" : row.nll_reduction < 0 ? "negative" : ""}">${number(row.nll_reduction, 4, true)}</td><td>${percent(row.teacher_forced_top1_accuracy)}</td><td>${percent(row.token_accuracy)}</td><td>${percent(row.exact_span, 2)}</td><td>${percent(row.document_reduction?.helped_fraction)}</td></tr>`).join("");
    return `<p class="table-title">${escapeHtml(run.label)} · ${run.final.examples} documents × ${run.final.corruptions} masks</p><div class="table-scroll" tabindex="0" aria-label="Scroll to view all result columns"><table><thead><tr><th>Condition</th><th>NLL ↓</th><th>ΔNLL ↑</th><th>TF top-1</th><th>Free token acc.</th><th>Exact span</th><th>Docs helped</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
}

function renderFactorialSummary() {
  const target = $("#factorial-summary");
  if (!target) return;
  const rows = ["512", "1024"].map((key) => {
    const run = data.runs[key];
    const matrix = data.runs[key].factorial.matrix;
    const baseSystem = Number(matrix.base_base.nll);
    const trainedSystem = Number(matrix.learned_learned.nll);
    const totalGain = baseSystem - trainedSystem;
    const baseWriter = Number(matrix.base_learned.benefit);
    const trainedWriter = Number(matrix.learned_learned.benefit);
    const writerGain = trainedWriter - baseWriter;
    return `<tr>
      <td>${escapeHtml(run.short_label)}</td>
      <td><strong>${number(baseSystem, 3)} → ${number(trainedSystem, 3)}</strong><br><span class="table-subvalue">${number(totalGain, 3)} lower NLL</span></td>
      <td class="positive"><strong>${number(run.final.surface_uncovered_delta, 4, true)}</strong><br><span class="table-subvalue">true uncopied tokens helped</span></td>
      <td class="${writerGain > 0 ? "positive" : writerGain < 0 ? "negative" : ""}"><strong>${number(writerGain, 4, true)}</strong></td>
    </tr>`;
  }).join("");
  target.innerHTML = `<div class="key-result"><strong>Three questions, three comparisons.</strong> End-to-end NLL asks whether the complete trained system improved. Strict uncovered ΔNLL asks whether redundancy helped beyond recognizable copying. The writer-only column holds the decoder fixed to isolate what RL added beyond prompting Qwen3.5-4B.</div>
    <div class="table-scroll" tabindex="0" aria-label="Scroll to view the complete control comparison"><table class="system-control-table">
      <thead><tr><th>Scale</th><th>Whole system: base/base → trained/trained</th><th>Redundancy benefit on uncovered tokens</th><th>Extra benefit from writer RL alone</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function renderAnecdotes() {
  $$(".anecdote-context").forEach((target) => {
    const run = data.runs[target.dataset.run];
    const row = run?.rollouts.find((item) => Number(item.step) === Number(target.dataset.step));
    if (!row) {
      target.textContent = "Saved rollout unavailable.";
      return;
    }
    const candidate = row.candidates.reduce((best, item) => (
      Number(item.reward) > Number(best.reward) ? item : best
    ));
    const deleted = row.masks.map((mask) => `<li><strong>Q${mask.quartile}</strong><span>${escapeHtml(mask.target)}</span></li>`).join("");
    const effects = candidate.mask_deltas.map((value, index) => `<span class="anecdote-effect ${value > 0 ? "positive" : value < 0 ? "negative" : ""}">Q${row.masks[index]?.quartile ?? "?"}: ${number(value, 3, true)}</span>`).join("");
    target.innerHTML = `<table class="anecdote-table">
      <tbody>
        <tr><th>Document</th><td><pre>${escapeHtml(row.document)}</pre></td></tr>
        <tr><th>Deleted spans</th><td><ol>${deleted}</ol></td></tr>
        <tr><th>Recovery note</th><td><pre>${escapeHtml(candidate.text)}</pre></td></tr>
        <tr><th>Mask reward</th><td><div class="anecdote-effects">${effects}</div></td></tr>
      </tbody>
    </table>`;
  });
}

function initArchitectureDiagram() {
  const notes = {
    document: "<strong>The source.</strong> The writer and corruption process operate on the same tokenizer IDs. The decoder never receives the intact document.",
    writer: "<strong>The policy being tested.</strong> This LoRA sees the intact document and samples ordinary vocabulary tokens. It never sees a mask, hole position, or deleted target.",
    redundancy: "<strong>The pre-committed message.</strong> It can look like prose, a list, fused words, multilingual text, or punctuation, but it cannot contain new embeddings or hidden states.",
    corruption: "<strong>Corruption happens second.</strong> Four masks are drawn only after sampling. The 1024/48 run balances one per quarter; the earlier 512/24 run uses four unconstrained positions. Each mask creates a separate single-hole decoder example.",
    with: "<strong>Assisted reading.</strong> Teacher forcing measures the probability assigned to every true deleted token when both the damaged document and redundancy are available.",
    without: "<strong>The paired control.</strong> The identical decoder state scores the identical target and damaged document with the redundancy field removed. This isolates the incremental context supplied by Z.",
    decoder: "<strong>One shared decoder.</strong> The two prompts are scored in separate forward passes through exactly the same decoder LoRA weights. This makes the comparison paired and fair.",
    comparison: "<strong>The learning signal.</strong> The NLL difference is calculated per target token. Candidate rewards are compared within the same document and mask before updating the writer.",
    "decoder-update": "<strong>The supervised update.</strong> The decoder receives cross-entropy gradients on the complete deleted target. It learns both assisted and bare infilling; the writer never receives this gradient.",
  };
  const stages = $$(".architecture-svg .stage");
  const note = $("#architecture-note");
  if (!stages.length || !note) return;
  const select = (stage) => {
    stages.forEach((node) => node.classList.toggle("active", node === stage));
    note.innerHTML = notes[stage.dataset.stage] || notes.document;
  };
  stages.forEach((stage) => {
    stage.addEventListener("click", () => select(stage));
    stage.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(stage);
      }
    });
  });
}

function initRewardExplorer() {
  const buttons = $$(".reward-buttons button");
  const tokenRow = $("#reward-token-row");
  const quarterRow = $("#reward-quarter-row");
  const explanation = $("#reward-explanation");
  if (!buttons.length || !tokenRow || !quarterRow || !explanation) return;

  const tokens = [
    { text: "The", copied: false },
    { text: "launch", copied: true },
    { text: "code", copied: false },
    { text: "is", copied: false },
    { text: "ZX-41", copied: true },
    { text: "at", copied: false },
    { text: "noon", copied: true },
    { text: ".", copied: false },
  ];
  const copyTokenHtml = (mode) => tokens.map((token) => {
    const state = mode === "all"
      ? (token.copied ? "covered" : "counted")
      : (token.copied ? "excluded" : "counted");
    const label = token.copied
      ? `${token.text}: recognizable copy`
      : `${token.text}: not present in redundancy`;
    return `<span class="reward-demo-token ${state}" title="${escapeHtml(label)}">${escapeHtml(token.text)}</span>`;
  }).join("");

  const stages = {
    all: {
      explanation: "<strong>Naive reward:</strong> every green or orange target position contributes. The large gain on <code>ZX-41</code> is valid backup value, but it can dominate the score and teach the writer little beyond selective copying.",
    },
    uncovered: {
      explanation: "<strong>Strict reward:</strong> crossed-out tokens remain in the decoder loss but do not count toward writer reward. The writer is graded only on tokens whose recognizable surface form is absent.",
    },
    quarters: {
      explanation: "<strong>1024/48 only — quarter-balanced comparison:</strong> the same strict calculation is made independently for Q1–Q4, candidates are ranked inside each quarter, and the four relative results are averaged. The earlier 512/24 run did not use this position-aware step.",
    },
  };

  const render = (stage) => {
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.rewardStage === stage));
    tokenRow.innerHTML = copyTokenHtml(stage === "all" ? "all" : "uncovered");
    quarterRow.hidden = stage !== "quarters";
    quarterRow.innerHTML = ["Q1", "Q2", "Q3", "Q4"].map((quarter) => `<span class="reward-quarter"><strong>${quarter}</strong>one paired rank</span>`).join("");
    explanation.innerHTML = stages[stage].explanation;
  };
  buttons.forEach((button) => button.addEventListener("click", () => render(button.dataset.rewardStage)));
  render("all");
}

function initPolicyViewer() {
  const run = $("#policy-run");
  const slider = $("#policy-step");
  const previous = $("#policy-step-prev");
  const next = $("#policy-step-next");
  const render = () => {
    const rows = data.runs[run.value].rollouts;
    const rowIndex = Number(slider.value || 0);
    const row = rows[rowIndex];
    if (!row) return;
    previous.disabled = rowIndex === 0;
    next.disabled = rowIndex === rows.length - 1;
    $("#policy-step-label").textContent = `step ${row.step}`;
    $("#policy-example-label").textContent = `${data.runs[run.value].short_label} · step ${row.step} · saved example ${rowIndex + 1} of ${rows.length}`;
    $("#policy-nll-summary").textContent = `${row.masks.length} masks · ${row.candidates.length} candidates · scored as separate single-hole examples`;

    const boundaries = new Set([0, row.document.length]);
    row.masks.forEach((mask) => {
      boundaries.add(Number(mask.char_start));
      boundaries.add(Number(mask.char_end));
    });
    const ordered = [...boundaries].sort((a, b) => a - b);
    $("#policy-highlighted-document").innerHTML = ordered.slice(0, -1).map((start, index) => {
      const end = ordered[index + 1];
      const text = escapeHtml(row.document.slice(start, end));
      const active = row.masks.filter((mask) => start >= Number(mask.char_start) && end <= Number(mask.char_end));
      if (!active.length) return text;
      const classes = active.length === 1
        ? `mask-color-${Number(active[0].mask_index) + 1}`
        : "multi-mask-highlight";
      const maskNames = active.map((mask) => `M${Number(mask.mask_index) + 1}`).join(" + ");
      return `<mark class="deletion-highlight ${classes}" data-mask-index="${Number(active[0].mask_index)}" title="${maskNames}: independently deleted during scoring">${text}</mark>`;
    }).join("");

    $("#policy-mask-legend").innerHTML = row.masks.map((mask) => `<span class="policy-mask-key">
      <span class="policy-mask-swatch mask-color-${Number(mask.mask_index) + 1}"></span>
      <button type="button" data-mask-index="${Number(mask.mask_index)}">M${Number(mask.mask_index) + 1} · document Q${mask.quartile} · tokens ${mask.token_start}–${Number(mask.token_end) - 1}</button>
    </span>`).join("");
    $("#policy-mask-grid").innerHTML = row.masks.map((mask) => `<article class="policy-mask-card mask-card-${Number(mask.mask_index) + 1}">
      <header><strong>M${Number(mask.mask_index) + 1} · Q${mask.quartile}</strong><span>${Number(mask.token_end) - Number(mask.token_start)} tokens</span></header>
      <pre>${escapeHtml(mask.target)}</pre>
    </article>`).join("");
    $$("#policy-mask-legend button").forEach((button) => {
      button.addEventListener("click", () => {
        const highlight = $(`.deletion-highlight[data-mask-index="${button.dataset.maskIndex}"]`, $("#policy-highlighted-document"));
        highlight?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    const comparisonValues = row.candidates.map((candidate) => (
      candidate.advantage !== null && candidate.advantage !== undefined
        ? Number(candidate.advantage)
        : Number(candidate.reward)
    ));
    const bestValue = Math.max(...comparisonValues);
    const winnerIndex = comparisonValues.filter((value) => value === bestValue).length === 1
      ? comparisonValues.indexOf(bestValue)
      : -1;
    $("#policy-candidates").innerHTML = row.candidates.map((candidate, index) => {
      const maskDeltas = candidate.mask_deltas.map((value, maskIndex) => (
        `<span class="mask-delta-chip"><span>M${maskIndex + 1} · Q${row.masks[maskIndex]?.quartile ?? "?"}</span><strong class="${value > 0 ? "positive" : value < 0 ? "negative" : ""}">${number(value, 3, true)}</strong></span>`
      )).join("");
      return `<article class="policy-candidate-card ${index === winnerIndex ? "winner" : ""}">
        <header>
          <span class="policy-candidate-name">Candidate ${index + 1}</span>
          ${index === winnerIndex ? '<span class="policy-winner-label">preferred for this document</span>' : '<span class="policy-winner-label neutral">comparison sample</span>'}
        </header>
        <div class="policy-candidate-text">${escapeHtml(candidate.text)}</div>
        <dl class="policy-candidate-metrics">
          <div><dt>Strict reward</dt><dd class="${candidate.reward > 0 ? "positive" : candidate.reward < 0 ? "negative" : ""}">${number(candidate.reward, 4, true)}</dd></div>
          <div><dt>RL advantage</dt><dd class="${candidate.advantage > 0 ? "positive" : candidate.advantage < 0 ? "negative" : ""}">${number(candidate.advantage, 3, true)}</dd></div>
          <div><dt>Target coverage</dt><dd>${percent(candidate.coverage)}</dd></div>
          <div><dt>Mask spread</dt><dd>${number(candidate.mask_std, 4)}</dd></div>
        </dl>
        <div class="policy-mask-deltas"><strong>Reward by deletion</strong><div>${maskDeltas}</div></div>
      </article>`;
    }).join("");
    $$(".policy-highlighted-document, .policy-mask-card pre").forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  };
  const selectRun = () => {
    const rows = data.runs[run.value].rollouts;
    slider.max = Math.max(0, rows.length - 1);
    slider.value = 0;
    render();
  };
  const move = (offset) => {
    slider.value = Math.max(0, Math.min(Number(slider.max), Number(slider.value) + offset));
    render();
  };
  run.addEventListener("change", selectRun);
  slider.addEventListener("input", render);
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  selectRun();
}

async function main() {
  const response = await fetch("data/results.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load results (${response.status})`);
  data = await response.json();
  renderTrainingPlots();
  renderHeldoutPlots();
  renderFinalTables();
  renderFinalPlots();
  renderFactorialSummary();
  renderAnecdotes();
  initArchitectureDiagram();
  initRewardExplorer();
  initPolicyViewer();
}

main().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML("afterbegin", `<p style="padding:12px;background:#fee">Could not load result data: ${escapeHtml(error.message)}</p>`);
});

addEventListener("load", async () => {
  if (!location.hash) return;
  if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
  document.querySelector(location.hash)?.scrollIntoView();
});
