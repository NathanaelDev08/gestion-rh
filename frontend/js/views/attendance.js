/* ============================================================
   Gestion RH — Présence & pointeuse
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const state = {
    tab: "clock",
    month: new Date().toISOString().slice(0, 7),
    from: new Date().toISOString().slice(0, 7) + "-01",
    to: new Date().toISOString().slice(0, 10),
  };

  let clockTimer = null;

  const STATUS_OPTIONS = [
    { value: "present", label: "Présent" },
    { value: "late", label: "En retard" },
    { value: "absent", label: "Absent" },
    { value: "leave", label: "Congé" },
    { value: "sick", label: "Arrêt maladie" },
    { value: "remote", label: "Télétravail" },
    { value: "mission", label: "Mission" },
    { value: "holiday", label: "Jour férié" },
  ];

  /* ---------------- Pointage rapide ---------------- */
  async function clock(employeeId, action) {
    await App.api("clock_event", { employee_id: employeeId, action });
    const label = action === "in" ? "Arrivée pointée" : "Départ pointé";
    App.toast(label + " · " + App.fmt.nowHM(), "success");
    Router.render();
  }

  async function openClock() {
    const list = (await App.call("today_presence")) || [];
    UI.openModal({
      title: "Pointeuse",
      subtitle: `Journée du ${App.fmt.dateLong(App.fmt.today())}`,
      size: "md",
      body: `
        <div class="row mb-16" style="justify-content:center">
          <div style="font-size:44px;font-weight:750;letter-spacing:-.03em" id="clock-live">${App.fmt.nowHM()}</div>
        </div>
        <div style="max-height:52vh;overflow-y:auto;border:1px solid var(--border);border-radius:12px">
          ${
            list.length
              ? list
                  .map((p) => {
                    const doneIn = !!p.clock_in;
                    const doneOut = !!p.clock_out;
                    return `<div class="list-item">
                        ${UI.avatar(`${p.first_name} ${p.last_name}`, p.photo_color, "sm")}
                        <div class="li-main">
                          <div class="li-title">${App.esc(p.first_name)} ${App.esc(p.last_name)}</div>
                          <div class="li-sub">${
                            doneIn
                              ? `Entrée ${App.fmt.time(p.clock_in)}${doneOut ? " · Sortie " + App.fmt.time(p.clock_out) : ""}`
                              : "Non pointé"
                          }</div>
                        </div>
                        ${p.id ? App.labels.badge(App.labels.attendance, p.status) : `<span class="badge gray">—</span>`}
                        <button class="icon-btn ${doneIn ? "" : "success"}" data-clock-in="${p.employee_id}" ${
                      doneIn ? "disabled title='Déjà pointé'" : "title='Pointer l'arrivée'"
                    }><svg class="ico"><use href="#i-upload"/></svg></button>
                        <button class="icon-btn ${!doneIn || doneOut ? "" : ""}" data-clock-out="${p.employee_id}" ${
                      !doneIn || doneOut ? "disabled title='Indisponible'" : "title='Pointer le départ'"
                    }><svg class="ico"><use href="#i-download"/></svg></button>
                      </div>`;
                  })
                  .join("")
              : UI.empty({ icon: "#i-users", title: "Aucun employé en poste" })
          }
        </div>`,
      footer: `<span class="left">Arrivée puis départ — le calcul des heures est automatique.</span>
               <button class="btn" data-close>Fermer</button>`,
    });
    const modal = document.getElementById("modal-root").lastElementChild;
    modal.querySelector("[data-close]").onclick = () => UI.closeModal();
    const live = modal.querySelector("#clock-live");
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (!document.body.contains(live)) return clearInterval(clockTimer);
      live.textContent = App.fmt.nowHM();
    }, 1000);
    modal.addEventListener("click", async (e) => {
      const inBtn = e.target.closest("[data-clock-in]");
      const outBtn = e.target.closest("[data-clock-out]");
      if (inBtn && !inBtn.disabled) {
        UI.closeModal();
        await clock(Number(inBtn.dataset.clockIn), "in");
      }
      if (outBtn && !outBtn.disabled) {
        UI.closeModal();
        await clock(Number(outBtn.dataset.clockOut), "out");
      }
    });
  }

  /* ---------------- Édition d'une journée ---------------- */
  function editDay(row, defaults) {
    const values = Object.assign(
      {
        employee_id: "",
        date: App.fmt.today(),
        status: "present",
        clock_in: "",
        clock_out: "",
        break_minutes: 60,
        note: "",
      },
      defaults || {},
      row || {}
    );
    UI.form({
      title: row ? "Modifier la journée" : "Ajouter un pointage",
      subtitle: row ? `${row.employee_name || ""} · ${App.fmt.date(row.date)}` : "",
      size: "md",
      submitLabel: "Enregistrer",
      successMessage: "Pointage enregistré",
      fields: [
        { name: "employee_id", label: "Employé", type: "select", col: 7, required: true, value: values.employee_id, options: (App.state.employees || []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })) },
        { name: "date", label: "Date", type: "date", col: 5, required: true, value: values.date },
        { name: "status", label: "Statut", type: "select", col: 6, value: values.status || "present", options: STATUS_OPTIONS },
        { name: "break_minutes", label: "Pause (minutes)", type: "number", col: 6, value: values.break_minutes || 0, min: 0, step: 5 },
        { name: "clock_in", label: "Arrivée", type: "time", col: 6, value: values.clock_in || "" },
        { name: "clock_out", label: "Départ", type: "time", col: 6, value: values.clock_out || "" },
        { name: "note", label: "Note", col: 12, value: values.note || "" },
        { type: "html", col: 12, html: row ? `<button type="button" class="btn btn-danger btn-sm" data-del="${row.id}"><svg class="ico"><use href="#i-trash"/></svg> Supprimer ce pointage</button>` : "" },
      ],
      onSubmit: async (v) => {
        await App.api("save_attendance", { data: v });
        Router.render();
      },
    });
    const del = document.querySelector("[data-del]");
    if (del)
      del.onclick = async () => {
        const ok = await UI.confirm({ title: "Supprimer le pointage", message: "Supprimer cette journée ?", confirmLabel: "Supprimer", danger: true });
        if (!ok) return;
        await App.api("delete_attendance", { id: Number(del.dataset.del) });
        UI.closeAllModals();
        App.toast("Pointage supprimé", "success");
        Router.render();
      };
  }

  /* ---------------- Vue ---------------- */
  Views.attendance = {
    title: "Présence",
    subtitle: "Pointeuse, registre et rapports",
    openClock,
    openEdit: editDay,

    render: async function (el) {
      if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
      }
      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div class="row-between wrap">
            <div id="att-tabs" class="grow">${UI.tabs(
              [
                { id: "clock", label: "Pointeuse" },
                { id: "grid", label: "Registre mensuel" },
                { id: "report", label: "Rapports" },
              ],
              state.tab
            )}</div>
            <div class="row wrap">
              ${
                state.tab === "grid"
                  ? `<input type="month" id="att-month" value="${state.month}" style="height:36px;width:160px"/>`
                  : state.tab === "report"
                  ? `<input type="date" id="att-from" value="${state.from}" style="height:36px"/> <span class="muted small">au</span> <input type="date" id="att-to" value="${state.to}" style="height:36px"/>`
                  : ""
              }
              <button class="btn btn-sm" data-act="add"><svg class="ico"><use href="#i-plus"/></svg> Saisie manuelle</button>
              <button class="btn btn-sm btn-primary" data-act="clock"><svg class="ico"><use href="#i-clock"/></svg> Pointer</button>
            </div>
          </div>
          <div id="att-content"></div>
        </div>`;

      UI.bindTabs(el, (t) => {
        state.tab = t;
        Router.render();
      });
      const monthInput = el.querySelector("#att-month");
      if (monthInput)
        monthInput.onchange = () => {
          state.month = monthInput.value;
          Router.render();
        };
      const fromInput = el.querySelector("#att-from");
      if (fromInput)
        fromInput.onchange = () => {
          state.from = fromInput.value;
          Router.render();
        };
      const toInput = el.querySelector("#att-to");
      if (toInput)
        toInput.onchange = () => {
          state.to = toInput.value;
          Router.render();
        };
      el.querySelector('[data-act="clock"]').onclick = openClock;
      el.querySelector('[data-act="add"]').onclick = () => editDay(null, { date: state.tab === "grid" ? state.month + "-01" : App.fmt.today() });

      const box = el.querySelector("#att-content");
      if (state.tab === "clock") await renderClock(box);
      if (state.tab === "grid") await renderGrid(box);
      if (state.tab === "report") await renderReport(box);
    },
  };

  /* ---------------- Pointeuse ---------------- */
  async function renderClock(box) {
    const [presence, todayRows] = await Promise.all([
      App.api("today_presence"),
      App.call("list_attendance", { month: App.fmt.today().slice(0, 7) }),
    ]);
    const monthRows = todayRows || [];
    const present = (presence || []).filter((p) => p.clock_in).length;
    const late = (presence || []).filter((p) => p.status === "late").length;
    const notYet = (presence || []).filter((p) => !p.clock_in).length;
    const monthHours = monthRows.reduce((a, r) => a + (r.worked_minutes || 0), 0);

    box.innerHTML = `
      <div class="grid grid-4 mb-16">
        ${UI.kpi({ icon: "#i-user-check", tone: "green", label: "Pointés aujourd'hui", value: App.fmt.num(present), hint: `${App.fmt.num(notYet)} non pointés` })}
        ${UI.kpi({ icon: "#i-alert", tone: late ? "amber" : "green", label: "Retards", value: App.fmt.num(late), hint: "Au-delà de la tolérance" })}
        ${UI.kpi({ icon: "#i-clock", tone: "sky", label: "Heures ce mois", value: App.fmt.duration(monthHours), hint: App.fmt.monthLabel(App.fmt.today().slice(0, 7)) })}
        ${UI.kpi({ icon: "#i-refresh", tone: "teal", label: "Horaires", value: `${App.esc((App.state.settings.work || {}).start || "08:30")}–${App.esc((App.state.settings.work || {}).end || "17:30")}`, hint: "tolérance de retard paramétrée" })}
      </div>
      ${UI.card({
        title: "Pointage du jour",
        subtitle: App.fmt.dateLong(App.fmt.today()),
        tight: true,
        actions: `<button class="btn btn-sm btn-primary" data-act="open-clock"><svg class="ico"><use href="#i-clock"/></svg> Ouvrir la pointeuse</button>`,
        body: `<div id="clock-list"></div>`,
      })}
      <div class="mt-16">${UI.card({
        title: "Dernières journées saisies",
        subtitle: "5 derniers pointages",
        tight: true,
        body: `<div id="recent-list"></div>`,
      })}</div>`;

    const list = box.querySelector("#clock-list");
    if (!presence.length) list.innerHTML = UI.empty({ icon: "#i-users", title: "Aucun employé en poste" });
    else
      list.innerHTML = presence
        .map((p) => {
          const name = `${p.first_name} ${p.last_name}`;
          return UI.listItem({
            attrs: `data-emp="${p.employee_id}"`,
            avatar: UI.avatar(name, p.photo_color, "sm"),
            title: App.esc(name),
            sub: `${App.esc(p.job_title || "")}${p.clock_in ? ` · entrée à ${App.fmt.time(p.clock_in)}` : " · non pointé"}`,
            right: `${p.id ? App.labels.badge(App.labels.attendance, p.status) : `<span class="badge gray">Non pointé</span>`}
                    <div class="small muted">${p.clock_out ? "sortie " + App.fmt.time(p.clock_out) : p.worked_minutes ? App.fmt.duration(p.worked_minutes) : ""}</div>`,
            actions: `<button class="icon-btn success" data-in="${p.employee_id}" title="Arrivée" ${p.clock_in ? "disabled" : ""}><svg class="ico"><use href="#i-upload"/></svg></button>
                      <button class="icon-btn" data-out="${p.employee_id}" title="Départ" ${!p.clock_in || p.clock_out ? "disabled" : ""}><svg class="ico"><use href="#i-download"/></svg></button>
                      <button class="icon-btn" data-edit="${p.id || ""}" data-date="${App.fmt.today()}" title="Corriger"><svg class="ico"><use href="#i-edit"/></svg></button>`,
          });
        })
        .join("");

    box.querySelector('[data-act="open-clock"]').onclick = openClock;
    list.addEventListener("click", async (e) => {
      const inBtn = e.target.closest("[data-in]");
      const outBtn = e.target.closest("[data-out]");
      const editBtn = e.target.closest("[data-edit]");
      if (inBtn && !inBtn.disabled) return clock(Number(inBtn.dataset.in), "in");
      if (outBtn && !outBtn.disabled) return clock(Number(outBtn.dataset.out), "out");
      if (editBtn) {
        const rows = await App.call("list_attendance", { month: App.fmt.today().slice(0, 7) });
        const row = (rows || []).find(
          (r) => r.date === editBtn.dataset.date && r.id === Number(editBtn.dataset.edit)
        );
        editDay(row || null, { date: App.fmt.today(), employee_id: Number(editBtn.closest("[data-emp]").dataset.emp) });
      }
    });

    const recent = box.querySelector("#recent-list");
    const last5 = monthRows.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
    recent.innerHTML = last5.length
      ? last5
          .map((r) =>
            UI.listItem({
              title: `${App.fmt.date(r.date)} — ${App.esc(r.employee_name)}`,
              sub: r.clock_in
                ? `${App.fmt.time(r.clock_in)} → ${App.fmt.time(r.clock_out)} · ${App.fmt.duration(r.worked_minutes)}${
                    r.overtime_minutes ? " · dont " + App.fmt.duration(r.overtime_minutes) + " sup." : ""
                  }`
                : "Aucun pointage",
              right: App.labels.badge(App.labels.attendance, r.status),
              actions: `<button class="icon-btn" data-act="edit-row" data-id="${r.id}"><svg class="ico"><use href="#i-edit"/></svg></button>`,
            })
          )
          .join("")
      : UI.empty({ icon: "#i-clock", title: "Aucun pointage ce mois-ci" });
    recent.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-id]");
      if (!b) return;
      const row = (monthRows || []).find((r) => r.id === Number(b.dataset.id));
      if (row) editDay(row);
    });
  }

  /* ---------------- Registre mensuel ---------------- */
  async function renderGrid(box) {
    const grid = await App.api("monthly_grid", { month: state.month });
    const days = Number(grid.days);
    const year = Number(grid.year);
    const monthNum = Number(grid.month_number);
    const weekdays = (App.state.settings.work && App.state.settings.work.work_weekdays) || [1, 2, 3, 4, 5];
    const att = grid.attendance || [];
    const empIds = new Set((grid.employees || []).map((e) => e.id));
    const leaveMap = {};
    (grid.leaves || []).forEach((l) => {
      if (!empIds.has(l.employee_id)) return;
      const start = new Date(l.start_date + "T00:00:00");
      const end = new Date(l.end_date + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (key.slice(0, 7) === state.month) (leaveMap[l.employee_id] = leaveMap[l.employee_id] || {})[key] = l;
      }
    });

    const code = { present: "P", late: "R", absent: "A", leave: "C", sick: "M", remote: "T", mission: "Mi", holiday: "F" };
    const headerCells = [];
    const holidayDays = {};
    (grid.holidays || []).forEach((h) => {
      const d = Number(String(h.date).slice(8, 10));
      if (d) holidayDays[d] = h.name;
    });
    for (let d = 1; d <= days; d++) {
      const dt = new Date(Date.UTC(year, monthNum - 1, d));
      const wd = dt.getUTCDay() + 1; // 1 = lundi
      const we = !weekdays.includes(wd);
      const hol = !!holidayDays[d];
      headerCells.push(
        `<th class="${hol ? "holiday" : we ? "we" : ""}" title="${App.esc(holidayDays[d] || "")}">${
          ["D", "L", "M", "M", "J", "V", "S"][dt.getUTCDay()]
        }<br><b>${d}</b></th>`
      );
    }

    const body = (grid.employees || [])
      .map((emp) => {
        const rows = att.filter((a) => a.employee_id === emp.id);
        const cells = [];
        let totalMin = 0;
        let lates = 0;
        for (let d = 1; d <= days; d++) {
          const date = `${state.month}-${String(d).padStart(2, "0")}`;
          const dt = new Date(Date.UTC(year, monthNum - 1, d));
          const we = !weekdays.includes(dt.getUTCDay() + 1);
          const row = rows.find((r) => r.date === date);
          let cls = "";
          let text = "";
          if (row) {
            totalMin += row.worked_minutes || 0;
            if (row.status === "late") lates++;
            cls = row.status;
            text = code[row.status] || "P";
          } else if (holidayDays[d]) {
            cls = "holiday";
            text = "F";
          } else if (leaveMap[emp.id] && leaveMap[emp.id][date]) {
            cls = "leave";
            text = "C";
          } else if (we) {
            cls = "empty";
            text = "·";
          } else {
            cls = "empty";
            text = "";
          }
          cells.push(
            `<td class="${we && !row ? "we" : ""}" data-emp="${emp.id}" data-date="${date}" style="cursor:pointer" title="${App.esc(
              emp.first_name + " " + emp.last_name
            )} — ${date}">
               <span class="cell ${cls}">${text}</span>
             </td>`
          );
        }
        const totals = `
          <td class="nowrap"><b>${App.fmt.duration(totalMin)}</b></td>
          <td>${lates ? `<span class="badge amber">${lates}</span>` : `<span class="muted">0</span>`}</td>`;
        return `<tr>
            <td class="emp-cell">${UI.avatar(`${emp.first_name} ${emp.last_name}`, emp.photo_color, "sm")} <b>${App.esc(
          emp.last_name
        )}</b> ${App.esc(emp.first_name)}<div class="small muted">${App.esc(emp.department || "")}</div></td>
            ${cells.join("")}
            ${totals}
          </tr>`;
      })
      .join("");

    box.innerHTML = UI.card({
      title: `Registre de présence — ${App.fmt.monthLabel(state.month)}`,
      subtitle: `${grid.employees.length} salarié(s) · cliquez une case pour corriger`,
      tight: true,
      body: `<div class="table-wrap" style="max-height:calc(100vh - 340px);overflow:auto">
          <table class="grid-days" style="min-width:${190 + days * 28 + 140}px">
            <thead><tr>
              <th class="emp-cell" style="text-align:left;background:var(--surface-2)">Employé</th>
              ${headerCells.join("")}
              <th style="background:var(--surface-2)">Heures</th>
              <th style="background:var(--surface-2)">Retards</th>
            </tr></thead>
            <tbody>${body || `<tr><td colspan="${days + 3}">${UI.empty({ icon: "#i-users", title: "Aucun salarié en poste" })}</td></tr>`}</tbody>
          </table>
        </div>`,
      foot: `<span class="row wrap" style="gap:12px">
          <span class="cell present">P</span> Présent
          <span class="cell late">R</span> Retard
          <span class="cell leave">C</span> Congé
          <span class="cell absent">A</span> Absent
          <span class="cell remote">T</span> Télétravail
          <span class="cell holiday">F</span> Férié
        </span>
        <span class="muted small">Les cases grises sont des jours non travaillés.</span>`,
    });

    box.addEventListener("click", async (e) => {
      const td = e.target.closest("td[data-emp]");
      if (!td) return;
      const date = td.dataset.date;
      const empId = Number(td.dataset.emp);
      const row = (grid.attendance || []).find((r) => r.employee_id === empId && r.date === date);
      editDay(row || null, { date, employee_id: empId });
    });
  }

  /* ---------------- Rapport ---------------- */
  async function renderReport(box) {
    const rows = await App.api("attendance_summary", { date_from: state.from, date_to: state.to });
    const totalHours = rows.reduce((a, r) => a + (r.worked_minutes || 0), 0);
    const totalOvertime = rows.reduce((a, r) => a + (r.overtime_minutes || 0), 0);
    const totalLates = rows.reduce((a, r) => a + (r.lates || 0), 0);

    box.innerHTML = `
      <div class="grid grid-4 mb-16">
        ${UI.kpi({ icon: "#i-users", tone: "green", label: "Jours de présence", value: App.fmt.num(rows.reduce((a, r) => a + (r.days_present || 0), 0)) })}
        ${UI.kpi({ icon: "#i-clock", tone: "sky", label: "Heures travaillées", value: App.fmt.duration(totalHours) })}
        ${UI.kpi({ icon: "#i-trend", tone: "teal", label: "Heures supplémentaires", value: App.fmt.duration(totalOvertime) })}
        ${UI.kpi({ icon: "#i-alert", tone: totalLates ? "amber" : "green", label: "Retards", value: App.fmt.num(totalLates) })}
      </div>
      ${UI.card({
        tight: true,
        actions: `<button class="btn btn-sm" data-act="export"><svg class="ico"><use href="#i-download"/></svg> Exporter CSV</button>`,
        body: `<div id="report-table"></div>`,
        foot: `Période du ${App.fmt.date(state.from)} au ${App.fmt.date(state.to)}`,
      })}`;

    const container = box.querySelector("#report-table");
    UI.table(container, {
      rows,
      rowKey: (r) => r.employee_id,
      resetSort: true,
      empty: { icon: "#i-clock", title: "Aucune donnée", text: "Aucun pointage sur cette période." },
      foot: `${rows.length} salarié(s)`,
      columns: [
        {
          key: "employee_name",
          label: "Employé",
          render: (r) =>
            `<div class="person">${UI.avatar(r.employee_name, "#0ea5e9", "sm")}<div class="grow"><div class="p-name">${App.esc(
              r.employee_name
            )}</div><div class="p-sub">${App.esc(r.matricule || "")} · ${App.esc(r.department || "")}</div></div></div>`,
        },
        { key: "days_present", label: "Jours", align: "right" },
        { key: "worked_minutes", label: "Heures", align: "right", render: (r) => `<strong>${App.fmt.duration(r.worked_minutes)}</strong>`, sortValue: (r) => r.worked_minutes },
        { key: "overtime_minutes", label: "H. sup.", align: "right", render: (r) => App.fmt.duration(r.overtime_minutes) },
        { key: "lates", label: "Retards", align: "right", render: (r) => (r.lates ? `<span class="badge amber">${r.lates}</span>` : "0") },
        { key: "absents", label: "Absences", align: "right", render: (r) => (r.absents ? `<span class="badge red">${r.absents}</span>` : "0") },
      ],
    });

    container.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-key]");
      if (tr && !e.target.closest("button")) App.go("/employees/" + tr.dataset.key);
    });

    box.querySelector('[data-act="export"]').onclick = async () => {
      const res = await App.call("export_csv", { kind: "attendance", params: { from: state.from, to: state.to } });
      if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
    };
  }
})();
