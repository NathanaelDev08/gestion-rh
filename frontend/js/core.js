/* ============================================================
   Gestion RH — Noyau applicatif (état, appels Rust, formats)
   ============================================================ */
(function () {
  "use strict";

  const App = (window.App = {
    state: {
      user: null,
      settings: {},
      departments: [],
      leaveTypes: [],
      employees: [],
      loggedIn: false,
    },
  });

  /* ---------------- Échappement & utilitaires ---------------- */
  App.esc = (v) =>
    v === null || v === undefined
      ? ""
      : String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

  App.uid = (() => {
    let n = 0;
    return (p) => `${p || "id"}-${++n}-${Date.now().toString(36)}`;
  })();

  App.clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------- Appels vers le backend Rust ---------------- */
  function normalizeArgs(args) {
    const out = {};
    Object.entries(args || {}).forEach(([k, v]) => {
      out[k] = v;
      // Tauri accepte snake_case (Rust) comme camelCase : on envoie les deux.
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (camel !== k) out[camel] = v;
      const snake = k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      if (snake !== k) out[snake] = v;
    });
    return out;
  }

  function tauriInvoke(cmd, args) {
    const t = window.__TAURI__ || window.__TAURI_INTERNALS__;
    if (t && t.core && typeof t.core.invoke === "function") {
      return t.core.invoke(cmd, args);
    }
    if (t && typeof t.invoke === "function") return t.invoke(cmd, args);
    return Promise.reject(
      new Error("Environnement Tauri introuvable : l'application doit être lancée depuis le bureau.")
    );
  }

  /** Appel normal : affiche une notification en cas d'erreur. */
  App.api = async function (cmd, args) {
    try {
      return await tauriInvoke(cmd, normalizeArgs(args));
    } catch (err) {
      const msg = typeof err === "string" ? err : (err && err.message) || "Erreur inattendue";
      App.toast(msg, "error");
      throw new Error(msg);
    }
  };

  /** Appel silencieux : renvoie null en cas d'erreur. */
  App.call = async function (cmd, args) {
    try {
      return await tauriInvoke(cmd, normalizeArgs(args));
    } catch (e) {
      return null;
    }
  };

  /* ---------------- Notifications ---------------- */
  App.toast = function (message, type, ttl) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const icons = {
      success: "#i-check",
      error: "#i-alert",
      warning: "#i-alert",
      info: "#i-info",
    };
    const el = document.createElement("div");
    el.className = `toast ${type || "info"}`;
    el.innerHTML =
      `<svg class="ico"><use href="${icons[type] || "#i-info"}"/></svg>` +
      `<div class="grow">${App.esc(message)}</div>` +
      `<button aria-label="Fermer">&times;</button>`;
    el.querySelector("button").onclick = () => el.remove();
    root.appendChild(el);
    const life = ttl || (type === "error" ? 6500 : 3800);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(30px)";
      setTimeout(() => el.remove(), 320);
    }, life);
  };

  /* ---------------- Formats ---------------- */
  /* Devise sans sous-unité (franc CFA XOF/XAF, etc.) : affichage sans décimales. */
  const NO_DECIMAL = ["XOF", "XAF", "FCFA", "F CFA", "GNF", "KMF", "JPY", "KRW"];
  const currency = () =>
    (App.state.settings.company && App.state.settings.company.currency) || "XOF";
  const moneyDecimals = () =>
    NO_DECIMAL.includes(String(currency()).trim().toUpperCase()) ? 0 : 2;

  function numFmt(n, min, max) {
    if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: min === undefined ? 0 : min,
      maximumFractionDigits: max === undefined ? 0 : max,
    }).format(Number(n));
  }

  const F = (App.fmt = {
    num: (n, d) => numFmt(n, d, d),
    money: (n) => (n === null || n === undefined || isNaN(Number(n)))
        ? "—"
        : numFmt(n, moneyDecimals(), moneyDecimals()) + " " + currency(),
    moneyShort: (n) => (Math.abs(Number(n)) >= 1000000
        ? numFmt(Number(n) / 1000000, 1, 1) + " M"
        : Math.abs(Number(n)) >= 1000
        ? numFmt(Number(n) / 1000, 1, 1) + " k"
        : numFmt(n, 0, 0)) + " " + currency(),
    percent: (v, d) => numFmt(v, d === undefined ? 0 : d, d === undefined ? 0 : d) + " %",

    date: (iso) => {
      if (!iso) return "—";
      const s = String(iso).slice(0, 10);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
    },
    dateTime: (iso) => {
      if (!iso) return "—";
      const s = String(iso);
      const d = F.date(s);
      const t = s.match(/(\d{2}:\d{2})/);
      return t ? `${d} ${t[1]}` : d;
    },
    time: (iso) => (iso ? String(iso).match(/(\d{2}:\d{2})/)?.[1] || String(iso) : "—"),
    monthLabel: (ym) => {
      if (!ym) return "—";
      const [y, m] = String(ym).split("-");
      const names = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
      return `${names[Number(m) - 1] || ""} ${y}`;
    },
    duration: (minutes) => {
      const m = Math.max(0, Math.round(Number(minutes) || 0));
      const h = Math.floor(m / 60);
      return h > 0 ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
    },
    hours: (value) => F.duration(value),
    days: (n) => `${numFmt(n, n % 1 ? 1 : 0, n % 1 ? 1 : 0)} j`,
    age: (iso) => {
      if (!iso) return "—";
      const b = new Date(String(iso).slice(0, 10));
      if (isNaN(b)) return "—";
      const now = new Date();
      let a = now.getFullYear() - b.getFullYear();
      const m = now.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
      return a;
    },
    fromNow: (iso) => {
      if (!iso) return "—";
      const d = new Date(String(iso).replace(" ", "T"));
      if (isNaN(d)) return F.dateTime(iso);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return "à l'instant";
      if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
      if (diff < 2592000) return `il y a ${Math.floor(diff / 86400)} j`;
      return F.date(iso);
    },
    initials: (name) => {
      const parts = String(name || "?").trim().split(/\s+/);
      return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
    },
    seniority: (hireDate) => {
      if (!hireDate) return "—";
      const start = new Date(String(hireDate).slice(0, 10));
      if (isNaN(start)) return "—";
      const months = Math.max(0, Math.round((Date.now() - start.getTime()) / 2629800000));
      if (months < 1) return "moins d'un mois";
      const y = Math.floor(months / 12), m = months % 12;
      if (!y) return `${m} mois`;
      return m ? `${y} an${y > 1 ? "s" : ""} ${m} mois` : `${y} an${y > 1 ? "s" : ""}`;
    },
    today: () => new Date().toISOString().slice(0, 10),
    nowHM: () => new Date().toTimeString().slice(0, 5),
    dateLong: (iso) => {
      if (!iso) return "";
      const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    },
  });

  /* ---------------- Libellés / badges ---------------- */
  const L = (App.labels = {
    status: {
      active: ["En poste", "green"],
      probation: ["Période d'essai", "amber"],
      leave: ["En congé", "blue"],
      suspended: ["Suspendu", "red"],
      terminated: ["Sorti", "gray"],
    },
    contract: {
      CDI: ["CDI", "indigo"],
      CDD: ["CDD", "amber"],
      Stage: ["Stage", "purple"],
      Alternance: ["Alternance", "teal"],
      Freelance: ["Freelance", "blue"],
      Intérim: ["Intérim", "gray"],
    },
    leave: {
      pending: ["En attente", "amber"],
      approved: ["Approuvée", "green"],
      rejected: ["Refusée", "red"],
      cancelled: ["Annulée", "gray"],
    },
    attendance: {
      present: ["Présent", "green"],
      late: ["Retard", "amber"],
      absent: ["Absent", "red"],
      leave: ["Congé", "indigo"],
      holiday: ["Jour férié", "purple"],
      sick: ["Arrêt maladie", "purple"],
      remote: ["Télétravail", "blue"],
      mission: ["Mission", "teal"],
    },
    stage: {
      new: ["Nouveau", "blue"],
      screening: ["Présélection", "indigo"],
      interview: ["Entretien", "purple"],
      offer: ["Offre", "amber"],
      hired: ["Recruté", "green"],
      rejected: ["Refusé", "gray"],
    },
    offer: {
      draft: ["Brouillon", "gray"],
      open: ["Ouverte", "green"],
      on_hold: ["En pause", "amber"],
      closed: ["Clôturée", "gray"],
    },
    evaluation: {
      draft: ["Brouillon", "amber"],
      completed: ["Finalisée", "green"],
    },
    interview: {
      pending: ["Planifié", "amber"],
      positive: ["Positif", "green"],
      negative: ["Négatif", "red"],
      cancelled: ["Annulé", "gray"],
    },
    gender: { M: "Homme", F: "Femme" },
    /** html badge : map = App.labels.xxx */
    badge: (map, value, plain) => {
      const def = (map && map[value]) || [value || "—", "gray"];
      return `<span class="badge ${def[1]}${plain ? " plain" : ""}">${App.esc(def[0])}</span>`;
    },
  });

  /* ---------------- Données de référence ---------------- */
  App.loadDepartments = async function () {
    const rows = await App.call("list_departments");
    App.state.departments = rows || [];
    return App.state.departments;
  };

  App.loadLeaveTypes = async function () {
    const rows = await App.call("list_leave_types");
    App.state.leaveTypes = rows || [];
    return App.state.leaveTypes;
  };

  App.loadEmployees = async function (force) {
    if (App.state.employees.length && !force) return App.state.employees;
    const rows = await App.call("list_employees", {});
    App.state.employees = rows || [];
    return App.state.employees;
  };

  App.deptName = (id) => {
    const d = App.state.departments.find((x) => x.id === Number(id));
    return d ? d.name : "—";
  };

  App.currency = currency;
  App.moneyDecimals = moneyDecimals;

  App.departmentOptions = (selected) => {
    const opts = ['<option value="">— Aucun —</option>'];
    App.state.departments.forEach((d) => {
      opts.push(
        `<option value="${d.id}"${String(selected) === String(d.id) ? " selected" : ""}>${App.esc(d.name)}</option>`
      );
    });
    return opts.join("");
  };

  App.employeeOptions = (selected, filter) => {
    const list = (App.state.employees || []).filter(filter || (() => true));
    const opts = ['<option value="">— Sélectionner —</option>'];
    list.forEach((e) => {
      opts.push(
        `<option value="${e.id}"${String(selected) === String(e.id) ? " selected" : ""}>${App.esc(
          `${e.first_name} ${e.last_name}` + (e.job_title ? ` — ${e.job_title}` : "")
        )}</option>`
      );
    });
    return opts.join("");
  };

  /* ---------------- Impression ---------------- */
  App.print = function (html, title) {
    const root = document.getElementById("print-root");
    root.innerHTML = html;
    if (title) document.title = title;
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        root.innerHTML = "";
        document.title = "Gestion RH — Ressources humaines";
      }, 400);
    }, 60);
  };

  /* ---------------- Navigation ---------------- */
  App.go = function (path) {
    const target = path.startsWith("#") ? path : "#" + path;
    if (location.hash === target) App.render();
    else location.hash = target;
  };

  App.render = function () {
    if (window.Router) Router.render();
  };

  /* ---------------- Rafraîchissement global ---------------- */
  App.refresh = async function () {
    await Promise.all([
      App.loadDepartments(),
      App.loadLeaveTypes(),
      App.loadEmployees(true),
    ]);
    App.render();
  };
})();
