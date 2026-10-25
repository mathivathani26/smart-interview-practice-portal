/* Smart Interview Practice Portal — real API client. */

const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:5000/api"
  : "https://smart-interview-practice-portal.onrender.com/api";

const Auth = {
  getToken() { return localStorage.getItem("sip_token"); },
  getUser() {
    const raw = localStorage.getItem("sip_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("sip_token", token);
    localStorage.setItem("sip_user", JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem("sip_token");
    localStorage.removeItem("sip_user");
  },
  isLoggedIn() { return !!this.getToken(); },
  isAdmin() { const u = this.getUser(); return !!u && u.role === "admin"; },
  async logout() {
    try {
      if (this.getToken()) await apiRequest("/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Server logout failed; clearing the local session anyway.", err);
    } finally {
      this.clearSession();
      document.documentElement.style.visibility = "hidden";
      window.location.replace("login.html");
    }
  },
  requireAuth() {
    document.documentElement.dataset.authRequired = "true";
    if (!this.isLoggedIn()) {
      window.location.replace("login.html");
      return false;
    }
    return true;
  },
  requireAdmin() {
    if (!this.requireAuth()) return;
    document.documentElement.dataset.adminRequired = "true";
    if (!this.isAdmin()) { alert("Admin access required."); window.location.replace("dashboard.html"); }
  },
};

window.addEventListener("pageshow", () => {
  const page = document.documentElement;
  if (page.dataset.authRequired && !Auth.isLoggedIn()) {
    window.location.replace("login.html");
  } else if (page.dataset.adminRequired && !Auth.isAdmin()) {
    window.location.replace("dashboard.html");
  }
});

async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Auth.getToken()) headers["Authorization"] = `Bearer ${Auth.getToken()}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.code = data && data.code;
    error.data = data;
    throw error;
  }
  return data;
}

const Api = {
  register: (payload) => apiRequest("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => apiRequest("/auth/login", { method: "POST", body: payload, auth: false }),
  resetPassword: (payload) => apiRequest("/auth/reset-password", { method: "POST", body: payload, auth: false }),

  companies: () => apiRequest("/companies"),
  company: (id) => apiRequest(`/companies/${id}`),

  startSession: (payload) => apiRequest("/sessions/start", { method: "POST", body: payload }),
  nextQuestion: (sessionId, roundType, category, difficulty, questionIndex) => {
    const params = new URLSearchParams({ roundType });
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);
    if (Number.isInteger(questionIndex)) params.set("questionIndex", String(questionIndex));
    return apiRequest(`/sessions/${sessionId}/next-question?${params}`);
  },
  aptitudeSet: (sessionId, category, difficulty, limit = 10) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (difficulty) params.set("difficulty", difficulty);
    params.set("limit", String(limit));
    return apiRequest(`/sessions/${sessionId}/aptitude-set?${params}`);
  },
  submitRound: (sessionId, payload) => apiRequest(`/sessions/${sessionId}/submit-round`, { method: "POST", body: payload }),
  completeSession: (sessionId) => apiRequest(`/sessions/${sessionId}/complete`, { method: "POST" }),
  getSession: (sessionId) => apiRequest(`/sessions/${sessionId}`),
  history: () => apiRequest("/sessions"),
  dashboardStats: () => apiRequest("/sessions/stats/dashboard"),

  runCode: (payload) => apiRequest("/code/run", { method: "POST", body: payload }),

  leaderboard: (companyId, driveId) => {
    const params = new URLSearchParams({ companyId });
    if (driveId) params.set("driveId", driveId);
    return apiRequest(`/leaderboard?${params}`);
  },

  admin: {
    listAptitude: () => apiRequest("/admin/questions/aptitude"),
    createAptitude: (payload) => apiRequest("/admin/questions/aptitude", { method: "POST", body: payload }),
    deleteAptitude: (id) => apiRequest(`/admin/questions/aptitude/${id}`, { method: "DELETE" }),

    listCoding: () => apiRequest("/admin/questions/coding"),
    createCoding: (payload) => apiRequest("/admin/questions/coding", { method: "POST", body: payload }),
    deleteCoding: (id) => apiRequest(`/admin/questions/coding/${id}`, { method: "DELETE" }),

    listTheory: () => apiRequest("/admin/questions/theory"),
    createTheory: (payload) => apiRequest("/admin/questions/theory", { method: "POST", body: payload }),
    deleteTheory: (id) => apiRequest(`/admin/questions/theory/${id}`, { method: "DELETE" }),

    listCompanies: () => apiRequest("/admin/companies"),
    createCompany: (payload) => apiRequest("/admin/companies", { method: "POST", body: payload }),
    validatePattern: (companyId, round_sequence) => apiRequest(`/admin/companies/${companyId}/validate-pattern`, { method: "POST", body: { round_sequence } }),
    updatePattern: (companyId, round_sequence) => apiRequest(`/admin/companies/${companyId}/pattern`, { method: "PUT", body: { round_sequence } }),
    deleteCompany: (id) => apiRequest(`/admin/companies/${id}`, { method: "DELETE" }),
  },
};
