const API_BASE = window.KOMPENSA_API_BASE;

const form = document.getElementById("createProjectForm");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  statusMessage.className = "status info";
  statusMessage.textContent = "Skapar projekt och kör analys...";
  submitBtn.disabled = true;
  submitBtn.textContent = "Arbetar...";

  try {
    const formData = new FormData(form);

    const response = await fetch(`${API_BASE}/create_project`, {
      method: "POST",
      credentials: "include",
      body: formData
    });

    if (response.status === 401) {
      window.location.href = "/kompensa/login.html";
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Något gick fel.");
    }

    statusMessage.className = "status success";
    statusMessage.textContent = `Projekt "${data.project}" skapades. Omdirigerar...`;

    setTimeout(() => {
      window.location.href = "projects.html";
    }, 1000);

  } catch (error) {
    statusMessage.className = "status error";
    statusMessage.textContent = `Fel: ${error.message}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Klart";
  }
});
