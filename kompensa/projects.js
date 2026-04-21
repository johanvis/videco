const API_BASE = window.KOMPENSA_API_BASE;

const PROJECT_CARD_IMAGES = [
  "/kompensa/images/wind-1.jpg",
  "/kompensa/images/wind-2.jpg",
  "/kompensa/images/wind-3.jpg",
  "/kompensa/images/wind-4.jpg"
];

const logoutBtn = document.getElementById("logoutBtn");

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

let projects = [];

const emptyState = document.getElementById("empty-state");
const projectsSection = document.getElementById("projects-section");
const projectsGrid = document.getElementById("projects-grid");
const createProjectBtn = document.getElementById("create-project-btn");
const createProjectCard = document.getElementById("create-project-card");

async function fetchProjects() {
  const response = await fetch(`${API_BASE}/projects`, {
    credentials: "include"
  });

  if (response.status === 401) {
    window.location.href = "/kompensa/login.html";
    return null;
  }

  if (!response.ok) {
    throw new Error("Kunde inte hämta projekt från backend.");
  }

  return await response.json();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("sv-SE");
}

function getProjectImage(projectName) {
  let sum = 0;
  for (let i = 0; i < projectName.length; i++) {
    sum += projectName.charCodeAt(i);
  }
  return PROJECT_CARD_IMAGES[sum % PROJECT_CARD_IMAGES.length];
}

function renderProjects() {
  document.querySelectorAll(".existing-project-card").forEach(card => card.remove());

  projects.forEach(project => {
    const projectCard = document.createElement("button");
    projectCard.type = "button";
    projectCard.className = "project-card existing-project-card";

    // 🔥 HÄR sätts bilden
    projectCard.classList.add("with-image");
    projectCard.style.backgroundImage = `url("${getProjectImage(project.name)}")`;

    projectCard.innerHTML = `
      <div class="project-card-top">
        <span class="project-badge">Projekt</span>
      </div>

      <div class="project-card-body">
        <h3>${project.name}</h3>
        <p class="project-meta">Senast ändrad: ${formatDate(project.updatedAt)}</p>
      </div>
    `;

    projectCard.addEventListener("click", () => {
      window.location.href = `project.html?project=${encodeURIComponent(project.id)}`;
    });

    projectsGrid.appendChild(projectCard);
  });
}

function handleCreateProject() {
  window.location.href = "create_project.html";
}

async function initProjectsPage() {
  try {
    const data = await fetchProjects();

    if (!data) return;

    projects = data;

    if (projects.length === 0) {
      emptyState.style.display = "flex";
      projectsSection.style.display = "none";
    } else {
      emptyState.style.display = "none";
      projectsSection.style.display = "block";
      renderProjects();
    }
  } catch (error) {
    console.error(error);
    emptyState.style.display = "flex";
    projectsSection.style.display = "none";
  }
}

createProjectBtn?.addEventListener("click", handleCreateProject);
createProjectCard?.addEventListener("click", handleCreateProject);
logoutBtn?.addEventListener("click", logoutUser);

initProjectsPage();