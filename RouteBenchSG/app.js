const manifestPath = "data/experiments/color_route_choice_benchmark_300_interactive/manifest.json";
const svgNS = "http://www.w3.org/2000/svg";

const state = {
  records: [],
  selected: null,
  revealed: false,
  activeRoute: null,
  selectedOrigin: null,
};

const els = {
  difficulty: document.getElementById("difficultyFilter"),
  distance: document.getElementById("distanceFilter"),
  visibleCount: document.getElementById("visibleCount"),
  stats: document.getElementById("stats"),
  originMap: document.getElementById("originMap"),
  originMeta: document.getElementById("originMeta"),
  clearOrigin: document.getElementById("clearOriginButton"),
  grid: document.getElementById("sampleGrid"),
  sampleSummary: document.getElementById("sampleSummary"),
  mainImage: document.getElementById("mainImage"),
  mapStatus: document.getElementById("mapStatus"),
  candidateCount: document.getElementById("candidateCount"),
  candidateList: document.getElementById("candidateList"),
  eyebrow: document.getElementById("eyebrow"),
  title: document.getElementById("routeTitle"),
  answer: document.getElementById("answerBar"),
  reveal: document.getElementById("revealButton"),
};

function cleanName(value) {
  return String(value || "").replace(/\s*MRT\s*$/i, "");
}

function routeTitle(record) {
  return `${cleanName(record.origin?.name)} to ${cleanName(record.destination?.name)}`;
}

function originKey(origin) {
  return `${origin?.name || ""}|${Number(origin?.lat || 0).toFixed(4)}|${Number(origin?.lon || 0).toFixed(4)}`;
}

