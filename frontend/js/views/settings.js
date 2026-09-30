/* ============================================================
   Gestion RH — Paramètres (entreprise, travail, paie, congés,
   comptes utilisateurs, sauvegarde des données)
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  /* État de la vue : conservé d'un rendu à l'autre. */
  const state = { tab: "company" };

  const TABS = [
    { id: "company", label: "Entreprise" },
    { id: "work", label: "Organisation du travail" },
    { id: "payroll", label: "Paie" },
    { id: "leaves", label: "Congés & fériés" },
    { id: "users", label: "Utilisateurs" },
    { id: "data", label: "Sauvegarde & données" },
  ];

  const esc = (v) => App.esc(v);

  const WEEKDAYS = [
    [1, "Lundi"],
    [2, "Mardi"],
    [3, "Mercredi"],
    [4, "Jeudi"],
    [5, "Vendredi"],
    [6, "Samedi"],
    [7, "Dimanche"],
  ];

  const ROLES = {
    admin: ["Administrateur", "indigo"],
    manager: ["Manager", "blue"],
    hr: ["RH & Paie", "teal"],
  };

  const COLOR_OPTIONS = [
    { value: "#4f46e5", label: "Indigo" },
    { value: "#8b5cf6", label: "Violet" },
    { value: "#0d9488", label: "Sarcelle" },
    { value: "#0ea5e9", label: "Bleu" },
    { value: "#10b981", label: "Vert" },
    { value: "#f59e0b", label: "Ambre" },
    { value: "#ef4444", label: "Rouge" },
    { value: "#ec4899", label: "Rose" },
    { value: "#64748b", label: "Gris" },
  ];

  const TABLE_LABELS = {
    employees: "Employés",
    departments: "Services",
    leave_requests: "Congés",
    attendance: "Présences",
    payroll_runs: "Paies",
    payroll_lines: "Lignes de paie",
    job_offers: "Offres",
    candidates: "Candidatures",
    evaluations: "Évaluations",
    documents: "Documents",
    users: "Comptes",
  };

  const ENTITY_LABELS = {
    employee: "Fiche employé",
    department: "Service",
    settings: "Paramètres",
    auth: "Connexion",
    user: "Compte",
    leave: "Congé",
    attendance: "Présence",
    payroll: "Paie",
    evaluation: "Évaluation",
    document: "Document",
    recruitment: "Recrutement",
    system: "Système",
  };

  /* Colonnes des tableaux éditables de la paie. */
  const LIST_DEFS = {
    employee_contributions: [
      { f: "label", t: "text", l: "Libellé" },
      { f: "rate", t: "number", l: "Taux (%)" },
      { f: "ceiling", t: "number", l: "Plafond mensuel" },
      { f: "account", t: "text", l: "Compte SYSCOHADA", ph: "431" },
    ],
    employer_contributions: [
      { f: "label", t: "text", l: "Libellé" },
      { f: "rate", t: "number", l: "Taux (%)" },
      { f: "ceiling", t: "number", l: "Plafond mensuel" },
      { f: "account", t: "text", l: "Compte SYSCOHADA", ph: "431" },
    ],
    tax_brackets: [
      { f: "up_to", t: "number", l: "Jusqu'à (annuel)", ph: "Sans limite" },
      { f: "rate", t: "number", l: "Taux (%)" },
    ],
  };

  /* Comptes du plan SYSCOHADA (révisé / AUDCIF) utilisés par le bulletin et les écritures. */
  const SYSCOHADA_ACCOUNTS = [
    { f: "salary", l: "Salaires bruts", ph: "6611", help: "Appointements, salaires et commissions" },
    { f: "prime", l: "Primes et gratifications", ph: "6612", help: "Bonus, commissions" },
    { f: "allowance", l: "Indemnités versées au personnel", ph: "663", help: "Transport, panier…" },
    { f: "employer_charges", l: "Charges sociales patronales", ph: "664", help: "Part employeur" },
    { f: "employee_charges", l: "Cotisations salariales (compte)", ph: "431", help: "Organisme — sécurité sociale" },
    { f: "tax", l: "Impôt sur les revenus", ph: "447", help: "État, impôts retenus à la source" },
    { f: "other_deductions", l: "Autres retenues", ph: "47", help: "Avances, oppositions, saisies" },
    { f: "net_pay", l: "Net à payer", ph: "422", help: "Personnel, rémunérations dues" },
    { f: "payment", l: "Règlement des salaires", ph: "521", help: "Banques locales / caisse" },
  ];
  const ACCOUNT_DEFAULTS = SYSCOHADA_ACCOUNTS.reduce((o, a) => {
    o[a.f] = a.ph;
    return o;
  }, {});

  /* ================= Utilitaires ================= */

  function textField(name, label, value, opts) {
    const o = opts || {};
    const id = "f-" + name;
    return `<div class="col-${o.col || 6} field" data-field="${esc(name)}">
        <label for="${id}">${esc(label)}${o.required ? ' <span class="req">*</span>' : ""}</label>
        <input type="${o.type || "text"}" id="${id}" name="${esc(name)}"
          value="${esc(value === undefined || value === null ? "" : value)}"
          placeholder="${esc(o.placeholder || "")}" autocomplete="off"/>
        ${o.help ? `<span class="help">${esc(o.help)}</span>` : ""}
      </div>`;
  }

  function numberField(id, name, label, value, opts) {
    const o = opts || {};
    return `<div class="col-${o.col || 3} field" data-field="${esc(name)}">
        <label for="${id}">${esc(label)}</label>
        <input type="number" id="${id}" name="${esc(name)}" min="${o.min !== undefined ? o.min : 0}"
          step="${o.step !== undefined ? o.step : "any"}" value="${esc(value === undefined || value === null ? "" : value)}"/>
        ${o.help ? `<span class="help">${esc(o.help)}</span>` : ""}
      </div>`;
  }

  function valuesOf(form, names) {
    const out = {};
    names.forEach((n) => {
      const el = form.querySelector(`[name="${n}"]`);
      out[n] = el ? String(el.value).trim() : "";
    });
    return out;
  }

  function showBox(box, message) {
    if (!box) return;
    if (!message) {
      box.classList.add("hidden");
      box.textContent = "";
      return;
    }
    box.textContent = message;
    box.classList.remove("hidden");
  }

  async function reloadSettings() {
    const s = await App.call("get_settings");
    if (s) App.state.settings = s;
    return App.state.settings;
  }

  function applyBrand(c) {
    const bn = document.getElementById("brand-name");
    if (bn) bn.textContent = c.name || "Gestion RH";
    const bt = document.getElementById("brand-tag");
    if (bt) bt.textContent = c.tagline || "Ressources humaines";
    const bm = document.querySelector(".sidebar-brand .brand-mark");
    if (bm) bm.style.background = c.logo_color ? `linear-gradient(135deg, ${c.logo_color}, #14b8a6)` : "";
  }

  /* ================= 1. Entreprise ================= */

  function previewHtml(c) {
    const name = c.name || "Gestion RH";
    const tag = c.tagline || "Ressources humaines";
    const color = c.logo_color || "#4f46e5";
    return `
      <div style="background:linear-gradient(180deg,#0f172a,#16213b);border-radius:12px;padding:18px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="brand-mark" id="pv-mark" style="background:linear-gradient(135deg, ${esc(color)}, #14b8a6)">${esc(
      App.fmt.initials(name)
    )}</div>
          <div class="brand-text">
            <strong id="pv-name">${esc(name)}</strong>
            <span id="pv-tag">${esc(tag)}</span>
          </div>
        </div>
        <div class="row wrap" style="margin-top:14px;gap:8px">
          <span class="badge indigo plain">Devise&nbsp;: <b id="pv-cur">${esc(c.currency || "XOF")}</b></span>
          <span class="badge gray plain">${esc(c.city || "Ville non renseignée")}</span>
          <span class="badge teal plain">${esc(c.email || "E-mail non renseigné")}</span>
        </div>
      </div>
      <p class="small muted mt-16">L'aperçu se met à jour pendant la saisie ; il n'est appliqué qu'après enregistrement.</p>`;
  }

  function collectCompany(form) {
    return valuesOf(form, [
      "name",
      "tagline",
      "address",
      "city",
      "phone",
      "email",
      "registration",
      "currency",
      "logo_color",
    ]);
  }

  function updatePreview(panel, v) {
    const mark = panel.querySelector("#pv-mark");
    if (!mark) return;
    mark.style.background = `linear-gradient(135deg, ${v.logo_color || "#4f46e5"}, #14b8a6)`;
    mark.textContent = App.fmt.initials(v.name || "Gestion RH");
    const n = panel.querySelector("#pv-name");
    if (n) n.textContent = v.name || "Gestion RH";
    const t = panel.querySelector("#pv-tag");
    if (t) t.textContent = v.tagline || "Ressources humaines";
    const cur = panel.querySelector("#pv-cur");
    if (cur) cur.textContent = v.currency || "XOF";
  }

  function renderCompany(panel) {
    const c = (App.state.settings && App.state.settings.company) || {};
    panel.innerHTML = `
      <div class="grid grid-2">
        ${UI.card({
          title: "Identité de l'entreprise",
          subtitle: "Informations affichées dans l'en-tête et sur les documents",
          body: `
            <form id="co-form" class="form-grid" novalidate>
              ${textField("name", "Nom de l'entreprise", c.name, { col: 7, required: true, placeholder: "ex. Atlas Services" })}
              ${textField("tagline", "Baseline", c.tagline, { col: 5, placeholder: "ex. Ressources humaines" })}
              ${textField("address", "Adresse", c.address, { col: 8, placeholder: "Rue, numéro…" })}
              ${textField("city", "Ville", c.city, { col: 4 })}
              ${textField("phone", "Téléphone", c.phone, { col: 4, placeholder: "+221 …" })}
              ${textField("email", "E-mail", c.email, { col: 4, type: "email" })}
              ${textField("registration", "Registre de commerce / ICE", c.registration, { col: 4 })}
              ${textField("currency", "Devise affichée", c.currency === undefined || c.currency === null ? "XOF" : c.currency, {
                col: 4,
                placeholder: "XOF, FCFA, EUR",
                help: "Utilisée pour tous les montants du logiciel (XOF par défaut).",
              })}
              <div class="col-4 field" data-field="logo_color">
                <label for="f-logo_color">Couleur du logo</label>
                <input type="color" id="f-logo_color" name="logo_color" value="${esc(c.logo_color || "#4f46e5")}"
                  style="width:100%;height:40px;padding:3px;border:1px solid var(--border-strong);border-radius:10px;background:#fff;cursor:pointer"/>
              </div>
            </form>
            <p class="form-error hidden" id="co-error"></p>`,
          foot: `<button class="btn btn-primary" data-act="save-company"><svg class="ico"><use href="#i-check"/></svg> Enregistrer les informations</button>`,
        })}
        ${UI.card({
          title: "Aperçu de l'en-tête",
          subtitle: "Barre latérale de l'application",
          body: previewHtml(c),
        })}
      </div>`;

    const form = panel.querySelector("#co-form");
    form.addEventListener("input", () => updatePreview(panel, collectCompany(form)));
  }

  async function saveCompany(panel) {
    const form = panel.querySelector("#co-form");
    if (!form) return;
    const box = panel.querySelector("#co-error");
    const values = collectCompany(form);
    if (!values.name) {
      showBox(box, "Le nom de l'entreprise est obligatoire.");
      const input = form.querySelector('[name="name"]');
      if (input) input.focus();
      return;
    }
    showBox(box, null);
    await App.api("save_settings", { data: { company: values } });
    await reloadSettings();
    applyBrand(values);
    App.toast("Informations de l'entreprise enregistrées", "success");
    Router.render();
  }

  /* ================= 2. Organisation du travail ================= */

  function renderWork(panel) {
    const w = (App.state.settings && App.state.settings.work) || {};
    const days = Array.isArray(w.work_weekdays) ? w.work_weekdays.map(Number) : [1, 2, 3, 4, 5];
    panel.innerHTML = UI.card({
      title: "Organisation du travail",
      subtitle: "Horaires, durée de référence et jours travaillés",
      body: `
        <form id="work-form" class="form-grid" novalidate>
          <div class="col-3 field" data-field="start">
            <label for="f-start">Heure de début</label>
            <input type="time" id="f-start" name="start" value="${esc(w.start || "08:30")}"/>
          </div>
          <div class="col-3 field" data-field="end">
            <label for="f-end">Heure de fin</label>
            <input type="time" id="f-end" name="end" value="${esc(w.end || "17:30")}"/>
          </div>
          ${numberField("f-break", "break_minutes", "Pause déjeuner (minutes)", w.break_minutes === undefined ? 60 : w.break_minutes, {
            col: 3,
            step: 5,
            help: "Retirée du temps de présence.",
          })}
          ${numberField("f-hours", "standard_hours_month", "Durée mensuelle (heures)", w.standard_hours_month === undefined ? 191 : w.standard_hours_month, {
            col: 3,
            min: 1,
            step: 1,
            help: "Base de calcul de la présence.",
          })}
          ${numberField("f-grace", "late_grace_minutes", "Tolérance de retard (minutes)", w.late_grace_minutes === undefined ? 10 : w.late_grace_minutes, {
            col: 3,
            step: 1,
            help: "Au-delà, le pointage est marqué en retard.",
          })}
          <div class="col-12 field">
            <label>Jours travaillés</label>
            <div class="row wrap" style="gap:16px;padding-top:4px">
              ${WEEKDAYS.map(
                ([n, label]) =>
                  `<label class="check"><input type="checkbox" data-day="${n}" ${
                    days.indexOf(n) >= 0 ? "checked" : ""
                  }/> <span>${label} <span class="muted small">(${n})</span></span></label>`
              ).join("")}
            </div>
            <span class="help">
              Valeurs enregistrées de 1 (lundi) à 7 (dimanche) : elles définissent les jours ouvrés
              utilisés pour les congés et les pointages.
            </span>
          </div>
          <div class="col-12"><p class="form-error hidden" id="work-error"></p></div>
        </form>`,
      foot: `<button class="btn btn-primary" data-act="save-work"><svg class="ico"><use href="#i-check"/></svg> Enregistrer l'organisation</button>`,
    });
  }

  async function saveWork(panel) {
    const form = panel.querySelector("#work-form");
    if (!form) return;
    const box = panel.querySelector("#work-error");
    const get = (n) => form.querySelector(`[name="${n}"]`);
    const selected = Array.prototype.slice
      .call(form.querySelectorAll("[data-day]:checked"))
      .map((i) => Number(i.getAttribute("data-day")))
      .sort((a, b) => a - b);

    if (!selected.length) {
      showBox(box, "Sélectionnez au moins un jour travaillé.");
      return;
    }
    const start = get("start").value;
    const end = get("end").value;
    if (!start || !end) {
      showBox(box, "Les heures de début et de fin sont obligatoires.");
      return;
    }
    if (end <= start) {
      showBox(box, "L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }
    showBox(box, null);

    const data = {
      start,
      end,
      break_minutes: Number(get("break_minutes").value) || 0,
      standard_hours_month: Number(get("standard_hours_month").value) || 191,
      late_grace_minutes: Number(get("late_grace_minutes").value) || 0,
      work_weekdays: selected,
    };
    await App.api("save_settings", { data: { work: data } });
    await reloadSettings();
    App.toast("Organisation du travail enregistrée", "success");
    Router.render();
  }

  /* ================= 3. Paie ================= */

  function payRow(list, cols, values) {
    const v = values || {};
    return `<tr data-list="${esc(list)}">${cols
      .map((c) => {
        const raw = v[c.f];
        const val = raw === undefined || raw === null ? "" : raw;
        const ph = c.ph ? ` placeholder="${esc(c.ph)}"` : "";
        return `<td><input type="${c.t}" data-f="${esc(c.f)}" value="${esc(val)}"${ph} step="any"
            style="height:34px"${c.t === "text" ? ' autocomplete="off"' : ""}/></td>`;
      })
      .join("")}
      <td class="actions-cell">
        <button class="icon-btn danger" data-act="del-row" title="Retirer cette ligne"><svg class="ico"><use href="#i-x"/></svg></button>
      </td></tr>`;
  }

  function listBlock(key, title, subtitle, rows) {
    const cols = LIST_DEFS[key];
    const list = rows || [];
    const body = list.length
      ? list.map((r) => payRow(key, cols, r)).join("")
      : `<tr><td colspan="${cols.length + 1}" class="muted small">Aucune ligne : cliquez sur « Ajouter » pour en créer une.</td></tr>`;
    return `<section class="card" style="box-shadow:none">
        <div class="card-head">
          <div class="grow"><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>
          <button class="btn btn-sm" data-act="add-row" data-list="${esc(key)}">
            <svg class="ico"><use href="#i-plus"/></svg> Ajouter
          </button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>${cols.map((c) => `<th>${esc(c.l)}</th>`).join("")}<th class="right">Actions</th></tr></thead>
            <tbody data-list-body="${esc(key)}">${body}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderPayroll(panel) {
    const p = (App.state.settings && App.state.settings.payroll) || {};
    const accs = Object.assign({}, ACCOUNT_DEFAULTS, p.accounts || {});
    panel.innerHTML = `<div class="stack" style="gap:16px">
        ${UI.card({
          title: "Paramètres généraux de paie",
          subtitle: "Base de calcul des bulletins",
          body: `<div class="form-grid">
              ${numberField("f-mh", "monthly_hours", "Heures mensuelles de référence", p.monthly_hours === undefined ? 191 : p.monthly_hours, {
                col: 4,
                min: 1,
                step: 1,
                help: "Utilisé pour déterminer le taux horaire.",
              })}
              ${numberField("f-or", "overtime_rate", "Majoration des heures supplémentaires (×)", p.overtime_rate === undefined ? 1.5 : p.overtime_rate, {
                col: 4,
                min: 0,
                step: 0.05,
                help: "1,5 correspond à une majoration de 50 %.",
              })}
            </div>`,
        })}
        ${listBlock("employee_contributions", "Cotisations salariales", "Retenues appliquées au salaire brut mensuel — saisissez vos propres taux (aucun régime n'est pré-rempli)", p.employee_contributions)}
        ${listBlock("employer_contributions", "Cotisations patronales", "Charges supportées par l'employeur — saisissez vos propres taux", p.employer_contributions)}
        ${listBlock("tax_brackets", "Barème de l'impôt sur le revenu", "Paliers appliqués à l'assiette annuelle — saisissez votre propre barème", p.tax_brackets)}
        ${UI.card({
          title: "Comptes SYSCOHADA",
          subtitle: "Plan comptable OHADA révisé : comptes imprimés sur le bulletin et utilisés pour les écritures de paie",
          body: `<div class="form-grid">
              ${SYSCOHADA_ACCOUNTS.map((a) =>
                textField("acc_" + a.f, a.l, accs[a.f], {
                  col: 3,
                  placeholder: a.ph,
                  help: a.help,
                })
              ).join("")}
            </div>`,
        })}
        ${UI.alert(
          "info",
          "Aucun régime de cotisation n'est pré-rempli : ajoutez vos lignes avec le bouton « Ajouter » (taux, plafond mensuel et compte SYSCOHADA, ex. 431 Sécurité sociale, 432 Caisses de retraite, 438 Autres organismes). Les montants de toutes les rubriques sont exprimés dans la devise définie dans l'onglet Entreprise (XOF par défaut). Le plafond des cotisations est mensuel : saisissez 0 pour « sans plafond ». Laissez vide le plafond du dernier palier du barème (assiette illimitée)."
        )}
        <div class="row-between wrap">
          <span class="muted small">Les modifications ne sont appliquées qu'après enregistrement.</span>
          <div class="row wrap">
            <button class="btn" data-act="pay-reset"><svg class="ico"><use href="#i-refresh"/></svg> Réinitialiser les valeurs par défaut</button>
            <button class="btn btn-primary" data-act="pay-save"><svg class="ico"><use href="#i-check"/></svg> Enregistrer la structure de paie</button>
          </div>
        </div>
      </div>`;
  }

  function toNumber(value) {
    const n = parseFloat(String(value).replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function collectPayroll(panel) {
    const hourly = panel.querySelector('[data-p="monthly_hours"]') || panel.querySelector('[name="monthly_hours"]');
    const overtime = panel.querySelector('[data-p="overtime_rate"]') || panel.querySelector('[name="overtime_rate"]');
    const out = {
      monthly_hours: toNumber(hourly ? hourly.value : 191) || 191,
      overtime_rate: toNumber(overtime ? overtime.value : 1.5),
    };
    ["employee_contributions", "employer_contributions"].forEach((key) => {
      out[key] = Array.prototype.slice.call(panel.querySelectorAll(`tr[data-list="${key}"]`)).map((tr) => ({
        label: (tr.querySelector('[data-f="label"]').value || "").trim() || "Cotisation",
        rate: toNumber(tr.querySelector('[data-f="rate"]').value),
        ceiling: toNumber(tr.querySelector('[data-f="ceiling"]').value),
        account: (tr.querySelector('[data-f="account"]') ? tr.querySelector('[data-f="account"]').value : "").trim() || "431",
      }));
    });
    out.tax_brackets = Array.prototype.slice
      .call(panel.querySelectorAll('tr[data-list="tax_brackets"]'))
      .map((tr) => {
        const up = String(tr.querySelector('[data-f="up_to"]').value).trim();
        return { up_to: up === "" ? null : toNumber(up), rate: toNumber(tr.querySelector('[data-f="rate"]').value) };
      })
      .sort((a, b) => {
        const va = a.up_to === null ? Infinity : a.up_to;
        const vb = b.up_to === null ? Infinity : b.up_to;
        return va - vb;
      });
    out.accounts = {};
    SYSCOHADA_ACCOUNTS.forEach((a) => {
      const el = panel.querySelector(`[name="acc_${a.f}"]`);
      const v = el ? String(el.value).trim() : "";
      out.accounts[a.f] = v || a.ph;
    });
    return out;
  }

  async function savePayroll(panel) {
    const data = collectPayroll(panel);
    if (!(data.monthly_hours > 0)) {
      App.toast("Les heures mensuelles de référence doivent être supérieures à 0.", "error");
      return;
    }
    await App.api("save_settings", { data: { payroll: data } });
    await reloadSettings();
    App.toast("Structure de paie enregistrée", "success");
    Router.render();
  }

  /* ================= 4. Congés & fériés ================= */

  function colorOptions(selected) {
    const opts = COLOR_OPTIONS.slice();
    if (selected && !opts.some((o) => o.value === selected)) opts.unshift({ value: selected, label: selected });
    return opts;
  }

  function swatch(color) {
    return `<span style="width:12px;height:12px;border-radius:4px;flex:none;display:inline-block;background:${esc(
      color || "#4f46e5"
    )}"></span>`;
  }

  function isRecurring(holiday) {
    return String(holiday.date || "").length <= 5;
  }

  function openLeaveTypeForm(row) {
    UI.form({
      title: row ? "Modifier le type de congé" : "Nouveau type de congé",
      subtitle: row
        ? `Type « ${row.name || ""} »`
        : "Définissez le solde annuel, la couleur et le statut du congé.",
      fields: [
        { name: "name", label: "Intitulé", required: true, col: 6, placeholder: "ex. Congé annuel" },
        { name: "code", label: "Code", col: 3, placeholder: "ex. CA" },
        {
          name: "days_per_year",
          type: "number",
          label: "Jours / an",
          col: 3,
          min: 0,
          step: 0.5,
          help: "0 = illimité.",
        },
        {
          name: "color",
          type: "select",
          label: "Couleur",
          col: 4,
          options: colorOptions(row ? row.color : null),
          placeholder: "— Choisir —",
        },
        { name: "is_paid", type: "checkbox", label: "Congé rémunéré", col: 4 },
        { name: "active", type: "checkbox", label: "Type actif", col: 4 },
        { name: "requires_document", type: "checkbox", label: "Justificatif requis", col: 4 },
      ],
      values: row
        ? {
            name: row.name || "",
            code: row.code || "",
            days_per_year: row.days_per_year,
            color: row.color || "#4f46e5",
            is_paid: !!Number(row.is_paid),
            active: !!Number(row.active),
            requires_document: !!Number(row.requires_document),
          }
        : { days_per_year: 30, color: "#4f46e5", is_paid: true, active: true, requires_document: false },
      submitLabel: row ? "Enregistrer" : "Créer le type",
      successMessage: row ? "Type de congé mis à jour" : "Type de congé créé",
      onSubmit: async (v) => {
        const data = {
          name: String(v.name || "").trim(),
          code: String(v.code || "").trim(),
          days_per_year: Number(v.days_per_year) || 0,
          color: v.color || "#4f46e5",
          is_paid: !!v.is_paid,
          active: !!v.active,
          requires_document: !!v.requires_document,
        };
        if (!data.name) throw "L'intitulé du type de congé est obligatoire.";
        if (row) data.id = row.id;
        await App.api("save_leave_type", { data });
        await App.loadLeaveTypes();
        Router.render();
      },
    });
  }

  function openHolidayForm(row) {
    const recurring = row ? isRecurring(row) : false;
    UI.form({
      title: row ? "Modifier le jour férié" : "Nouveau jour férié",
      subtitle: "Ces dates sont exclues du calcul des jours ouvrés.",
      fields: [
        { name: "name", label: "Libellé", required: true, col: 7, placeholder: "ex. Fête du Travail" },
        {
          name: "date",
          type: "date",
          label: "Date",
          col: 5,
          required: true,
          help: "Cochez « récurrent » pour ne conserver que le mois et le jour.",
        },
        {
          name: "recurring",
          type: "checkbox",
          label: "Récurrent chaque année (format MM-JJ)",
          col: 12,
        },
      ],
      values: row
        ? {
            name: row.name || "",
            date: recurring ? `2000-${row.date}` : row.date,
            recurring,
          }
        : { date: App.fmt.today(), recurring: false },
      submitLabel: row ? "Enregistrer" : "Créer le jour férié",
      successMessage: row ? "Jour férié mis à jour" : "Jour férié créé",
      onSubmit: async (v) => {
        const name = String(v.name || "").trim();
        const raw = String(v.date || "");
        if (!name) throw "Le libellé du jour férié est obligatoire.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw "La date du jour férié est obligatoire.";
        const data = {
          name,
          date: v.recurring ? raw.slice(5) : raw,
          recurring: !!v.recurring,
        };
        if (!/^\d{2}-\d{2}$/.test(data.date)) throw "Date invalide : utilisez le format MM-JJ pour un jour récurrent.";
        if (row) data.id = row.id;
        await App.api("save_holiday", { data });
        await App.loadLeaveTypes();
        Router.render();
      },
    });
  }

  function actionButtons(kind, id) {
    return `
      <button class="icon-btn" data-act="edit-${kind}" data-action="edit" data-id="${esc(
      id
    )}" title="Modifier"><svg class="ico"><use href="#i-edit"/></svg></button>
      <button class="icon-btn danger" data-act="del-${kind}" data-action="del" data-id="${esc(
      id
    )}" title="Supprimer"><svg class="ico"><use href="#i-trash"/></svg></button>`;
  }

  async function renderLeaves(panel) {
    const results = await Promise.all([App.call("list_leave_types"), App.call("list_holidays")]);
    const types = results[0] || App.state.leaveTypes || [];
    const holidays = results[1] || [];

    panel.innerHTML = `<div class="stack" style="gap:16px">
        ${UI.card({
          title: "Types de congés",
          subtitle: "Soldes annuels, couleurs et statut des absences rémunérées",
          actions: `<button class="btn btn-sm btn-primary" data-act="new-lt"><svg class="ico"><use href="#i-plus"/></svg> Nouveau type</button>`,
          body: `<div id="lt-table"></div>`,
        })}
        ${UI.card({
          title: "Jours fériés",
          subtitle: "Dates retenues pour le calcul des jours ouvrés",
          actions: `<button class="btn btn-sm btn-primary" data-act="new-holiday"><svg class="ico"><use href="#i-plus"/></svg> Nouveau jour férié</button>`,
          body: `<div id="hd-table"></div>`,
        })}
      </div>`;

    UI.table(panel.querySelector("#lt-table"), {
      columns: [
        {
          key: "name",
          label: "Type de congé",
          render: (r) =>
            `<div class="row" style="gap:9px">${swatch(r.color)}
              <div><div style="font-weight:650">${esc(r.name)}</div>
              <div class="small muted">${esc(r.code || "sans code")}${
              Number(r.requires_document) ? " · justificatif requis" : ""
            }</div></div></div>`,
        },
        {
          key: "days_per_year",
          label: "Jours / an",
          align: "right",
          sortValue: (r) => Number(r.days_per_year) || 0,
          render: (r) => (Number(r.days_per_year) > 0 ? App.fmt.days(r.days_per_year) : "Illimité"),
        },
        {
          key: "is_paid",
          label: "Rémunération",
          sortValue: (r) => Number(r.is_paid) || 0,
          render: (r) =>
            Number(r.is_paid)
              ? `<span class="badge green">Payé</span>`
              : `<span class="badge gray">Non payé</span>`,
        },
        {
          key: "active",
          label: "Statut",
          sortValue: (r) => Number(r.active) || 0,
          render: (r) =>
            Number(r.active) ? `<span class="badge green">Actif</span>` : `<span class="badge red">Inactif</span>`,
        },
        {
          key: "_actions",
          label: "Actions",
          sortable: false,
          cls: "actions-cell",
          render: (r) => actionButtons("lt", r.id),
        },
      ],
      rows: types,
      rowKey: (r) => r.id,
      sort: { key: "name", dir: "asc" },
      onRowClick: (r) => openLeaveTypeForm(r),
      empty: {
        icon: "#i-calendar",
        title: "Aucun type de congé",
        text: "Créez vos types de congés pour permettre les demandes des collaborateurs.",
        action: "Créer un type",
      },
      onEmptyAction: () => openLeaveTypeForm(null),
    });

    UI.table(panel.querySelector("#hd-table"), {
      columns: [
        {
          key: "date",
          label: "Date",
          sortValue: (r) => (isRecurring(r) ? `0000-${r.date}` : r.date),
          render: (r) =>
            isRecurring(r)
              ? `<span class="badge purple plain">${esc(String(r.date))}</span>`
              : App.fmt.date(r.date),
        },
        { key: "name", label: "Libellé", render: (r) => `<strong>${esc(r.name)}</strong>` },
        {
          key: "recurring",
          label: "Périodicité",
          sortValue: (r) => Number(r.recurring) || 0,
          render: (r) =>
            Number(r.recurring)
              ? `<span class="badge amber">Chaque année</span>`
              : `<span class="badge gray">Ponctuel</span>`,
        },
        {
          key: "_actions",
          label: "Actions",
          sortable: false,
          cls: "actions-cell",
          render: (r) => actionButtons("holiday", r.id),
        },
      ],
      rows: holidays,
      rowKey: (r) => r.id,
      sort: { key: "date", dir: "asc" },
      onRowClick: (r) => openHolidayForm(r),
      empty: {
        icon: "#i-calendar",
        title: "Aucun jour férié",
        text: "Ajoutez les jours fériés pour exclure automatiquement ces dates du calcul des congés.",
        action: "Créer un jour férié",
      },
      onEmptyAction: () => openHolidayForm(null),
    });
  }

  async function removeLeaveType(id) {
    const rows = App.state.leaveTypes || [];
    const row = rows.find((r) => r.id === id);
    const ok = await UI.confirm({
      title: "Supprimer le type de congé",
      message: row
        ? `Supprimer le type « ${esc(row.name)} » ?<br><br>Les demandes déjà enregistrées avec ce type empêcheront la suppression.`
        : "Supprimer ce type de congé ?",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    await App.api("delete_leave_type", { id });
    await App.loadLeaveTypes();
    App.toast("Type de congé supprimé", "success");
    Router.render();
  }

  async function removeHoliday(id) {
    const ok = await UI.confirm({
      title: "Supprimer le jour férié",
      message: "Supprimer ce jour férié ? Il sera à nouveau compté comme un jour ouvré.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    await App.api("delete_holiday", { id });
    await App.loadLeaveTypes();
    App.toast("Jour férié supprimé", "success");
    Router.render();
  }

  /* ================= 5. Utilisateurs ================= */

  function openUserForm(row) {
    UI.form({
      title: row ? "Modifier le compte" : "Nouveau compte utilisateur",
      subtitle: row ? `Compte « ${row.username || ""} »` : "Créez un accès au logiciel pour un collègue.",
      fields: [
        { name: "username", label: "Nom d'utilisateur", required: true, col: 6, placeholder: "ex. jdupont" },
        { name: "full_name", label: "Nom complet", col: 6, placeholder: "ex. Jean Dupont" },
        {
          name: "role",
          type: "select",
          label: "Rôle",
          col: 6,
          options: [
            { value: "admin", label: "Administrateur — accès complet" },
            { value: "manager", label: "Manager — suivi de son équipe" },
            { value: "hr", label: "RH & Paie — dossiers et paie" },
          ],
        },
        { name: "active", type: "checkbox", label: "Compte actif", col: 6 },
        {
          name: "password",
          type: "password",
          label: row ? "Nouveau mot de passe" : "Mot de passe",
          col: 6,
          help: "4 caractères minimum. Facultatif lors de la modification d'un compte existant.",
        },
      ],
      values: row
        ? { username: row.username, full_name: row.full_name || "", role: row.role || "hr", active: !!Number(row.active) }
        : { role: "hr", active: true },
      submitLabel: row ? "Enregistrer" : "Créer le compte",
      successMessage: row ? "Compte mis à jour" : "Compte créé",
      onSubmit: async (v) => {
        const data = {
          username: String(v.username || "").trim(),
          full_name: String(v.full_name || "").trim(),
          role: v.role || "hr",
          active: !!v.active,
        };
        const password = String(v.password || "");
        if (!data.username) throw "Le nom d'utilisateur est obligatoire.";
        if (row) {
          data.id = row.id;
          if (password) {
            if (password.length < 4) throw "Le nouveau mot de passe doit contenir au moins 4 caractères.";
            data.password = password;
          }
        } else {
          if (password.length < 4) throw "Le mot de passe doit contenir au moins 4 caractères.";
          data.password = password;
        }
        await App.api("save_user", { data });
        Router.render();
      },
    });
  }

  async function removeUser(id, username) {
    const ok = await UI.confirm({
      title: "Supprimer le compte",
      message: `Supprimer le compte « ${esc(username)} » ?<br><br>Cette action est définitive.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    const current = (App.state.user && App.state.user.username) || "admin";
    await App.api("delete_user", { id, current });
    App.toast("Compte supprimé", "success");
    Router.render();
  }

  function passwordBlock() {
    const user = App.state.user || {};
    return UI.card({
      title: "Changer mon mot de passe",
      subtitle: "Sécurisez votre accès au logiciel",
      body: `
        <form id="pwd-form" class="form-grid" novalidate>
          ${textField("username", "Compte", user.username || "", { col: 6, required: true, help: "Compte connecté." })}
          ${textField("old_password", "Mot de passe actuel", "", { col: 6, type: "password" })}
          ${textField("new_password", "Nouveau mot de passe", "", { col: 6, type: "password", help: "4 caractères minimum." })}
          ${textField("confirm_password", "Confirmer le nouveau mot de passe", "", { col: 6, type: "password" })}
          <div class="col-12"><p class="form-error hidden" id="pwd-error"></p></div>
        </form>`,
      foot: `<button class="btn btn-primary" data-act="change-pwd"><svg class="ico"><use href="#i-key"/></svg> Modifier le mot de passe</button>`,
    });
  }

  async function changePassword(panel) {
    const form = panel.querySelector("#pwd-form");
    if (!form) return;
    const box = panel.querySelector("#pwd-error");
    const v = valuesOf(form, ["username", "old_password", "new_password", "confirm_password"]);
    if (!v.username) return showBox(box, "Indiquez le nom d'utilisateur.");
    if (!v.old_password) return showBox(box, "Saisissez votre mot de passe actuel.");
    if (v.new_password.length < 4) return showBox(box, "Le nouveau mot de passe doit contenir au moins 4 caractères.");
    if (v.new_password !== v.confirm_password) return showBox(box, "La confirmation ne correspond pas au nouveau mot de passe.");
    showBox(box, null);

    await App.api("change_password", {
      username: v.username,
      old_password: v.old_password,
      new_password: v.new_password,
    });
    ["old_password", "new_password", "confirm_password"].forEach((n) => {
      const el = form.querySelector(`[name="${n}"]`);
      if (el) el.value = "";
    });
    App.toast("Mot de passe modifié avec succès", "success");
  }

  async function renderUsers(panel) {
    const users = (await App.call("list_users")) || [];
    panel.innerHTML = `<div class="stack" style="gap:16px">
        ${UI.card({
          title: "Comptes utilisateurs",
          subtitle: "Accès au logiciel, rôles et dernière connexion",
          actions: `<button class="btn btn-sm btn-primary" data-act="new-user"><svg class="ico"><use href="#i-plus"/></svg> Nouveau compte</button>`,
          body: `<div id="users-table"></div>`,
        })}
        ${passwordBlock()}
      </div>`;

    UI.table(panel.querySelector("#users-table"), {
      columns: [
        {
          key: "username",
          label: "Identifiant",
          render: (r) => `<div style="font-weight:650">${esc(r.username)}</div>`,
        },
        { key: "full_name", label: "Nom complet", render: (r) => esc(r.full_name || "—") },
        {
          key: "role",
          label: "Rôle",
          render: (r) => App.labels.badge(ROLES, r.role),
        },
        {
          key: "active",
          label: "Statut",
          sortValue: (r) => Number(r.active) || 0,
          render: (r) =>
            Number(r.active) ? `<span class="badge green">Actif</span>` : `<span class="badge red">Désactivé</span>`,
        },
        {
          key: "last_login",
          label: "Dernière connexion",
          render: (r) => (r.last_login ? App.fmt.dateTime(r.last_login) : `<span class="muted">Jamais</span>`),
        },
        {
          key: "_actions",
          label: "Actions",
          sortable: false,
          cls: "actions-cell",
          render: (r) => actionButtons("user", r.id),
        },
      ],
      rows: users,
      rowKey: (r) => r.id,
      sort: { key: "username", dir: "asc" },
      onRowClick: (r) => openUserForm(r),
      empty: {
        icon: "#i-users",
        title: "Aucun compte",
        text: "Créez au moins un compte pour donner accès au logiciel.",
        action: "Créer un compte",
      },
      onEmptyAction: () => openUserForm(null),
    });
  }

  /* ================= 6. Sauvegarde & données ================= */

  function actionCard(id, icon, title, text, label, btnClass, tone) {
    return UI.card({
      title,
      body: `<div class="row" style="align-items:flex-start;gap:12px">
          <div style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;flex:none;background:${
            tone || "var(--primary-soft)"
          };color:var(--primary)"><svg class="ico"><use href="${icon}"/></svg></div>
          <p class="small muted" style="line-height:1.55">${esc(text)}</p>
        </div>`,
      foot: `<button class="btn ${btnClass || ""} btn-block" data-act="${id}">${label}</button>`,
    });
  }

  async function renderData(panel) {
    const results = await Promise.all([
      App.call("database_info"),
      App.call("list_activity", { limit: 10 }),
    ]);
    const info = results[0] || {};
    const activity = results[1] || [];

    const counts = Object.keys(TABLE_LABELS)
      .filter((k) => info[k] !== undefined && info[k] !== null)
      .map(
        (k) =>
          `<span class="badge indigo plain">${esc(TABLE_LABELS[k])} · <b>${App.fmt.num(info[k])}</b></span>`
      )
      .join("");

    const timeline = activity.length
      ? `<div class="timeline">${activity
          .map(
            (a) => `<div class="tl">
              <div class="tl-title">${esc(a.label)}</div>
              <div class="tl-sub">${esc(ENTITY_LABELS[a.entity] || a.entity || "Journal")} · ${esc(
              a.author || ""
            )} · ${App.fmt.fromNow(String(a.at).replace(" ", "T"))}</div>
            </div>`
          )
          .join("")}</div>`
      : UI.empty({ icon: "#i-clock", title: "Aucune activité", text: "Le journal se remplit à mesure que vous utilisez le logiciel." });

    panel.innerHTML = `<div class="stack" style="gap:16px">
        <div class="grid grid-3">
          ${actionCard(
            "backup",
            "#i-database",
            "Sauvegarder la base",
            "Crée une copie complète du fichier de données au format SQLite, à l'emplacement de votre choix.",
            "Sauvegarder la base"
          )}
          ${actionCard(
            "restore",
            "#i-upload",
            "Restaurer une sauvegarde",
            "Remplace les données actuelles par un fichier de sauvegarde. Opération irréversible.",
            "Restaurer une sauvegarde",
            "btn-danger"
          )}
          ${actionCard(
            "folder",
            "#i-pin",
            "Ouvrir le dossier de données",
            "Affiche dans l'explorateur de fichiers le dossier contenant la base et les sauvegardes.",
            "Ouvrir le dossier"
          )}
          ${actionCard(
            "csv",
            "#i-download",
            "Exporter les employés en CSV",
            "Exporte la liste des collaborateurs au format tableur (point-virgule, compatible Excel).",
            "Exporter en CSV"
          )}
          ${actionCard(
            "seed",
            "#i-refresh",
            "Charger les données de démonstration",
            "Remplit le logiciel avec des services, collaborateurs et opérations d'exemple.",
            "Charger la démonstration"
          )}
          ${actionCard(
            "reset",
            "#i-trash",
            "Réinitialiser toutes les données",
            "Supprime définitivement les données métier. Votre compte administrateur est conservé.",
            "Réinitialiser…",
            "btn-danger"
          )}
        </div>

        <div class="grid grid-2">
          ${UI.card({
            title: "Contenu de la base",
            subtitle: info.first_activity
              ? `Journal actif depuis le ${App.fmt.date(info.first_activity)}`
              : "Nombre d'enregistrements par table",
            body: counts
              ? `<div class="row wrap" style="gap:8px">${counts}</div>`
              : UI.empty({ icon: "#i-database", title: "Information indisponible" }),
          })}
          ${UI.card({
            title: "Activité récente",
            subtitle: "10 dernières opérations enregistrées",
            tight: true,
            body: `<div style="padding:16px 18px">${timeline}</div>`,
          })}
        </div>
      </div>`;
  }

  async function runBackup() {
    const res = await App.api("backup_database");
    if (res) {
      App.toast(
        `Sauvegarde créée : ${res.path} (${App.fmt.num(Math.round((res.size || 0) / 1024))} Ko)`,
        "success",
        6000
      );
    }
  }

  async function runRestore() {
    const ok = await UI.confirm({
      title: "Restaurer une sauvegarde",
      messageTitle: "Opération destructive",
      message:
        "<strong>Les données actuelles seront remplacées</strong> par le contenu du fichier de sauvegarde choisi.<br><br>" +
        "Pensez à créer une sauvegarde avant de continuer. Cette opération ne peut pas être annulée.",
      confirmLabel: "Choisir un fichier",
      danger: true,
    });
    if (!ok) return;
    const res = await App.api("restore_database");
    if (res) {
      App.toast("Base restaurée avec succès. Redémarrez l'application pour prendre en compte la sauvegarde.", "success", 8000);
      await reloadSettings();
      Router.render();
    }
  }

  async function runSeed() {
    const ok = await UI.confirm({
      title: "Charger les données de démonstration",
      message:
        "Des services, collaborateurs et opérations d'exemple seront créés.<br><br>" +
        "Cette action nécessite une base sans employé.",
      confirmLabel: "Charger",
    });
    if (!ok) return;
    await App.api("seed_demo");
    App.toast("Données de démonstration chargées", "success");
    await App.refresh();
  }

  async function runReset() {
    const first = await UI.confirm({
      title: "Réinitialiser toutes les données",
      messageTitle: "Action irréversible",
      message:
        "<strong>Toutes les données métier seront supprimées</strong> : employés, services, congés, présences, " +
        "paies, recrutements, évaluations, documents et journal d'activité.<br><br>" +
        "Votre compte administrateur et vos paramètres sont conservés.",
      confirmLabel: "Continuer",
      danger: true,
    });
    if (!first) return;

    const typed = await new Promise((resolve) => {
      UI.form({
        title: "Confirmation finale",
        subtitle: "Saisissez le mot de confirmation pour valider la réinitialisation.",
        size: "sm",
        fields: [
          {
            name: "confirmation",
            label: "Tapez RÉINITIALISER pour confirmer",
            required: true,
            col: 12,
            placeholder: "RÉINITIALISER",
          },
        ],
        submitLabel: "Réinitialiser",
        onSubmit: (v) => {
          if (String(v.confirmation || "").trim().toUpperCase() !== "RÉINITIALISER") {
            throw "Le mot de confirmation ne correspond pas.";
          }
          resolve(true);
          return true;
        },
        onClose: () => resolve(false),
      });
    });
    if (!typed) return;

    await App.api("reset_data");
    App.toast("Toutes les données métier ont été réinitialisées.", "success");
    await App.refresh();
  }

  /* ================= Actions ================= */

  async function onAction(act, btn, panel) {
    switch (act) {
      /* Entreprise */
      case "save-company":
        await saveCompany(panel);
        break;

      /* Travail */
      case "save-work":
        await saveWork(panel);
        break;

      /* Paie */
      case "pay-save":
        await savePayroll(panel);
        break;
      case "pay-reset":
        await reloadSettings();
        App.toast("Valeurs enregistrées rechargées", "info");
        Router.render();
        break;
      case "add-row": {
        const key = btn.getAttribute("data-list");
        const cols = LIST_DEFS[key];
        const body = panel.querySelector(`tbody[data-list-body="${key}"]`);
        if (cols && body) {
          const placeholder = body.querySelector("tr:not([data-list])");
          if (placeholder) placeholder.remove();
          body.insertAdjacentHTML("beforeend", payRow(key, cols, null));
        }
        break;
      }
      case "del-row": {
        const tr = btn.closest("tr");
        if (tr && tr.parentNode) {
          const body = tr.parentNode;
          const key = body.getAttribute("data-list-body");
          tr.remove();
          if (!body.querySelector("tr[data-list]")) {
            const cols = ((LIST_DEFS[key] || []).length || 1) + 1;
            body.insertAdjacentHTML(
              "beforeend",
              `<tr><td colspan="${cols}" class="muted small">Aucune ligne : cliquez sur « Ajouter » pour en créer une.</td></tr>`
            );
          }
        }
        break;
      }

      /* Congés & fériés */
      case "new-lt":
        openLeaveTypeForm(null);
        break;
      case "edit-lt": {
        const row = ((await App.call("list_leave_types")) || App.state.leaveTypes || []).find(
          (r) => r.id === Number(btn.dataset.id)
        );
        if (row) openLeaveTypeForm(row);
        break;
      }
      case "del-lt":
        await removeLeaveType(Number(btn.dataset.id));
        break;
      case "new-holiday":
        openHolidayForm(null);
        break;
      case "edit-holiday": {
        const rows = (await App.call("list_holidays")) || [];
        const row = rows.find((r) => r.id === Number(btn.dataset.id));
        if (row) openHolidayForm(row);
        break;
      }
      case "del-holiday":
        await removeHoliday(Number(btn.dataset.id));
        break;

      /* Utilisateurs */
      case "new-user":
        openUserForm(null);
        break;
      case "edit-user": {
        const row = ((await App.call("list_users")) || []).find((r) => r.id === Number(btn.dataset.id));
        if (row) openUserForm(row);
        break;
      }
      case "del-user": {
        const row = ((await App.call("list_users")) || []).find((r) => r.id === Number(btn.dataset.id));
        await removeUser(Number(btn.dataset.id), row ? row.username : "");
        break;
      }
      case "change-pwd":
        await changePassword(panel);
        break;

      /* Données */
      case "backup":
        await runBackup();
        break;
      case "restore":
        await runRestore();
        break;
      case "folder": {
        const res = await App.api("open_data_folder");
        if (res) App.toast(`Dossier de données ouvert : ${res.path}`, "info");
        break;
      }
      case "csv": {
        const res = await App.api("export_csv", { kind: "employees", params: {} });
        if (res) App.toast(`Export CSV créé : ${res.path} (${App.fmt.num(res.rows)} ligne(s))`, "success", 6000);
        break;
      }
      case "seed":
        await runSeed();
        break;
      case "reset":
        await runReset();
        break;

      default:
        break;
    }
  }

  /* ================= Vue ================= */

  Views.settings = {
    title: "Paramètres",
    subtitle: "Entreprise, sécurité et données",

    render: async (el, params) => {
      if (!App.state.settings || !Object.keys(App.state.settings).length) await reloadSettings();

      el.innerHTML = `
        <div class="set-root stack" style="gap:16px">
          <div class="row-between wrap">
            ${UI.tabs(TABS, state.tab)}
            <span class="muted small">Chaque modification est appliquée après validation</span>
          </div>
          <div id="set-panel"></div>
        </div>`;

      /* `el` survit aux rendus : on synchronise les événements sur un conteneur neuf. */
      const root = el.querySelector(".set-root");
      const panel = root.querySelector("#set-panel");

      UI.bindTabs(root, (id) => {
        state.tab = id;
        Router.render();
      });

      UI.on(root, "[data-act]", async (btn) => {
        try {
          await onAction(btn.dataset.act, btn, panel);
        } catch (err) {
          /* les erreurs App.api sont déjà notifiées par le noyau */
        }
      });

      try {
        if (state.tab === "work") renderWork(panel);
        else if (state.tab === "payroll") renderPayroll(panel);
        else if (state.tab === "leaves") await renderLeaves(panel);
        else if (state.tab === "users") await renderUsers(panel);
        else if (state.tab === "data") await renderData(panel);
        else renderCompany(panel);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        panel.innerHTML = UI.alert(
          "danger",
          `<strong>Impossible d'afficher cette section.</strong><br>${esc(msg)}`
        );
      }
    },
  };
})();
