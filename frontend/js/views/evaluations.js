/* ============================================================
   Gestion RH — Évaluations : grille de critères, notes, historique
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const esc = App.esc;
  const ico = (id) => `<svg class="ico"><use href="${id}"/></svg>`;

  /* Grille par défaut (utilisée si les paramètres ne définissent rien). */
  const DEFAULT_CRITERIA = [
    "Qualité du travail",
    "Productivité",
    "Ponctualité et assiduité",
    "Esprit d'équipe",
    "Communication",
    "Initiative et autonomie",
    "Respect des procédures",
    "Développement des compétences",
  ];

  const RATING_TEXT = {
    1: "Insuffisant",
    2: "À améliorer",
    3: "Satisfaisant",
    4: "Très bien",
    5: "Excellent",
  };

  const TABS = [
    { id: "list", label: "Évaluations" },
    { id: "history", label: "Historique par employé" },
    { id: "summary", label: "Synthèse" },
  ];

  /* État local : conservé d'un rendu à l'autre. */
  const state = { tab: "list", status: "all", period: "all", employee: "all", search: "" };

  let rows = [];
  let stats = null;

  /* ---------------- Utilitaires ---------------- */
  async function safe(cmd, args) {
    try {
      return await App.api(cmd, args || {});
    } catch (err) {
      return null;
    }
  }

  function scale() {
    const s = App.state.settings && App.state.settings.evaluation;
    return Number(s && s.scale) || 5;
  }

  function criteriaLabels() {
    const s = App.state.settings && App.state.settings.evaluation;
    const list = s && s.criteria;
    return list && list.length ? list.slice() : DEFAULT_CRITERIA.slice();
  }

  function parseCriteria(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function ratingText(n) {
    const v = Number(n) || 0;
    return RATING_TEXT[v] || (v ? String(v) : "—");
  }

  function avgCriteria(list) {
    if (!list.length) return 0;
    const sum = list.reduce((a, c) => a + (Number(c.rating) || 0), 0);
    return Math.round((sum / list.length) * 100) / 100;
  }

  function empName(r) {
    return r.employee_name || "Employé";
  }

  const rowKey = (r) => "r" + r.id;

  /* ---------------- Filtrage local ---------------- */
  function filtered() {
    const term = state.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (state.status !== "all" && r.status !== state.status) return false;
      if (state.period !== "all" && r.period !== state.period) return false;
      if (state.employee !== "all" && Number(r.employee_id) !== Number(state.employee)) return false;
      if (!term) return true;
      return [empName(r), r.period, r.evaluator_name, r.department, r.matricule]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }

  function periods() {
    const set = [];
    rows.forEach((r) => {
      if (r.period && !set.includes(r.period)) set.push(r.period);
    });
    return set.sort((a, b) => String(b).localeCompare(String(a), "fr"));
  }

  function aggregateByEmployee(list) {
    const map = new Map();
    list.forEach((r) => {
      const key = Number(r.employee_id);
      const cur =
        map.get(key) ||
        {
          employee_id: key,
          employee_name: empName(r),
          photo_color: r.photo_color,
          job_title: r.job_title || "",
          department: r.department || "",
          n: 0,
          sum: 0,
          completed: 0,
          last_period: "",
          last_date: "",
          rows: [],
        };
      cur.n++;
      cur.sum += Number(r.global_rating) || 0;
      if (r.status === "completed") cur.completed++;
      const d = String(r.created_at || "");
      if (d > cur.last_date) {
        cur.last_date = d;
        cur.last_period = r.period || "";
      }
      cur.rows.push(r);
      map.set(key, cur);
    });
    return Array.from(map.values()).map((m) => {
      m.avg = Math.round((m.sum / m.n) * 100) / 100;
      return m;
    });
  }

  /* ---------------- KPI ---------------- */
  function paintKpis(el) {
    const box = el.querySelector("#ev-kpis");
    if (!box) return;
    const overall = (stats && stats.overall) || {};
    const total = Number(overall.total) || rows.length;
    const avg = Number(overall.avg_rating) || 0;
    const completed = Number(overall.completed) || 0;
    const unique = new Set(rows.map((r) => Number(r.employee_id))).size;

    box.innerHTML =
      UI.kpi({
        icon: "#i-clipboard",
        label: "Évaluations",
        value: App.fmt.num(total),
        hint: `${App.fmt.num(unique)} collaborateur(s) évalué(s)`,
      }) +
      UI.kpi({
        icon: "#i-star",
        tone: "amber",
        label: "Moyenne générale",
        value: total ? `${App.fmt.num(avg, 2)} / ${scale()}` : "—",
        hint: "Note moyenne des évaluations enregistrées",
      }) +
      UI.kpi({
        icon: "#i-check",
        tone: "green",
        label: "Finalisées",
        value: App.fmt.num(completed),
        hint: `${App.fmt.num(Math.max(0, total - completed))} brouillon(s) en cours`,
      }) +
      UI.kpi({
        icon: "#i-users",
        tone: "sky",
        label: "Collaborateurs évalués",
        value: App.fmt.num(unique),
        hint: `${App.fmt.num((App.state.employees || []).length)} fiche(s) employé(s) au total`,
      });
  }

  /* ---------------- Filtres ---------------- */
  function filtersHtml(list) {
    const periodOpts = ['<option value="all">Toutes les périodes</option>']
      .concat(
        periods().map(
          (p) =>
            `<option value="${esc(p)}"${state.period === p ? " selected" : ""}>${esc(p)}</option>`
        )
      )
      .join("");
    const empOpts = ['<option value="all">Tous les employés</option>']
      .concat(
        (App.state.employees || []).map(
          (e) =>
            `<option value="${e.id}"${String(state.employee) === String(e.id) ? " selected" : ""}>${esc(
              `${e.first_name} ${e.last_name}`
            )}</option>`
        )
      )
      .join("");
    const statusOpts = ['<option value="all">Tous les statuts</option>']
      .concat(
        Object.keys(App.labels.evaluation).map(
          (k) =>
            `<option value="${k}"${state.status === k ? " selected" : ""}>${esc(
              App.labels.evaluation[k][0]
            )}</option>`
        )
      )
      .join("");
    const dirty =
      state.search || state.status !== "all" || state.period !== "all" || state.employee !== "all";

    return `
      <div class="filters">
        <div class="search-inline">
          ${ico("#i-search")}
          <input type="search" id="ev-search" placeholder="Employé, période, évaluateur…" value="${esc(
            state.search
          )}"/>
        </div>
        <select id="ev-status">${statusOpts}</select>
        <select id="ev-period">${periodOpts}</select>
        <select id="ev-employee">${empOpts}</select>
        ${dirty ? `<button class="btn btn-sm btn-ghost" data-act="reset">Réinitialiser</button>` : ""}
        <span class="muted small" style="margin-left:auto">${App.fmt.num(list.length)} résultat(s)</span>
      </div>`;
  }

  function bindFilters(el) {
    const search = el.querySelector("#ev-search");
    if (search) {
      let t = null;
      search.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.search = search.value;
          Router.render();
          let tries = 0;
          const refocus = () => {
            const box = document.getElementById("ev-search");
            if (box) {
              box.focus();
              box.setSelectionRange(box.value.length, box.value.length);
            } else if (tries++ < 40) setTimeout(refocus, 30);
          };
          setTimeout(refocus, 30);
        }, 300);
      });
    }
    const bind = (id, key) => {
      const sel = el.querySelector(id);
      if (sel) sel.onchange = () => { state[key] = sel.value; Router.render(); };
    };
    bind("#ev-status", "status");
    bind("#ev-period", "period");
    bind("#ev-employee", "employee");
    const reset = el.querySelector('[data-act="reset"]');
    if (reset)
      reset.onclick = () => {
        state.search = "";
        state.status = "all";
        state.period = "all";
        state.employee = "all";
        Router.render();
      };
  }

  /* ---------------- Onglet : liste ---------------- */
  function paintList(el, list) {
    const panel = el.querySelector("#ev-panel");
    panel.innerHTML = UI.card({
      tight: true,
      actions: `
        <button class="btn btn-sm" data-act="refresh">${ico("#i-refresh")} Actualiser</button>
        <button class="btn btn-sm btn-primary" data-act="new">${ico("#i-plus")} Nouvelle évaluation</button>`,
      body: `
        <div class="card-body" style="padding-bottom:0">${filtersHtml(list)}</div>
        <div id="ev-table" style="margin-top:14px"></div>`,
      foot: `<span class="muted small">Cliquez sur une ligne pour consulter le détail de l'évaluation.</span>`,
    });

    UI.table(el.querySelector("#ev-table"), {
      rows: list,
      rowKey,
      resetSort: true,
      sort: { key: "created_at", dir: "desc" },
      columns: [
        {
          key: "employee_name",
          label: "Employé",
          sortValue: (r) => empName(r),
          render: (r) =>
            `<div class="person">
              ${UI.avatar(empName(r), r.photo_color, "sm")}
              <div class="grow">
                <div class="p-name">${esc(empName(r))}</div>
                <div class="p-sub">${esc(r.matricule || "")}${r.job_title ? " · " + esc(r.job_title) : ""}</div>
              </div>
            </div>`,
        },
        {
          key: "department",
          label: "Service",
          render: (r) => esc(r.department || "—"),
        },
        {
          key: "period",
          label: "Période",
          render: (r) => `<span class="badge indigo plain">${esc(r.period || "—")}</span>`,
        },
        {
          key: "evaluator_name",
          label: "Évaluateur",
          render: (r) => esc(r.evaluator_name || "—"),
        },
        {
          key: "global_rating",
          label: "Note globale",
          align: "right",
          render: (r) => UI.score(r.global_rating, scale()),
        },
        {
          key: "status",
          label: "Statut",
          render: (r) => App.labels.badge(App.labels.evaluation, r.status),
        },
        {
          key: "created_at",
          label: "Créée le",
          render: (r) => `<span class="small">${App.fmt.date(r.created_at)}</span>`,
        },
        {
          key: "actions",
          label: "",
          sortable: false,
          cls: "actions-cell",
          render: (r) => `
            <button class="icon-btn" data-act="view" data-id="${r.id}" title="Consulter">${ico("#i-eye")}</button>
            <button class="icon-btn" data-act="edit" data-id="${r.id}" title="Modifier">${ico("#i-edit")}</button>
            <button class="icon-btn danger" data-act="delete" data-id="${r.id}" title="Supprimer">${ico("#i-trash")}</button>`,
        },
      ],
      empty: {
        icon: "#i-clipboard",
        title: rows.length ? "Aucune évaluation ne correspond au filtre" : "Aucune évaluation",
        text: rows.length
          ? "Modifiez les filtres pour afficher d'autres résultats."
          : "Créez votre première évaluation pour noter les performances de vos collaborateurs.",
        action: "Nouvelle évaluation",
      },
      onEmptyAction: () => openForm(null),
      onRowClick: (r) => openDetail(r),
    });

    const table = el.querySelector("#ev-table");
    table.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const row = rows.find((r) => Number(r.id) === Number(btn.dataset.id));
      if (!row) return;
      if (btn.dataset.act === "view") openDetail(row);
      else if (btn.dataset.act === "edit") openForm(row);
      else if (btn.dataset.act === "delete") await remove(row);
    });

    panel.querySelector('[data-act="new"]').onclick = () => openForm(null);
    panel.querySelector('[data-act="refresh"]').onclick = () => {
      Router.render();
      App.toast("Données actualisées", "success");
    };
  }

  /* ---------------- Onglet : historique ---------------- */
  function paintHistory(el, list) {
    const panel = el.querySelector("#ev-panel");
    const groups = aggregateByEmployee(list).sort((a, b) => b.avg - a.avg);

    panel.innerHTML = UI.card({
      tight: true,
      subtitle:
        "Moyenne et nombre d'évaluations par collaborateur (données filtrées ci-dessus)",
      body: `<div id="ev-history" style="margin-top:4px"></div>`,
      foot: `<span class="muted small">Cliquez sur une ligne pour afficher l'historique complet du collaborateur.</span>`,
    });

    UI.table(el.querySelector("#ev-history"), {
      rows: groups,
      rowKey: (r) => "e" + r.employee_id,
      resetSort: true,
      sort: { key: "avg", dir: "desc" },
      columns: [
        {
          key: "employee_name",
          label: "Employé",
          render: (r) =>
            `<div class="person">
              ${UI.avatar(r.employee_name, r.photo_color, "sm")}
              <div class="grow">
                <div class="p-name">${esc(r.employee_name)}</div>
                <div class="p-sub">${esc(r.job_title || "")}${r.department ? " · " + esc(r.department) : ""}</div>
              </div>
            </div>`,
        },
        {
          key: "n",
          label: "Évaluations",
          align: "right",
          render: (r) => App.fmt.num(r.n),
        },
        {
          key: "completed",
          label: "Finalisées",
          align: "right",
          render: (r) =>
            `${App.fmt.num(r.completed)} <span class="muted small">/ ${App.fmt.num(r.n)}</span>`,
        },
        {
          key: "avg",
          label: "Moyenne",
          align: "right",
          render: (r) => UI.score(r.avg, scale()),
        },
        {
          key: "last_period",
          label: "Dernière période",
          render: (r) => `<span class="badge indigo plain">${esc(r.last_period || "—")}</span>`,
        },
        {
          key: "actions",
          label: "",
          sortable: false,
          cls: "actions-cell",
          render: (r) => `
            <button class="icon-btn" data-act="history" data-id="${r.employee_id}" title="Voir l'historique">${ico(
            "#i-eye"
          )}</button>
            <button class="icon-btn" data-act="new-for" data-id="${r.employee_id}" title="Nouvelle évaluation">${ico(
            "#i-plus"
          )}</button>`,
        },
      ],
      empty: {
        icon: "#i-clipboard",
        title: "Aucun historique",
        text: "L'historique apparaît dès la première évaluation enregistrée.",
        action: "Nouvelle évaluation",
      },
      onEmptyAction: () => openForm(null),
      onRowClick: (r) => openEmployeeHistory(r),
    });

    const box = el.querySelector("#ev-history");
    box.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const empId = Number(btn.dataset.id);
      const group = groups.find((g) => Number(g.employee_id) === empId);
      if (!group) return;
      if (btn.dataset.act === "history") openEmployeeHistory(group);
      else openForm(null, empId);
    });
  }

  /* ---------------- Onglet : synthèse ---------------- */
  function paintSummary(el) {
    const panel = el.querySelector("#ev-panel");
    const byPeriod = (stats && stats.by_period) || [];
    const byDept = (stats && stats.by_department) || [];
    const top = (stats && stats.top) || [];
    const max = scale();

    const periodBars = byPeriod.length
      ? byPeriod
          .map((r) =>
            UI.bar(r.period || "—", Number(r.avg_rating) || 0, max, {
              display: `${App.fmt.num(r.avg_rating, 2)} / ${max} (${App.fmt.num(r.n)})`,
              tone: "teal",
            })
          )
          .join("")
      : UI.empty({ icon: "#i-trend", title: "Aucune période", text: "Enregistrez des évaluations pour voir les moyennes." });

    const deptBars = byDept.length
      ? byDept
          .map((r) =>
            UI.bar(r.department || "Non affecté", Number(r.avg_rating) || 0, max, {
              display: `${App.fmt.num(r.avg_rating, 2)} / ${max} (${App.fmt.num(r.n)})`,
              tone: "green",
            })
          )
          .join("")
      : UI.empty({ icon: "#i-building", title: "Aucune donnée", text: "Les moyennes par service s'affichent dès la première évaluation." });

    const topList = top.length
      ? top
          .map((t, i) =>
            UI.listItem({
              avatar: `<span class="avatar sm" style="background:${
                ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"][i % 5]
              }">${i + 1}</span>`,
              title: esc(t.employee_name || "—"),
              sub: `Période ${esc(t.period || "—")}`,
              right: UI.score(t.global_rating, max),
            })
          )
          .join("")
      : `<p class="muted small">Aucune évaluation enregistrée.</p>`;

    panel.innerHTML = `
      <div class="stack" style="gap:16px">
        <div class="grid grid-2">
          ${UI.card({
            title: "Moyenne par période",
            subtitle: `Note moyenne sur ${max}`,
            body: periodBars,
          })}
          ${UI.card({
            title: "Moyenne par service",
            subtitle: `Note moyenne sur ${max}`,
            body: deptBars,
          })}
        </div>
        ${UI.card({
          title: "Meilleures évaluations",
          subtitle: "Les 5 notes globales les plus élevées",
          tight: true,
          body: `<div style="padding:6px 10px">${topList}</div>`,
        })}
      </div>`;
  }

  /* ---------------- Détail d'une évaluation ---------------- */
  function criteriaHtml(list) {
    if (!list.length) {
      return `<p class="muted small">Aucun critère renseigné pour cette évaluation.</p>`;
    }
    return list
      .map(
        (c) => `
        <div class="row-between wrap" style="gap:10px;padding:9px 0;border-bottom:1px dashed var(--border)">
          <span class="grow" style="font-weight:640;min-width:180px">${esc(c.label || "Critère")}</span>
          <span class="row" style="gap:10px">
            ${UI.stars(c.rating)}
            <span class="badge ${Number(c.rating) >= 4 ? "green" : Number(c.rating) <= 2 ? "red" : "amber"} plain">${esc(
          ratingText(c.rating)
        )}</span>
            <strong style="min-width:26px;text-align:right">${App.fmt.num(c.rating, 0)}</strong>
          </span>
        </div>
        ${c.comment ? `<p class="small muted" style="padding:2px 0 8px">💬 ${esc(c.comment)}</p>` : ""}`
      )
      .join("");
  }

  function textBlock(title, value) {
    if (!value || !String(value).trim()) return "";
    return `
      <p class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:16px 0 6px">${esc(
        title
      )}</p>
      <p class="small" style="line-height:1.6;white-space:pre-wrap">${esc(value)}</p>`;
  }

  function openDetail(r) {
    const criteria = parseCriteria(r.criteria_json);
    const m = UI.openModal({
      title: `Évaluation — ${empName(r)}`,
      subtitle: `${esc(r.period || "Période non précisée")}${
        r.department ? ` · ${esc(r.department)}` : ""
      }`,
      size: "lg",
      body: `
        ${UI.kv([
          ["Employé", esc(empName(r))],
          ["Matricule", esc(r.matricule || "—")],
          ["Service", esc(r.department || "—")],
          ["Poste", esc(r.job_title || "—")],
          ["Période", esc(r.period || "—")],
          ["Évaluateur", esc(r.evaluator_name || "—")],
          ["Note globale", `${UI.score(r.global_rating, scale())} <span class="muted small">(${esc(
            ratingText(r.global_rating)
          )})</span>`],
          ["Statut", App.labels.badge(App.labels.evaluation, r.status)],
          ["Créée le", App.fmt.date(r.created_at)],
          ["Finalisée le", r.completed_at ? App.fmt.dateTime(r.completed_at) : "—"],
        ])}
        <p class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:18px 0 6px">Grille de critères</p>
        ${criteriaHtml(criteria)}
        ${textBlock("Points forts", r.strengths)}
        ${textBlock("Axes d'amélioration", r.improvements)}
        ${textBlock("Objectifs fixés", r.goals)}
        ${textBlock("Commentaires", r.comments)}`,
      footer: `
        <span class="left">${criteria.length ? `${criteria.length} critère(s) · moyenne ${App.fmt.num(
        avgCriteria(criteria),
        2
      )} / ${scale()}` : "Aucun critère"}</span>
        <button class="btn" type="button" data-act="edit">${ico("#i-edit")} Modifier</button>
        <button class="btn btn-danger" type="button" data-act="del">${ico("#i-trash")} Supprimer</button>`,
    });

    m.foot.querySelector('[data-act="edit"]').onclick = () => {
      m.close();
      openForm(r);
    };
    m.foot.querySelector('[data-act="del"]').onclick = async () => {
      m.close();
      await remove(r);
    };
  }

  function openEmployeeHistory(group) {
    const list = (group.rows || []).slice().sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );
    const m = UI.openModal({
      title: `Historique — ${group.employee_name}`,
      subtitle: `${App.fmt.num(list.length)} évaluation(s) · moyenne ${App.fmt.num(
        group.avg,
        2
      )} / ${scale()}`,
      size: "lg",
      body: list.length
        ? list
            .map(
              (r) => `
              <div class="list-item" data-ev="${r.id}" style="cursor:pointer">
                <span class="avatar sm" style="background:#4f46e5">${ico("#i-clipboard")}</span>
                <div class="li-main">
                  <div class="li-title">${esc(r.period || "Période non précisée")}</div>
                  <div class="li-sub">${App.fmt.date(r.created_at)}${
                r.evaluator_name ? " · " + esc(r.evaluator_name) : ""
              }${parseCriteria(r.criteria_json).length ? ` · ${parseCriteria(r.criteria_json).length} critère(s)` : ""}</div>
                </div>
                <div class="li-right">
                  ${UI.score(r.global_rating, scale())}
                  <div class="mt-8">${App.labels.badge(App.labels.evaluation, r.status)}</div>
                </div>
              </div>`
            )
            .join("")
        : UI.empty({ icon: "#i-clipboard", title: "Aucune évaluation", text: "Ce collaborateur n'a pas encore été évalué." }),
      footer: `
        <span class="left">Cliquez sur une évaluation pour l'ouvrir</span>
        <button class="btn" type="button" data-act="close">Fermer</button>
        <button class="btn btn-primary" type="button" data-act="new">${ico("#i-plus")} Nouvelle évaluation</button>`,
    });

    m.foot.querySelector('[data-act="close"]').onclick = () => m.close();
    m.foot.querySelector('[data-act="new"]').onclick = () => {
      m.close();
      openForm(null, group.employee_id);
    };
    m.body.addEventListener("click", (e) => {
      const item = e.target.closest("[data-ev]");
      if (!item) return;
      const row = rows.find((x) => Number(x.id) === Number(item.dataset.ev));
      if (!row) return;
      m.close();
      openDetail(row);
    });
  }

  /* ---------------- Formulaire ---------------- */
  function ratingOptions(selected, max) {
    const opts = [];
    for (let i = 1; i <= max; i++) {
      opts.push(
        `<option value="${i}"${Number(selected) === i ? " selected" : ""}>${i} — ${esc(
          RATING_TEXT[i] || ""
        )}</option>`
      );
    }
    return opts.join("");
  }

  function criterionRow(label, existing, editable) {
    const rating = existing ? Number(existing.rating) || 3 : 3;
    const comment = existing && existing.comment ? existing.comment : "";
    const labelHtml = editable
      ? `<input type="text" data-role="label" value="${esc(label || "")}" placeholder="Nom du critère" style="height:34px;min-width:180px;flex:1"/>`
      : `<span data-role="label-text" style="flex:1;min-width:180px;font-weight:640;font-size:13.2px">${esc(
          label
        )}</span>`;
    return `
      <div class="row wrap" style="gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--border)" data-crit="${esc(
        label || ""
      )}">
        ${labelHtml}
        <select data-role="rating" style="height:34px;width:auto;min-width:160px">${ratingOptions(
          rating,
          scale()
        )}</select>
        <input type="text" data-role="comment" value="${esc(comment)}" placeholder="Commentaire (facultatif)" style="height:34px;flex:1;min-width:170px"/>
        <button type="button" class="icon-btn danger" data-act="rm-crit" title="Retirer ce critère">${ico(
          "#i-x"
        )}</button>
      </div>`;
  }

  function criteriaGridHtml(values) {
    const existing = parseCriteria(values && values.criteria_json);
    let rowsHtml = "";
    if (existing.length) {
      /* On conserve exactement les critères déjà enregistrés. */
      rowsHtml = existing
        .filter((c) => c && c.label)
        .map((c) => criterionRow(c.label, c, false))
        .join("");
    } else {
      /* Nouvelle évaluation : grille standard issue des paramètres. */
      rowsHtml = criteriaLabels().map((l) => criterionRow(l, undefined, false)).join("");
    }
    if (!rowsHtml) rowsHtml = criterionRow("", undefined, true);

    return `
      <div class="field" data-field="criteria">
        <div class="row-between" style="margin-bottom:6px">
          <label style="margin:0">Grille de critères (note de 1 à ${scale()})</label>
          <span class="small muted">Moyenne calculée : <strong id="crit-avg">—</strong></span>
        </div>
        <div id="criteria-grid">${rowsHtml}</div>
        <div class="row-between" style="margin-top:9px">
          <button type="button" class="btn btn-sm" data-act="add-crit">${ico("#i-plus")} Ajouter un critère</button>
          <span class="help">La note globale est recalculée automatiquement (moyenne des critères).</span>
        </div>
      </div>`;
  }

  function readCriteria(m) {
    const out = [];
    m.body.querySelectorAll("#criteria-grid [data-crit]").forEach((el) => {
      const labelInput = el.querySelector('[data-role="label"]');
      const labelText = el.querySelector('[data-role="label-text"]');
      const label = labelInput
        ? labelInput.value.trim()
        : labelText
        ? labelText.textContent.trim()
        : el.dataset.crit || "";
      if (!label) return;
      const ratingEl = el.querySelector('[data-role="rating"]');
      const commentEl = el.querySelector('[data-role="comment"]');
      out.push({
        label,
        rating: Math.min(scale(), Math.max(1, Number(ratingEl ? ratingEl.value : 3) || 3)),
        comment: commentEl ? commentEl.value.trim() : "",
      });
    });
    return out;
  }

  function updateGridAvg(m) {
    const box = m.body.querySelector("#crit-avg");
    if (!box) return;
    const list = readCriteria(m);
    box.textContent = list.length ? `${App.fmt.num(avgCriteria(list), 2)} / ${scale()}` : "—";
  }

  function bindCriteriaGrid(m) {
    const grid = m.body.querySelector("#criteria-grid");
    if (!grid) return;
    grid.addEventListener("click", (e) => {
      const rm = e.target.closest('[data-act="rm-crit"]');
      if (rm) {
        rm.closest("[data-crit]").remove();
        updateGridAvg(m);
        return;
      }
    });
    grid.addEventListener("change", () => updateGridAvg(m));
    grid.addEventListener("input", () => updateGridAvg(m));
    const addBtn = m.body.querySelector('[data-act="add-crit"]');
    if (addBtn) {
      addBtn.onclick = () => {
        grid.insertAdjacentHTML("beforeend", criterionRow("", undefined, true));
        const last = grid.lastElementChild;
        const input = last && last.querySelector('[data-role="label"]');
        if (input) input.focus();
        updateGridAvg(m);
      };
    }
    updateGridAvg(m);
  }

  function openForm(row, presetEmployee) {
    const currentEmployee = row ? row.employee_id : presetEmployee || "";
    const m = UI.form({
      title: row ? "Modifier l'évaluation" : "Nouvelle évaluation",
      subtitle: row
        ? `${esc(empName(row))} · ${esc(row.period || "")}`
        : "Notez les performances d'un collaborateur sur la période",
      size: "lg",
      values: row || { period: App.fmt.today().slice(0, 4), status: "draft" },
      successMessage: row ? "Évaluation mise à jour" : "Évaluation créée",
      leftFooter: row
        ? `<span class="left"><button class="btn btn-danger" type="button" data-act="del">${ico(
            "#i-trash"
          )} Supprimer</button></span>`
        : "",
      fields: [
        { type: "section", label: "Évaluation" },
        {
          name: "employee_id",
          label: "Employé",
          type: "select",
          required: true,
          col: 6,
          options: (App.state.employees || []).map((e) => ({
            value: e.id,
            label: `${e.first_name} ${e.last_name}${e.job_title ? ` — ${e.job_title}` : ""}`,
          })),
          placeholder: "— Sélectionner —",
          value: currentEmployee,
        },
        {
          name: "period",
          label: "Période évaluée",
          col: 3,
          placeholder: "ex. 2026 S1",
          help: "Année, semestre ou mois évalué.",
        },
        {
          name: "status",
          label: "Statut",
          type: "select",
          col: 3,
          options: Object.keys(App.labels.evaluation).map((k) => ({
            value: k,
            label: App.labels.evaluation[k][0],
          })),
          value: row ? row.status : "draft",
        },
        {
          name: "evaluator_name",
          label: "Évaluateur",
          col: 6,
          value:
            row && row.evaluator_name
              ? row.evaluator_name
              : (App.state.user && (App.state.user.full_name || App.state.user.username)) || "",
        },
        { type: "section", label: "Grille de notation" },
        {
          type: "html",
          name: "criteria",
          col: 12,
          html: (values) => criteriaGridHtml(values),
        },
        { type: "section", label: "Bilan de la période" },
        {
          name: "strengths",
          label: "Points forts",
          type: "textarea",
          col: 6,
          rows: 3,
          placeholder: "Qualités constatées, réussites…",
        },
        {
          name: "improvements",
          label: "Axes d'amélioration",
          type: "textarea",
          col: 6,
          rows: 3,
          placeholder: "Points à progresser, difficultés…",
        },
        {
          name: "goals",
          label: "Objectifs fixés",
          type: "textarea",
          col: 6,
          rows: 3,
          placeholder: "Objectifs pour la prochaine période…",
        },
        {
          name: "comments",
          label: "Commentaires",
          type: "textarea",
          col: 6,
          rows: 3,
          placeholder: "Observations complémentaires…",
        },
      ],
      onSubmit: async (v) => {
        const criteria = readCriteria(m);
        const empId = v.employee_id ? Number(v.employee_id) : 0;
        if (!empId) throw new Error("Sélectionnez l'employé à évaluer.");
        const data = {
          employee_id: empId,
          period: String(v.period || "").trim(),
          evaluator_name: String(v.evaluator_name || "").trim(),
          status: v.status === "completed" ? "completed" : "draft",
          criteria_json: JSON.stringify(criteria),
          global_rating: avgCriteria(criteria),
          strengths: String(v.strengths || "").trim(),
          improvements: String(v.improvements || "").trim(),
          goals: String(v.goals || "").trim(),
          comments: String(v.comments || "").trim(),
        };
        if (!criteria.length && !data.global_rating) {
          throw new Error("Ajoutez au moins un critère avec une note.");
        }
        if (row) data.id = row.id;
        try {
          await App.api("save_evaluation", { data });
        } catch (err) {
          throw new Error(err.message || "Enregistrement impossible.");
        }
        await reload();
        Router.render();
      },
    });

    bindCriteriaGrid(m);

    const del = m.foot.querySelector('[data-act="del"]');
    if (del) {
      del.onclick = async () => {
        m.close();
        await remove(row);
      };
    }
    return m;
  }

  async function remove(row) {
    const ok = await UI.confirm({
      title: "Supprimer l'évaluation",
      messageTitle: `Supprimer l'évaluation de ${esc(empName(row))} ?`,
      message: `Période ${esc(row.period || "—")} · cette action est définitive.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await App.api("delete_evaluation", { id: row.id });
      App.toast("Évaluation supprimée", "success");
      await reload();
      Router.render();
    } catch (err) {
      /* notification déjà affichée par App.api */
    }
  }

  /* ---------------- Chargement ---------------- */
  async function reload() {
    const [list, st] = await Promise.all([safe("list_evaluations", {}), safe("evaluation_stats")]);
    rows = list || [];
    stats = st || null;
  }

  /* ---------------- Vue ---------------- */
  Views.evaluations = {
    title: "Évaluations",
    subtitle: "Notes de performance et suivi des collaborateurs",

    openNew: (employeeId) => openForm(null, employeeId),

    render: async (el, params) => {
      if (params && params.tab && TABS.some((t) => t.id === params.tab)) state.tab = params.tab;
      await reload();

      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div id="ev-kpis" class="grid grid-4"></div>
          <div class="row-between wrap">
            ${UI.tabs(
              TABS.map((t) => ({
                id: t.id,
                label: t.label,
                count:
                  t.id === "list"
                    ? rows.length
                    : t.id === "history"
                    ? aggregateByEmployee(rows).length
                    : null,
              })),
              state.tab
            )}
            <button class="btn btn-primary" id="ev-new" type="button">${ico("#i-plus")} Nouvelle évaluation</button>
          </div>
          <div id="ev-panel"></div>
        </div>`;

      paintKpis(el);
      UI.bindTabs(el, (id) => {
        state.tab = id;
        Router.render();
      });
      el.querySelector("#ev-new").onclick = () => openForm(null);

      const list = filtered();
      if (state.tab === "history") paintHistory(el, list);
      else if (state.tab === "summary") paintSummary(el);
      else {
        paintList(el, list);
        bindFilters(el);
      }
    },
  };
})();
