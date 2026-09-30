/* ============================================================
   Gestion RH — Employés (liste + fiche détaillée)
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const STATUS_OPTIONS = [
    { value: "active", label: "En poste" },
    { value: "probation", label: "Période d'essai" },
    { value: "leave", label: "En congé" },
    { value: "suspended", label: "Suspendu" },
    { value: "terminated", label: "Sorti" },
  ];
  const CONTRACT_OPTIONS = ["CDI", "CDD", "Stage", "Alternance", "Freelance", "Intérim"];
  const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];
  const SCHEDULES = ["Temps plein", "Temps partiel", "Forfait jours", "Temps réduit"];

  const state = { search: "", status: "all", department_id: 0, contract_type: "all" };

  /* ---------------- Formulaire employé ---------------- */
  function employeeForm(employee) {
    const e = employee || {};
    const fields = [
      { type: "section", label: "Identité" },
      { name: "matricule", label: "Matricule", col: 3, placeholder: "Généré automatiquement", help: "Laisser vide pour générer" },
      { name: "first_name", label: "Prénom", col: 4, required: true },
      { name: "last_name", label: "Nom", col: 5, required: true },
      { name: "gender", label: "Genre", type: "radio", col: 6, value: e.gender || "F", options: [
        { value: "F", label: "Femme" }, { value: "M", label: "Homme" },
      ] },
      { name: "birth_date", label: "Date de naissance", type: "date", col: 3 },
      { name: "national_id", label: "CIN / pièce d'identité", col: 3 },
      { name: "email", label: "Email professionnel", type: "email", col: 4 },
      { name: "phone", label: "Téléphone", type: "tel", col: 4 },
      { name: "photo_color", label: "Couleur du badge", type: "select", col: 4, value: e.photo_color || "#4f46e5",
        options: COLORS.map((c) => ({ value: c, label: c })) },

      { type: "section", label: "Affectation" },
      { name: "department_id", label: "Département", type: "select", col: 4, value: e.department_id || "", options: [] },
      { name: "job_title", label: "Poste occupé", col: 4 },
      { name: "manager_id", label: "Responsable hiérarchique", type: "select", col: 4, value: e.manager_id || "", options: [] },
      { name: "hire_date", label: "Date d'embauche", type: "date", col: 4, required: true, value: e.hire_date || App.fmt.today() },
      { name: "probation_end_date", label: "Fin de période d'essai", type: "date", col: 4 },
      { name: "status", label: "Statut", type: "select", col: 4, value: e.status || "active", options: STATUS_OPTIONS },

      { type: "section", label: "Contrat" },
      { name: "contract_type", label: "Type de contrat", type: "select", col: 4, value: e.contract_type || "CDI",
        options: CONTRACT_OPTIONS.map((c) => ({ value: c, label: c })) },
      { name: "contract_end_date", label: "Fin de contrat (CDD…)", type: "date", col: 4 },
      { name: "work_location", label: "Lieu de travail", col: 4 },
      { name: "work_schedule", label: "Régime de travail", type: "select", col: 4, value: e.work_schedule || "Temps plein",
        options: SCHEDULES.map((c) => ({ value: c, label: c })) },
      { name: "termination_date", label: "Date de départ", type: "date", col: 4 },
      { name: "termination_reason", label: "Motif du départ", col: 4 },

      { type: "section", label: "Rémunération" },
      { name: "base_salary", label: "Salaire de base (brut mensuel)", type: "number", col: 4, required: true, min: 0, step: "0.01",
        help: `Devise : ${App.fmt.money(0).split(" ").slice(1).join(" ")}` },
      { name: "transport_allowance", label: "Indemnité de transport", type: "number", col: 4, min: 0, step: "0.01" },
      { name: "other_allowance", label: "Autres indemnités", type: "number", col: 4, min: 0, step: "0.01" },
      { name: "dependents", label: "Charges à déduire (personnes à charge)", type: "number", col: 4, min: 0, step: 1 },
      { name: "bank_name", label: "Banque", col: 4 },
      { name: "iban", label: "RIB / IBAN", col: 4 },
      { name: "social_security", label: "N° de sécurité sociale", col: 4 },

      { type: "section", label: "Coordonnées" },
      { name: "address", label: "Adresse", col: 8 },
      { name: "city", label: "Ville", col: 4 },
      { name: "postal_code", label: "Code postal", col: 4 },
      { name: "country", label: "Pays", col: 4 },

      { type: "section", label: "Contact d'urgence" },
      { name: "emergency_name", label: "Personne à contacter", col: 6 },
      { name: "emergency_phone", label: "Téléphone d'urgence", type: "tel", col: 6 },

      { type: "section", label: "Notes" },
      { name: "notes", label: "Observations", type: "textarea", col: 12, rows: 3 },
    ];

    // Sélectifs dynamiques.
    const deptField = fields.find((f) => f.name === "department_id");
    deptField.options = [{ value: "", label: "— Aucun —" }].concat(
      App.state.departments.map((d) => ({ value: d.id, label: d.name }))
    );
    const mgrField = fields.find((f) => f.name === "manager_id");
    mgrField.options = [{ value: "", label: "— Aucun —" }].concat(
      App.state.employees
        .filter((x) => !employee || x.id !== employee.id)
        .map((x) => ({ value: x.id, label: `${x.first_name} ${x.last_name}${x.job_title ? " — " + x.job_title : ""}` }))
    );

    UI.form({
      title: employee ? `Modifier : ${employee.first_name} ${employee.last_name}` : "Nouvel employé",
      subtitle: employee ? `Fiche ${employee.matricule || ""}` : "Création d'un dossier salarié",
      size: "xl",
      fields,
      values: employee || {},
      successMessage: "Fiche employé enregistrée",
      submitLabel: "Enregistrer la fiche",
      onSubmit: async (values) => {
        if (employee && employee.id) values.id = employee.id;
        const res = await App.api("save_employee", { data: values });
        await App.loadEmployees(true);
        await App.loadDepartments();
        updateBadgeLeaves();
        if (!employee) {
          const ok = await UI.confirm({
            title: "Fiche créée",
            message: `La fiche <strong>${App.esc(values.first_name)} ${App.esc(
              values.last_name
            )}</strong> a été créée avec le matricule <strong>${App.esc(res.matricule)}</strong>.<br>Voulez-vous l'ouvrir ?`,
            confirmLabel: "Ouvrir la fiche",
          });
          if (ok) App.go("/employees/" + res.id);
          else Router.render();
        } else {
          Router.render();
        }
      },
    });
  }

  function updateBadgeLeaves() {
    if (App.updateBadges) App.updateBadges();
  }

  /* ---------------- Liste des employés ---------------- */
  Views.employees = {
    title: "Employés",
    subtitle: () => "Dossiers salariés, contrats et carrières",

    openForm: (employee) => employeeForm(employee),

    render: async function (el) {
      const rows = await App.api("list_employees", {
        search: state.search || null,
        status: state.status,
        department_id: state.department_id || null,
        contract_type: state.contract_type,
      });

      const active = rows.filter((r) => r.status !== "terminated");
      const totalSalary = active.reduce((a, r) => a + (r.base_salary || 0), 0);

      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div class="grid grid-4">
            ${UI.kpi({ icon: "#i-users", label: "Effectif listé", value: App.fmt.num(rows.length), hint: `${App.fmt.num(active.length)} en poste` })}
            ${UI.kpi({ icon: "#i-building", tone: "sky", label: "Départements", value: App.fmt.num(App.state.departments.length) })}
            ${UI.kpi({ icon: "#i-wallet", tone: "teal", label: "Masse salariale brute", value: App.fmt.moneyShort(totalSalary), hint: "Salaires de base cumulés" })}
            ${UI.kpi({ icon: "#i-award", tone: "amber", label: "Ancienneté moyenne", value: (() => {
                const avg = active.reduce((a, r) => a + (r.seniority_years || 0), 0) / (active.length || 1);
                return App.fmt.num(avg, 1) + " an";
              })() })}
          </div>

          ${UI.card({
            tight: true,
            actions: `
              <button class="btn btn-sm" data-act="export"><svg class="ico"><use href="#i-download"/></svg> Exporter CSV</button>
              <button class="btn btn-sm btn-primary" data-act="new"><svg class="ico"><use href="#i-plus"/></svg> Nouvel employé</button>`,
            body: `
              <div class="card-body" style="padding-bottom:0">
                <div class="filters">
                  <div class="search-inline">
                    <svg class="ico"><use href="#i-search"/></svg>
                    <input type="search" id="emp-search" placeholder="Nom, matricule, poste, email…" value="${App.esc(state.search)}"/>
                  </div>
                  <select id="emp-status">
                    <option value="all">Tous les statuts</option>
                    ${STATUS_OPTIONS.map((s) => `<option value="${s.value}"${state.status === s.value ? " selected" : ""}>${s.label}</option>`).join("")}
                  </select>
                  <select id="emp-dept">
                    <option value="0">Tous les services</option>
                    ${App.state.departments
                      .map((d) => `<option value="${d.id}"${Number(state.department_id) === d.id ? " selected" : ""}>${App.esc(d.name)}</option>`)
                      .join("")}
                  </select>
                  <select id="emp-contract">
                    <option value="all">Tous les contrats</option>
                    ${CONTRACT_OPTIONS.map((c) => `<option value="${c}"${state.contract_type === c ? " selected" : ""}>${c}</option>`).join("")}
                  </select>
                  ${(state.search || state.status !== "all" || state.department_id || state.contract_type !== "all")
                    ? `<button class="btn btn-sm btn-ghost" data-act="reset">Réinitialiser</button>`
                    : ""}
                </div>
              </div>
              <div id="emp-table" style="margin-top:14px"></div>`,
            foot: `<span class="muted small">Cliquez sur une ligne pour ouvrir la fiche complète du salarié.</span>`,
          })}
        </div>`;

      const container = el.querySelector("#emp-table");
      UI.table(container, {
        rows,
        rowKey: (r) => r.id,
        onRowClick: (r) => App.go("/employees/" + r.id),
        resetSort: true,
        empty: {
          icon: "#i-users",
          title: rows.length ? "Aucun résultat" : "Aucun employé enregistré",
          text: rows.length
            ? "Aucun salarié ne correspond à ces critères de recherche."
            : "Créez le premier dossier salarié pour démarrer la gestion RH.",
          action: rows.length ? null : "Créer un employé",
        },
        onEmptyAction: () => employeeForm(null),
        foot: `<span>${rows.length} salarié(s) affiché(s)</span><span>Cliquez un en-tête pour trier</span>`,
        columns: [
          {
            key: "last_name",
            label: "Employé",
            render: (r) =>
              `<div class="person">
                 ${UI.avatar(`${r.first_name} ${r.last_name}`, r.photo_color, "sm")}
                 <div class="grow">
                   <div class="p-name">${App.esc(r.first_name)} ${App.esc(r.last_name)}</div>
                   <div class="p-sub">${App.esc(r.matricule || "")}${r.job_title ? " · " + App.esc(r.job_title) : ""}</div>
                 </div>
               </div>`,
            sortValue: (r) => `${r.last_name} ${r.first_name}`,
          },
          { key: "department_name", label: "Service", render: (r) => App.esc(r.department_name || "—") },
          {
            key: "contract_type",
            label: "Contrat",
            render: (r) => App.labels.badge(App.labels.contract, r.contract_type, true),
          },
          {
            key: "status",
            label: "Statut",
            render: (r) => App.labels.badge(App.labels.status, r.status),
          },
          { key: "hire_date", label: "Embauche", render: (r) => App.fmt.date(r.hire_date), align: "center" },
          { key: "seniority_years", label: "Ancienneté", align: "right", render: (r) => App.fmt.seniority(r.hire_date) },
          {
            key: "base_salary",
            label: "Salaire de base",
            align: "right",
            render: (r) => `<strong>${App.fmt.money(r.base_salary)}</strong>`,
          },
          {
            key: "actions",
            label: "",
            sortable: false,
            align: "right",
            cls: "actions-cell",
            render: (r) => `
              <button class="icon-btn" data-act="view" data-id="${r.id}" title="Voir la fiche"><svg class="ico"><use href="#i-eye"/></svg></button>
              <button class="icon-btn" data-act="edit" data-id="${r.id}" title="Modifier"><svg class="ico"><use href="#i-edit"/></svg></button>
              <button class="icon-btn danger" data-act="delete" data-id="${r.id}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`,
          },
        ],
      });

      container.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const row = rows.find((r) => r.id === id);
        if (btn.dataset.act === "view") App.go("/employees/" + id);
        if (btn.dataset.act === "edit") employeeForm(row);
        if (btn.dataset.act === "delete") {
          const ok = await UI.confirm({
            title: "Supprimer le dossier",
            message: `Supprimer définitivement le dossier de <strong>${App.esc(
              `${row.first_name} ${row.last_name}`
            )}</strong> ?<br><span class="small">Congés, présences, évaluations et documents associés seront également supprimés.`,
            confirmLabel: "Supprimer",
            danger: true,
          });
          if (!ok) return;
          await App.api("delete_employee", { id });
          await App.loadEmployees(true);
          App.toast("Dossier employé supprimé", "success");
          Router.render();
        }
      });

      // Filtres
      const searchInput = el.querySelector("#emp-search");
      let t = null;
      searchInput.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.search = searchInput.value;
          Router.render();
          // On attend que la vue soit réaffichée avant de repositionner
          // le curseur dans le champ de recherche.
          let tries = 0;
          const refocus = () => {
            const box = document.getElementById("emp-search");
            if (box) {
              box.focus();
              box.setSelectionRange(box.value.length, box.value.length);
            } else if (tries++ < 40) setTimeout(refocus, 30);
          };
          setTimeout(refocus, 30);
        }, 320);
      });
      el.querySelector("#emp-status").onchange = (ev) => { state.status = ev.target.value; Router.render(); };
      el.querySelector("#emp-dept").onchange = (ev) => { state.department_id = Number(ev.target.value); Router.render(); };
      el.querySelector("#emp-contract").onchange = (ev) => { state.contract_type = ev.target.value; Router.render(); };
      const resetBtn = el.querySelector('[data-act="reset"]');
      if (resetBtn)
        resetBtn.onclick = () => {
          state.search = "";
          state.status = "all";
          state.department_id = 0;
          state.contract_type = "all";
          Router.render();
        };
      el.querySelector('[data-act="new"]').onclick = () => employeeForm(null);
      el.querySelector('[data-act="export"]').onclick = async () => {
        const res = await App.call("export_csv", { kind: "employees", params: {} });
        if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
      };
    },
  };

  /* ---------------- Fiche détaillée ---------------- */
  Views.employee = {
    title: (p) => "Fiche salarié",
    subtitle: () => "Dossier complet",

    render: async function (el, params) {
      const id = Number(params.id);
      const data = await App.api("get_employee", { id });
      const e = data.employee;
      if (!e || e.is_null) {
        el.innerHTML = UI.empty({ icon: "#i-users", title: "Employé introuvable", text: "Ce dossier n'existe plus.", action: "Retour à la liste" });
        el.querySelector("[data-empty-action]").onclick = () => App.go("/employees");
        return;
      }
      const name = `${e.first_name} ${e.last_name}`;
      const tab = Views.employee._tab || "info";

      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-body">
              <div class="row wrap" style="gap:18px">
                ${UI.avatar(name, e.photo_color, "xl")}
                <div class="grow" style="min-width:220px">
                  <div class="row wrap" style="gap:9px">
                    <h3 style="font-size:20px">${App.esc(name)}</h3>
                    ${App.labels.badge(App.labels.status, e.status)}
                    ${App.labels.badge(App.labels.contract, e.contract_type, true)}
                  </div>
                  <p class="muted mt-8">
                    ${App.esc(e.job_title || "Poste non renseigné")}
                    ${e.department_name ? " · " + App.esc(e.department_name) : ""}
                    · ${App.esc(e.matricule || "")}
                  </p>
                  <p class="small muted mt-8">Embauché(e) le ${App.fmt.date(e.hire_date)} · ${App.fmt.seniority(
        e.hire_date
      )} d'ancienneté${e.manager_name ? " · Responsable : " + App.esc(e.manager_name) : ""}</p>
                </div>
                <div class="row wrap" style="gap:8px">
                  <a class="btn" href="#/employees"><svg class="ico"><use href="#i-arrow-left"/></svg> Retour</a>
                  <button class="btn" data-act="leave"><svg class="ico"><use href="#i-calendar"/></svg> Congé</button>
                  <button class="btn" data-act="pay"><svg class="ico"><use href="#i-wallet"/></svg> Simuler la paie</button>
                  <button class="btn btn-primary" data-act="edit"><svg class="ico"><use href="#i-edit"/></svg> Modifier</button>
                  <button class="icon-btn danger" data-act="delete" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>
                </div>
              </div>

              <div class="grid grid-4 mt-24">
                ${UI.kpi({ icon: "#i-clock", tone: "green", label: "Jours de présence", value: App.fmt.num(data.attendance.days || 0), hint: `${App.fmt.duration(data.attendance.minutes || 0)} pointées` })}
                ${UI.kpi({ icon: "#i-alert", tone: "amber", label: "Retards", value: App.fmt.num(data.attendance.lates || 0), hint: "12 derniers mois" })}
                ${UI.kpi({ icon: "#i-calendar", tone: "indigo", label: "Congés pris", value: App.fmt.days((data.leave_history || []).filter((l) => l.status === "approved").reduce((a, l) => a + (l.days || 0), 0)), hint: `${App.fmt.num(data.leaves.pending || 0)} demande(s) en attente` })}
                ${UI.kpi({ icon: "#i-star", tone: "purple", label: "Évaluations", value: App.fmt.num(data.evaluations.total || 0), hint: data.evaluations.avg_rating ? `Moyenne ${App.fmt.num(data.evaluations.avg_rating, 2)}/5` : "Aucune note" })}
              </div>
            </div>
            <div class="card-body" style="padding-top:0">
              ${UI.tabs(
                [
                  { id: "info", label: "Informations" },
                  { id: "contract", label: "Contrat & paie" },
                  { id: "leaves", label: "Congés", count: data.leave_history.length || null },
                  { id: "presence", label: "Présence" },
                  { id: "docs", label: "Documents", count: data.documents.total || null },
                ],
                tab
              )}
            </div>
          </div>

          <div id="emp-tab-content"></div>
        </div>`;

      const box = el.querySelector("#emp-tab-content");
      UI.bindTabs(el, (t) => {
        Views.employee._tab = t;
        Router.render();
      });

      if (tab === "info") {
        box.innerHTML = UI.card({
          title: "Informations personnelles",
          actions: `<button class="btn btn-sm" data-act="edit">Modifier</button>`,
          body: UI.kv([
            ["Nom complet", App.esc(name)],
            ["Matricule", App.esc(e.matricule || "—")],
            ["Genre", App.labels.gender[e.gender] || "—"],
            ["Date de naissance", `${App.fmt.date(e.birth_date)}${e.birth_date ? ` (${App.fmt.age(e.birth_date)} ans)` : ""}`],
            ["CIN / identité", App.esc(e.national_id || "—")],
            ["Email", e.email ? `<a href="mailto:${App.esc(e.email)}">${App.esc(e.email)}</a>` : "—"],
            ["Téléphone", App.esc(e.phone || "—")],
            ["Adresse", [e.address, e.postal_code, e.city, e.country].filter(Boolean).map(App.esc).join(", ") || "—"],
            ["N° sécurité sociale", App.esc(e.social_security || "—")],
            ["Contact d'urgence", e.emergency_name ? `${App.esc(e.emergency_name)} · ${App.esc(e.emergency_phone || "")}` : "—"],
            ["Observations", e.notes ? `<span style="white-space:pre-wrap">${App.esc(e.notes)}</span>` : "—"],
          ]),
        });
        box.querySelector('[data-act="edit"]').onclick = () => employeeForm(e);
      }

      if (tab === "contract") {
        const last = data.last_payroll;
        box.innerHTML = `
          <div class="grid grid-2">
            ${UI.card({
              title: "Contrat de travail",
              actions: `<button class="btn btn-sm" data-act="edit">Modifier</button>`,
              body: UI.kv([
                ["Type de contrat", App.labels.badge(App.labels.contract, e.contract_type, true)],
                ["Statut", App.labels.badge(App.labels.status, e.status)],
                ["Date d'embauche", App.fmt.date(e.hire_date)],
                ["Fin de période d'essai", App.fmt.date(e.probation_end_date)],
                ["Fin de contrat", App.fmt.date(e.contract_end_date)],
                ["Régime de travail", App.esc(e.work_schedule || "—")],
                ["Lieu de travail", App.esc(e.work_location || "—")],
                ["Département", App.esc(e.department_name || "—")],
                ["Responsable", App.esc(e.manager_name || "—")],
                ["Date de départ", App.fmt.date(e.termination_date)],
                ["Motif du départ", App.esc(e.termination_reason || "—")],
              ]),
            })}
            ${UI.card({
              title: "Rémunération",
              actions: `<button class="btn btn-sm" data-act="edit">Modifier</button>`,
              body: UI.kv([
                ["Salaire de base", `<strong>${App.fmt.money(e.base_salary)}</strong>`],
                ["Indemnité transport", App.fmt.money(e.transport_allowance)],
                ["Autres indemnités", App.fmt.money(e.other_allowance)],
                ["Total mensuel brut", `<strong>${App.fmt.money((+e.base_salary || 0) + (+e.transport_allowance || 0) + (+e.other_allowance || 0))}</strong>`],
                ["Banque", App.esc(e.bank_name || "—")],
                ["RIB / IBAN", App.esc(e.iban || "—")],
                ["Charges à déduire", App.fmt.num(e.dependents || 0)],
                [
                  "Dernière paie",
                  last && last.period
                    ? `${App.fmt.monthLabel(last.period)} · net <strong>${App.fmt.money(last.net)}</strong> (brut ${App.fmt.money(last.gross)})`
                    : "Aucune paie enregistrée",
                ],
              ]),
              foot: `<button class="btn btn-sm" data-act="pay"><svg class="ico"><use href="#i-wallet"/></svg> Simuler un bulletin</button>`,
            })}
          </div>`;
        box.querySelectorAll('[data-act="edit"]').forEach((b) => (b.onclick = () => employeeForm(e)));
        box.querySelectorAll('[data-act="pay"]').forEach((b) => (b.onclick = () => simulatePayroll(e)));
      }

      if (tab === "leaves") {
        const balances = await App.call("leave_balances", {});
        const mine = (balances || []).filter((b) => b.employee_id === e.id);
        box.innerHTML = `
          <div class="grid grid-2">
            ${UI.card({
              title: "Soldes de congés",
              subtitle: `Année ${new Date().getFullYear()}`,
              tight: true,
              body: `<div id="leave-bal"></div>`,
              foot: `<button class="btn btn-sm btn-primary" data-act="leave"><svg class="ico"><use href="#i-plus"/></svg> Nouvelle demande</button>`,
            })}
            ${UI.card({
              title: "Historique des demandes",
              tight: true,
              body: `<div id="leave-hist"></div>`,
            })}
          </div>`;
        const balBox = box.querySelector("#leave-bal");
        const paid = mine.filter((b) => b.acquis > 0);
        if (!paid.length) balBox.innerHTML = UI.empty({ icon: "#i-calendar", title: "Aucun solde", text: "Aucun type de congé annuel configuré." });
        else
          balBox.innerHTML = paid
            .map((b) => {
              const restant = Math.max(0, (b.acquis || 0) - (b.pris || 0));
              const pct = b.acquis ? Math.round((restant / b.acquis) * 100) : 0;
              return `<div class="list-item">
                  <span class="avatar sm" style="background:${b.color || "#4f46e5"}">${App.esc((b.type_name || "CG").slice(0, 2).toUpperCase())}</span>
                  <div class="li-main">
                    <div class="li-title">${App.esc(b.type_name)}</div>
                    <div class="li-sub">${App.fmt.days(b.pris || 0)} pris sur ${App.fmt.days(b.acquis)}${
                b.en_attente ? ` · ${b.en_attente} en attente` : ""
              }</div>
                    <div class="progress mt-8" style="max-width:260px"><span style="width:${pct}%"></span></div>
                  </div>
                  <div class="li-right"><strong>${App.fmt.days(restant)}</strong><br><span class="muted small">restants</span></div>
                </div>`;
            })
            .join("");
        const histBox = box.querySelector("#leave-hist");
        const hist = data.leave_history || [];
        histBox.innerHTML = hist.length
          ? hist
              .map((h) =>
                UI.listItem({
                  avatar: `<span class="avatar sm" style="background:${h.color || "#4f46e5"}">${App.esc((h.type_name || "CG").slice(0, 2).toUpperCase())}</span>`,
                  title: App.esc(h.type_name),
                  sub: `${App.fmt.date(h.start_date)} → ${App.fmt.date(h.end_date)} · ${App.fmt.days(h.days)}`,
                  right: App.labels.badge(App.labels.leave, h.status),
                })
              )
              .join("")
          : UI.empty({ icon: "#i-calendar", title: "Aucune demande", text: "Cet employé n'a pas encore demandé de congé." });
        box.querySelectorAll('[data-act="leave"]').forEach(
          (b) => (b.onclick = () => (Views.leaves.openNew ? Views.leaves.openNew(e.id) : App.go("/leaves")))
        );
      }

      if (tab === "presence") {
        const rows = await App.call("list_attendance", { employee_id: e.id });
        const list = (rows || []).slice(0, 20);
        box.innerHTML = `
          <div class="grid grid-2">
            ${UI.card({
              title: "Synthèse de présence",
              body: UI.kv([
                ["Jours pointés (12 mois)", App.fmt.num(data.attendance.days || 0)],
                ["Temps total", App.fmt.duration(data.attendance.minutes || 0)],
                ["Retards", App.fmt.num(data.attendance.lates || 0)],
                ["Dernière présence", list[0] ? `${App.fmt.date(list[0].date)} · ${App.fmt.time(list[0].clock_in)}` : "—"],
              ]),
              foot: `<a class="btn btn-sm" href="#/attendance">Ouvrir le registre de présence</a>`,
            })}
            ${UI.card({
              title: "Derniers pointages",
              tight: true,
              body: list.length
                ? list
                    .map((r) =>
                      UI.listItem({
                        title: App.fmt.date(r.date),
                        sub: r.clock_in
                          ? `${App.fmt.time(r.clock_in)} → ${App.fmt.time(r.clock_out)} · ${App.fmt.duration(r.worked_minutes)}`
                          : "Aucun pointage",
                        right: App.labels.badge(App.labels.attendance, r.status),
                      })
                    )
                    .join("")
                : UI.empty({ icon: "#i-clock", title: "Aucun pointage" }),
            })}
          </div>`;
      }

      if (tab === "docs") {
        const docs = await App.call("list_documents", { employee_id: e.id });
        box.innerHTML = UI.card({
          title: "Documents du dossier",
          tight: true,
          actions: `<button class="btn btn-sm btn-primary" data-act="doc"><svg class="ico"><use href="#i-plus"/></svg> Ajouter</button>`,
          body:
            (docs || []).length
              ? docs
                  .map((d) =>
                    UI.listItem({
                      avatar: `<span class="avatar sm" style="background:#0ea5e9"><svg class="ico ico-sm"><use href="#i-file"/></svg></span>`,
                      title: App.esc(d.name),
                      sub: `${App.esc(d.category)}${d.reference ? " · " + App.esc(d.reference) : ""}${
                        d.expiry_date ? " · expire le " + App.fmt.date(d.expiry_date) : ""
                      }`,
                      right: d.expiry_date ? expiryBadge(d.expiry_date) : `<span class="badge gray">Sans échéance</span>`,
                      actions: `<button class="icon-btn danger" data-del="${d.id}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`,
                    })
                  )
                  .join("")
              : UI.empty({ icon: "#i-file", title: "Aucun document", text: "Ajoutez les pièces du dossier salarié (contrat, CIN, diplômes…)." }),
        });
        box.querySelector('[data-act="doc"]').onclick = () =>
          Views.documents && Views.documents.openForm ? Views.documents.openForm(null, e.id) : App.go("/documents");
        box.addEventListener("click", async (ev) => {
          const del = ev.target.closest("[data-del]");
          if (!del) return;
          const ok = await UI.confirm({ title: "Supprimer le document", message: "Supprimer ce document ?", confirmLabel: "Supprimer", danger: true });
          if (!ok) return;
          await App.api("delete_document", { id: Number(del.dataset.del) });
          App.toast("Document supprimé", "success");
          Router.render();
        });
      }

      // Actions de l'en-tête
      el.querySelector('[data-act="edit"]').onclick = () => employeeForm(e);
      el.querySelector('[data-act="leave"]').onclick = () =>
        Views.leaves.openNew ? Views.leaves.openNew(e.id) : App.go("/leaves");
      el.querySelector('[data-act="pay"]').onclick = () => simulatePayroll(e);
      el.querySelector('[data-act="delete"]').onclick = async () => {
        const ok = await UI.confirm({
          title: "Supprimer le dossier",
          message: `Supprimer définitivement le dossier de <strong>${App.esc(name)}</strong> ?`,
          confirmLabel: "Supprimer",
          danger: true,
        });
        if (!ok) return;
        await App.api("delete_employee", { id: e.id });
        await App.loadEmployees(true);
        App.toast("Dossier supprimé", "success");
        App.go("/employees");
      };
    },
  };

  function expiryBadge(date) {
    const d = new Date(date + "T00:00:00");
    const diff = Math.round((d - new Date()) / 86400000);
    if (isNaN(diff)) return `<span class="badge gray">${App.fmt.date(date)}</span>`;
    if (diff < 0) return `<span class="badge red">Expiré (${App.fmt.date(date)})</span>`;
    if (diff <= 30) return `<span class="badge amber">Expire dans ${diff} j</span>`;
    if (diff <= 60) return `<span class="badge indigo">Expire dans ${diff} j</span>`;
    return `<span class="badge gray">Expire le ${App.fmt.date(date)}</span>`;
  }

  function simulatePayroll(e) {
    UI.form({
      title: "Simulateur de bulletin",
      subtitle: `${e.first_name} ${e.last_name} · ${App.esc(e.job_title || "")}`,
      size: "md",
      submitLabel: "Calculer",
      fields: [
        { name: "base_salary", label: "Salaire de base", type: "number", col: 6, required: true, value: e.base_salary, step: "0.01" },
        { name: "overtime_hours", label: "Heures supplémentaires", type: "number", col: 6, value: 0, step: "0.5", min: 0 },
        { name: "bonus", label: "Prime", type: "number", col: 4, value: 0, step: "0.01" },
        { name: "commission", label: "Commission", type: "number", col: 4, value: 0, step: "0.01" },
        { name: "allowance", label: "Indemnités", type: "number", col: 4, value: e.transport_allowance || 0, step: "0.01" },
        { name: "other_deductions", label: "Retenues diverses", type: "number", col: 4, value: 0, step: "0.01" },
      ],
      onSubmit: async (values) => {
        const calc = await App.api("simulate_payroll", { data: values });
        showSimulation(e, values, calc);
        return false;
      },
    });
  }

  function showSimulation(e, input, c) {
    const A = Object.assign(
      {
        salary: "6611",
        prime: "6612",
        allowance: "663",
        employee_charges: "431",
        tax: "447",
        other_deductions: "47",
        net_pay: "422",
        employer_charges: "664",
        payment: "521",
      },
      ((App.state.settings && App.state.settings.payroll) || {}).accounts || {}
    );
    const acc = (code) =>
      `<td class="right"><span class="mono">${code ? App.esc(code) : ""}</span></td>`;
    const contribs = c.employee_contributions || [];
    const brackets = ((App.state.settings || {}).payroll || {}).tax_brackets || [];
    const warning =
      !contribs.length && !brackets.length
        ? UI.alert(
            "warning",
            "<strong>Aucun taux n'est configuré :</strong> le net à payer égale le brut. Ajoutez vos cotisations et votre barème dans <strong>Paramètres → Paie</strong> (comptes du plan SYSCOHADA)."
          )
        : "";
    UI.openModal({
      title: "Simulation de bulletin",
      subtitle: `${e.first_name} ${e.last_name} · ${App.fmt.monthLabel(App.fmt.today().slice(0, 7))}`,
      size: "lg",
      body: `
        <div class="grid grid-3 mb-16">
          ${UI.kpi({ icon: "#i-wallet", label: "Brut mensuel", value: App.fmt.money(c.gross) })}
          ${UI.kpi({ icon: "#i-download", tone: "green", label: "Net à payer", value: App.fmt.money(c.net) })}
          ${UI.kpi({ icon: "#i-building", tone: "teal", label: "Coût employeur", value: App.fmt.money(c.employer_cost) })}
        </div>
        <table class="table">
          <thead><tr><th>Détail</th><th class="right">Base</th><th class="right">Taux</th><th class="right">Montant</th><th class="right">Compte</th></tr></thead>
          <tbody>
            <tr><td>Salaire de base</td><td class="num">${App.fmt.money(input.base_salary)}</td><td class="num">—</td><td class="num">${App.fmt.money(
        input.base_salary
      )}</td>${acc(A.salary)}</tr>
            ${
              +input.overtime_hours
                ? `<tr><td>Heures supplémentaires (${App.fmt.num(input.overtime_hours, 1)} h)</td><td class="num">${App.fmt.money(
                    c.hour_rate
                  )}/h</td><td class="num">×${App.fmt.num(1.5, 1)}</td><td class="num">${App.fmt.money(c.overtime_amount)}</td>${acc(
                    A.salary
                  )}</tr>`
                : ""
            }
            ${+input.bonus ? `<tr><td>Prime</td><td class="num">—</td><td class="num">—</td><td class="num">${App.fmt.money(input.bonus)}</td>${acc(
              A.prime
            )}</tr>` : ""}
            ${+input.commission ? `<tr><td>Commission</td><td class="num">—</td><td class="num">—</td><td class="num">${App.fmt.money(
              input.commission
            )}</td>${acc(A.prime)}</tr>` : ""}
            ${+input.allowance ? `<tr><td>Indemnités</td><td class="num">—</td><td class="num">—</td><td class="num">${App.fmt.money(
              input.allowance
            )}</td>${acc(A.allowance)}</tr>` : ""}
            ${contribs
              .map(
                (x) =>
                  `<tr><td>${App.esc(x.label)} (salarié)</td><td class="num">${App.fmt.money(x.taxable)}</td><td class="num">${App.fmt.num(
                    x.rate,
                    2
                  )} %</td><td class="num">- ${App.fmt.money(x.amount)}</td>${acc(x.account || A.employee_charges)}</tr>`
              )
              .join("")}
            <tr><td>Impôt sur le revenu</td><td class="num">${App.fmt.money(c.taxable)}</td><td class="num">barème</td><td class="num">- ${App.fmt.money(
        c.tax
      )}</td>${acc(A.tax)}</tr>
            <tr class="tot"><td><strong>Total brut</strong></td><td></td><td></td><td class="num"><strong>${App.fmt.money(c.gross)}</strong></td>${acc("")}</tr>
            <tr class="tot net"><td><strong>Net à payer</strong></td><td></td><td></td><td class="num"><strong>${App.fmt.money(
              c.net
            )}</strong></td>${acc(A.net_pay)}</tr>
            <tr><td>Coût employeur (dont ${App.fmt.money(c.social_employer)} de charges patronales)</td><td></td><td></td><td class="num">${App.fmt.money(
        c.employer_cost
      )}</td>${acc(A.employer_charges)}</tr>
          </tbody>
        </table>
        ${warning}
        <p class="small muted">Simulation indicative calculée avec les taux paramétrés dans Paramètres → Paie.</p>`,
      footer: `<button class="btn" data-close>Fermer</button>`,
    }).foot.querySelector("[data-close]").onclick = () => UI.closeModal();
  }

  Views.employees.simulatePayroll = simulatePayroll;
  Views.employee.expiryBadge = expiryBadge;
})();
