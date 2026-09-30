/* ============================================================
   Gestion RH — Paie & primes
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const state = { tab: "runs", runId: null };

  function currentMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  /* ---------------- Génération ---------------- */
  async function generate() {
    const employees = await App.loadEmployees();
    const eligible = employees.filter((e) => e.status !== "terminated");
    if (!eligible.length) {
      App.toast("Aucun salarié éligible à la paie.", "warning");
      return;
    }
    const runs = (await App.call("list_payroll_runs")) || [];
    UI.form({
      title: "Générer la paie",
      subtitle: "Calcul automatique des cotisations et de l'impôt",
      size: "md",
      submitLabel: "Générer la paie",
      fields: [
        { name: "period", label: "Période (AAAA-MM)", type: "month", value: currentMonth(), col: 6, required: true },
        {
          name: "scope",
          label: "Périmètre",
          type: "select",
          col: 6,
          value: "all",
          options: [
            { value: "all", label: "Tous les salariés en poste" },
            { value: "cdi", label: "CDI uniquement" },
          ],
        },
        { name: "replace", label: "Remplacer la paie existante de cette période", type: "checkbox", col: 12, value: false },
        {
          type: "html",
          col: 12,
          html: `<div class="alert info"><svg class="ico"><use href="#i-info"/></svg><div>
              Les taux de cotisation et le barème d'impression sont ceux définis dans
              <strong>Paramètres → Paie</strong>. Les éléments variables déjà saisis sont conservés lors d'un remplacement.
              ${runs.length ? `<br>Dernière paie générée : <strong>${App.esc(runs[0].period)}</strong> (${App.fmt.moneyShort(runs[0].total_gross)} de brut).` : ""}
            </div></div>`,
        },
      ],
      onSubmit: async (v) => {
        let ids = null;
        if (v.scope === "cdi") ids = eligible.filter((e) => e.contract_type === "CDI").map((e) => e.id);
        const res = await App.api("generate_payroll", {
          period: v.period,
          replace: !!v.replace,
          employee_ids: ids,
        });
        state.runId = res.id;
        state.tab = "detail";
        App.toast(
          `Paie ${res.period} générée : ${res.employee_count} salarié(s), net total ${App.fmt.money(res.total_net)}`,
          "success"
        );
        Router.render();
      },
    });
  }

  /* ---------------- Bulletin ---------------- */
  function payslipHtml(line, run, settings) {
    const breakdown = (() => {
      try {
        return JSON.parse(line.breakdown_json || "{}");
      } catch (e) {
        return {};
      }
    })();
    const empContrib = breakdown.lines || [];
    const erContrib = breakdown.employer_lines || [];
    const company = settings.company || {};
    const currency = company.currency || "XOF";
    const money = (n) => App.fmt.money(n);
    /* Comptes du plan SYSCOHADA (révisé / AUDCIF). */
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
      (settings.payroll && settings.payroll.accounts) || {}
    );
    const acc = (code) =>
      `<td class="right" style="white-space:nowrap">${code ? `<span class="mono">${App.esc(code)}</span>` : ""}</td>`;

    return `
    <div class="payslip">
      <div class="ps-head">
        <div>
          <h1>${App.esc(company.name || "Entreprise")}</h1>
          <p>${App.esc([company.address, company.city].filter(Boolean).join(", "))}</p>
          <p>${App.esc([company.phone, company.email].filter(Boolean).join(" · "))}</p>
          ${company.registration ? `<p>Enregistrement : ${App.esc(company.registration)}</p>` : ""}
        </div>
        <div style="text-align:right">
          <h1>Bulletin de paie</h1>
          <p><strong>Période :</strong> ${App.esc(run.period)}</p>
          <p><strong>Établissement :</strong> ${App.esc(company.name || "—")}</p>
          <p><strong>Date d'édition :</strong> ${App.fmt.date(App.fmt.today())}</p>
          <p class="small">Plan comptable SYSCOHADA — montants en ${App.esc(currency)}</p>
        </div>
      </div>

      <table>
        <tbody>
          <tr><th>Salarié</th><td>${App.esc(line.full_name)} (${App.esc(line.matricule || "")})</td>
              <th>Poste</th><td>${App.esc(line.job_title || "—")}</td></tr>
          <tr><th>Service</th><td>${App.esc(line.department || "—")}</td>
              <th>Contrat</th><td>${App.esc(line.contract_type || "—")}</td></tr>
          <tr><th>Journalier</th><td>${App.esc((App.state.settings.work || {}).start || "08:30")} – ${App.esc(
      (App.state.settings.work || {}).end || "17:30"
    )}</td>
              <th>Référence</th><td>${App.esc(run.period)}-${App.esc(String(line.id))}</td></tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th style="width:40%">Rubrique</th>
            <th style="text-align:right">Base</th>
            <th style="text-align:right">Taux</th>
            <th style="text-align:right">Gain</th>
            <th style="text-align:right">Retenue</th>
            <th style="text-align:right">Compte SYSCOHADA</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Salaire de base</td><td class="right">${money(line.base_salary)}</td><td class="right">—</td><td class="right">${money(
      line.base_salary
    )}</td><td class="right"></td>${acc(A.salary)}</tr>
          ${
            line.overtime_hours
              ? `<tr><td>Heures supplémentaires (${App.fmt.num(line.overtime_hours, 1)} h × ${App.fmt.money(
                  breakdown.hour_rate || 0
                )} × 1,5)</td><td class="right">${App.fmt.num(line.overtime_hours, 1)} h</td><td class="right">×1,5</td><td class="right">${money(
                  line.overtime_amount
                )}</td><td class="right"></td>${acc(A.salary)}</tr>`
              : ""
          }
          ${line.bonus ? `<tr><td>Prime</td><td class="right">—</td><td class="right">—</td><td class="right">${money(line.bonus)}</td><td class="right"></td>${acc(
            A.prime
          )}</tr>` : ""}
          ${line.commission ? `<tr><td>Commission</td><td class="right">—</td><td class="right">—</td><td class="right">${money(
            line.commission
          )}</td><td class="right"></td>${acc(A.prime)}</tr>` : ""}
          ${line.allowance ? `<tr><td>Indemnités (transport, fonctions…)</td><td class="right">—</td><td class="right">—</td><td class="right">${money(
            line.allowance
          )}</td><td class="right"></td>${acc(A.allowance)}</tr>` : ""}
          <tr class="tot"><td><strong>Salaire brut</strong></td><td></td><td></td><td class="right"><strong>${money(
            line.gross
          )}</strong></td><td class="right"></td>${acc("")}</tr>
          ${empContrib
            .map(
              (c) =>
                `<tr><td>${App.esc(c.label)} — salarié</td><td class="right">${money(c.taxable)}</td><td class="right">${App.fmt.num(
                  c.rate,
                  2
                )} %</td><td class="right"></td><td class="right">${money(c.amount)}</td>${acc(c.account || A.employee_charges)}</tr>`
            )
            .join("")}
          <tr><td>Impôt sur le revenu (retenue à la source)</td><td class="right">${money(
            breakdown.taxable || 0
          )}</td><td class="right">barème</td><td class="right"></td><td class="right">${money(line.tax)}</td>${acc(A.tax)}</tr>
          ${
            line.other_deductions
              ? `<tr><td>Autres retenues</td><td class="right">—</td><td class="right">—</td><td class="right"></td><td class="right">${money(
                  line.other_deductions
                )}</td>${acc(A.other_deductions)}</tr>`
              : ""
          }
          <tr class="tot"><td><strong>Total des retenues</strong></td><td></td><td></td><td class="right"></td><td class="right"><strong>${money(
            line.social_employee + line.tax + (line.other_deductions || 0)
          )}</strong></td>${acc("")}</tr>
          <tr class="tot net"><td><strong>Net à payer</strong></td><td></td><td></td><td class="right"></td><td class="right"><strong>${money(
            line.net
          )}</strong></td>${acc(A.net_pay)}</tr>
          <tr><td colspan="5" style="background:#fff"><strong>Coût employeur</strong> — cotisations patronales : ${money(
            line.social_employer
          )} · total : <strong>${money(line.employer_cost)}</strong></td>${acc(A.employer_charges)}</tr>
        </tbody>
      </table>

      ${
        erContrib.length
          ? `<p class="small"><strong>Cotisations patronales (compte ${App.esc(A.employer_charges)} au débit) :</strong> ${erContrib
              .map(
                (c) =>
                  `${App.esc(c.label)} ${App.fmt.num(c.rate, 2)} % = ${money(c.amount)} → ${App.esc(c.account || A.employee_charges)}`
              )
              .join(" · ")}</p>`
          : ""
      }
      <p class="small" style="margin-top:10px">
        <strong>Plan comptable SYSCOHADA (révisé) :</strong> rémunérations ${App.esc(A.salary)} / ${App.esc(A.prime)} / ${App.esc(
        A.allowance
      )} · cotisations salariales ${App.esc(A.employee_charges)} · impôt ${App.esc(A.tax)} · net à payer ${App.esc(
        A.net_pay
      )} · charges patronales ${App.esc(A.employer_charges)} · règlement ${App.esc(A.payment)}.
      </p>
      <p class="small" style="margin-top:14px">
        Bulletin édité par <strong>Gestion RH</strong> — ${App.esc(company.name || "")}. 
        Document à conserver 5 ans. Arrêté le présent bulletin à la somme de <strong>${money(line.net)}</strong>.
      </p>
    </div>`;
  }

  function openPayslip(line, run) {
    const html = payslipHtml(line, run, App.state.settings);
    UI.openModal({
      title: "Bulletin de paie",
      subtitle: `${line.full_name} · ${run.period}`,
      size: "lg",
      body: html,
      footer: `<button class="btn" data-act="close">Fermer</button>
               <button class="btn btn-primary" data-act="print"><svg class="ico"><use href="#i-print"/></svg> Imprimer / PDF</button>`,
    });
    const m = document.getElementById("modal-root").lastElementChild;
    m.querySelector('[data-act="close"]').onclick = () => UI.closeModal();
    m.querySelector('[data-act="print"]').onclick = () => App.print(html, `Bulletin ${line.full_name} ${run.period}`);
  }

  /* ---------------- Écritures de paie (plan SYSCOHADA) ---------------- */
  function entriesTableHtml(data) {
    const rows = data.rows || [];
    if (!rows.length) {
      return UI.empty({ icon: "#i-file", title: "Aucune écriture", text: "Aucune ligne de paie pour cette période." });
    }
    let lastOp = "";
    const body = rows
      .map((r) => {
        const showOp = r.operation !== lastOp;
        lastOp = r.operation;
        return `<tr${showOp ? ' style="border-top:2px solid var(--border-strong)"' : ""}>
          <td class="mono small">${App.esc(r.piece)}</td>
          <td class="small">${showOp ? `<strong>${App.esc(r.operation)}</strong>` : ""}</td>
          <td class="mono"><strong>${App.esc(r.compte)}</strong></td>
          <td>${App.esc(r.libelle)}</td>
          <td class="right mono">${r.debit ? App.fmt.money(r.debit) : ""}</td>
          <td class="right mono">${r.credit ? App.fmt.money(r.credit) : ""}</td>
        </tr>`;
      })
      .join("");
    const t = data.totals || {};
    return `<div class="table-wrap"><table class="table">
        <thead><tr><th>Pièce</th><th>Opération</th><th>Compte</th><th>Libellé</th>
          <th class="right">Débit</th><th class="right">Crédit</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="tot">
          <td colspan="4"><strong>Total général</strong>
            ${t.balanced === false ? `<span class="badge red">Écritures non équilibrées</span>` : `<span class="badge green">Équilibré</span>`}
          </td>
          <td class="right mono"><strong>${App.fmt.money(t.debit || 0)}</strong></td>
          <td class="right mono"><strong>${App.fmt.money(t.credit || 0)}</strong></td>
        </tr></tfoot>
      </table></div>`;
  }

  function entriesPrintHtml(data) {
    const rows = data.rows || [];
    const t = data.totals || {};
    const company = (App.state.settings && App.state.settings.company) || {};
    return `<div class="payslip">
      <div class="ps-head">
        <div><h1>${App.esc(company.name || "Entreprise")}</h1>
          <p>Écritures de paie — ${App.esc(company.city || "")}</p></div>
        <div style="text-align:right"><h1>Journal de paie</h1>
          <p>Période ${App.esc(data.period || "")} · plan SYSCOHADA</p>
          <p>Édité le ${App.fmt.date(App.fmt.today())}</p></div>
      </div>
      <table>
        <thead><tr><th>Pièce</th><th>Opération</th><th>Compte</th><th>Libellé</th>
          <th style="text-align:right">Débit</th><th style="text-align:right">Crédit</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr><td>${App.esc(r.piece)}</td><td>${App.esc(r.operation)}</td>
              <td><strong>${App.esc(r.compte)}</strong></td><td>${App.esc(r.libelle)}</td>
              <td style="text-align:right">${r.debit ? App.fmt.money(r.debit) : ""}</td>
              <td style="text-align:right">${r.credit ? App.fmt.money(r.credit) : ""}</td></tr>`
          )
          .join("")}</tbody>
        <tfoot><tr class="tot"><td colspan="4"><strong>Total général</strong></td>
          <td style="text-align:right"><strong>${App.fmt.money(t.debit || 0)}</strong></td>
          <td style="text-align:right"><strong>${App.fmt.money(t.credit || 0)}</strong></td></tr></tfoot>
      </table>
      <p class="small">Symétrisation automatique du journal de paie (SYSCOHADA révisé).</p>
    </div>`;
  }

  async function openEntries(runId, run) {
    const data = await App.call("payroll_entries", { run_id: runId });
    if (!data) return;
    const s = data.summary || {};
    UI.openModal({
      title: "Écritures de paie — plan SYSCOHADA",
      subtitle: `${run.period} · ${App.fmt.num(data.employee_count)} bulletin(s)`,
      size: "lg",
      body: `<div class="stack" style="gap:12px">
          <div class="row wrap small">
            <span class="badge gray plain">Brut : <b>${App.fmt.money(s.gross)}</b></span>
            <span class="badge indigo plain">Cotisations salariales : <b>${App.fmt.money(s.employee_contributions)}</b></span>
            <span class="badge amber plain">Impôt : <b>${App.fmt.money(s.tax)}</b></span>
            <span class="badge teal plain">Cotisations patronales : <b>${App.fmt.money(s.employer_contributions)}</b></span>
            <span class="badge green plain">Net : <b>${App.fmt.money(s.net)}</b></span>
          </div>
          ${entriesTableHtml(data)}
        </div>`,
      footer: `<button class="btn" data-act="close">Fermer</button>
               <button class="btn" data-act="export"><svg class="ico"><use href="#i-download"/></svg> Exporter CSV</button>
               <button class="btn btn-primary" data-act="print"><svg class="ico"><use href="#i-print"/></svg> Imprimer / PDF</button>`,
    });
    const m = document.getElementById("modal-root").lastElementChild;
    m.querySelector('[data-act="close"]').onclick = () => UI.closeModal();
    m.querySelector('[data-act="print"]').onclick = () => App.print(entriesPrintHtml(data), `Écritures de paie ${run.period}`);
    m.querySelector('[data-act="export"]').onclick = async () => {
      const res = await App.call("export_csv", { kind: "payroll_entries", params: { run_id: runId } });
      if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
    };
  }

  /* ---------------- Édition d'une ligne ---------------- */
  function editLine(line, run) {
    UI.form({
      title: "Éléments variables",
      subtitle: `${line.full_name} · ${run.period}`,
      size: "md",
      submitLabel: "Recalculer et enregistrer",
      successMessage: "Bulletin recalculé",
      fields: [
        { name: "base_salary", label: "Salaire de base", type: "number", col: 6, value: line.base_salary, step: "0.01", min: 0, help: "Brut mensuel" },
        { name: "overtime_hours", label: "Heures supplémentaires", type: "number", col: 6, value: line.overtime_hours, step: "0.5", min: 0 },
        { name: "bonus", label: "Prime", type: "number", col: 4, value: line.bonus, step: "0.01", min: 0 },
        { name: "commission", label: "Commission", type: "number", col: 4, value: line.commission, step: "0.01", min: 0 },
        { name: "other_deductions", label: "Retenues diverses", type: "number", col: 4, value: line.other_deductions, step: "0.01", min: 0 },
        { name: "notes", label: "Note interne", col: 12, value: line.notes || "" },
      ],
      onSubmit: async (v) => {
        await App.api("update_payroll_line", { id: line.id, data: v });
        Router.render();
      },
    });
  }

  /* ---------------- Vue ---------------- */
  Views.payroll = {
    title: "Paie & primes",
    subtitle: "Bulletins, cotisations et coûts employeur",

    render: async function (el) {
      const [runs, settings] = await Promise.all([App.api("list_payroll_runs"), App.call("get_settings")]);
      if (settings) App.state.settings = settings;
      const tabs = [
        { id: "runs", label: "Historique des paies", count: runs.length },
        { id: "detail", label: "Détail & bulletins" },
      ];
      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div class="row-between wrap">
            <div id="pay-tabs" class="grow">${UI.tabs(tabs, state.tab)}</div>
            <div class="row wrap">
              <button class="btn btn-sm" data-act="export-run" ${state.runId ? "" : "disabled"}><svg class="ico"><use href="#i-download"/></svg> Exporter CSV</button>
              <button class="btn btn-sm" data-act="simulator"><svg class="ico"><use href="#i-clipboard"/></svg> Simulateur</button>
              <button class="btn btn-sm btn-primary" data-act="generate"><svg class="ico"><use href="#i-refresh"/></svg> Générer une paie</button>
            </div>
          </div>
          <div id="pay-content"></div>
        </div>`;

      UI.bindTabs(el, (t) => {
        state.tab = t;
        Router.render();
      });
      el.querySelector('[data-act="generate"]').onclick = generate;
      el.querySelector('[data-act="simulator"]').onclick = () => Views.employees.simulatePayroll({ first_name: "Simulation", last_name: "personnalisée", base_salary: 350000, transport_allowance: 0, job_title: "" });
      el.querySelector('[data-act="export-run"]').onclick = async () => {
        if (!state.runId) return;
        const res = await App.call("export_csv", { kind: "payroll_run", params: { run_id: state.runId } });
        if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
      };

      const box = el.querySelector("#pay-content");
      if (state.tab === "runs") renderRuns(box, runs);
      else await renderDetail(box, runs);
    },
  };

  /* ---------------- Historique ---------------- */
  function renderRuns(box, runs) {
    if (!runs.length) {
      box.innerHTML = UI.card({
        body: UI.empty({
          icon: "#i-wallet",
          title: "Aucune paie générée",
          text: "Générez la première paie du mois : le calcul des cotisations, de l'impôt et du net à payer est automatique.",
          action: "Générer une paie",
        }),
      });
      box.querySelector("[data-empty-action]").onclick = generate;
      return;
    }
    const totalYear = runs
      .filter((r) => r.period.slice(0, 4) === String(new Date().getFullYear()))
      .reduce((a, r) => a + (r.total_gross || 0), 0);

    box.innerHTML = `
      <div class="grid grid-4 mb-16">
        ${UI.kpi({ icon: "#i-wallet", label: "Paies enregistrées", value: App.fmt.num(runs.length) })}
        ${UI.kpi({ icon: "#i-trend", tone: "teal", label: `Brut ${new Date().getFullYear()}`, value: App.fmt.moneyShort(totalYear) })}
        ${UI.kpi({ icon: "#i-download", tone: "green", label: "Dernier net", value: runs[0] ? App.fmt.moneyShort(runs[0].total_net) : "—" , hint: runs[0] ? runs[0].period : "" })}
        ${UI.kpi({ icon: "#i-building", tone: "sky", label: "Dernier coût employeur", value: runs[0] ? App.fmt.moneyShort(runs[0].total_employer) : "—" })}
      </div>
      ${UI.card({
        tight: true,
        body: `<div id="runs-table"></div>`,
        foot: `<span class="muted small">Cliquez sur une période pour ouvrir le détail et les bulletins.</span>`,
      })}`;

    const container = box.querySelector("#runs-table");
    UI.table(container, {
      rows: runs,
      rowKey: (r) => r.id,
      resetSort: true,
      onRowClick: (r) => {
        state.runId = r.id;
        state.tab = "detail";
        Router.render();
      },
      columns: [
        { key: "period", label: "Période", render: (r) => `<strong>${App.esc(r.period)}</strong> <span class="muted small">${App.esc(r.label || "")}</span>` },
        { key: "employee_count", label: "Salariés", align: "right" },
        { key: "total_gross", label: "Brut total", align: "right", render: (r) => App.fmt.money(r.total_gross) },
        { key: "total_net", label: "Net total", align: "right", render: (r) => `<strong>${App.fmt.money(r.total_net)}</strong>` },
        { key: "total_employer", label: "Coût employeur", align: "right", render: (r) => App.fmt.money(r.total_employer) },
        { key: "generated_at", label: "Générée le", align: "center", render: (r) => App.fmt.date(r.generated_at) },
        {
          key: "actions",
          label: "",
          sortable: false,
          align: "right",
          cls: "actions-cell",
          render: (r) => `
            <button class="icon-btn" data-act="open" data-id="${r.id}" title="Détail"><svg class="ico"><use href="#i-eye"/></svg></button>
            <button class="icon-btn danger" data-act="delete" data-id="${r.id}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`,
        },
      ],
    });

    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "open") {
        state.runId = id;
        state.tab = "detail";
        Router.render();
      }
      if (btn.dataset.act === "delete") {
        const run = runs.find((r) => r.id === id);
        const ok = await UI.confirm({
          title: "Supprimer la paie",
          message: `Supprimer définitivement la paie <strong>${App.esc(run.period)}</strong> (${App.fmt.num(
            run.employee_count
          )} bulletins) ?`,
          confirmLabel: "Supprimer",
          danger: true,
        });
        if (!ok) return;
        await App.api("delete_payroll_run", { id });
        if (state.runId === id) state.runId = null;
        App.toast("Paie supprimée", "success");
        Router.render();
      }
    });
  }

  /* ---------------- Détail ---------------- */
  async function renderDetail(box, runs) {
    if (!runs.length) {
      box.innerHTML = UI.card({ body: UI.empty({ icon: "#i-wallet", title: "Aucune paie", text: "Générez une paie pour consulter les bulletins.", action: "Générer une paie" }) });
      box.querySelector("[data-empty-action]").onclick = generate;
      return;
    }
    const runId = state.runId || runs[0].id;
    state.runId = runId;
    const detail = await App.api("get_payroll_run", { id: runId });
    const run = detail.run;
    const lines = detail.lines || [];
    const avg = lines.length ? lines.reduce((a, l) => a + (l.net || 0), 0) / lines.length : 0;
    const payCfg = (App.state.settings && App.state.settings.payroll) || {};
    const noRates =
      !(payCfg.employee_contributions || []).length &&
      !(payCfg.tax_brackets || []).length;

    box.innerHTML = `
      <div class="card mb-16">
        <div class="card-head">
          <div class="grow">
            <h3>Paie ${App.esc(run.period)} ${App.esc(run.label || "")}</h3>
            <p>Générée le ${App.fmt.dateTime(run.generated_at)} · ${App.fmt.num(run.employee_count)} salarié(s)</p>
          </div>
          <div class="row wrap">
            <select id="run-select" style="height:36px">
              ${runs.map((r) => `<option value="${r.id}"${r.id === runId ? " selected" : ""}>${App.esc(r.period)}</option>`).join("")}
            </select>
            <button class="btn btn-sm" data-act="print-all"><svg class="ico"><use href="#i-print"/></svg> Imprimer la synthèse</button>
            <button class="btn btn-sm" data-act="entries"><svg class="ico"><use href="#i-file"/></svg> Écritures SYSCOHADA</button>
            <button class="btn btn-sm" data-act="export-run"><svg class="ico"><use href="#i-download"/></svg> Exporter</button>
          </div>
        </div>
        <div class="card-body">
          <div class="grid grid-4">
            ${UI.kpi({ icon: "#i-wallet", label: "Brut total", value: App.fmt.money(run.total_gross) })}
            ${UI.kpi({ icon: "#i-download", tone: "green", label: "Net à payer", value: App.fmt.money(run.total_net) })}
            ${UI.kpi({ icon: "#i-building", tone: "teal", label: "Coût employeur", value: App.fmt.money(run.total_employer) })}
            ${UI.kpi({ icon: "#i-users", tone: "sky", label: "Net moyen", value: App.fmt.money(avg) })}
          </div>
        </div>
      </div>

      ${
        noRates
          ? UI.alert(
              "warning",
              "<strong>Aucune cotisation ni barème n'est configuré</strong> : le net à payer est égal au brut. Renseignez vos taux dans <strong>Paramètres → Paie</strong> (aucun régime n'est pré-rempli) — les comptes du plan SYSCOHADA (6611, 431, 447, 422, 664, 521…) y sont également paramétrables."
            )
          : ""
      }
      ${UI.card({
        tight: true,
        title: "Bulletins de la période",
        subtitle: "Cliquez une ligne pour afficher et imprimer le bulletin",
        body: `<div id="lines-table"></div>`,
        foot: `<span class="muted small">Heures supplémentaires, primes et commissions modifiables ligne par ligne.</span>`,
      })}`;

    box.querySelector("#run-select").onchange = (e) => {
      state.runId = Number(e.target.value);
      Router.render();
    };
    box.querySelector('[data-act="entries"]').onclick = () => openEntries(runId, run);
    box.querySelector('[data-act="export-run"]').onclick = async () => {
      const res = await App.call("export_csv", { kind: "payroll_run", params: { run_id: runId } });
      if (res) App.toast(`Export réussi : ${res.path} (${res.rows} lignes)`, "success");
    };
    box.querySelector('[data-act="print-all"]').onclick = () => {
      const html = `
        <div class="payslip">
          <div class="ps-head">
            <div><h1>${App.esc((App.state.settings.company || {}).name || "Entreprise")}</h1>
            <p>Récapitulatif de paie — ${App.esc(run.period)}</p></div>
            <div style="text-align:right"><h1>${App.fmt.num(lines.length)} bulletins</h1>
            <p>Édité le ${App.fmt.date(App.fmt.today())}</p></div>
          </div>
          <table>
            <thead><tr><th>Salarié</th><th>Matricule</th><th>Service</th><th style="text-align:right">Brut</th><th style="text-align:right">Retenues</th><th style="text-align:right">Net</th></tr></thead>
            <tbody>
              ${lines
                .map(
                  (l) => `<tr><td>${App.esc(l.full_name)}</td><td>${App.esc(l.matricule || "")}</td><td>${App.esc(
                    l.department || ""
                  )}</td><td style="text-align:right">${App.fmt.money(l.gross)}</td><td style="text-align:right">${App.fmt.money(
                    l.social_employee + l.tax + (l.other_deductions || 0)
                  )}</td><td style="text-align:right">${App.fmt.money(l.net)}</td></tr>`
                )
                .join("")}
              <tr class="tot"><td colspan="3"><strong>Totaux</strong></td><td style="text-align:right"><strong>${App.fmt.money(
                run.total_gross
              )}</strong></td><td style="text-align:right">—</td><td style="text-align:right"><strong>${App.fmt.money(
                run.total_net
              )}</strong></td></tr>
            </tbody>
          </table>
        </div>`;
      App.print(html, `Synthèse de paie ${run.period}`);
    };

    const container = box.querySelector("#lines-table");
    UI.table(container, {
      rows: lines,
      rowKey: (l) => l.id,
      resetSort: true,
      onRowClick: (l) => openPayslip(l, run),
      empty: { icon: "#i-wallet", title: "Aucune ligne" },
      foot: `${lines.length} bulletin(s)`,
      columns: [
        {
          key: "full_name",
          label: "Salarié",
          render: (l) => `<div class="person">${UI.avatar(l.full_name, "#4f46e5", "sm")}<div class="grow"><div class="p-name">${App.esc(
            l.full_name
          )}</div><div class="p-sub">${App.esc(l.matricule || "")} · ${App.esc(l.job_title || "")}</div></div></div>`,
        },
        { key: "department", label: "Service", render: (l) => App.esc(l.department || "—") },
        { key: "base_salary", label: "Base", align: "right", render: (l) => App.fmt.money(l.base_salary) },
        { key: "overtime_hours", label: "H. sup.", align: "right", render: (l) => (l.overtime_hours ? App.fmt.num(l.overtime_hours, 1) + " h" : "—") },
        { key: "bonus", label: "Primes", align: "right", render: (l) => App.fmt.money((l.bonus || 0) + (l.commission || 0)) },
        { key: "gross", label: "Brut", align: "right", render: (l) => `<strong>${App.fmt.money(l.gross)}</strong>` },
        { key: "social_employee", label: "Cotisations", align: "right", render: (l) => "- " + App.fmt.money(l.social_employee) },
        { key: "tax", label: "Impôt", align: "right", render: (l) => "- " + App.fmt.money(l.tax) },
        { key: "net", label: "Net", align: "right", render: (l) => `<strong class="mono">${App.fmt.money(l.net)}</strong>` },
        {
          key: "actions",
          label: "",
          sortable: false,
          align: "right",
          cls: "actions-cell",
          render: (l) => `
            <button class="icon-btn" data-act="edit" data-id="${l.id}" title="Éléments variables"><svg class="ico"><use href="#i-edit"/></svg></button>
            <button class="icon-btn" data-act="slip" data-id="${l.id}" title="Bulletin"><svg class="ico"><use href="#i-print"/></svg></button>`,
        },
      ],
    });

    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      e.stopPropagation();
      const line = lines.find((l) => l.id === Number(btn.dataset.id));
      if (!line) return;
      if (btn.dataset.act === "edit") editLine(line, run);
      if (btn.dataset.act === "slip") openPayslip(line, run);
    });
  }
})();
