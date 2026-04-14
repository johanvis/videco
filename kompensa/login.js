const API_BASE = window.KOMPENSA_API_BASE;

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("error");

  errorEl.style.display = "none";
  errorEl.textContent = "Fel e-post eller lösenord";

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    if (response.ok) {
      window.location.href = "/kompensa/projects.html";
      return;
    }

    if (response.status === 401) {
      errorEl.style.display = "block";
      return;
    }

    const data = await response.json().catch(() => null);
    errorEl.textContent = data?.error || "Inloggningen misslyckades";
    errorEl.style.display = "block";

  } catch (err) {
    console.error(err);
    errorEl.textContent = "Kunde inte ansluta till servern";
    errorEl.style.display = "block";
  }
}
