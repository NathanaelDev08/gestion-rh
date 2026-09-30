/* ============================================================
   Gestion RH — Tableau de bord
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function shortMonth(ym) {
    const n = Number(String(ym).slice(5, 7));
    return MONTHS[n - 1] || "";
  }

  async function refresh() {
    Router.render();
  }

  Views.dashboard = {
    title: "Tableau de bord",
    subtitle: () => App.fmt.dateLong(App.fmt.today()),

    render: async function (el) {
      const s = await App.api("dashboard_stats");
      const hc = s.headcount || {};
      const pr = s.presence || {};
      const lv = s.leaves || {};
      const rec = s.recruitment || {};
      const pay = s.payroll && s.payroll.id ? s.payroll : null;
      const total = (hc.total || 0) - (hc.terminated || 0);
      const user = App.state.user || { full_name: "" };

      const maxDept = Math.max(1, ...(s.by_department || []).map((d) => d.n));

      const evolution = (s.evolution || []).map((e) => ({
        value: e.headcount,
        label: App.fmt.monthLabel(e.month),
        short: shortMonth(e.month),
      }));

      const leaveSeries = [];
      if (s.leave_monthly && s.leave_monthly.length) {
        const year = App.fmt.today().slice(0, 4);
        for (let m = 1; m <= 12; m++) {
          const key = `${year}-${String(m).padStart(2, "0")}`;
          const row = s.leave_monthly.find((x) => x.month === key);
          leaveSeries.push({
            value: row ? row.n : 0,
            label: App.fmt.monthLabel(key),
            short: MONTHS[m - 1],
          });
        }
      }

      el.innerHTML = `
      <div class="stack" style="gap:18px">

        <div class="row-between wrap">
          <div>
            <h3 style="font-size:19px">Bonjour, ${App.esc((user.full_name || user.username || "").split(" ")[0])} 👋</h3>
            <p class="muted small mt-8">${App.esc(App.fmt.dateLong(App.fmt.today()))} · ${
        s.is_workday ? "Jour ouvré" : "Week-end / jour férié"
      } · <strong>${App.fmt.num(total)}</strong> salarié(s) en effectif</p>
          </div>
          <div class="row wrap">
            <button class="btn" data-act="clock"><svg class="ico"><use href="#i-clock"/></svg> Pointer</button>
            <button class="btn" data-act="leave"><svg class="ico"><use href="#i-calendar"/></svg> Demande de congé</button>
            <button class="btn btn-primary" data-act="employee"><svg class="ico"><use href="#i-plus"/></svg> Nouvel employé</button>
          </div>
        </div>

        <div class="grid grid-6">
          ${UI.kpi({
            icon: "#i-users",
            label: "Effectif actif",
            value: App.fmt.num(total),
            hint: `${App.fmt.num(hc.hires_month || 0)} arrivée(s) ce mois · ${App.fmt.num(hc.terminated || 0)} sorti(s)`,
          })}
          ${UI.kpi({
            icon: "#i-user-check",
            tone: "green",
            label: "Présents aujourd'hui",
            value: App.fmt.num(pr.present || 0),
            hint: pr.late ? `${App.fmt.num(pr.late)} en retard` : "Aucun retard",
          })}
          ${UI.kpi({
            icon: "#i-alert",
            tone: pr.missing ? "red" : "green",
            label: "Absents / non pointés",
            value: App.fmt.num(pr.missing || 0),
            hint: `${App.fmt.num(pr.excused || 0)} en congé ou arrêt`,
          })}
          ${UI.kpi({
            icon: "#i-calendar",
            tone: lv.pending ? "amber" : "green",
            label: "Congés en attente",
            value: App.fmt.num(lv.pending || 0),
            hint: `${App.fmt.num(lv.away_today || 0)} salarié(s) absent(s) aujourd'hui`,
          })}
          ${UI.kpi({
            icon: "#i-wallet",
            tone: "teal",
            label: "Masse salariale",
            value: pay ? App.fmt.moneyShort(pay.total_gross) : "—",
            hint: pay ? `Paie ${App.esc(pay.period)} · net ${App.fmt.moneyShort(pay.total_net)}` : "Aucune paie générée",
          })}
          ${UI.kpi({
            icon: "#i-briefcase",
            tone: "sky",
            label: "Recrutement",
            value: App.fmt.num(rec.in_pipeline || 0),
            hint: `${App.fmt.num(rec.open_offers || 0)} offre(s) ouverte(s) · ${App.fmt.num(rec.pending_interviews || 0)} entretien(s)`,
          })}
        </div>

        <div class="grid grid-3">
          ${UI.card({
            title: "Évolution de l'effectif",
            subtitle: "12 derniers mois (arrivées - départs)",
            actions: `<a class="btn btn-sm" href="#/employees">Employés</a>`,
            body: evolution.length
              ? UI.spark(evolution, { display: (i) => `${i.value} salarié(s)` })
              : UI.empty({ icon: "#i-trend", title: "Pas encore de données" }),
          })}
          ${UI.card({
            title: "Répartition par service",
            subtitle: "Effectif et masse salariale",
            body: (s.by_department || []).length
              ? s.by_department
                  .map((d) =>
                    UI.bar(d.department, d.n, maxDept, {
                      display: `${App.fmt.num(d.n)}`,
                      tone: d.n > maxDept / 2 ? "" : "teal",
                    })
                  )
                  .join("")
              : UI.empty({ icon: "#i-sitemap", title: "Aucun service", text: "Créez des départements dans l'organigramme." }),
            foot: `<span class="muted small">Masse salariale cumulée : <strong>${
              s.by_department ? App.fmt.moneyShort(s.by_department.reduce((a, d) => a + (d.salary_mass || 0), 0)) : "—"
            }</strong></span>`,
          })}
          ${UI.card({
            title: "À venir",
            subtitle: "Jours fériés et événements",
            body: `
              <p class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">Jours fériés</p>
              ${
                (s.upcoming_holidays || []).length
                  ? s.upcoming_holidays
                      .map(
                        (h) => `<div class="row" style="padding:6px 0;gap:10px">
                          <span class="badge purple plain">${App.fmt.date(h.date)}</span>
                          <span class="grow">${App.esc(h.name)}</span>
                          <span class="muted small">${
                            h.in_days === 0 ? "aujourd'hui" : `dans ${h.in_days} j`
                          }</span>
                        </div>`
                      )
                      .join("")
                  : `<p class="muted small">Aucun jour férié dans les 60 prochains jours.</p>`
              }
              <p class="small mt-16" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">Anniversaires d'embauche</p>
              ${
                (s.anniversaries || []).length
                  ? s.anniversaries
                      .slice(0, 4)
                      .map(
                        (a) => `<div class="row" style="padding:5px 0">
                            ${UI.avatar(a.name, a.photo_color, "sm")}
                            <span class="grow">${App.esc(a.name)}</span>
                            <span class="badge indigo plain">${a.years} an${a.years > 1 ? "s" : ""}</span>
                          </div>`
                      )
                      .join("")
                  : `<p class="muted small">Aucun anniversaire ce mois-ci.</p>`
              }`,
          })}
        </div>

        <div class="grid grid-2">
          ${UI.card({
            title: "Présence du jour",
            subtitle: "Pointages du jour",
            tight: true,
            actions: `<a class="btn btn-sm" href="#/attendance">Voir le registre</a>`,
            body: `<div id="dash-presence"></div>`,
          })}
          ${UI.card({
            title: "Congés à valider",
            subtitle: "Demandes en attente",
            tight: true,
            actions: `<a class="btn btn-sm" href="#/leaves">Toutes les demandes</a>`,
            body: `<div id="dash-leaves"></div>`,
          })}
        </div>

        <div class="grid grid-3">
          ${UI.card({
            title: "Congés approuvés",
            subtitle: "Par mois sur l'année en cours",
            body: leaveSeries.length
              ? UI.spark(leaveSeries, { display: (i) => `${i.value} demande(s)` })
              : UI.empty({ icon: "#i-calendar", title: "Aucun congé approuvé" }),
          })}
          ${UI.card({
            title: "Entretiens planifiés",
            subtitle: "Recrutement",
            tight: true,
            body: `<div id="dash-interviews"></div>`,
          })}
          ${UI.card({
            title: "Activité récente",
            subtitle: "Journal du logiciel",
            tight: true,
            body: `<div id="dash-activity" style="padding:16px 18px"></div>`,
          })}
        </div>

        ${
          (s.documents_expiring || []).length
            ? `<div class="alert warning"><svg class="ico"><use href="#i-alert"/></svg><div>
                 <strong>${s.documents_expiring.length} document(s) expire(nt) dans les 60 prochains jours</strong><br>
                 ${s.documents_expiring
                   .map(
                     (d) =>
                      `${App.esc(d.name)} — ${App.esc(d.employee_name)} (échéance du ${App.fmt.date(d.expiry_date)})`
                   )
                   .join(" · ")}
                 &nbsp;<a href="#/documents" style="text-decoration:underline">Voir les documents</a>
               </div></div>`
            : ""
        }
      </div>`;

      // --- Actions rapides ---
      el.querySelector('[data-act="employee"]').onclick = () =>
        Views.employees && Views.employees.openForm ? Views.employees.openForm(null) : App.go("/employees");
      el.querySelector('[data-act="leave"]').onclick = () =>
        Views.leaves && Views.leaves.openNew ? Views.leaves.openNew() : App.go("/leaves");
      el.querySelector('[data-act="clock"]').onclick = () =>
        Views.attendance && Views.attendance.openClock
          ? Views.attendance.openClock()
          : App.go("/attendance");

      // --- Présence du jour ---
      const presence = await App.call("today_presence");
      const pbox = el.querySelector("#dash-presence");
      const renderPresence = () => {
        if (!presence || !presence.length) {
          pbox.innerHTML = UI.empty({ icon: "#i-clock", title: "Aucun employé en poste" });
          return;
        }
        pbox.innerHTML = presence
          .slice(0, 8)
          .map((p) => {
            const name = `${p.first_name} ${p.last_name}`;
            const badge = p.id
              ? App.labels.badge(App.labels.attendance, p.status)
              : `<span class="badge gray">Non pointé</span>`;
            return UI.listItem({
              avatar: UI.avatar(name, p.photo_color, "sm"),
              title: App.esc(name),
              sub: App.esc(p.job_title || p.department || ""),
              right: `${badge}<div class="small muted">${
                p.clock_in ? App.fmt.time(p.clock_in) + (p.clock_out ? " → " + App.fmt.time(p.clock_out) : "") : "—"
              }</div>`,
            });
          })
          .join("");
        const more = presence.length > 8;
        if (more) {
          pbox.insertAdjacentHTML(
            "beforeend",
            `<div class="table-foot"><a href="#/attendance" style="text-decoration:underline">Voir les ${presence.length} employés</a></div>`
          );
        }
      };
      renderPresence();

      // --- Congés en attente ---
      const pending = await App.call("list_leave_requests", { status: "pending" });
      const lbox = el.querySelector("#dash-leaves");
      const renderPending = () => {
        if (!pending || !pending.length) {
          lbox.innerHTML = UI.empty({
            icon: "#i-check",
            title: "Aucune demande en attente",
            text: "Toutes les demandes de congés ont été traitées.",
          });
          return;
        }
        lbox.innerHTML = pending
          .slice(0, 6)
          .map(
            (r) => UI.listItem({
              attrs: `data-id="${r.id}"`,
              avatar: `<span class="avatar sm" style="background:${r.color || "#4f46e5"}">${App.esc(
                (r.type_code || "CG").slice(0, 2)
              )}</span>`,
              title: `${App.esc(r.employee_name)} <span class="muted small">· ${App.esc(r.type_name)}</span>`,
              sub: `${App.fmt.date(r.start_date)} → ${App.fmt.date(r.end_date)} · ${App.fmt.days(r.days)}`,
              right: App.labels.badge(App.labels.leave, r.status),
              actions: `
                <button class="icon-btn success" data-act="approve" title="Approuver"><svg class="ico"><use href="#i-check"/></svg></button>
                <button class="icon-btn danger" data-act="reject" title="Refuser"><svg class="ico"><use href="#i-x"/></svg></button>`,
            })
          )
          .join("");
      };
      renderPending();
      el.querySelector("#dash-leaves").addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const id = Number(btn.closest("[data-id]").dataset.id);
        const action = btn.dataset.act;
        if (action === "reject") {
          const ok = await UI.confirm({
            title: "Refuser la demande",
            message: "Refuser cette demande de congé ?",
            confirmLabel: "Refuser",
            danger: true,
          });
          if (!ok) return;
        }
        try {
          await App.api("decide_leave_request", {
            id,
            decision: action === "approve" ? "approved" : "rejected",
            approver: (App.state.user && App.state.user.full_name) || "Administrateur",
            note: "",
          });
          App.toast(action === "approve" ? "Demande approuvée" : "Demande refusée", "success");
          const idx = pending.findIndex((r) => r.id === id);
          if (idx >= 0) pending.splice(idx, 1);
          renderPending();
          updateBadges();
        } catch (err) {}
      });

      // --- Entretiens ---
      const interviews = await App.call("list_interviews", { upcoming: true });
      const ibox = el.querySelector("#dash-interviews");
      if (!interviews || !interviews.length) {
        ibox.innerHTML = UI.empty({
          icon: "#i-briefcase",
          title: "Aucun entretien planifié",
          text: "Planifiez des entretiens depuis la section Recrutement.",
        });
      } else {
        ibox.innerHTML = interviews
          .slice(0, 5)
          .map((i) =>
            UI.listItem({
              avatar: `<span class="avatar sm" style="background:#8b5cf6"><svg class="ico ico-sm"><use href="#i-briefcase"/></svg></span>`,
              title: App.esc(i.candidate_name),
              sub: `${App.esc(i.offer_title)} · ${App.esc(i.type)}`,
              right: `<strong>${App.fmt.dateTime(i.scheduled_at)}</strong><div class="small muted">${App.esc(
                i.interviewer || ""
              )}</div>`,
            })
          )
          .join("");
      }

      // --- Activité ---
      const activity = s.activity || [];
      const abox = el.querySelector("#dash-activity");
      if (!activity.length) {
        abox.innerHTML = `<p class="muted small">Aucune activité enregistrée pour le moment.</p>`;
      } else {
        abox.innerHTML = `<div class="timeline">${activity
          .slice(0, 7)
          .map(
            (a) => `<div class="tl">
                <div class="tl-title">${App.esc(a.label)}</div>
                <div class="tl-sub">${App.esc(a.entity)} · ${App.fmt.fromNow(
              String(a.at).replace(" ", "T")
            )}</div>
              </div>`
          )
          .join("")}</div>`;
      }
    },
  };

  function updateBadges() {
    if (App.updateBadges) App.updateBadges();
  }

  Views.dashboard.refresh = refresh;
})();
