const API_BASE = window.KOMPENSA_API_BASE;

const form = document.getElementById("createProjectForm");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

const modeFileBtn = document.getElementById("mode-file-btn");
const modeManualBtn = document.getElementById("mode-manual-btn");
const inputModeField = document.getElementById("input_mode");

const fileUploadSection = document.getElementById("file-upload-section");
const manualCoordinatesSection = document.getElementById("manual-coordinates-section");

const turbinesInput = document.getElementById("turbines");
const manualCoordinatesInput = document.getElementById("manual_coordinates");
const manualLayoutNameInput = document.getElementById("manual_layout_name");

function setStatus(message = "", variant = "muted") {
  statusMessage.className = variant ? `project-status ${variant}` : "project-status";
  statusMessage.textContent = message;
}

function setInputMode(mode) {
  const isFileMode = mode === "file";

  inputModeField.value = isFileMode ? "file" : "manual";

  fileUploadSection.classList.toggle("is-hidden", !isFileMode);
  manualCoordinatesSection.classList.toggle("is-hidden", isFileMode);

  modeFileBtn.classList.toggle("is-active", isFileMode);
  modeManualBtn.classList.toggle("is-active", !isFileMode);

  modeFileBtn.setAttribute("aria-pressed", String(isFileMode));
  modeManualBtn.setAttribute("aria-pressed", String(!isFileMode));

  turbinesInput.required = isFileMode;
  manualCoordinatesInput.required = !isFileMode;

  if (isFileMode) {
    manualCoordinatesInput.value = "";
    manualLayoutNameInput.value = "";
    setStatus("");
  } else {
    turbinesInput.value = "";
    setStatus(
      "Manuell koordinatinmatning kräver backendstöd för att skapa ett punktlager i SWEREF 99 TM.",
      "muted"
    );
  }
}

function parseManualCoordinates(rawText) {
  const rows = rawText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (!rows.length) {
    throw new Error("Ange minst en koordinatrad.");
  }

  const points = rows.map((row, index) => {
    const normalized = row.replace(/;/g, ",");
    const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);

    if (parts.length !== 2) {
      throw new Error(`Rad ${index + 1} har fel format. Använd X, Y.`);
    }

    const x = Number(parts[0].replace(/\s/g, "").replace(",", "."));
    const y = Number(parts[1].replace(/\s/g, "").replace(",", "."));

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Rad ${index + 1} innehåller ogiltiga koordinater.`);
    }

    return { x, y };
  });

  return points;
}

function buildFormData() {
  const formData = new FormData();
  const projectName = form.elements.project_name.value.trim();
  const inputMode = inputModeField.value;

  formData.append("project_name", projectName);
  formData.append("input_mode", inputMode);

  if (inputMode === "file") {
    const file = turbinesInput.files?.[0];

    if (!file) {
      throw new Error("Välj en turbinfil.");
    }

    formData.append("turbines", file);
    return formData;
  }

  const points = parseManualCoordinates(manualCoordinatesInput.value);
  const layoutName = manualLayoutNameInput.value.trim();

  const manualCoordinates = document.getElementById("manual_coordinates").value.trim();
  formData.append("manual_coordinates", manualCoordinates);
  formData.append("manual_crs", "EPSG:3006");
  formData.append("input_mode", "manual");

  if (layoutName) {
    formData.append("manual_layout_name", layoutName);
  }

  return formData;
}

async function submitCreateProject(formData) {
  const response = await fetch(`${API_BASE}/create_project`, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Något gick fel.");
  }

  return data;
}

modeFileBtn?.addEventListener("click", () => setInputMode("file"));
modeManualBtn?.addEventListener("click", () => setInputMode("manual"));

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  setStatus("Skapar projekt och kör analys...", "muted");
  submitBtn.disabled = true;
  submitBtn.textContent = "Arbetar...";

  try {
    const formData = buildFormData();
    const data = await submitCreateProject(formData);

    if (!data) return;

    setStatus(`Projekt "${data.project}" skapades. Omdirigerar...`, "success");

    setTimeout(() => {
      window.location.href = "projects.html";
    }, 1000);
  } catch (error) {
    setStatus(`Fel: ${error.message}`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Klart";
  }
});

setInputMode("file");
