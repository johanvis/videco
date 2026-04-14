const API_BASE = window.KOMPENSA_API_BASE;

const projectTitle = document.getElementById("project-title");
const projectSubtitle = document.getElementById("project-subtitle");
const projectName = document.getElementById("project-name");
const projectCompany = document.getElementById("project-company");
const projectUpdated = document.getElementById("project-updated");
const turbineCount = document.getElementById("turbine-count");
const houseCount = document.getElementById("house-count");
const statusMessage = document.getElementById("status-message");
const openResultBtn = document.getElementById("open-map-btn");

function getProjectIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("project");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("sv-SE");
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

async function initProjectPage() {
  const projectId = getProjectIdFromUrl();

  if (!projectId) {
    statusMessage.className = "status error";
    statusMessage.textContent = "Ingen projektparameter hittades i URL.";
    return;
  }

  try {
    const project = await fetchProject(projectId);

    if (!project) {
      return;
    }

    projectTitle.textContent = project.name;
    projectSubtitle.textContent = "Här ser du en första översikt av projektets analysresultat.";
    projectName.textContent = project.name;
    projectCompany.textContent = project.company;
    projectUpdated.textContent = formatDate(project.updatedAt);
    turbineCount.textContent = project.summary.turbineCount;
    houseCount.textContent = project.summary.houseCount;

    openResultBtn.addEventListener("click", () => {
      window.location.href = `project_map.html?project=${encodeURIComponent(projectId)}`;
    });

  } catch (error) {
    console.error(error);
    statusMessage.className = "status error";
    statusMessage.textContent = error.message;
  }
}

initProjectPage();
