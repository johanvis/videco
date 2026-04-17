const API_BASE = window.KOMPENSA_API_BASE;

const projectTitle = document.getElementById("project-title");
const projectSubtitle = document.getElementById("project-subtitle");
const projectName = document.getElementById("project-name");
const projectCompany = document.getElementById("project-company");
const projectUpdated = document.getElementById("project-updated");
const statusMessage = document.getElementById("status-message");
const openResultBtn = document.getElementById("open-map-btn");

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

function setStatus(message, variant = "") {
  statusMessage.className = variant ? `status ${variant}` : "status";
  statusMessage.textContent = message || "";
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

async function fetchProject(projectId) {
  const response = await fetch(`${API_BASE}/project/${encodeURIComponent(projectId)}`, {
    credentials: "include"
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  if (!response.ok) {
    throw new Error("Kunde inte hämta projektinformation.");
  }

  return await response.json();
}

async function fetchLayouts(projectId) {
  const response = await fetch(`${API_BASE}/project/${encodeURIComponent(projectId)}/layouts`, {
    credentials: "include"
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  if (!response.ok) {
    const payload = await safeReadJson(response);
    throw new Error(payload?.error || "Kunde inte hämta layouter.");
  }

  return await response.json();
}

function updateProjectSummary(project) {
  currentProject = project;

  projectTitle.textContent = project.name;
  projectSubtitle.textContent = "Här ser du projektets layouter och väljer vilken layout som ska användas i resultatkartan.";
  projectName.textContent = project.name;
  projectCompany.textContent = project.company;
  projectUpdated.textContent = formatDate(project.updatedAt);
}

function updateLayoutLimitInfo() {
  const count = layouts.length;
  layoutLimitInfo.textContent = `${count} av 5 layouter`;
  uploadLayoutBtn.disabled = count >= 5;
}

function renderLayouts() {
  layoutList.innerHTML = "";

  if (!layouts.length) {
    layoutEmpty.style.display = "block";
    updateLayoutLimitInfo();
    return;
  }

  layoutEmpty.style.display = "none";

  layouts.forEach((layout, index) => {
    const item = document.createElement("div");
    item.className = `layout-item ${layout.id === selectedLayoutId ? "active" : ""}`;

    const title = layout.name || `Layout ${index + 1}`;
    const turbineText = layout.turbineCount ?? "–";
    const houseText = currentProject?.summary?.houseCount ?? "–";

    item.innerHTML = `
      <div class="layout-main">
        <p class="layout-title">${escapeHtml(title)}</p>
        <p class="layout-meta">
          Turbiner: ${escapeHtml(turbineText)} ·
          Bostäder: ${escapeHtml(houseText)} ·
          Skapad ${escapeHtml(formatDate(layout.createdAt))}${layout.isBase ? " · Ursprungslayout" : ""}
        </p>
      </div>
      <div class="layout-actions">
        <button class="button button-secondary open-layout-btn" type="button">Välj</button>
        ${layout.isBase ? "" : `<button class="button button-danger delete-layout-btn" type="button">Ta bort</button>`}
      </div>
    `;

    const openBtn = item.querySelector(".open-layout-btn");
    openBtn.addEventListener("click", () => {
      selectedLayoutId = layout.id;
      renderLayouts();
      setStatus(`Vald layout: ${title}`, "success");
    });

    const deleteBtn = item.querySelector(".delete-layout-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        await deleteLayout(layout.id, title);
      });
    }

    layoutList.appendChild(item);
  });

  updateLayoutLimitInfo();
}

async function uploadLayout(projectId, file) {
  const formData = new FormData();
  formData.append("turbines", file);

  const response = await fetch(`${API_BASE}/project/${encodeURIComponent(projectId)}/layouts`, {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  const payload = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Kunde inte ladda upp layout.");
  }

  return payload;
}

async function deleteLayoutRequest(projectId, layoutId) {
  const response = await fetch(`${API_BASE}/project/${encodeURIComponent(projectId)}/layouts/${encodeURIComponent(layoutId)}`, {
    method: "DELETE",
    credentials: "include"
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  const payload = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Kunde inte ta bort layout.");
  }

  return payload;
}

async function handleLayoutUpload(projectId, file) {
  if (!file) return;

  if (layouts.length >= 5) {
    setStatus("Max 5 layouter per projekt har uppnåtts.", "error");
    layoutFileInput.value = "";
    return;
  }

  try {
    setStatus("Laddar upp och validerar layout...", "muted");
    uploadLayoutBtn.disabled = true;

    const result = await uploadLayout(projectId, file);
    if (!result) return;

    setStatus(result.message || "Layout uppladdad.", "success");

    const refreshedLayouts = await fetchLayouts(projectId);
    if (!refreshedLayouts) return;

    layouts = Array.isArray(refreshedLayouts.layouts) ? refreshedLayouts.layouts : [];
    if (result.layout?.id) {
      selectedLayoutId = result.layout.id;
    } else if (!selectedLayoutId && layouts.length) {
      selectedLayoutId = layouts[0].id;
    }

    renderLayouts();
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  } finally {
    layoutFileInput.value = "";
    updateLayoutLimitInfo();
  }
}

async function handleDeleteLayout(projectId, layoutId, layoutName) {
  const confirmed = window.confirm(`Vill du ta bort ${layoutName}?`);
  if (!confirmed) return;

  try {
    setStatus("Tar bort layout...", "muted");

    const result = await deleteLayoutRequest(projectId, layoutId);
    if (!result) return;

    setStatus(result.message || "Layout borttagen.", "success");

    const refreshedLayouts = await fetchLayouts(projectId);
    if (!refreshedLayouts) return;

    layouts = Array.isArray(refreshedLayouts.layouts) ? refreshedLayouts.layouts : [];

    if (!layouts.some(layout => layout.id === selectedLayoutId)) {
      selectedLayoutId = layouts.length ? layouts[0].id : null;
    }

    renderLayouts();
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

async function deleteLayout(layoutId, layoutName) {
  const projectId = getProjectIdFromUrl();
  if (!projectId) return;
  await handleDeleteLayout(projectId, layoutId, layoutName);
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

    renderLayouts();

    openResultBtn.addEventListener("click", () => {
      const url = new URL("project_map.html", window.location.href);
      url.searchParams.set("project", projectId);

      if (selectedLayoutId) {
        url.searchParams.set("layout", selectedLayoutId);
      }

      window.location.href = url.toString();
    });

    uploadLayoutBtn.addEventListener("click", () => {
      if (layouts.length >= 5) {
        setStatus("Max 5 layouter per projekt har uppnåtts.", "error");
        return;
      }
      layoutFileInput.click();
    });

    layoutFileInput.addEventListener("change", async () => {
      const file = layoutFileInput.files?.[0];
      await handleLayoutUpload(projectId, file);
    });

    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

initProjectPage();