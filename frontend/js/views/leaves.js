/* ============================================================
   Gestion RH — Congés & absences
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const state = {
    tab: "requests",
    status: "all",
    year: new Date().getFullYear().toString(),
    month: new Date().getMonth() + 1,
  };

  function yearOptions(selected) {
    const y = new Date().getFullYear();
    let out = "";
    for (let i = y - 3; i <= y + 1; i++)
      out += `<option value="${i}"${String(selected) === String(i) ? " selected" : ""}>${i}</option>`;
    return out;
  }

  /* ---------------- Nouvelle demande ---------------- */
  async function openNew(employeeId) {
    const types = App.state.leaveTypes.length ? App.state.leaveTypes : (await App.loadLeaveTypes());
    const employees = await App.loadEmployees();
    const balances = (await App.call("leave_balances", { year: state.year })) || [];

    UI.form({
      title: "Nouvelle demande de congé",
      subtitle: "Le nombre de jours ouvrés est calculé automatiquement",
      size: "lg",
      submitLabel: "Envoyer la demande",
      successMessage: "Demande de congé envoyée",
      fields: [
        { type: "section", label: "Demandeur" },
        { name: "employee_id", label: "Employé", type: "select", col: 7, required: true, value: employeeId || "", options: employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.job_title ? " — " + e.job_title : ""}` })) },
        { name: "leave_type_id", label: "Type d'absence", type: "select", col: 5, required: true, options: types.filter((t) => t.active !== 0).map((t) => ({ value: t.id, label: `${t.name}${t.days_per_year > 0 ? ` (${t.days_per_year} j/an)` : ""}` })) },
        { type: "section", label: "Période" },
        { name: "start_date", label: "Du", type: "date", col: 4, required: true, value: App.fmt.today() },
        { name: "end_date", label: "Au", type: "date", col: 4, required: true, value: App.fmt.today() },
        { name: "days_preview", label: "Jours ouvrés estimés", col: 4, readonly: true, value: "", help: "Week-ends et jours fériés déduits (calcul définitif à l'envoi)" },
        { type: "section", label: "Justification" },
        { name: "reason", label: "Motif / observation", type: "textarea", col: 12, rows: 2, placeholder: "Facultatif" },
        { type: "html", col: 12, html: () => `<div id="solde-box" class="alert info"><svg class="ico"><use href="#i-info"/></svg><div>Sélectionnez un employé et un type de congé pour afficher le solde restant.</div></div>` },
      ],
      onSubmit: async (values) => {
        if (values.end_date && values.start_date && values.end_date < values.start_date) {
          throw new Error("La date de fin doit être postérieure à la date de début.");
        }
        await App.api("create_leave_request", { data: values });
        await App.loadLeaveTypes();
        if (App.updateBadges) App.updateBadges();
        Router.render();
      },
    });

    // Prévisualisation du nombre de jours + solde.
    const form = document.getElementById("ui-form");
    if (!form) return;
    const holidays = (await App.call("list_holidays")) || [];
    const update = () => {
      const start = form.querySelector('[name="start_date"]').value;
      const end = form.querySelector('[name="end_date"]').value;
      const empId = Number(form.querySelector('[name="employee_id"]').value);
      const typeId = Number(form.querySelector('[name="leave_type_id"]').value);
      const daysEl = form.querySelector('[name="days_preview"]');
      let days = 0;
      if (start && end && end >= start) {
        const d = new Date(start + "T00:00:00");
        const last = new Date(end + "T00:00:00");
        while (d <= last) {
          const wd = d.getDay();
          const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const iso = d.toISOString().slice(0, 10);
          const festif = holidays.some((h) => h.date === iso || (h.recurring && h.date === md));
          if (wd !== 0 && wd !== 6 && !festif) days++;
          d.setDate(d.getDate() + 1);
        }
      }
      daysEl.value = days ? `${days} jour(s)` : "";
      const box = document.getElementById("solde-box");
      if (box && empId && typeId) {
        const b = balances.find((x) => x.employee_id === empId && x.type_id === typeId);
        if (b) {
          const restant = Math.max(0, (b.acquis || 0) - (b.pris || 0));
          box.className = restant >= days && days > 0 ? "alert success" : "alert warning";
          box.innerHTML = `<svg class="ico"><use href="#i-${
            restant >= days && days > 0 ? "check" : "alert"
          }"/></svg><div><strong>Solde ${App.esc(b.type_name)} :</strong> ${App.fmt.days(b.pris || 0)} pris / ${App.fmt.days(
            b.acquis
          )} acquis → <strong>${App.fmt.days(restant)} restant(s)</strong>${
            days > 0 && restant < days ? " — solde insuffisant pour cette période" : ""
          }</div>`;
        } else {
          box.className = "alert info";
          box.innerHTML = `<svg class="ico"><use href="#i-info"/></svg><div>Aucun solde annuel pour ce type (absence non décomptée).</div>`;
        }
      }
    };
    ["start_date", "end_date", "employee_id", "leave_type_id"].forEach((n) => {
      const el = form.querySelector(`[name="${n}"]`);
      if (el) el.addEventListener("change", update);
    });
    update();
  }

  /* ---------------- Décision sur une demande ---------------- */
  async function decide(row, decision) {
    if (decision === "rejected") {
      const ok = await UI.confirm({
        title: "Refuser la demande",
        message: `Refuser la demande de <strong>${App.esc(row.employee_name)}</strong> (${App.fmt.date(row.start_date)} → ${App.fmt.date(
          row.end_date
        )}) ?`,
        confirmLabel: "Refuser",
        danger: true,
      });
      if (!ok) return;
    }
    await App.api("decide_leave_request", {
      id: row.id,
      decision,
      approver: (App.state.user && App.state.user.full_name) || "Administrateur",
      note: "",
    });
    App.toast(decision === "approved" ? "Demande approuvée" : "Demande refusée", "success");
    if (App.updateBadges) App.updateBadges();
    Router.render();
  }

  /* ---------------- Vue ---------------- */
  Views.leaves = {
    title: "Congés & absences",
    subtitle: "Demandes, soldes et calendrier",
    openNew,

    render: async function (el) {
      const tabs = [
        { id: "requests", label: "Demandes" },
        { id: "balances", label: "Soldes" },
        { id: "calendar", label: "Calendrier" },
      ];
      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div class="row-between wrap">
            <div id="leave-tabs" class="grow">${UI.tabs(tabs, state.tab)}</div>
            <div class="row">
              <select id="leave-year" style="height:36px">${yearOptions(state.year)}</select>
              <button class="btn btn-sm" data-act="export"><svg class="ico"><use href="#i-download"/></svg> Exporter</button>
              <button class="btn btn-sm btn-primary" data-act="new"><svg class="ico"><use href="#i-plus"/></svg> Nouvelle demande</button>
            </div>
          </div>
          <div id="leave-content"></div>
        </div>`;

      UI.bindTabs(el, (t) => {
        state.tab = t;
        Router.render();
      });
      el.querySelector("#leave-year").onchange = (e) => {
        state.year = e.target.value;
        Router.render();
      };
      el.querySelector('[data-act="new"]').onclick = () => openNew(null);
      el.querySelector('[data-act="export"]').onclick = async () => {
        const res = await App.call("export_csv", { kind: "leaves", params: { year: state.year } });
        if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
      };

      const box = el.querySelector("#leave-content");
      if (state.tab === "requests") await renderRequests(box);
      if (state.tab === "balances") await renderBalances(box);
      if (state.tab === "calendar") await renderCalendar(box);
    },
  };

  /* ---------------- Onglet : demandes ---------------- */
  async function renderRequests(box) {
    const rows = (await App.api("list_leave_requests", {
      year: state.year,
      status: state.status,
    })) || [];
    const pending = rows.filter((r) => r.status === "pending");

    box.innerHTML = `
      <div class="grid grid-4 mb-16">
        ${UI.kpi({ icon: "#i-calendar", label: "Demandes " + state.year, value: App.fmt.num(rows.length) })}
        ${UI.kpi({ icon: "#i-clock", tone: "amber", label: "En attente", value: App.fmt.num(pending.length) })}
        ${UI.kpi({ icon: "#i-check", tone: "green", label: "Approuvées", value: App.fmt.num(rows.filter((r) => r.status === "approved").length) })}
        ${UI.kpi({ icon: "#i-x", tone: "red", label: "Refusées", value: App.fmt.num(rows.filter((r) => r.status === "rejected").length) })}
      </div>
      ${UI.card({
        tight: true,
        body: `
          <div class="card-body" style="padding-bottom:0">
            <div class="filters">
              <span class="small muted row" style="gap:6px"><svg class="ico"><use href="#i-filter"/></svg> Statut</span>
              <div class="pill-group" id="leave-filter">
                ${[
                  ["all", "Toutes"],
                  ["pending", "En attente"],
                  ["approved", "Approuvées"],
                  ["rejected", "Refusées"],
                ]
                  .map(
                    ([v, l]) =>
                      `<button data-status="${v}" class="${state.status === v ? "active" : ""}">${l}${
                        v === "all" ? "" : ` (${rows.filter((r) => r.status === v).length})`
                      }</button>`
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div id="leave-table" style="margin-top:14px"></div>`,
      })}`;

    box.querySelector("#leave-filter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-status]");
      if (!b) return;
      state.status = b.dataset.status;
      Router.render();
    });

    const container = box.querySelector("#leave-table");
    UI.table(container, {
      rows,
      rowKey: (r) => r.id,
      resetSort: true,
      empty: {
        icon: "#i-calendar",
        title: "Aucune demande",
        text: `Aucune demande de congé enregistrée pour ${state.year}.`,
        action: "Créer une demande",
      },
      onEmptyAction: () => openNew(null),
      foot: `${rows.length} demande(s) · ${App.fmt.monthLabel(state.year + "-01").split(" ")[1]}`,
      columns: [
        {
          key: "employee_name",
          label: "Employé",
          render: (r) =>
            `<div class="person">
               ${UI.avatar(r.employee_name, r.color || "#4f46e5", "sm")}
               <div class="grow"><div class="p-name">${App.esc(r.employee_name)}</div>
               <div class="p-sub">${App.esc(r.department || "")}${r.matricule ? " · " + App.esc(r.matricule) : ""}</div></div>
             </div>`,
        },
        {
          key: "type_name",
          label: "Type",
          render: (r) => `<span class="badge plain" style="background:${App.esc(r.color || "#4f46e5")}22;color:${
            r.color || "#4f46e5"
          };border-color:${App.esc(r.color || "#4f46e5")}55">${App.esc(r.type_name)}</span>`,
        },
        {
          key: "start_date",
          label: "Période",
          render: (r) => `${App.fmt.date(r.start_date)} → ${App.fmt.date(r.end_date)}`,
          sortValue: (r) => r.start_date,
        },
        { key: "days", label: "Jours", align: "right", render: (r) => `<strong>${App.fmt.days(r.days)}</strong>` },
        {
          key: "status",
          label: "Statut",
          render: (r) => App.labels.badge(App.labels.leave, r.status) + (r.reason ? `<div class="small muted">${App.esc(r.reason)}</div>` : ""),
        },
        { key: "created_at", label: "Demande", align: "center", render: (r) => App.fmt.date(r.created_at) },
        {
          key: "actions",
          label: "",
          sortable: false,
          align: "right",
          cls: "actions-cell",
          render: (r) =>
            r.status === "pending"
              ? `<button class="icon-btn success" data-act="approve" data-id="${r.id}" title="Approuver"><svg class="ico"><use href="#i-check"/></svg></button>
                 <button class="icon-btn danger" data-act="reject" data-id="${r.id}" title="Refuser"><svg class="ico"><use href="#i-x"/></svg></button>
                 <button class="icon-btn danger" data-act="delete" data-id="${r.id}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`
              : `<button class="icon-btn danger" data-act="delete" data-id="${r.id}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`,
        },
      ],
    });

    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const row = rows.find((r) => r.id === Number(btn.dataset.id));
      if (!row) return;
      if (btn.dataset.act === "approve") return decide(row, "approved");
      if (btn.dataset.act === "reject") return decide(row, "rejected");
      if (btn.dataset.act === "delete") {
        const ok = await UI.confirm({
          title: "Supprimer la demande",
          message: `Supprimer la demande de ${App.esc(row.employee_name)} (${App.fmt.date(row.start_date)} → ${App.fmt.date(row.end_date)}) ?`,
          confirmLabel: "Supprimer",
          danger: true,
        });
        if (!ok) return;
        await App.api("delete_leave_request", { id: row.id });
        if (App.updateBadges) App.updateBadges();
        App.toast("Demande supprimée", "success");
        Router.render();
      }
    });
  }

  /* ---------------- Onglet : soldes ---------------- */
  async function renderBalances(box) {
    const rows = (await App.api("leave_balances", { year: state.year })) || [];
    const types = (App.state.leaveTypes || []).filter((t) => t.active !== 0 && t.days_per_year > 0);
    const employees = [];
    rows.forEach((r) => {
      let emp = employees.find((e) => e.id === r.employee_id);
      if (!emp) {
        emp = {
          id: r.employee_id,
          name: `${r.first_name} ${r.last_name}`,
          department: r.department,
          status: r.status,
          items: [],
        };
        employees.push(emp);
      }
      emp.items.push(r);
    });

    box.innerHTML = UI.card({
      title: `Soldes de congés — ${state.year}`,
      subtitle: "Acquis, consommé et restant par salarié",
      tight: true,
      actions: `<span class="small muted">Seuls les types annuels (jours/an > 0) sont décomptés</span>`,
      body: `<div id="bal-table"></div>`,
    });

    const container = box.querySelector("#bal-table");
    const columns = [
      {
        key: "name",
        label: "Employé",
        render: (e) =>
          `<div class="person">${UI.avatar(e.name, "#4f46e5", "sm")}<div class="grow"><div class="p-name">${App.esc(
            e.name
          )}</div><div class="p-sub">${App.esc(e.department || "")}</div></div></div>`,
      },
      ...types.map((t) => ({
        key: "type_" + t.id,
        label: t.name,
        align: "center",
        sortable: false,
        render: (e) => {
          const item = e.items.find((x) => x.type_id === t.id);
          if (!item) return "—";
          const restant = Math.max(0, (item.acquis || 0) - (item.pris || 0));
          const pct = item.acquis ? Math.round((restant / item.acquis) * 100) : 0;
          const tone = pct < 25 ? "red" : pct < 60 ? "amber" : "green";
          return `<span class="badge ${tone} plain">${App.fmt.days(item.pris || 0)} / ${App.fmt.days(item.acquis)}</span>
                  <div class="progress mt-8" style="max-width:110px;margin:6px auto 0"><span style="width:${pct}%"></span></div>`;
        },
      })),
      {
        key: "restant",
        label: "Restant total",
        align: "right",
        render: (e) => {
          const total = e.items.reduce((a, x) => a + Math.max(0, (x.acquis || 0) - (x.pris || 0)), 0);
          return `<strong>${App.fmt.days(total)}</strong>`;
        },
      },
      {
        key: "pending",
        label: "En attente",
        align: "right",
        sortable: false,
        render: (e) => {
          const n = e.items.reduce((a, x) => a + (x.en_attente || 0), 0);
          return n ? `<span class="badge amber">${n}</span>` : `<span class="muted">—</span>`;
        },
      },
    ];

    UI.table(container, {
      rows: employees,
      rowKey: (e) => e.id,
      columns,
      onRowClick: (e) => App.go("/employees/" + e.id),
      resetSort: true,
      empty: { icon: "#i-calendar", title: "Aucun solde", text: "Aucun salarié ou aucun type de congé annuel configuré." },
      foot: `${employees.length} salarié(s) · ${types.length} type(s) annuel(s)`,
    });
  }

  /* ---------------- Onglet : calendrier ---------------- */
  async function renderCalendar(box) {
    const rows = (await App.api("list_leave_requests", { year: state.year, status: "all" })) || [];
    const holidays = (await App.call("list_holidays")) || [];
    const year = Number(state.year);
    const employees = [];
    rows.forEach((r) => {
      if (!employees.find((e) => e.name === r.employee_name)) {
        employees.push({ name: r.employee_name, color: r.color, items: [] });
      }
      employees.find((e) => e.name === r.employee_name).items.push(r);
    });

    const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const pct = (dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const start = new Date(year, 0, 1).getTime();
      const end = new Date(year + 1, 0, 1).getTime();
      return Math.max(0, Math.min(100, ((d.getTime() - start) / (end - start)) * 100));
    };

    box.innerHTML = UI.card({
      title: `Calendrier des absences — ${year}`,
      subtitle: `${rows.filter((r) => r.status === "approved").length} période(s) approuvée(s) · ${
        rows.filter((r) => r.status === "pending").length
      } en attente`,
      body: employees.length
        ? `
        <div class="row" style="gap:16px;margin-bottom:12px" class="wrap">
          <span class="badge indigo plain">Congé approuvé</span>
          <span class="badge amber plain">En attente</span>
          <span class="badge gray plain">Refusé</span>
          <span class="badge purple plain">Jour férié</span>
        </div>
        <div class="table-wrap">
          <table class="table" style="min-width:760px">
            <thead><tr>
              <th style="min-width:170px">Employé</th>
              ${monthNames.map((m) => `<th class="center" style="width:6.6%;text-align:center">${m}</th>`).join("")}
            </tr></thead>
            <tbody>
              ${employees
                .map(
                  (emp) => `<tr>
                    <td class="nowrap">${App.esc(emp.name)}</td>
                    <td colspan="12" style="padding:6px 8px;position:relative;height:34px">
                      ${emp.items
                        .map((r) => {
                          const left = pct(r.start_date);
                          const right = pct(r.end_date);
                          const width = Math.max(1.2, right - left);
                          const cls =
                            r.status === "approved" ? "indigo" : r.status === "pending" ? "amber" : "gray";
                          return `<span title="${App.esc(r.type_name)} : ${App.fmt.date(r.start_date)} → ${App.fmt.date(
                            r.end_date
                          )} (${App.fmt.days(r.days)})" style="
                            position:absolute;top:6px;left:${left}%;width:${width}%;
                            background:${r.status === "approved" ? "#6366f1" : r.status === "pending" ? "#f59e0b" : "#cbd5e1"};
                            color:#fff;border-radius:6px;font-size:10.5px;line-height:20px;height:20px;
                            overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 6px;cursor:default"
                            class="badge-plain-${cls}">${App.esc(r.type_name)}</span>`;
                        })
                        .join("")}
                    </td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
        : UI.empty({
            icon: "#i-calendar",
            title: "Aucune absence planifiée",
            text: `Aucune demande de congé sur ${state.year}. Créez une demande pour la voir apparaître ici.`,
            action: "Créer une demande",
          }),
      foot: `<span class="small muted">Survolez une barre pour le détail de la période.</span>`,
    });
    const btn = box.querySelector("[data-empty-action]");
    if (btn) btn.onclick = () => openNew(null);

    // Jours fériés de l'année
    const list = holidays.slice(0, 24);
    box.insertAdjacentHTML(
      "beforeend",
      UI.card({
        title: "Jours fériés",
        subtitle: "Paramétrés dans Paramètres → Congés & fériés",
        className: "mt-16",
        body: list.length
          ? `<div class="grid grid-4" style="gap:8px">${list
              .map(
                (h) =>
                  `<div class="row" style="gap:8px;background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:8px 10px">
                     <span class="badge purple plain">${h.recurring ? App.fmt.date("2000-" + h.date) : App.fmt.date(h.date)}</span>
                     <span class="small grow">${App.esc(h.name)}</span>
                   </div>`
              )
              .join("")}</div>`
          : `<p class="muted small">Aucun jour férié configuré.</p>`,
      })
    );
  }
})();
