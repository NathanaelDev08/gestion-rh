/* ============================================================
   Gestion RH — Amorçage, connexion, barres latérales
   ============================================================ */
(function () {
  "use strict";

  const ROUTES = [
    { pattern: "dashboard", view: "dashboard", nav: "dashboard" },
    { pattern: "employees", view: "employees", nav: "employees" },
    { pattern: "employees/:id", view: "employee", nav: "employees" },
    { pattern: "org", view: "org", nav: "org" },
    { pattern: "leaves", view: "leaves", nav: "leaves" },
    { pattern: "attendance", view: "attendance", nav: "attendance" },
    { pattern: "payroll", view: "payroll", nav: "payroll" },
    { pattern: "recruitment", view: "recruitment", nav: "recruitment" },
    { pattern: "evaluations", view: "evaluations", nav: "evaluations" },
    { pattern: "documents", view: "documents", nav: "documents" },
    { pattern: "settings", view: "settings", nav: "settings" },
  ];
  ROUTES.forEach((r) => Router.register(r.pattern, r.view, r.nav));

  const $ = (id) => document.getElementById(id);

  /* ---------------- Connexion ---------------- */
  async function login(username, password) {
    const user = await App.api("login", { username, password });
    App.state.user = user;
    App.state.loggedIn = true;
    sessionStorage.setItem("grh_user", user.username);

    $("login-screen").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    $("user-name").textContent = user.full_name || user.username;
    $("user-role").textContent = user.role === "admin" ? "Administrateur" : user.role;
    $("user-avatar").textContent = App.fmt.initials(user.full_name || user.username);

    await Promise.all([
      App.loadDepartments(),
      App.loadLeaveTypes(),
      App.loadEmployees(true),
    ]);
    applyCompany();
    if (!location.hash || location.hash === "#") location.hash = "#/dashboard";
    Router.render();
    updateBadges();
  }

  function applyCompany() {
    const c = App.state.settings.company || {};
    $("brand-name").textContent = c.name || "Gestion RH";
    $("brand-tag").textContent = c.tagline || "Ressources humaines";
    document.querySelector(".sidebar-brand .brand-mark").style.background =
      c.logo_color
        ? `linear-gradient(135deg, ${c.logo_color}, #14b8a6)`
        : "";
  }

  function showLogin() {
    App.state.loggedIn = false;
    $("app-shell").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
    setTimeout(() => $("login-pass") && $("login-pass").focus(), 80);
  }

  async function logout() {
    const ok = await UI.confirm({
      title: "Déconnexion",
      message: "Voulez-vous vous déconnecter du logiciel ?",
      confirmLabel: "Se déconnecter",
      danger: true,
    });
    if (!ok) return;
    App.state.user = null;
    App.state.settings = {};
    App.state.employees = [];
    sessionStorage.removeItem("grh_user");
    UI.closeAllModals();
    showLogin();
  }

  /* ---------------- Badges de navigation ---------------- */
  async function updateBadges() {
    if (!App.state.loggedIn) return;
    const pending = await App.call("list_leave_requests", { status: "pending" });
    const badge = $("badge-leaves");
    const n = (pending || []).length;
    badge.textContent = n;
    badge.classList.toggle("hidden", n === 0);
  }
  App.updateBadges = updateBadges;

  /* ---------------- Recherche globale ---------------- */
  let searchTimer = null;
  async function runSearch(term) {
    const box = $("search-results");
    if (!term || term.trim().length < 2) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    const res = await App.call("global_search", { term: term.trim() });
    if (!res) return;
    const parts = [];
    if (res.employees.length)
      parts.push(
        `<div class="sr-group">Employés</div>` +
          res.employees
            .map(
              (e) =>
                `<a data-go="#/employees/${e.id}"><svg class="ico"><use href="#i-users"/></svg><span><strong>${App.esc(
                  e.first_name + " " + e.last_name
                )}</strong> <span class="muted small">${App.esc(e.job_title || e.matricule || "")}</span></span></a>`
            )
            .join("")
      );
    if (res.offers.length)
      parts.push(
        `<div class="sr-group">Offres d'emploi</div>` +
          res.offers
            .map(
              (o) =>
                `<a data-go="#/recruitment"><svg class="ico"><use href="#i-briefcase"/></svg><span>${App.esc(
                  o.title
                )}</span></a>`
            )
            .join("")
      );
    if (res.candidates.length)
      parts.push(
        `<div class="sr-group">Candidats</div>` +
          res.candidates
            .map(
              (c) =>
                `<a data-go="#/recruitment"><svg class="ico"><use href="#i-user-check"/></svg><span>${App.esc(
                  c.first_name + " " + c.last_name
                )}</span></a>`
            )
            .join("")
      );
    box.innerHTML = parts.length ? parts.join("") : `<div class="sr-group">Aucun résultat</div>`;
    box.classList.remove("hidden");
    box.querySelectorAll("[data-go]").forEach((a) => {
      a.onclick = () => {
        box.classList.add("hidden");
        $("global-search").value = "";
        App.go(a.dataset.go.replace("#", ""));
      };
    });
  }

  /* ---------------- Liaison de l'enveloppe ---------------- */
  function bindShell() {
    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const err = $("login-error");
      btn.disabled = true;
      btn.textContent = "Connexion…";
      err.classList.add("hidden");
      try {
        await login($("login-user").value.trim(), $("login-pass").value);
      } catch (ex) {
        err.textContent = ex.message || "Connexion impossible.";
        err.classList.remove("hidden");
      } finally {
        btn.disabled = false;
        btn.textContent = "Se connecter";
      }
    });

    $("btn-logout").onclick = logout;
    $("btn-menu").onclick = () => $("sidebar").classList.toggle("open");
    $("btn-refresh").onclick = async () => {
      await App.refresh();
      updateBadges();
      App.toast("Données actualisées", "success");
    };

    const search = $("global-search");
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(search.value), 260);
    });
    search.addEventListener("focus", () => {
      if (search.value.trim().length >= 2) runSearch(search.value);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".topbar-search")) $("search-results").classList.add("hidden");
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.focus();
        search.select();
      }
      if (e.key === "Escape") $("search-results").classList.add("hidden");
    });

    // Actualisation périodique des indicateurs de navigation.
    setInterval(updateBadges, 90000);
  }

  /* ---------------- Démarrage ---------------- */
  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    $("topbar-date").textContent = App.fmt.dateLong(App.fmt.today());
    bindShell();

    // Récupère la session en cours (le backend est la source de vérité).
    const settings = await App.call("get_settings");
    if (settings) App.state.settings = settings;

    showLogin();

    // Si une session existe encore (démonstration), on garde le champ pré-rempli.
    const remembered = sessionStorage.getItem("grh_user");
    if (remembered) $("login-user").value = remembered;
  }

  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();
})();