function formatDistance(meters) {
  const value = Number(meters || 0);
  if (value >= 10000) return `${(value / 1000).toFixed(1)} km`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

function formatTime(seconds) {
  const value = Number(seconds || 0);
  if (value >= 3600) {
    const hours = Math.floor(value / 3600);
    const minutes = Math.round((value % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  return `${Math.round(value / 60)} min`;
}

function inDistanceBand(record) {
  const band = els.distance.value;
  const km = Number(record.direct_distance_km || 0);
  if (band === "short") return km < 8;
  if (band === "medium") return km >= 8 && km < 18;
  if (band === "long") return km >= 18;
  return true;
}

function filteredRecords() {
  const difficulty = els.difficulty.value;
  return state.records.filter((record) => {
    if (difficulty !== "all" && record.difficulty !== difficulty) return false;
    if (!inDistanceBand(record)) return false;
    if (state.selectedOrigin && originKey(record.origin) !== state.selectedOrigin) return false;
    return true;
  });
}

function renderStats(records) {
  const counts = records.reduce(
    (acc, record) => {
      acc[record.difficulty] = (acc[record.difficulty] || 0) + 1;
      return acc;
    },
    { easy: 0, medium: 0, hard: 0 },
  );
  els.visibleCount.textContent = records.length;
  els.stats.innerHTML = `
    <strong>${records.length}</strong>
    visible samples<br>
    Easy: ${counts.easy || 0}<br>
    Medium: ${counts.medium || 0}<br>
    Hard: ${counts.hard || 0}
  `;
  els.sampleSummary.textContent = `${records.length} samples match the current filters. Click a card to inspect its candidate routes.`;
}

function candidateRank(record, candidate) {
  const sorted = [...(record.candidates || [])].sort((a, b) => a.distance_m - b.distance_m);
  return sorted.findIndex((item) => item.route_index === candidate.route_index) + 1;
}

function setActiveRoute(routeIndex) {
  state.activeRoute = routeIndex;
  renderCandidateList();
}

function renderMap(record) {
  els.mainImage.src = record.map_image;
  els.mapStatus.textContent = "Rendered benchmark map";
}

function renderCandidateList() {
  const record = state.selected;
  els.candidateList.replaceChildren();
  els.candidateCount.textContent = record?.candidate_count || 0;
  if (!record) return;

  const candidates = [...(record.candidates || [])].sort((a, b) => a.route_index - b.route_index);
  for (const candidate of candidates) {
    const isAnswer = state.revealed && candidate.route_index === record.answer_route_index;
    const active = state.activeRoute === candidate.route_index;
    const item = document.createElement("article");
    item.className = `candidate${active ? " active" : ""}${isAnswer ? " answerVisible" : ""}`;
    item.style.setProperty("--route-color", candidate.color_hex);
    item.addEventListener("mouseenter", () => setActiveRoute(candidate.route_index));
    item.addEventListener("mouseleave", () => setActiveRoute(null));
    item.innerHTML = `
      <div class="candidateTop">
        <div class="candidateName">
          <span class="swatch"></span>
          <span>R${candidate.route_index} · ${candidate.color_id}</span>
        </div>
        <span class="rankPill">${isAnswer ? "shortest" : `rank ${candidateRank(record, candidate)}`}</span>
      </div>
      <div class="metrics">
        <div class="metric"><span>Distance</span><strong>${formatDistance(candidate.distance_m)}</strong></div>
        <div class="metric"><span>Time</span><strong>${formatTime(candidate.travel_time_s)}</strong></div>
        <div class="metric"><span>Nodes</span><strong>${candidate.osm_node_count}</strong></div>
      </div>
    `;
    els.candidateList.appendChild(item);
  }
}

function renderViewer() {
  const record = state.selected;
  if (!record) return;
  els.eyebrow.textContent = `${record.difficulty} · ${record.candidate_count} candidate routes · ${formatDistance(record.direct_distance_km * 1000)} direct`;
  els.title.textContent = routeTitle(record);
  els.answer.innerHTML = state.revealed
    ? `Answer: <strong>R${record.answer_route_index} · ${record.answer_color_id}</strong> · ${formatDistance(record.answer_distance_m)}`
    : "Answer hidden";
  renderMap(record);
  renderCandidateList();
}

function setSelected(record) {
  state.selected = record;
  state.revealed = false;
  state.activeRoute = null;
  renderViewer();
  renderGrid();
  renderOriginMap();
}

function originRecords() {
  const byOrigin = new Map();
  for (const record of state.records) {
    const key = originKey(record.origin);
    if (!byOrigin.has(key)) {
      byOrigin.set(key, { key, origin: record.origin, count: 0 });
    }
    byOrigin.get(key).count += 1;
  }
  return [...byOrigin.values()];
}

function projectOrigin(origin, bounds) {
  const width = 250;
  const height = 116;
  const x = 15 + ((Number(origin.lon) - bounds.minLon) / Math.max(0.0001, bounds.maxLon - bounds.minLon)) * width;
  const y = 17 + (1 - (Number(origin.lat) - bounds.minLat) / Math.max(0.0001, bounds.maxLat - bounds.minLat)) * height;
  return [x, y];
}

function renderOriginMap() {
  els.originMap.replaceChildren();
  const origins = originRecords();
  const bounds = origins.reduce(
    (acc, item) => ({
      minLat: Math.min(acc.minLat, Number(item.origin.lat)),
      maxLat: Math.max(acc.maxLat, Number(item.origin.lat)),
      minLon: Math.min(acc.minLon, Number(item.origin.lon)),
      maxLon: Math.max(acc.maxLon, Number(item.origin.lon)),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity },
  );

  const frame = document.createElementNS(svgNS, "path");
  frame.setAttribute("d", "M17 54 L46 28 L92 22 L131 34 L173 20 L229 30 L263 58 L246 110 L188 132 L128 121 L77 137 L34 112 Z");
  frame.setAttribute("fill", "#f1f1ee");
  frame.setAttribute("stroke", "#b9b9b3");
  frame.setAttribute("stroke-width", "1");
  els.originMap.appendChild(frame);

  for (const item of origins) {
    const [x, y] = projectOrigin(item.origin, bounds);
    const point = document.createElementNS(svgNS, "circle");
    point.setAttribute("class", `originPoint${state.selectedOrigin === item.key ? " active" : ""}`);
    point.setAttribute("cx", x.toFixed(1));
    point.setAttribute("cy", y.toFixed(1));
    point.setAttribute("r", state.selectedOrigin === item.key ? "4.6" : "3.2");
    point.setAttribute("fill", originKey(state.selected?.origin || {}) === item.key ? "#ff7a1a" : "#111111");
    point.setAttribute("opacity", state.selectedOrigin && state.selectedOrigin !== item.key ? "0.28" : "0.82");
    point.addEventListener("click", () => {
      state.selectedOrigin = state.selectedOrigin === item.key ? null : item.key;
      const matches = filteredRecords();
      if (matches.length > 0) setSelected(matches[0]);
      renderGrid();
      renderOriginMap();
    });
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${item.origin.name}: ${item.count} samples`;
    point.appendChild(title);
    els.originMap.appendChild(point);
  }

  const current = origins.find((item) => item.key === state.selectedOrigin);
  els.originMeta.textContent = current ? `${current.origin.name} · ${current.count} samples` : "All origins selected";
}

function renderGrid() {
  const records = filteredRecords();
  renderStats(records);
  els.grid.innerHTML = "";
  if (records.length === 0) {
    state.selected = null;
    els.eyebrow.textContent = "No samples";
    els.title.textContent = "No benchmark samples match the selected filters";
    els.answer.textContent = "Adjust difficulty, distance, or origin.";
    els.mainImage.removeAttribute("src");
    els.candidateList.replaceChildren();
    renderOriginMap();
    return;
  }
  for (const record of records) {
    const card = document.createElement("article");
    card.className = `card${state.selected?.route_name === record.route_name ? " active" : ""}`;
    card.tabIndex = 0;
    card.addEventListener("click", () => setSelected(record));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelected(record);
      }
    });
    card.innerHTML = `
      <img src="${record.map_image}" alt="${routeTitle(record)}" loading="lazy">
      <div class="cardBody">
        <h3>${routeTitle(record)}</h3>
        <div class="meta">
          <span class="pill">${record.difficulty}</span>
          <span class="pill">${record.candidate_count} routes</span><br>
          ${formatDistance(record.direct_distance_km * 1000)} direct · ${formatDistance(record.answer_distance_m)} shortest
        </div>
      </div>
    `;
    els.grid.appendChild(card);
  }
  if (!records.includes(state.selected)) {
    setSelected(records[0]);
  }
}

async function loadManifest() {
  const response = await fetch(manifestPath);
  if (!response.ok) {
    throw new Error(`Could not load ${manifestPath}`);
  }
  state.records = await response.json();
  state.records.sort((a, b) => {
    const diffOrder = { easy: 0, medium: 1, hard: 2 };
    return (diffOrder[a.difficulty] ?? 9) - (diffOrder[b.difficulty] ?? 9) || a.route_name.localeCompare(b.route_name);
  });
  setSelected(state.records[0] || null);
  renderOriginMap();
}

els.difficulty.addEventListener("change", () => {
  renderGrid();
  renderOriginMap();
});
els.distance.addEventListener("change", () => {
  renderGrid();
  renderOriginMap();
});
els.clearOrigin.addEventListener("click", () => {
  state.selectedOrigin = null;
  renderGrid();
  renderOriginMap();
});
els.reveal.addEventListener("click", () => {
  state.revealed = !state.revealed;
  renderViewer();
});

loadManifest().catch((error) => {
  els.eyebrow.textContent = "Manifest unavailable";
  els.title.textContent = "Run the benchmark generator first";
  els.answer.textContent = error.message;
});
