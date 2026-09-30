/* ============================================================
   Gestion RH — Routeur (navigation par ancre)
   ============================================================ */
(function () {
  "use strict";

  const Router = (window.Router = {
    routes: [],
    current: null,
    token: 0,
    lastPath: null,
  });

  /** pattern : "employees/:id" */
  Router.register = function (pattern, viewName, navKey) {
    Router.routes.push({
      pattern,
      segments: pattern.split("/").filter(Boolean),
      viewName,
      navKey: navKey || pattern.split("/")[0],
    });
  };

  Router.parse = function () {
    const raw = location.hash.replace(/^#\/?/, "");
    const path = raw.replace(/\/+$/, "");
    return {
      path,
      segments: path ? path.split("/").filter(Boolean) : [],
      query: Object.fromEntries(new URLSearchParams(location.search)),
    };
  };

  Router.resolve = function (segments) {
    for (const route of Router.routes) {
      if (route.segments.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(segments[i]);
        else if (seg !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  };

  let renderTimer = null;

  Router.render = function () {
    if (!App.state.loggedIn) return;
    const { segments, path } = Router.parse();
    const match = Router.resolve(segments.length ? segments : ["dashboard"]);
    const viewEl = document.getElementById("view");
    const token = ++Router.token;

    clearTimeout(renderTimer);

    if (!match) {
      if (viewEl) {
        viewEl.innerHTML = UI.empty({
          icon: "#i-search",
          title: "Page introuvable",
          text: `L'adresse « ${path} » ne correspond à aucune section du logiciel.`,
          action: "Revenir au tableau de bord",
        });
        const btn = viewEl.querySelector("[data-empty-action]");
        if (btn) btn.onclick = () => App.go("/dashboard");
      }
      return;
    }

    const { route, params } = match;
    // Changement de section : on ferme les éventuels formulaires modaux ouverts.
    if (Router.lastPath !== null && Router.lastPath !== path && window.UI && UI.closeAllModals) {
      UI.closeAllModals();
    }
    Router.lastPath = path;
    Router.current = { route, params, path };
    const view = (window.Views || {})[route.viewName];

    // Navigation active + titres
    document.querySelectorAll("#nav a").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route.navKey);
      if (a.dataset.route === route.navKey) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (view) {
      const title = typeof view.title === "function" ? view.title(params) : view.title;
      const subtitle = typeof view.subtitle === "function" ? view.subtitle(params) : view.subtitle;
      document.getElementById("page-title").textContent = title || "";
      document.getElementById("page-subtitle").textContent = subtitle || "";
      document.title = `${title || "Gestion RH"} — Gestion RH`;
    }
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");

    if (!viewEl || !view || typeof view.render !== "function") return;

    // Chaque rendu reçoit son propre conteneur : une vue dont le rendu est
    // encore en cours (appels asynchrones) ne peut plus écraser — ni être
    // écrasée par — une navigation ultérieure. Une vue obsolète écrit donc
    // dans son propre conteneur orphelin, sans jamais planter.
    const holder = document.createElement("div");
    holder.className = "view-host";
    viewEl.replaceChildren(holder);

    // Petit délai : permet d'afficher instantanément un état de chargement.
    renderTimer = setTimeout(() => {
      if (token === Router.token && !holder.innerHTML.trim()) {
        holder.innerHTML = `<div class="empty"><div class="empty-icon"><svg class="ico"><use href="#i-refresh"/></svg></div><h4>Chargement…</h4></div>`;
      }
    }, 180);

    Promise.resolve()
      .then(() => view.render(holder, params))
      .catch((err) => {
        if (token !== Router.token) return;
        clearTimeout(renderTimer);
        const msg = err && err.message ? err.message : String(err);
        holder.innerHTML = `<div class="card"><div class="card-body">${UI.alert(
          "danger",
          `<strong>Impossible d'afficher cette section.</strong><br>${App.esc(msg)}`,
          "#i-alert"
        )}</div></div>`;
        console.error(err);
      })
      .finally(() => {
        if (token === Router.token) clearTimeout(renderTimer);
      });
  };

  window.addEventListener("hashchange", () => Router.render());
})();
