const API_BASE = window.KOMPENSA_API_BASE;
const MAX_LAYOUTS = 5;

const projectTitle = document.getElementById("project-title");
const projectSubtitle = document.getElementById("project-subtitle");
const projectName = document.getElementById("project-name");
const projectHouseRadius = document.getElementById("project-house-radius");
const projectHouseCount = document.getElementById("project-house-count");
const projectUpdated = document.getElementById("project-updated");
const statusMessage = document.getElementById("status-message");
const openMapBtn = document.getElementById("open-map-btn");
const logoutBtn = document.getElementById("logoutBtn");

const uploadLayoutBtn = document.getElementById("upload-layout-btn");
const layoutFileInput = document.getElementById("layout-file-input");
const layoutList = document.getElementById("layout-list");
const layoutEmpty = document.getElementById("layout-empty");
const layoutLimitInfo = document.getElementById("layout-limit-info");

let currentProject = null;
let layouts = [];
let selectedLayoutId = null;

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("project");
}

function formatDate(dateString) {
  if (!dateString) return "–";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("sv-SE");
}

function setStatus(message = "", variant = "") {
  statusMessage.className = variant ? `project-status ${variant}` : "project-status";
  statusMessage.textContent = message;
}

function setLayoutInfo(message = "", variant = "") {
  layoutLimitInfo.className = variant
    ? `project-toolbar-status ${variant}`
    : "project-toolbar-status";
  layoutLimitInfo.textContent = message;
}

function updateLayoutLimitInfo(showLimitError = false) {
  const count = layouts.length;

  if (showLimitError && count >= MAX_LAYOUTS) {
    setLayoutInfo(`Max ${MAX_LAYOUTS} layouter per projekt har uppnåtts.`, "error");
  } else {
    setLayoutInfo(`${count} av ${MAX_LAYOUTS} layouter`);
  }

  uploadLayoutBtn.disabled = count >= MAX_LAYOUTS;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchWithAuth(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  return response;
}

async function logoutUser() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    console.error("Kunde inte logga ut:", error);
  } finally {
    window.location.href = "/kompensa/login.html";
  }
}

async function fetchProject(projectId) {
  const response = await fetchWithAuth(
    `${API_BASE}/project/${encodeURIComponent(projectId)}`
  );

  if (!response) return null;

  if (!response.ok) {
    throw new Error("Kunde inte hämta projektinformation.");
  }

  return await response.json();
}

async function fetchLayouts(projectId) {
  const response = await fetchWithAuth(
    `${API_BASE}/project/${encodeURIComponent(projectId)}/layouts`
  );

  if (!response) return null;

  if (!response.ok) {
    const payload = await safeReadJson(response);
    throw new Error(payload?.error || "Kunde inte hämta layouter.");
  }

  return await response.json();
}

function resolveHouseCount(project) {
  const summary = project?.summary || {};

  return (
    summary.houseCount ??
    summary.housesCount ??
    summary.residenceCount ??
    summary.residencesCount ??
    project?.houseCount ??
    project?.housesCount ??
    "–"
  );
}

function resolveHouseFetchDistanceKm(project) {
  const summary = project?.summary || {};

  const rawDistance =
    summary.houseFetchDistanceKm ??
    summary.fetchDistanceKm ??
    summary.bufferDistanceKm ??
    summary.houseFetchRadiusKm ??
    project?.houseFetchDistanceKm ??
    project?.fetchDistanceKm ??
    project?.bufferDistanceKm ??
    project?.houseFetchRadiusKm ??
    null;

  if (rawDistance !== null && rawDistance !== undefined && rawDistance !== "") {
    const numeric = Number(rawDistance);
    if (!Number.isNaN(numeric)) {
      return numeric % 1 === 0 ? String(numeric) : numeric.toFixed(1);
    }
    return String(rawDistance);
  }

  const rawMeters =
    summary.bufferDistanceMeters ??
    summary.fetchDistanceMeters ??
    summary.houseFetchDistanceMeters ??
    project?.bufferDistanceMeters ??
    project?.fetchDistanceMeters ??
    project?.houseFetchDistanceMeters ??
    null;

  if (rawMeters !== null && rawMeters !== undefined && rawMeters !== "") {
    const numeric = Number(rawMeters);
    if (!Number.isNaN(numeric)) {
      const km = numeric / 1000;
      return km % 1 === 0 ? String(km) : km.toFixed(1);
    }
    return "–";
  }

  return "–";
}

function updateProjectSummary(project) {
  currentProject = project;

  projectTitle.textContent = project.name || "Projektöversikt";
  projectSubtitle.textContent =
    "Här ser du projektets layouter och väljer vilken layout som ska användas i resultatkartan.";
  projectName.textContent = project.name || "–";
  projectHouseRadius.textContent = resolveHouseFetchDistanceKm(project);
  projectHouseCount.textContent = resolveHouseCount(project);
  projectUpdated.textContent = formatDate(project.updatedAt);
}

function ensureSelectedLayout() {
  if (layouts.some((layout) => layout.id === selectedLayoutId)) {
    return;
  }

  selectedLayoutId = layouts.length ? layouts[0].id : null;
}

function selectLayout(layoutId, title) {
  selectedLayoutId = layoutId;
  renderLayouts();
  setStatus(`Vald layout: ${title}`, "success");
}

