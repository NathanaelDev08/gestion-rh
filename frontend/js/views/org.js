/* ============================================================
   Gestion RH — Organigramme, services et statistiques d'effectif
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  /* État de la vue : conservé d'un rendu à l'autre. */
  const state = { tab: "chart", mode: "tree" };

  const TABS = [
    { id: "chart", label: "Organigramme" },
    { id: "services", label: "Services" },
    { id: "stats", label: "Statistiques" },
  ];

  const esc = (v) => App.esc(v);
  const fullName = (p) => `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Sans nom";

  /* Les tons réellement disponibles pour UI.bar. */
  function barTone(tone) {
    return { green: "green", amber: "amber", teal: "teal", purple: "purple" }[tone] || "";
  }

  function bars(rows, labelOf, toneOf, unit) {
    const values = (rows || []).map((r) => Number(r.n) || 0);
    const max = Math.max(1, ...values);
    return (rows || [])
      .map((r, i) =>
        UI.bar(labelOf(r, i), values[i], max, {
          display: `${App.fmt.num(values[i])}${unit || ""}`,
          tone: barTone(toneOf ? toneOf(r, i) : ""),
        })
      )
      .join("");
  }

  /* ================= Arborescence ================= */

  function nodeHtml(p, isRoot, reports) {
    const who = fullName(p);
    const dept = p.department_id ? App.deptName(p.department_id) : "";
    return `<div class="org-node${isRoot ? " root" : ""}" data-emp="${esc(p.id)}" role="button" tabindex="0"
        title="Ouvrir la fiche de ${esc(who)}">
      <div style="display:flex;justify-content:center;margin-bottom:6px">${UI.avatar(who, p.photo_color, "sm")}</div>
      <div class="p-name">${esc(who)}</div>
      <div class="p-sub">${esc(p.job_title || p.title || "Poste à définir")}</div>
      ${dept ? `<div class="p-sub">${esc(dept)}</div>` : ""}
      ${reports ? `<div class="p-sub"><strong>${App.fmt.num(reports)}</strong> collaborateur(s)</div>` : ""}
    </div>`;
  }

  function branchHtml(index, person, depth, visited) {
    if (visited.has(person.id)) return `<div class="org-col">${nodeHtml(person, false, 0)}</div>`;
    visited.add(person.id);
    const kids = index[person.id] || [];
    return `<div class="org-col">${nodeHtml(person, depth === 0, kids.length)}${
      kids.length
        ? `<div class="org-children">${kids
            .map((k) => branchHtml(index, k, depth + 1, visited))
            .join("")}</div>`
        : ""
    }</div>`;
  }

  function treeHtml(people) {
    const byId = {};
    people.forEach((p) => (byId[p.id] = p));
    const index = {};
    const roots = [];
    people.forEach((p) => {
      if (p.manager_id && byId[p.manager_id]) {
        (index[p.manager_id] = index[p.manager_id] || []).push(p);
      } else {
        roots.push(p);
      }
    });
    if (!roots.length && people.length) roots.push(people[0]);
    const visited = new Set();
    return `<div class="org-tree" style="flex-direction:row;gap:26px;align-items:flex-start;justify-content:center;flex-wrap:wrap">
        ${roots.map((r) => branchHtml(index, r, 0, visited)).join("")}
      </div>`;
  }

  function memberRow(m) {
    return `<div class="list-item" data-emp="${esc(m.id)}" style="padding:9px 6px;cursor:pointer" title="Ouvrir la fiche">
        ${UI.avatar(fullName(m), m.photo_color, "sm")}
        <div class="li-main">
          <div class="li-title">${esc(fullName(m))}</div>
          <div class="li-sub">${esc(m.job_title || "Poste à définir")}</div>
        </div>
        <div class="li-right">${App.labels.badge(App.labels.status, m.status)}</div>
      </div>`;
  }

  function deptsHtml(chart) {
    const depts = (chart && chart.departments) || [];
    const people = (chart && chart.people) || [];
    if (!depts.length) {
      return UI.empty({
        icon: "#i-building",
        title: "Aucun service enregistré",
        text: "Créez vos services pour consulter la structure par département.",
        action: "Créer un service",
      });
    }
    const orphans = people.filter((p) => !p.department_id);
    const cards = depts
      .map((d) => {
        const members = people.filter((p) => p.department_id === d.id);
        const mgr = members.find((m) => m.id === d.manager_id);
        return UI.card({
          title: `${esc(d.name)}${d.code ? ` <span class="badge gray plain">${esc(d.code)}</span>` : ""}`,
          subtitle: d.employee_count
            ? `${App.fmt.num(d.employee_count)} collaborateur(s)`
            : "Aucun collaborateur rattaché",
          body: `
            <div class="row" style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:6px">
              ${
                d.manager_name
                  ? `${UI.avatar(d.manager_name, mgr ? mgr.photo_color : null, "sm")}
                     <div class="grow"><div class="small muted">Responsable</div>
                     <div style="font-weight:650">${esc(d.manager_name)}</div></div>`
                  : `<span class="muted small">Aucun responsable désigné</span>`
              }
              <div class="right">
                <div class="small muted">Budget</div>
                <div style="font-weight:700">${App.fmt.money(d.budget)}</div>
              </div>
            </div>
            ${members.length ? members.map(memberRow).join("") : `<p class="muted small">Aucun collaborateur dans ce service.</p>`}`,
        });
      })
      .join("");

    const orphanCard = orphans.length
      ? UI.card({
          title: `Non affectés <span class="badge amber plain">${orphans.length}</span>`,
          subtitle: "Collaborateurs sans service attribué",
          body: orphans.map(memberRow).join(""),
        })
      : "";

    return `<div class="grid grid-3">${cards}</div>${orphanCard ? `<div class="mt-8">${orphanCard}</div>` : ""}`;
  }

  function paintChart(panel, chart) {
    const people = (chart && chart.people) || [];
    const depts = (chart && chart.departments) || App.state.departments || [];
    const modeSwitch = `<div class="pill-group">
        <button data-mode="tree" class="${state.mode === "tree" ? "active" : ""}">Arborescence</button>
        <button data-mode="dept" class="${state.mode === "dept" ? "active" : ""}">Par service</button>
      </div>`;

    if (!people.length) {
      panel.innerHTML = UI.card({
        title: "Organigramme",
        subtitle: "Hiérarchie des collaborateurs",
        actions: modeSwitch,
        body: UI.empty({
          icon: "#i-sitemap",
          title: "Aucun collaborateur à afficher",
          text:
            "L'organigramme se construit automatiquement à partir des fiches employés et de leur responsable hiérarchique. " +
            "Chargez un jeu de démonstration pour prévisualiser la structure.",
          action: "Charger des données de démonstration",
        }),
      });
      const seedBtn = panel.querySelector("[data-empty-action]");
      if (seedBtn) {
        seedBtn.onclick = async () => {
          try {
            await App.api("seed_demo");
            App.toast("Données de démonstration chargées", "success");
            await App.refresh();
          } catch (err) {
            /* l'erreur est déjà notifiée par App.api */
          }
        };
      }
      return;
    }

    const body =
      state.mode === "dept"
        ? deptsHtml(chart)
        : `<div style="overflow-x:auto;padding:6px 4px">${treeHtml(people)}</div>`;

    panel.innerHTML = UI.card({
      title: state.mode === "dept" ? "Structure par service" : "Organigramme hiérarchique",
      subtitle: `${App.fmt.num(people.length)} collaborateur(s) · ${App.fmt.num(depts.length)} service(s) · cliquez sur une personne pour ouvrir sa fiche`,
      actions: modeSwitch,
      body,
    });

    if (state.mode === "dept" && !(chart && chart.departments || []).length) {
      const btn = panel.querySelector("[data-empty-action]");
      if (btn) btn.onclick = () => openDeptForm(null);
    }
  }

  /* ================= Services ================= */

  function deptOptions(selected, excludeId) {
    const opts = ['<option value="">— Aucun —</option>'];
    App.state.departments.forEach((d) => {
      if (excludeId && d.id === excludeId) return;
      opts.push(
        `<option value="${esc(d.id)}"${String(selected) === String(d.id) ? " selected" : ""}>${esc(d.name)}</option>`
      );
    });
    return opts.join("");
  }

  function managerOptions(selected) {
    const opts = ['<option value="">— Aucun —</option>'];
    App.state.employees
      .filter((e) => e.status !== "terminated")
      .forEach((e) => {
        opts.push(
          `<option value="${esc(e.id)}"${String(selected) === String(e.id) ? " selected" : ""}>${esc(
            `${e.first_name} ${e.last_name}` + (e.job_title ? ` — ${e.job_title}` : "")
          )}</option>`
        );
      });
    return opts.join("");
  }

  function openDeptForm(row) {
    const values = row
      ? {
          name: row.name || "",
          code: row.code || "",
          description: row.description || "",
          manager_id: row.manager_id || "",
          parent_id: row.parent_id || "",
          budget: row.budget || 0,
        }
      : { budget: 0 };

    const handle = UI.form({
      title: row ? "Modifier le service" : "Nouveau service",
      subtitle: row
        ? `Service « ${row.name || ""} »`
        : "Renseignez les informations du service et son responsable.",
      fields: [
        { name: "name", label: "Nom du service", required: true, col: 7, placeholder: "ex. Ressources humaines" },
        { name: "code", label: "Code", col: 5, placeholder: "ex. RH" },
        { name: "description", label: "Description", type: "textarea", col: 12, rows: 3, placeholder: "Missions du service…" },
        { name: "manager_id", type: "select", label: "Responsable", col: 6, options: [], placeholder: "— Aucun —" },
        { name: "parent_id", type: "select", label: "Service parent", col: 6, options: [], placeholder: "— Aucun —" },
        { name: "budget", type: "number", label: "Budget annuel", col: 6, min: 0, step: "any" },
      ],
      values,
      submitLabel: row ? "Enregistrer" : "Créer le service",
      successMessage: row ? "Service mis à jour" : "Service créé",
      hint: "Le responsable apparaît dans l'organigramme et la vue « Par service ».",
      onSubmit: async (v) => {
        const data = {
          name: String(v.name || "").trim(),
          code: String(v.code || "").trim(),
          description: String(v.description || "").trim(),
          manager_id: v.manager_id === "" || v.manager_id === null ? null : Number(v.manager_id),
          parent_id: v.parent_id === "" || v.parent_id === null ? null : Number(v.parent_id),
          budget: Number(v.budget) || 0,
        };
        if (!data.name) throw "Le nom du service est obligatoire.";
        if (row) data.id = row.id;
        if (data.parent_id && data.parent_id === data.id) throw "Un service ne peut pas être son propre parent.";
        await App.api("save_department", { data });
        await App.loadDepartments();
        Router.render();
      },
    });

    // Les listes dépendantes de l'état courant sont injectées après ouverture.
    const mgrSel = handle.body.querySelector('[name="manager_id"]');
    if (mgrSel) mgrSel.innerHTML = managerOptions(values.manager_id);
    const parentSel = handle.body.querySelector('[name="parent_id"]');
    if (parentSel) parentSel.innerHTML = deptOptions(values.parent_id, row ? row.id : null);
    return handle;
  }

  async function removeDept(id) {
    const row = App.state.departments.find((d) => d.id === id);
    if (!row) return;
    const ok = await UI.confirm({
      title: "Supprimer le service",
      message:
        `Supprimer le service « ${App.esc(row.name)} » ?<br><br>` +
        "Les employés rattachés restent enregistrés mais perdent leur service.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await App.api("delete_department", { id });
      App.toast("Service supprimé", "success");
      await App.loadDepartments();
      Router.render();
    } catch (err) {
      /* déjà notifiée */
    }
  }

  function paintServices(panel) {
    const rows = App.state.departments || [];
    panel.innerHTML = UI.card({
      title: "Services & départements",
      subtitle: `${App.fmt.num(rows.length)} service(s) enregistré(s) · cliquez sur une ligne pour la modifier`,
      actions: `
        <button class="btn btn-sm" data-act="export"><svg class="ico"><use href="#i-download"/></svg> Exporter les employés</button>
        <button class="btn btn-sm btn-primary" data-act="new-dept"><svg class="ico"><use href="#i-plus"/></svg> Nouveau service</button>`,
      body: `<div id="dept-table"></div>`,
    });

    UI.table(panel.querySelector("#dept-table"), {
      columns: [
        {
          key: "code",
          label: "Code",
          render: (r) => `<span class="badge gray plain">${esc(r.code || "—")}</span>`,
        },
        {
          key: "name",
          label: "Service",
          render: (r) =>
            `<div style="font-weight:650">${esc(r.name)}</div>${
              r.description ? `<div class="small muted">${esc(String(r.description).slice(0, 70))}</div>` : ""
            }`,
        },
        {
          key: "manager_name",
          label: "Responsable",
          render: (r) => {
            if (!r.manager_name) return `<span class="muted">—</span>`;
            const emp = App.state.employees.find((e) => e.id === r.manager_id);
            return `<div class="row" style="gap:8px">${UI.avatar(
              r.manager_name,
              emp ? emp.photo_color : null,
              "sm"
            )}<span>${esc(r.manager_name)}</span></div>`;
          },
        },
        {
          key: "employee_count",
          label: "Effectif",
          align: "right",
          render: (r) => App.fmt.num(r.employee_count || 0),
        },
        {
          key: "budget",
          label: "Budget",
          align: "right",
          render: (r) => App.fmt.money(r.budget || 0),
        },
        {
          key: "_actions",
          label: "Actions",
          sortable: false,
          cls: "actions-cell",
          render: (r) => `
            <button class="icon-btn" data-act="edit-dept" data-action="edit" data-id="${esc(r.id)}" title="Modifier"><svg class="ico"><use href="#i-edit"/></svg></button>
            <button class="icon-btn danger" data-act="del-dept" data-action="del" data-id="${esc(r.id)}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`,
        },
      ],
      rows,
      rowKey: (r) => r.id,
      sort: { key: "name", dir: "asc" },
      onRowClick: (r) => openDeptForm(r),
      empty: {
        icon: "#i-building",
        title: "Aucun service",
        text: "Organisez vos équipes en créant votre premier service.",
        action: "Créer un service",
      },
      onEmptyAction: () => openDeptForm(null),
    });
  }

  /* ================= Statistiques ================= */

  function paintStats(panel, stats, people) {
    if (!stats) {
      panel.innerHTML = UI.alert(
        "danger",
        "<strong>Statistiques indisponibles.</strong><br>Les données d'effectif n'ont pas pu être calculées. Utilisez le bouton « Actualiser »."
      );
      return;
    }

    const actives = (App.state.employees || []).filter((e) => e.status !== "terminated");
    const mass = actives.reduce((sum, e) => sum + (Number(e.base_salary) || 0), 0);
    const byStatus = stats.by_status || [];
    const byDept = stats.by_department || [];
    const byContract = stats.by_contract || [];
    const fiches = byStatus.reduce((sum, s) => sum + (Number(s.n) || 0), 0);

    const statusLabel = (r) => (App.labels.status[r.status] || [r.status || "—"])[0];
    const statusTone = (r) => (App.labels.status[r.status] || ["", "gray"])[1];
    const contractLabel = (r) => (App.labels.contract[r.contract_type] || [r.contract_type || "—"])[0];
    const contractTone = (r) => (App.labels.contract[r.contract_type] || ["", "gray"])[1];

    panel.innerHTML = `
      <div class="stack" style="gap:16px">
        <div class="grid grid-4">
          ${UI.kpi({
            icon: "#i-users",
            label: "Effectif en poste",
            value: App.fmt.num(actives.length),
            hint: `${App.fmt.num(byDept.length)} service(s) rattaché(s)`,
          })}
          ${UI.kpi({
            icon: "#i-user-check",
            tone: "green",
            label: "Fiches employés",
            value: App.fmt.num(fiches),
            hint: "Toutes situations confondues",
          })}
          ${UI.kpi({
            icon: "#i-sitemap",
            tone: "sky",
            label: "Encadrants",
            value: App.fmt.num(
              new Set((people || []).filter((p) => p.manager_id).map((p) => p.manager_id)).size
            ),
            hint: "Responsables d'au moins un collaborateur",
          })}
          ${UI.kpi({
            icon: "#i-wallet",
            tone: "teal",
            label: "Masse salariale",
            value: App.fmt.moneyShort(mass),
            hint: "Somme des salaires de base mensuels",
          })}
        </div>

        <div class="grid grid-3">
          ${UI.card({
            title: "Répartition par statut",
            subtitle: "Toutes les fiches employés",
            body: byStatus.length
              ? bars(byStatus, statusLabel, statusTone)
              : UI.empty({ icon: "#i-users", title: "Aucune donnée" }),
          })}
          ${UI.card({
            title: "Répartition par service",
            subtitle: "Effectif en poste",
            body: byDept.length
              ? bars(byDept, (r) => r.department, () => "teal")
              : UI.empty({ icon: "#i-building", title: "Aucun service", text: "Créez des services depuis l'onglet Services." }),
          })}
          ${UI.card({
            title: "Répartition contractuelle",
            subtitle: "Types de contrat",
            body: byContract.length
              ? bars(byContract, contractLabel, contractTone)
              : UI.empty({ icon: "#i-file", title: "Aucun contrat" }),
          })}
        </div>

        <div class="grid grid-2">
          ${UI.card({
            title: "Détail des statuts",
            subtitle: "Volumes et parts relatives",
            tight: true,
            body: `<div style="padding:16px 18px">${
              byStatus.length
                ? byStatus
                    .map((s) => {
                      const n = Number(s.n) || 0;
                      const pct = fiches ? Math.round((n / fiches) * 100) : 0;
                      return `<div class="row-between" style="padding:7px 0;border-bottom:1px dashed var(--border)">
                          <span class="row" style="gap:8px">${App.labels.badge(App.labels.status, s.status)}<span class="muted small">${esc(
                        s.status || ""
                      )}</span></span>
                          <span class="row" style="gap:10px"><strong>${App.fmt.num(n)}</strong>
                          <span class="muted small">${App.fmt.percent(pct)}</span></span>
                        </div>`;
                    })
                    .join("")
                : `<p class="muted small">Aucune donnée disponible.</p>`
            }</div>`,
          })}
          ${UI.card({
            title: "Services les mieux dotés",
            subtitle: "Effectif et masse salariale estimée",
            tight: true,
            body: `<div style="padding:16px 18px">${
              byDept.length
                ? byDept
                    .map((d) => {
                      const members = actives.filter((e) => {
                        const dep = App.state.departments.find((x) => x.name === d.department);
                        return dep ? e.department_id === dep.id : false;
                      });
                      const m = members.reduce((sum, e) => sum + (Number(e.base_salary) || 0), 0);
                      return `<div class="row-between" style="padding:7px 0;border-bottom:1px dashed var(--border)">
                          <span class="grow">${esc(d.department)}</span>
                          <span class="row" style="gap:12px"><span class="muted small">${App.fmt.num(d.n)} pers.</span>
                          <strong>${App.fmt.moneyShort(m)}</strong></span>
                        </div>`;
                    })
                    .join("")
                : `<p class="muted small">Aucun service enregistré.</p>`
            }</div>`,
          })}
        </div>
      </div>`;
  }

  /* ================= Chargement ================= */

  async function loadData(tab) {
    let chart = null;
    let stats = null;
    let failure = null;
    try {
      chart = await App.api("org_chart");
    } catch (err) {
      failure = err;
    }
    if (tab === "stats") {
      try {
        stats = await App.api("employee_stats");
      } catch (err) {
        stats = null;
      }
    }
    await App.loadDepartments();
    if (!App.state.employees.length) await App.loadEmployees();
    return { chart, stats, failure };
  }

  async function exportEmployees() {
    const res = await App.call("export_csv", { kind: "employees", params: {} });
    if (res) App.toast(`Export créé : ${res.path} (${App.fmt.num(res.rows)} ligne(s))`, "success");
  }

  Views.org = {
    title: "Organigramme",
    subtitle: "Structure et services",

    render: async (el, params) => {
      const { chart, stats, failure } = await loadData(state.tab);
      const people = (chart && chart.people) || [];
      const depts = App.state.departments || [];

      el.innerHTML = `
        <div class="org-root stack" style="gap:16px">
          <div class="row-between wrap">
            ${UI.tabs(
              TABS.map((t) => ({
                id: t.id,
                label: t.label,
                count:
                  t.id === "chart"
                    ? people.length
                    : t.id === "services"
                    ? depts.length
                    : null,
              })),
              state.tab
            )}
            <button class="btn btn-sm" data-act="refresh"><svg class="ico"><use href="#i-refresh"/></svg> Actualiser</button>
          </div>
          <div id="org-panel"></div>
        </div>`;

      /* `el` survit aux rendus : on synchronise les événements sur un conteneur neuf. */
      const root = el.querySelector(".org-root");
      const panel = root.querySelector("#org-panel");

      UI.bindTabs(root, (id) => {
        state.tab = id;
        Router.render();
      });

      UI.on(root, "[data-emp]", (node) => App.go("/employees/" + node.dataset.emp));

      UI.on(root, "[data-mode]", (btn) => {
        state.mode = btn.dataset.mode;
        Router.render();
      });

      UI.on(root, "[data-act]", async (btn) => {
        const act = btn.dataset.act;
        try {
          if (act === "refresh") {
            Router.render();
            App.toast("Données actualisées", "success");
          } else if (act === "new-dept") {
            openDeptForm(null);
          } else if (act === "edit-dept") {
            const row = App.state.departments.find((d) => d.id === Number(btn.dataset.id));
            if (row) openDeptForm(row);
          } else if (act === "del-dept") {
            await removeDept(Number(btn.dataset.id));
          } else if (act === "export") {
            await exportEmployees();
          }
        } catch (err) {
          /* les erreurs App.api sont déjà notifiées */
        }
      });

      if (failure) {
        panel.innerHTML = UI.alert(
          "danger",
          `<strong>Impossible de charger l'organigramme.</strong><br>${esc(failure.message || failure)}`
        );
        return;
      }

      if (state.tab === "services") paintServices(panel);
      else if (state.tab === "stats") paintStats(panel, stats, people);
      else paintChart(panel, chart);
    },
  };
})();
