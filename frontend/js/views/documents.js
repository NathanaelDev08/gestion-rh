/* ============================================================
   Gestion RH — Documents des salariés : dossiers, expirations
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const esc = App.esc;
  const ico = (id) => `<svg class="ico"><use href="${id}"/></svg>`;

  /* Catégories proposées à la création (complétées par les catégories existantes). */
  const BASE_CATEGORIES = [
    "Contrat",
    "Justificatif",
    "Diplôme",
    "Certificat médical",
    "Pièce d'identité",
    "Attestation",
    "Avenant",
    "Divers",
  ];

  const CAT_TONE = {
    Contrat: "indigo",
    Justificatif: "blue",
    "Diplôme": "purple",
    "Certificat médical": "teal",
    "Pièce d'identité": "amber",
    Attestation: "green",
    Avenant: "purple",
    Divers: "gray",
  };

  /* État local : conservé d'un rendu à l'autre. */
  const state = { category: "all", employee: "all", expiring: false, search: "" };

  let rows = [];
  let alerts = { categories: [], expiring: [] };

  /* ---------------- Utilitaires ---------------- */
  async function safe(cmd, args) {
    try {
      return await App.api(cmd, args || {});
    } catch (err) {
      return null;
    }
  }

  const rowKey = (r) => "r" + r.id;

  function fullName(r) {
    return r.employee_name || "Employé";
  }

  function categoryBadge(cat) {
    const tone = CAT_TONE[cat] || "gray";
    return `<span class="badge ${tone} plain">${esc(cat || "Divers")}</span>`;
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (isNaN(d)) return null;
    const now = new Date(App.fmt.today() + "T00:00:00");
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  }

  function expiryBadge(iso) {
    const days = daysUntil(iso);
    if (days === null) return `<span class="badge gray plain">Sans expiration</span>`;
    if (days < 0) return `<span class="badge red">Expiré depuis ${App.fmt.days(-days)}</span>`;
    if (days === 0) return `<span class="badge red">Expire aujourd'hui</span>`;
    if (days < 30) return `<span class="badge amber">Expire dans ${App.fmt.days(days)}</span>`;
    if (days < 60) return `<span class="badge indigo">Expire dans ${App.fmt.days(days)}</span>`;
    return `<span class="muted">${App.fmt.date(iso)}</span>`;
  }

  function fileName(path) {
    if (!path) return "";
    const parts = String(path).split(/[\\/]/);
    return parts[parts.length - 1] || String(path);
  }

  /* ---------------- Filtrage local ---------------- */
  function filtered() {
    const term = state.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (state.category !== "all" && r.category !== state.category) return false;
      if (state.employee !== "all" && Number(r.employee_id) !== Number(state.employee)) return false;
      if (state.expiring) {
        const days = daysUntil(r.expiry_date);
        if (days === null || days > 60) return false;
      }
      if (!term) return true;
      return [r.name, r.category, r.reference, fullName(r), r.department]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }

  function categories() {
    const set = [];
    (alerts.categories || []).forEach((c) => {
      const v = c && (c.category !== undefined ? c.category : c);
      if (v && !set.includes(v)) set.push(v);
    });
    rows.forEach((r) => {
      if (r.category && !set.includes(r.category)) set.push(r.category);
    });
    return set.sort((a, b) => String(a).localeCompare(String(b), "fr"));
  }

  /* ---------------- KPI & alertes ---------------- */
  function paintKpis(el) {
    const box = el.querySelector("#doc-kpis");
    if (!box) return;
    const expiring = (alerts.expiring || []).length;
    const expired = rows.filter((r) => {
      const d = daysUntil(r.expiry_date);
      return d !== null && d < 0;
    }).length;
    const withExpiry = rows.filter((r) => daysUntil(r.expiry_date) !== null).length;

    box.innerHTML =
      UI.kpi({
        icon: "#i-file",
        label: "Documents archivés",
        value: App.fmt.num(rows.length),
        hint: `${App.fmt.num(categories().length)} catégorie(s) utilisée(s)`,
      }) +
      UI.kpi({
        icon: "#i-calendar",
        tone: expiring ? "amber" : "green",
        label: "Expirent sous 60 jours",
        value: App.fmt.num(expiring),
        hint: `${App.fmt.num(withExpiry)} document(s) avec date d'échéance`,
      }) +
      UI.kpi({
        icon: "#i-alert",
        tone: expired ? "red" : "green",
        label: "Documents expirés",
        value: App.fmt.num(expired),
        hint: expired ? "Renouvelez ces pièces au plus vite" : "Aucune pièce périmée",
      }) +
      UI.kpi({
        icon: "#i-users",
        tone: "sky",
        label: "Collaborateurs concernés",
        value: App.fmt.num(new Set(rows.map((r) => Number(r.employee_id))).size),
        hint: `${App.fmt.num((App.state.employees || []).length)} fiche(s) employé(s)`,
      });
  }

  function alertsHtml() {
    const list = alerts.expiring || [];
    if (!list.length) return "";
    return `<div class="alert warning"><svg class="ico"><use href="#i-alert"/></svg><div>
        <strong>${App.fmt.num(list.length)} document(s) expire(nt) dans les 60 prochains jours</strong><br>
        ${list
          .slice(0, 4)
          .map(
            (d) =>
              `${esc(d.name)} — ${esc(d.employee_name)} (${
                daysUntil(d.expiry_date) < 0
                  ? "expiré le " + App.fmt.date(d.expiry_date)
                  : "échéance du " + App.fmt.date(d.expiry_date)
              })`
          )
          .join(" · ")}
        ${list.length > 4 ? ` <span class="muted">et ${list.length - 4} autre(s)…</span>` : ""}
        &nbsp;<button class="btn btn-sm" type="button" data-act="show-expiring" style="vertical-align:middle">Voir les documents concernés</button>
      </div></div>`;
  }

  /* ---------------- Filtres ---------------- */
  function filtersHtml(list) {
    const catOpts = ['<option value="all">Toutes les catégories</option>']
      .concat(
        categories().map(
          (c) =>
            `<option value="${esc(c)}"${state.category === c ? " selected" : ""}>${esc(c)}</option>`
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
    const dirty =
      state.search || state.category !== "all" || state.employee !== "all" || state.expiring;

    return `
      <div class="filters">
        <div class="search-inline">
          ${ico("#i-search")}
          <input type="search" id="doc-search" placeholder="Nom, employé, référence…" value="${esc(
            state.search
          )}"/>
        </div>
        <select id="doc-category">${catOpts}</select>
        <select id="doc-employee">${empOpts}</select>
        <label class="check" style="gap:6px">
          <input type="checkbox" id="doc-expiring" ${state.expiring ? "checked" : ""}/>
          <span>Expire sous 60 j</span>
        </label>
        ${dirty ? `<button class="btn btn-sm btn-ghost" data-act="reset">Réinitialiser</button>` : ""}
        <span class="muted small" style="margin-left:auto">${App.fmt.num(list.length)} résultat(s)</span>
      </div>`;
  }

  function bindFilters(el) {
    const search = el.querySelector("#doc-search");
    if (search) {
      let t = null;
      search.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          state.search = search.value;
          Router.render();
          let tries = 0;
          const refocus = () => {
            const box = document.getElementById("doc-search");
            if (box) {
              box.focus();
              box.setSelectionRange(box.value.length, box.value.length);
            } else if (tries++ < 40) setTimeout(refocus, 30);
          };
          setTimeout(refocus, 30);
        }, 300);
      });
    }
    const cat = el.querySelector("#doc-category");
    if (cat) cat.onchange = () => { state.category = cat.value; Router.render(); };
    const emp = el.querySelector("#doc-employee");
    if (emp) emp.onchange = () => { state.employee = emp.value; Router.render(); };
    const chk = el.querySelector("#doc-expiring");
    if (chk) chk.onchange = () => { state.expiring = chk.checked; Router.render(); };
    const reset = el.querySelector('[data-act="reset"]');
    if (reset)
      reset.onclick = () => {
        state.search = "";
        state.category = "all";
        state.employee = "all";
        state.expiring = false;
        Router.render();
      };
  }

  /* ---------------- Liste ---------------- */
  function paintList(el, list) {
    const panel = el.querySelector("#doc-panel");
    panel.innerHTML = `
      ${alertsHtml()}
      ${UI.card({
        tight: true,
        actions: `
          <button class="btn btn-sm" data-act="refresh">${ico("#i-refresh")} Actualiser</button>
          <button class="btn btn-sm btn-primary" data-act="new">${ico("#i-plus")} Nouveau document</button>`,
        body: `
          <div class="card-body" style="padding-bottom:0">${filtersHtml(list)}</div>
          <div id="doc-table" style="margin-top:14px"></div>`,
        foot: `<span class="muted small">Cliquez sur une ligne pour consulter la fiche du document.</span>`,
      })}`;

    UI.table(el.querySelector("#doc-table"), {
      rows: list,
      rowKey,
      resetSort: true,
      sort: { key: "expiry_date", dir: "asc" },
      columns: [
        {
          key: "name",
          label: "Document",
          render: (r) =>
            `<div class="row" style="gap:9px">
              <span class="avatar sm" style="background:#64748b">${ico("#i-file")}</span>
              <div class="grow">
                <div class="p-name">${esc(r.name)}</div>
                <div class="p-sub">${esc(r.reference || "Sans référence")}</div>
              </div>
            </div>`,
        },
        {
          key: "employee_name",
          label: "Employé",
          sortValue: (r) => fullName(r),
          render: (r) =>
            `<div class="person">
              ${UI.avatar(fullName(r), null, "sm")}
              <div class="grow">
                <div class="p-name">${esc(fullName(r))}</div>
                <div class="p-sub">${esc(r.matricule || "")}${r.department ? " · " + esc(r.department) : ""}</div>
              </div>
            </div>`,
        },
        {
          key: "category",
          label: "Catégorie",
          render: (r) => categoryBadge(r.category),
        },
        {
          key: "issue_date",
          label: "Délivré le",
          render: (r) => `<span class="small">${App.fmt.date(r.issue_date)}</span>`,
        },
        {
          key: "expiry_date",
          label: "Expiration",
          render: (r) =>
            `${
              r.expiry_date ? `<div class="small muted">${App.fmt.date(r.expiry_date)}</div>` : ""
            }${expiryBadge(r.expiry_date)}`,
        },
        {
          key: "file_path",
          label: "Fichier",
          sortable: false,
          render: (r) =>
            r.file_path
              ? `<span class="small" title="${esc(r.file_path)}">${esc(fileName(r.file_path))}</span>`
              : `<span class="muted small">Aucun</span>`,
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
        icon: "#i-file",
        title: rows.length ? "Aucun document ne correspond au filtre" : "Aucun document",
        text: rows.length
          ? "Modifiez les filtres pour afficher d'autres résultats."
          : "Archivez les contrats, diplômes et justificatifs de vos collaborateurs.",
        action: "Nouveau document",
      },
      onEmptyAction: () => openForm(null),
      onRowClick: (r) => openDetail(r),
    });

    const table = el.querySelector("#doc-table");
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
    const showExp = panel.querySelector('[data-act="show-expiring"]');
    if (showExp)
      showExp.onclick = () => {
        state.expiring = true;
        Router.render();
      };
    bindFilters(el);
  }

  /* ---------------- Fiche document ---------------- */
  function openDetail(r) {
    const m = UI.openModal({
      title: r.name,
      subtitle: `${esc(fullName(r))}${r.category ? ` · ${esc(r.category)}` : ""}`,
      size: "lg",
      body: `
        ${UI.kv([
          ["Nom du document", esc(r.name)],
          ["Catégorie", categoryBadge(r.category)],
          ["Employé", esc(fullName(r))],
          ["Matricule", esc(r.matricule || "—")],
          ["Service", esc(r.department || "—")],
          ["Référence", esc(r.reference || "—")],
          ["Délivré le", App.fmt.date(r.issue_date)],
          ["Expire le", r.expiry_date ? `${App.fmt.date(r.expiry_date)} ${expiryBadge(r.expiry_date)}` : expiryBadge(null)],
          ["Fichier joint", r.file_path ? `<span class="small">${esc(r.file_path)}</span>` : `<span class="muted">Aucun fichier</span>`],
          ["Ajouté le", App.fmt.dateTime(r.created_at)],
        ])}
        ${r.description ? `
          <p class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:16px 0 6px">Description</p>
          <p class="small" style="line-height:1.6;white-space:pre-wrap">${esc(r.description)}</p>` : ""}
        <div class="alert info mt-16"><svg class="ico"><use href="#i-info"/></svg><div>
          <strong>Prévisualisation et téléchargement indisponibles.</strong><br>
          Le logiciel ne prend pas encore en charge l'ouverture des fichiers joints : renseignez uniquement le chemin du fichier (${
            r.file_path ? esc(fileName(r.file_path)) : "aucun"
          }).
        </div></div>`,
      footer: `
        <span class="left">${r.expiry_date ? `Échéance : ${App.fmt.date(r.expiry_date)}` : "Sans date d'expiration"}</span>
        <button class="btn" type="button" disabled title="Fonctionnalité non disponible pour le moment">${ico(
          "#i-download"
        )} Ouvrir le fichier</button>
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

  /* ---------------- Formulaire ---------------- */
  function openForm(row, presetEmployee) {
    const m = UI.form({
      title: row ? "Modifier le document" : "Nouveau document",
      subtitle: row ? esc(row.name) : "Ajoutez une pièce au dossier salarié",
      size: "lg",
      values: row || {},
      successMessage: row ? "Document mis à jour" : "Document ajouté",
      leftFooter: row
        ? `<span class="left"><button class="btn btn-danger" type="button" data-act="del">${ico(
            "#i-trash"
          )} Supprimer</button></span>`
        : "",
      fields: [
        { type: "section", label: "Identification" },
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
          value: presetEmployee || undefined,
        },
        {
          name: "name",
          label: "Nom du document",
          required: true,
          col: 6,
          placeholder: "ex. Contrat CDI — Sara Naciri",
        },
        {
          type: "html",
          name: "category",
          col: 6,
          html: (values) => `
            <div class="field" data-field="category">
              <label for="doc-cat-input">Catégorie</label>
              <input type="text" id="doc-cat-input" name="category" list="doc-categories" autocomplete="off"
                value="${esc((values && values.category) || "")}" placeholder="ex. Contrat"/>
              <datalist id="doc-categories">
                ${categories()
                  .concat(BASE_CATEGORIES)
                  .filter((c, i, arr) => arr.indexOf(c) === i)
                  .map((c) => `<option value="${esc(c)}"></option>`)
                  .join("")}
              </datalist>
              <span class="help">Choisissez une catégorie existante ou saisissez-en une nouvelle.</span>
            </div>`,
        },
        {
          name: "reference",
          label: "Référence",
          col: 6,
          placeholder: "ex. REF-2026-001",
        },
        { type: "section", label: "Validité" },
        {
          name: "issue_date",
          label: "Date de délivrance",
          type: "date",
          col: 4,
        },
        {
          name: "expiry_date",
          label: "Date d'expiration",
          type: "date",
          col: 4,
          help: "Laissez vide pour un document sans échéance.",
        },
        {
          name: "file_path",
          label: "Chemin du fichier",
          col: 4,
          placeholder: "C:\\… ou /…",
          help: "Chemin d'accès au fichier sur le disque (renseigné manuellement).",
        },
        {
          name: "description",
          label: "Description",
          type: "textarea",
          col: 12,
          rows: 3,
          placeholder: "Informations complémentaires sur cette pièce…",
        },
      ],
      onSubmit: async (v) => {
        const catInput = m.body.querySelector("#doc-cat-input");
        const empId = v.employee_id ? Number(v.employee_id) : 0;
        const name = String(v.name || "").trim();
        if (!empId) throw new Error("Sélectionnez l'employé auquel rattacher ce document.");
        if (!name) throw new Error("Le nom du document est obligatoire.");
        if (v.issue_date && v.expiry_date && v.expiry_date < v.issue_date) {
          throw new Error("La date d'expiration doit être postérieure à la date de délivrance.");
        }
        const data = {
          employee_id: empId,
          name,
          category: String((catInput && catInput.value) || v.category || "").trim() || "Divers",
          reference: String(v.reference || "").trim(),
          issue_date: v.issue_date || null,
          expiry_date: v.expiry_date || null,
          file_path: String(v.file_path || "").trim(),
          description: String(v.description || "").trim(),
        };
        if (row) data.id = row.id;
        try {
          await App.api("save_document", { data });
        } catch (err) {
          throw new Error(err.message || "Enregistrement impossible.");
        }
        await reload();
        Router.render();
      },
    });

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
      title: "Supprimer le document",
      messageTitle: `Supprimer « ${esc(row.name)} » ?`,
      message: `Document rattaché à ${esc(fullName(row))}. Cette action est définitive.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await App.api("delete_document", { id: row.id });
      App.toast("Document supprimé", "success");
      await reload();
      Router.render();
    } catch (err) {
      /* notification déjà affichée par App.api */
    }
  }

  /* ---------------- Chargement ---------------- */
  async function reload() {
    const [list, al] = await Promise.all([safe("list_documents", {}), safe("document_alerts")]);
    rows = list || [];
    alerts = al || { categories: [], expiring: [] };
  }

  /* ---------------- Vue ---------------- */
  Views.documents = {
    title: "Documents",
    subtitle: "Pièces, contrats et justificatifs des salariés",

    openNew: () => openForm(null),
    openForm: (row, employeeId) => openForm(row, employeeId),

    render: async (el) => {
      await reload();

      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div id="doc-kpis" class="grid grid-4"></div>
          <div id="doc-panel"></div>
        </div>`;

      paintKpis(el);
      paintList(el, filtered());
    },
  };
})();