function renderLayouts() {
  layoutList.innerHTML = "";

  if (!layouts.length) {
    layoutEmpty.classList.remove("is-hidden");
    updateLayoutLimitInfo(false);
    return;
  }

  layoutEmpty.classList.add("is-hidden");

  layouts.forEach((layout, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `layout-item layout-select-card ${layout.id === selectedLayoutId ? "active" : ""}`;

    const title = layout.name || `Layout ${index + 1}`;
    const turbineText = layout.turbineCount ?? "–";
    const createdText = formatDate(layout.createdAt);
    const baseText = layout.isBase ? " · Ursprungslayout" : "";

    item.innerHTML = `
      <div class="layout-main">
        <p class="layout-title">${escapeHtml(title)}</p>
        <p class="layout-meta">
          Turbiner: ${escapeHtml(turbineText)} ·
          Skapad ${escapeHtml(createdText)}${baseText}
        </p>
      </div>
      <div class="layout-actions">
        <span class="layout-select-label">${layout.id === selectedLayoutId ? "Vald layout" : "Klicka för att välja"}</span>
        ${layout.isBase ? "" : '<button class="btn btn-danger delete-layout-btn" type="button">Ta bort</button>'}
      </div>
    `;

    item.addEventListener("click", () => {
      selectLayout(layout.id, title);
    });

    const deleteBtn = item.querySelector(".delete-layout-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await handleDeleteLayout(layout.id, title);
      });
    }

    layoutList.appendChild(item);
  });

  updateLayoutLimitInfo(false);
}

async function uploadLayout(projectId, file) {
  const formData = new FormData();
  formData.append("turbines", file);

  const response = await fetchWithAuth(
    `${API_BASE}/project/${encodeURIComponent(projectId)}/layouts`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response) return null;

  const payload = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Kunde inte ladda upp layout.");
  }

  return payload;
}

async function deleteLayoutRequest(projectId, layoutId) {
  const response = await fetchWithAuth(
    `${API_BASE}/project/${encodeURIComponent(projectId)}/layouts/${encodeURIComponent(layoutId)}`,
    {
      method: "DELETE"
    }
  );

  if (!response) return null;

  const payload = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Kunde inte ta bort layout.");
  }

  return payload;
}

async function refreshLayouts(projectId) {
  const layoutPayload = await fetchLayouts(projectId);
  if (!layoutPayload) return false;

  layouts = Array.isArray(layoutPayload.layouts) ? layoutPayload.layouts : [];
  selectedLayoutId = layoutPayload.activeLayoutId || selectedLayoutId;

  ensureSelectedLayout();
  renderLayouts();

  return true;
}

function isAcceptedLayoutFile(file) {
  if (!file) return false;

  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".geojson") ||
    lowerName.endsWith(".gpkg")
  );
}

async function handleLayoutUpload(projectId, file) {
  if (!file) return;

  if (!isAcceptedLayoutFile(file)) {
    setStatus("Ogiltigt filformat. Använd ZIP, GeoJSON eller GeoPackage.", "error");
    layoutFileInput.value = "";
    return;
  }

  if (layouts.length >= MAX_LAYOUTS) {
    updateLayoutLimitInfo(true);
    layoutFileInput.value = "";
    return;
  }

  try {
    setStatus("Laddar upp och validerar layout...", "muted");
    uploadLayoutBtn.disabled = true;

    const result = await uploadLayout(projectId, file);
    if (!result) return;

    const refreshed = await refreshLayouts(projectId);
    if (!refreshed) return;

    if (result.layout?.id) {
      selectedLayoutId = result.layout.id;
      renderLayouts();
    }

    setStatus(result.message || "Layout uppladdad.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Kunde inte ladda upp layout.", "error");
  } finally {
    layoutFileInput.value = "";
    updateLayoutLimitInfo(false);
  }
}

async function handleDeleteLayout(layoutId, layoutName) {
  const projectId = getProjectIdFromUrl();
  if (!projectId) return;

  const confirmed = window.confirm(`Vill du ta bort ${layoutName}?`);
  if (!confirmed) return;

  try {
    setStatus("Tar bort layout...", "muted");

    const result = await deleteLayoutRequest(projectId, layoutId);
    if (!result) return;

    const refreshed = await refreshLayouts(projectId);
    if (!refreshed) return;

    setStatus(result.message || "Layout borttagen.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Kunde inte ta bort layout.", "error");
  } finally {
    updateLayoutLimitInfo(false);
  }
}

function openSelectedLayout(projectId) {
  const url = new URL("project_map.html", window.location.href);
  url.searchParams.set("project", projectId);

  if (selectedLayoutId) {
    url.searchParams.set("layout", selectedLayoutId);
  }

  window.location.href = url.toString();
}

function bindEvents(projectId) {
  openMapBtn.addEventListener("click", () => {
    openSelectedLayout(projectId);
  });

  uploadLayoutBtn.addEventListener("click", () => {
    if (layouts.length >= MAX_LAYOUTS) {
      updateLayoutLimitInfo(true);
      return;
    }

    updateLayoutLimitInfo(false);
    layoutFileInput.click();
  });

  layoutFileInput.addEventListener("change", async () => {
    const file = layoutFileInput.files?.[0];
    await handleLayoutUpload(projectId, file);
  });

  logoutBtn?.addEventListener("click", logoutUser);
}

async function initProjectPage() {
  const projectId = getProjectIdFromUrl();

  if (!projectId) {
    setStatus("Ingen projektparameter hittades i URL.", "error");
    return;
  }

  try {
    const [project, layoutPayload] = await Promise.all([
      fetchProject(projectId),
      fetchLayouts(projectId)
    ]);

    if (!project || !layoutPayload) {
      return;
    }

    updateProjectSummary(project);

    layouts = Array.isArray(layoutPayload.layouts) ? layoutPayload.layouts : [];
    selectedLayoutId = layoutPayload.activeLayoutId || (layouts[0]?.id ?? null);

    ensureSelectedLayout();
    renderLayouts();
    bindEvents(projectId);
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ett fel uppstod.", "error");
  }
}

initProjectPage();
