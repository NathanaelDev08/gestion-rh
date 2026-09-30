/* ============================================================
   Gestion RH — Recrutement : offres, candidats (kanban), entretiens
   ============================================================ */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const esc = App.esc;
  const ico = (id) => `<svg class="ico"><use href="${id}"/></svg>`;

  const STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"];
  const NEXT_STAGE = {
    new: "screening",
    screening: "interview",
    interview: "offer",
    offer: "hired",
  };

  const NEW_LABEL = {
    offers: "Nouvelle offre",
    candidates: "Nouveau candidat",
    interviews: "Nouvel entretien",
  };

  /* État local du module : conservé d'un rendu à l'autre. */
  const S = {
    tab: "offers",
    offerStatus: "",
    offerSearch: "",
    candOffer: "",
    candSearch: "",
    intSearch: "",
    stats: {},
    offers: [],
    candidates: [],
    interviews: [],
  };

  /* ---------------- Utilitaires ---------------- */
  async function safe(cmd, args) {
    try {
      return await App.api(cmd, args || {});
    } catch (err) {
      return null;
    }
  }

  function alive(root) {
    return !!root && document.body.contains(root);
  }

  /** Options au format UI.form à partir d'une map de libellés. */
  function mapOptions(map) {
    return Object.keys(map || {}).map((k) => ({ value: k, label: map[k][0] }));
  }

  function fullName(c) {
    return `${c.first_name || ""} ${c.last_name || ""}`.trim();
  }

  function salaryRange(o) {
    const lo = Number(o.salary_min) || 0;
    const hi = Number(o.salary_max) || 0;
    if (!lo && !hi) return "—";
    if (lo && hi) return lo === hi ? App.fmt.money(lo) : `${App.fmt.money(lo)} – ${App.fmt.money(hi)}`;
    return App.fmt.money(lo || hi);
  }

  function offerOptions(selected) {
    return S.offers
      .map(
        (o) =>
          `<option value="${o.id}"${String(selected) === String(o.id) ? " selected" : ""}>${esc(
            o.title
          )}</option>`
      )
      .join("");
  }

  function candidateArgs() {
    const args = {};
    if (S.candOffer) args.offer_id = Number(S.candOffer);
    if (S.candSearch.trim()) args.search = S.candSearch.trim();
    return args;
  }

  /** rowKey non numérique : UI.table utilise sinon la valeur comme index de ligne. */
  const rowKey = (r) => "r" + r.id;

  function freshBox(container) {
    container.innerHTML = "";
    const box = document.createElement("div");
    container.appendChild(box);
    return box;
  }

  function rowActions(id) {
    return `
      <button class="icon-btn" data-action="edit" data-id="${id}" title="Modifier">${ico("#i-edit")}</button>
      <button class="icon-btn danger" data-action="delete" data-id="${id}" title="Supprimer">${ico("#i-trash")}</button>`;
  }

  /* ---------------- Chargement des données ---------------- */
  async function loadAll() {
    const [stats, offers, candidates, interviews] = await Promise.all([
      safe("recruitment_stats"),
      safe("list_job_offers"),
      safe("list_candidates"),
      safe("list_interviews"),
    ]);
    S.stats = stats || {};
    S.offers = offers || [];
    S.candidates = candidates || [];
    S.interviews = interviews || [];
    // Conserve le filtre candidats (offre / recherche) après un rechargement complet.
    if (S.candOffer || S.candSearch.trim()) {
      const filtered = await safe("list_candidates", candidateArgs());
      if (filtered) S.candidates = filtered;
    }
  }

  async function refresh(root) {
    await loadAll();
    if (!alive(root)) return;
    paintKpis(root);
    paintTab(root);
  }

  async function reloadCandidates(root) {
    const args = {};
    if (S.candOffer) args.offer_id = Number(S.candOffer);
    if (S.candSearch.trim()) args.search = S.candSearch.trim();
    const rows = await safe("list_candidates", args);
    S.candidates = rows || [];
    if (alive(root)) paintBody(root);
  }

  /* ---------------- Statistiques ---------------- */
  function stageCount(stage) {
    const row = (S.stats.by_stage || []).find((r) => r.stage === stage);
    return row ? Number(row.n) || 0 : 0;
  }

  function paintKpis(root) {
    const box = root.querySelector("#rec-kpis");
    if (!box) return;
    const conv = S.stats.conversion || {};
    const total = Number(conv.total) || 0;
    const hired = Number(conv.hired) || stageCount("hired");
    const rejected = stageCount("rejected");
    const openOffers = S.offers.filter((o) => o.status === "open").length;
    const running = Math.max(0, total - hired - rejected);
    const rate = total ? Math.round((hired / total) * 100) : 0;

    box.innerHTML =
      UI.kpi({
        icon: "#i-briefcase",
        tone: "sky",
        label: "Offres ouvertes",
        value: App.fmt.num(openOffers),
        hint: `${App.fmt.num(S.offers.length)} offre(s) publiée(s) au total`,
      }) +
      UI.kpi({
        icon: "#i-users",
        label: "Candidats",
        value: App.fmt.num(total),
        hint: `${App.fmt.num(running)} en cours de traitement`,
      }) +
      UI.kpi({
        icon: "#i-user-check",
        tone: "green",
        label: "Recrutements",
        value: App.fmt.num(hired),
        hint: `${App.fmt.num(rejected)} candidature(s) refusée(s)`,
      }) +
      UI.kpi({
        icon: "#i-trend",
        tone: "teal",
        label: "Taux d'embauche",
        value: App.fmt.percent(rate),
        hint: "Candidats transformés en embauches",
      });
  }

  /* ---------------- Onglets & panneaux ---------------- */
  function panelHtml() {
    const q =
      S.tab === "offers"
        ? S.offerSearch
        : S.tab === "candidates"
        ? S.candSearch
        : S.intSearch;
    const placeholder =
      S.tab === "offers"
        ? "Rechercher un poste…"
        : S.tab === "candidates"
        ? "Rechercher un candidat…"
        : "Rechercher un entretien…";

    let select = "";
    if (S.tab === "offers") {
      const opts = ['<option value="">Tous les statuts</option>']
        .concat(
          mapOptions(App.labels.offer).map(
            (o) =>
              `<option value="${o.value}"${S.offerStatus === o.value ? " selected" : ""}>${esc(
                o.label
              )}</option>`
          )
        )
        .join("");
      select = `<select id="f-select">${opts}</select>`;
    } else if (S.tab === "candidates") {
      select = `<select id="f-select">
          <option value="">Toutes les offres</option>
          ${offerOptions(S.candOffer)}
        </select>`;
    }

    return `
      <div class="card">
        <div class="card-body">
          <div class="filters" style="margin-bottom:14px">
            ${select}
            <div class="search-inline">
              ${ico("#i-search")}
              <input id="f-q" type="text" value="${esc(q)}" placeholder="${esc(placeholder)}" autocomplete="off"/>
            </div>
          </div>
          <div id="rec-body"></div>
        </div>
      </div>`;
  }

  function paintTab(root) {
    if (!alive(root)) return;

    const tabs = root.querySelector("#rec-tabs");
    tabs.innerHTML = UI.tabs(
      [
        { id: "offers", label: "Offres", count: S.offers.length },
        { id: "candidates", label: "Candidats", count: stageCountGlobal() },
        { id: "interviews", label: "Entretiens", count: S.interviews.length },
      ],
      S.tab
    );
    UI.bindTabs(tabs, (id) => {
      S.tab = id;
      paintTab(root);
    });

    const btn = root.querySelector("#rec-new");
    btn.innerHTML = `${ico("#i-plus")} ${NEW_LABEL[S.tab] || "Nouvel élément"}`;
    btn.onclick = () => primaryAction(root);

    const panel = root.querySelector("#rec-panel");
    panel.innerHTML = panelHtml();
    bindPanel(root);
    paintBody(root);
  }

  function stageCountGlobal() {
    const rows = S.stats.by_stage || [];
    if (!rows.length) return S.candidates.length;
    return rows.reduce((a, r) => a + (Number(r.n) || 0), 0);
  }

  function bindPanel(root) {
    const q = root.querySelector("#f-q");
    if (q) {
      let timer = null;
      q.addEventListener("input", () => {
        if (S.tab === "offers") {
          S.offerSearch = q.value;
          paintBody(root);
        } else if (S.tab === "candidates") {
          S.candSearch = q.value;
          clearTimeout(timer);
          timer = setTimeout(() => reloadCandidates(root), 320);
        } else {
          S.intSearch = q.value;
          paintBody(root);
        }
      });
    }
    const sel = root.querySelector("#f-select");
    if (sel) {
      sel.addEventListener("change", () => {
        if (S.tab === "offers") {
          S.offerStatus = sel.value;
          paintBody(root);
        } else if (S.tab === "candidates") {
          S.candOffer = sel.value;
          reloadCandidates(root);
        }
      });
    }
  }

  function primaryAction(root) {
    if (S.tab === "offers") {
      offerForm(root, null);
      return;
    }
    if (S.tab === "candidates") {
      if (!S.offers.length) {
        App.toast("Créez d'abord une offre d'emploi pour ajouter un candidat.", "warning");
        S.tab = "offers";
        paintTab(root);
        return;
      }
      candidateForm(root, null);
      return;
    }
    openInterviewForm(root, null);
  }

  function paintBody(root) {
    const holder = root.querySelector("#rec-body");
    if (!holder) return;
    if (S.tab === "offers") paintOffers(root, holder);
    else if (S.tab === "candidates") paintKanban(root, holder);
    else paintInterviews(root, holder);
  }

  /* ---------------- Onglet : offres ---------------- */
  function paintOffers(root, holder) {
    const term = S.offerSearch.trim().toLowerCase();
    const rows = S.offers.filter((o) => {
      if (S.offerStatus && o.status !== S.offerStatus) return false;
      if (!term) return true;
      return [o.title, o.location, o.department_name, o.contract_type]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    const box = freshBox(holder);
    UI.table(box, {
      rows,
      rowKey,
      sort: { key: "title", dir: "asc" },
      columns: [
        {
          key: "title",
          label: "Poste",
          render: (r) => `<strong>${esc(r.title)}</strong>`,
        },
        {
          key: "department_name",
          label: "Service",
          render: (r) => esc(r.department_name || App.deptName(r.department_id)),
        },
        {
          key: "contract_type",
          label: "Contrat",
          render: (r) => App.labels.badge(App.labels.contract, r.contract_type),
        },
        {
          key: "location",
          label: "Localisation",
          render: (r) => esc(r.location) || "—",
        },
        {
          key: "salary_min",
          label: "Rémunération",
          sortValue: (r) => Number(r.salary_max) || Number(r.salary_min) || 0,
          render: (r) => `<span class="small">${salaryRange(r)}</span>`,
        },
        {
          key: "status",
          label: "Statut",
          render: (r) => App.labels.badge(App.labels.offer, r.status),
        },
        {
          key: "candidates_count",
          label: "Candidats",
          align: "right",
          render: (r) =>
            App.fmt.num(r.candidates_count || 0) +
            (Number(r.hired_count)
              ? ` <span class="badge green plain">${App.fmt.num(r.hired_count)} embauché(s)</span>`
              : ""),
        },
        {
          key: "actions",
          label: "",
          sortable: false,
          cls: "actions-cell",
          render: (r) => rowActions(r.id),
        },
      ],
      empty: {
        icon: "#i-briefcase",
        title: term || S.offerStatus ? "Aucune offre ne correspond au filtre" : "Aucune offre d'emploi",
        text: "Publiez une offre pour commencer à recevoir des candidatures.",
        action: "Créer une offre",
      },
      onEmptyAction: () => offerForm(root, null),
      onRowClick: (row) => openOffer(root, row),
    });

    box.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const offer = S.offers.find((o) => Number(o.id) === id);
      if (!offer) return;
      if (btn.dataset.action === "edit") offerForm(root, offer);
      else deleteOffer(root, offer);
    });
  }

  /* ---------------- Onglet : candidats (kanban) ---------------- */
  function paintKanban(root, holder) {
    const term = S.candSearch.trim().toLowerCase();
    const list = S.candidates.filter((c) => {
      if (!term) return true;
      return [fullName(c), c.email, c.offer_title, c.source].join(" ").toLowerCase().includes(term);
    });

    const box = freshBox(holder);

    if (!S.offers.length) {
      box.innerHTML = UI.empty({
        icon: "#i-briefcase",
        title: "Aucune offre publiée",
        text: "Le tableau de bord des candidats s'affiche dès la création d'une offre d'emploi.",
        action: "Créer une offre",
      });
      const b = box.querySelector("[data-empty-action]");
      if (b) b.onclick = () => offerForm(root, null);
      return;
    }

    if (!list.length) {
      box.innerHTML = UI.empty({
        icon: "#i-users",
        title: term ? "Aucun candidat trouvé" : "Aucun candidat",
        text: term
          ? "Aucune candidature ne correspond à votre recherche."
          : "Ajoutez un candidat pour alimenter le pipeline de recrutement.",
        action: "Nouveau candidat",
      });
      const b = box.querySelector("[data-empty-action]");
      if (b) b.onclick = () => candidateForm(root, null);
      return;
    }

    box.innerHTML = `<div class="kanban">${STAGES.map((stage) => {
      const cards = list.filter((c) => (c.stage || "new") === stage);
      const def = App.labels.stage[stage] || [stage, "gray"];
      return `
        <div class="kanban-col" data-stage="${stage}">
          <div class="kanban-head">
            <span class="badge ${def[1]} plain">${esc(def[0])}</span>
            <span class="count">${cards.length}</span>
          </div>
          <div class="kanban-body" data-stage="${stage}">
            ${cards.length ? cards.map(kanbanCard).join("") : `<p class="small muted" style="text-align:center;padding:8px 0">Aucun candidat</p>`}
          </div>
        </div>`;
    }).join("")}</div>`;

    box.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".kanban-card");
      if (!card) return;
      card.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", card.dataset.id);
        e.dataTransfer.effectAllowed = "move";
      }
    });
    box.addEventListener("dragend", (e) => {
      const card = e.target.closest(".kanban-card");
      if (card) card.classList.remove("dragging");
      box.querySelectorAll(".kanban-col.over").forEach((c) => c.classList.remove("over"));
    });
    box.addEventListener("dragover", (e) => {
      const col = e.target.closest(".kanban-col");
      if (!col) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      col.classList.add("over");
    });
    box.addEventListener("dragleave", (e) => {
      const col = e.target.closest(".kanban-col");
      if (col && !col.contains(e.relatedTarget)) col.classList.remove("over");
    });
    box.addEventListener("drop", async (e) => {
      const col = e.target.closest(".kanban-col");
      if (!col) return;
      e.preventDefault();
      col.classList.remove("over");
      const id = Number((e.dataTransfer && e.dataTransfer.getData("text/plain")) || 0);
      const stage = col.dataset.stage;
      if (id && stage) await moveStage(root, id, stage);
    });
    box.addEventListener("click", async (e) => {
      const card = e.target.closest(".kanban-card");
      if (!card) return;
      const id = Number(card.dataset.id);
      const cand = S.candidates.find((c) => Number(c.id) === id);
      if (!cand) return;
      const btn = e.target.closest("[data-act]");
      if (btn && btn.dataset.act === "next") {
        const target = NEXT_STAGE[cand.stage || "new"];
        if (target) await moveStage(root, id, target);
        return;
      }
      candidateForm(root, cand);
    });
  }

  function kanbanCard(c) {
    const stage = c.stage || "new";
    const next = NEXT_STAGE[stage];
    return `
      <div class="kanban-card" draggable="true" data-id="${c.id}">
        <div class="kc-name">${esc(fullName(c))}</div>
        <div class="kc-meta">${esc(c.offer_title || "Poste à préciser")}</div>
        <div class="kc-meta">${c.source ? `Source : ${esc(c.source)}` : "Source non précisée"}</div>
        <div class="kc-foot">
          ${UI.stars(c.rating)}
          <span class="row" style="gap:6px">
            ${
              next
                ? `<button type="button" class="icon-btn" data-act="next" title="Étape suivante : ${
                    App.labels.stage[next][0]
                  }">${ico("#i-chevron-right")}</button>`
                : ""
            }
            <button type="button" class="icon-btn" data-act="open" title="Ouvrir la fiche">${ico(
              "#i-eye"
            )}</button>
          </span>
        </div>
      </div>`;
  }

  async function moveStage(root, id, stage) {
    try {
      await App.api("move_candidate", { id, stage });
      App.toast(`Candidat déplacé vers « ${App.labels.stage[stage][0]} »`, "success");
      const [stats, rows] = await Promise.all([
        safe("recruitment_stats"),
        safe("list_candidates", candidateArgs()),
      ]);
      if (stats) S.stats = stats;
      S.candidates = rows || [];
      if (alive(root)) {
        paintKpis(root);
        paintBody(root);
      }
    } catch (err) {
      /* notification déjà affichée par App.api */
    }
  }

  function candidateArgs() {
    const args = {};
    if (S.candOffer) args.offer_id = Number(S.candOffer);
    if (S.candSearch.trim()) args.search = S.candSearch.trim();
    return args;
  }

  /* ---------------- Onglet : entretiens ---------------- */
  function paintInterviews(root, holder) {
    const term = S.intSearch.trim().toLowerCase();
    const rows = S.interviews.filter((i) => {
      if (!term) return true;
      return [i.candidate_name, i.offer_title, i.type, i.interviewer, i.location]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    const box = freshBox(holder);
    UI.table(box, {
      rows,
      rowKey,
      sort: { key: "scheduled_at", dir: "desc" },
      columns: [
        {
          key: "scheduled_at",
          label: "Date",
          render: (r) => `<strong>${App.fmt.dateTime(r.scheduled_at)}</strong>`,
        },
        {
          key: "candidate_name",
          label: "Candidat",
          render: (r) => esc(r.candidate_name),
        },
        {
          key: "offer_title",
          label: "Poste",
          render: (r) => esc(r.offer_title || "—"),
        },
        {
          key: "type",
          label: "Type",
          render: (r) => esc(r.type || "—"),
        },
        {
          key: "interviewer",
          label: "Recruteur",
          render: (r) => esc(r.interviewer || "—"),
        },
        {
          key: "duration_minutes",
          label: "Durée",
          align: "right",
          render: (r) => `<span class="small">${App.fmt.duration(r.duration_minutes)}</span>`,
        },
        {
          key: "result",
          label: "Résultat",
          render: (r) => App.labels.badge(App.labels.interview, r.result),
        },
        {
          key: "actions",
          label: "",
          sortable: false,
          cls: "actions-cell",
          render: (r) => rowActions(r.id),
        },
      ],
      empty: {
        icon: "#i-calendar",
        title: term ? "Aucun entretien trouvé" : "Aucun entretien planifié",
        text: "Planifiez un entretien pour suivre l'avancement des recrutements.",
        action: "Planifier un entretien",
      },
      onEmptyAction: () => openInterviewForm(root, null),
      onRowClick: (row) => openInterviewForm(root, row),
    });

    box.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const iv = S.interviews.find((x) => Number(x.id) === id);
      if (!iv) return;
      if (btn.dataset.action === "edit") openInterviewForm(root, iv);
      else await deleteInterview(root, iv);
    });
  }

  /* ---------------- Fiche offre ---------------- */
  function openOffer(root, o) {
    const blocks = [
      ["Description du poste", o.description],
      ["Profil recherché", o.requirements],
      ["Avantages proposés", o.benefits],
    ]
      .filter(([, txt]) => txt && String(txt).trim())
      .map(
        ([title, txt]) => `
          <p class="small" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin:16px 0 6px">${esc(
            title
          )}</p>
          <p class="small" style="line-height:1.6;white-space:pre-wrap">${esc(txt)}</p>`
      )
      .join("");

    const m = UI.openModal({
      title: o.title,
      subtitle: `${esc(o.department_name || App.deptName(o.department_id))} · ${
        (App.labels.contract[o.contract_type] || [o.contract_type || "—"])[0]
      } · ${esc(o.location || "Localisation non précisée")}`,
      size: "lg",
      body: `
        ${UI.kv([
          ["Service", esc(o.department_name || App.deptName(o.department_id))],
          ["Contrat", App.labels.badge(App.labels.contract, o.contract_type)],
          ["Localisation", esc(o.location || "—")],
          ["Rémunération", salaryRange(o)],
          ["Statut", App.labels.badge(App.labels.offer, o.status)],
          ["Publiée le", o.posted_at ? App.fmt.date(o.posted_at) : "—"],
          ["Clôturée le", o.closed_at ? App.fmt.date(o.closed_at) : "—"],
          ["Candidats", App.fmt.num(o.candidates_count || 0)],
          ["Embauches", App.fmt.num(o.hired_count || 0)],
        ])}
        ${blocks || `<p class="small muted mt-16">Aucune description renseignée pour cette offre.</p>`}`,
      footer: `
        <span class="left">${esc(o.posted_at ? `Offre publiée le ${App.fmt.date(o.posted_at)}` : "Offre non publiée")}</span>
        <button class="btn" type="button" data-act="edit">${ico("#i-edit")} Modifier</button>
        <button class="btn btn-danger" type="button" data-act="del">${ico("#i-trash")} Supprimer</button>`,
    });

    m.foot.querySelector('[data-act="edit"]').onclick = () => {
      m.close();
      offerForm(root, o);
    };
    m.foot.querySelector('[data-act="del"]').onclick = async () => {
      m.close();
      await deleteOffer(root, o);
    };
  }

  function offerForm(root, o) {
    UI.form({
      title: o ? "Modifier l'offre" : "Nouvelle offre d'emploi",
      subtitle: o ? esc(o.title) : "Renseignez le poste à pourvoir",
      size: "lg",
      values: o || {},
      successMessage: o ? "Offre mise à jour" : "Offre créée",
      fields: [
        { type: "section", label: "Poste à pourvoir" },
        {
          name: "title",
          label: "Intitulé du poste",
          required: true,
          col: 8,
          placeholder: "Ex. Responsable comptable",
        },
        {
          name: "contract_type",
          label: "Type de contrat",
          type: "select",
          col: 4,
          options: mapOptions(App.labels.contract),
          value: "CDI",
        },
        {
          name: "department_id",
          label: "Service",
          type: "select",
          col: 6,
          options: (App.state.departments || []).map((d) => ({ value: d.id, label: d.name })),
          placeholder: "— Aucun service —",
        },
        {
          name: "location",
          label: "Localisation",
          col: 6,
          placeholder: "Ex. Dakar",
        },
        { type: "section", label: "Rémunération" },
        {
          name: "salary_min",
          label: "Salaire minimum",
          type: "number",
          col: 6,
          min: 0,
          step: 100,
          placeholder: "0",
        },
        {
          name: "salary_max",
          label: "Salaire maximum",
          type: "number",
          col: 6,
          min: 0,
          step: 100,
          placeholder: "0",
        },
        { type: "section", label: "Détails de l'offre" },
        {
          name: "description",
          label: "Description du poste",
          type: "textarea",
          col: 12,
          rows: 4,
          placeholder: "Missions, responsabilités, environnement de travail…",
        },
        {
          name: "requirements",
          label: "Profil recherché",
          type: "textarea",
          col: 6,
          rows: 4,
          placeholder: "Formation, expérience, compétences…",
        },
        {
          name: "benefits",
          label: "Avantages proposés",
          type: "textarea",
          col: 6,
          rows: 4,
          placeholder: "Primes, mutuelle, télétravail…",
        },
        {
          name: "status",
          label: "Statut de l'offre",
          type: "select",
          col: 6,
          options: mapOptions(App.labels.offer),
          value: "open",
        },
      ],
      onSubmit: async (v) => {
        const lo = Number(v.salary_min) || 0;
        const hi = Number(v.salary_max) || 0;
        if (lo && hi && hi < lo) {
          throw new Error("Le salaire maximum doit être supérieur ou égal au salaire minimum.");
        }
        const data = {
          title: String(v.title || "").trim(),
          department_id: v.department_id ? Number(v.department_id) : null,
          contract_type: v.contract_type || "CDI",
          location: v.location || "",
          salary_min: lo,
          salary_max: hi,
          description: v.description || "",
          requirements: v.requirements || "",
          benefits: v.benefits || "",
          status: v.status || "open",
        };
        if (o) data.id = o.id;
        try {
          await App.api("save_job_offer", { data });
        } catch (err) {
          throw new Error(err.message || "Enregistrement impossible.");
        }
        await refresh(root);
      },
    });
  }

  async function deleteOffer(root, o) {
    const ok = await UI.confirm({
      title: "Supprimer l'offre",
      messageTitle: `Supprimer « ${esc(o.title)} » ?`,
      message: "Les candidats et entretiens rattachés à cette offre seront également supprimés. Cette action est définitive.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await App.api("delete_job_offer", { id: o.id });
      App.toast("Offre supprimée", "success");
      await refresh(root);
    } catch (err) {
      /* notification déjà affichée */
    }
  }

  /* ---------------- Fiche candidat ---------------- */
  function candidateForm(root, c) {
    const m = UI.form({
      title: c ? `Fiche candidat — ${fullName(c)}` : "Nouveau candidat",
      subtitle: c
        ? `Candidature pour ${esc(c.offer_title || "un poste")}`
        : "Enregistrez une candidature dans le pipeline",
      size: "lg",
      values: c || {},
      successMessage: c ? "Candidat mis à jour" : "Candidat ajouté",
      leftFooter: c
        ? `<span class="left"><button class="btn btn-danger" type="button" data-act="del">${ico(
            "#i-trash"
          )} Supprimer le candidat</button></span>`
        : "",
      fields: [
        { type: "section", label: "Identité" },
        {
          name: "first_name",
          label: "Prénom",
          required: true,
          col: 4,
        },
        {
          name: "last_name",
          label: "Nom",
          required: true,
          col: 4,
        },
        {
          name: "email",
          label: "Courriel",
          type: "email",
          col: 4,
          placeholder: "prenom.nom@exemple.fr",
        },
        {
          name: "phone",
          label: "Téléphone",
          col: 4,
          placeholder: "06 00 00 00 00",
        },
        {
          name: "source",
          label: "Source de candidature",
          col: 4,
          placeholder: "Ex. Site internet, LinkedIn",
        },
        {
          name: "offer_id",
          label: "Poste visé",
          type: "select",
          required: true,
          col: 4,
          options: S.offers.map((o) => ({ value: o.id, label: o.title })),
          placeholder: "— Sélectionner —",
        },
        { type: "section", label: "Suivi de la candidature" },
        {
          name: "stage",
          label: "Étape",
          type: "select",
          col: 4,
          options: mapOptions(App.labels.stage),
          value: "new",
        },
        {
          name: "rating",
          label: "Note (de 0 à 5)",
          type: "number",
          col: 4,
          min: 0,
          max: 5,
          step: 1,
        },
        {
          name: "salary_expectation",
          label: "Prétention salariale",
          type: "number",
          col: 4,
          min: 0,
          step: 100,
        },
        {
          name: "availability",
          label: "Disponibilité",
          col: 6,
          placeholder: "Ex. Dès que possible",
        },
        {
          name: "notes",
          label: "Notes internes",
          type: "textarea",
          col: 6,
          rows: 3,
          placeholder: "Observations de l'équipe de recrutement…",
        },
        { type: "section", label: "Entretiens" },
        {
          type: "html",
          name: "cand_interviews",
          col: 12,
          html: () => interviewsBlock(c),
        },
      ],
      onSubmit: async (v) => {
        const data = {
          first_name: String(v.first_name || "").trim(),
          last_name: String(v.last_name || "").trim(),
          email: v.email || "",
          phone: v.phone || "",
          source: v.source || "",
          offer_id: v.offer_id ? Number(v.offer_id) : null,
          stage: v.stage || "new",
          rating: Number(v.rating) || 0,
          salary_expectation: Number(v.salary_expectation) || 0,
          availability: v.availability || "",
          notes: v.notes || "",
        };
        if (data.offer_id === null) {
          throw new Error("Sélectionnez le poste visé par ce candidat.");
        }
        if (!data.first_name || !data.last_name) {
          throw new Error("Le prénom et le nom du candidat sont obligatoires.");
        }
        if (c) data.id = c.id;
        try {
          await App.api("save_candidate", { data });
        } catch (err) {
          throw new Error(err.message || "Enregistrement impossible.");
        }
        await refresh(root);
      },
    });

    const box = m.body.querySelector("#cand-interviews");
    if (box) {
      box.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "plan") {
          await openInterviewForm(root, null, c ? c.id : null, () => repaintIvBox(box, c));
          return;
        }
        const wrap = btn.closest("[data-iv]");
        if (!wrap) return;
        const iv = S.interviews.find((x) => Number(x.id) === Number(wrap.dataset.iv));
        if (!iv) return;
        if (act === "iv-edit") {
          await openInterviewForm(root, iv, null, () => repaintIvBox(box, c));
        } else if (act === "iv-del") {
          const ok = await UI.confirm({
            title: "Supprimer l'entretien",
            message: "Supprimer définitivement cet entretien ?",
            confirmLabel: "Supprimer",
            danger: true,
          });
          if (!ok) return;
          try {
            await App.api("delete_interview", { id: iv.id });
            App.toast("Entretien supprimé", "success");
            await refresh(root);
            repaintIvBox(box, c);
          } catch (err) {
            /* notification déjà affichée */
          }
        }
      });
    }

    if (c) {
      const del = m.foot.querySelector('[data-act="del"]');
      if (del) {
        del.onclick = async () => {
          const ok = await UI.confirm({
            title: "Supprimer le candidat",
            messageTitle: `Supprimer ${esc(fullName(c))} ?`,
            message: "Ses entretiens rattachés seront également supprimés. Cette action est définitive.",
            confirmLabel: "Supprimer",
            danger: true,
          });
          if (!ok) return;
          m.close();
          try {
            await App.api("delete_candidate", { id: c.id });
            App.toast("Candidat supprimé", "success");
            await refresh(root);
          } catch (err) {
            /* notification déjà affichée */
          }
        };
      }
    }
  }

  function ivListHtml(c) {
    if (!c) {
      return `<p class="small muted">Enregistrez d'abord le candidat pour planifier ses entretiens.</p>`;
    }
    const list = S.interviews.filter((i) => Number(i.candidate_id) === Number(c.id));
    if (!list.length) {
      return `<p class="small muted">Aucun entretien pour l'instant.</p>`;
    }
    return list.map(interviewItem).join("");
  }

  function interviewsBlock(c) {
    return `
      <div class="field">
        <label>Entretiens du candidat</label>
        <div class="row-between" style="margin-bottom:8px">
          <span class="small muted">${
            c
              ? `${S.interviews.filter((i) => Number(i.candidate_id) === Number(c.id)).length} entretien(s)`
              : "Enregistrez le candidat pour planifier ses entretiens"
          }</span>
          ${
            c
              ? `<button type="button" class="btn btn-sm" data-act="plan">${ico(
                  "#i-plus"
                )} Planifier un entretien</button>`
              : ""
          }
        </div>
        <div id="cand-interviews">${ivListHtml(c)}</div>
      </div>`;
  }

  async function repaintIvBox(box, c) {
    if (!box) return;
    box.innerHTML = ivListHtml(c);
  }

  function interviewItem(i) {
    return UI.listItem({
      attrs: `data-iv="${i.id}"`,
      avatar: `<span class="avatar sm" style="background:#8b5cf6"><svg class="ico ico-sm"><use href="#i-briefcase"/></svg></span>`,
      title: `${App.fmt.dateTime(i.scheduled_at)} · ${esc(i.type || "Entretien")}`,
      sub: `${esc(i.interviewer || "Recruteur non précisé")}${
        i.location ? ` · ${esc(i.location)}` : ""
      } · ${App.fmt.duration(i.duration_minutes)}`,
      right: App.labels.badge(App.labels.interview, i.result),
      actions: `
        <button type="button" class="icon-btn" data-act="iv-edit" title="Modifier">${ico("#i-edit")}</button>
        <button type="button" class="icon-btn danger" data-act="iv-del" title="Supprimer">${ico(
          "#i-trash"
        )}</button>`,
    });
  }

  /* ---------------- Formulaire d'entretien ---------------- */
  function toLocalInput(iso) {
    if (!iso) return "";
    return String(iso).slice(0, 16).replace(" ", "T");
  }

  function defaultDateTime() {
    const d = new Date(Date.now() + 3600 * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
  }

  async function openInterviewForm(root, iv, presetCandidate, onDone) {
    const all = (await safe("list_candidates")) || [];
    const source = all.length ? all : S.candidates;
    if (!source.length) {
      App.toast("Aucun candidat enregistré : ajoutez d'abord un candidat.", "warning");
      return;
    }

    const dtValue = iv ? toLocalInput(iv.scheduled_at) : defaultDateTime();

    const m = UI.form({
      title: iv ? "Modifier l'entretien" : "Planifier un entretien",
      subtitle: iv ? esc(iv.candidate_name || "") : "Organisez un rendez-vous avec un candidat",
      size: "lg",
      values: iv || {},
      successMessage: iv ? "Entretien mis à jour" : "Entretien planifié",
      fields: [
        { type: "section", label: "Rendez-vous" },
        {
          name: "candidate_id",
          label: "Candidat",
          type: "select",
          required: true,
          col: 8,
          options: source.map((c) => ({
            value: c.id,
            label: `${fullName(c)}${c.offer_title ? ` — ${c.offer_title}` : ""}`,
          })),
          placeholder: "— Sélectionner —",
          value: iv ? iv.candidate_id : presetCandidate || "",
        },
        {
          name: "type",
          label: "Type d'entretien",
          type: "select",
          col: 4,
          options: [
            { value: "Entretien", label: "Entretien" },
            { value: "Téléphonique", label: "Entretien téléphonique" },
            { value: "Présélection", label: "Présélection" },
            { value: "Technique", label: "Entretien technique" },
            { value: "RH", label: "Entretien RH" },
            { value: "Final", label: "Entretien final" },
            { value: "Visioconférence", label: "Visioconférence" },
          ],
          value: "Entretien",
        },
        {
          type: "html",
          name: "when",
          col: 6,
          html: () => `
            <div class="field" data-field="when">
              <label for="iv-datetime">Date et heure <span class="req">*</span></label>
              <input type="datetime-local" id="iv-datetime" name="scheduled_at" value="${esc(
                dtValue
              )}" style="width:100%;height:40px;padding:0 12px;background:#fff;border:1px solid var(--border-strong);border-radius:10px;outline:none"/>
            </div>`,
        },
        {
          name: "duration_minutes",
          label: "Durée (minutes)",
          type: "number",
          col: 3,
          min: 5,
          step: 5,
          value: 60,
        },
        {
          name: "result",
          label: "Résultat",
          type: "select",
          col: 3,
          options: mapOptions(App.labels.interview),
          value: "pending",
        },
        { type: "section", label: "Informations pratiques" },
        {
          name: "interviewer",
          label: "Recruteur",
          col: 6,
          value:
            iv && iv.interviewer
              ? iv.interviewer
              : (App.state.user && (App.state.user.full_name || App.state.user.username)) || "",
        },
        {
          name: "location",
          label: "Lieu / lien de visioconférence",
          col: 6,
          placeholder: "Ex. Salle de réunion 2 ou https://…",
        },
        {
          name: "feedback",
          label: "Compte rendu",
          type: "textarea",
          col: 12,
          rows: 3,
          placeholder: "Points abordés, impressions de l'équipe…",
        },
      ],
      onSubmit: async (v) => {
        const dt = m.body.querySelector("#iv-datetime").value;
        if (!dt) {
          throw new Error("La date et l'heure de l'entretien sont obligatoires.");
        }
        const data = {
          candidate_id: v.candidate_id ? Number(v.candidate_id) : null,
          scheduled_at: String(dt).replace("T", " ").slice(0, 16),
          duration_minutes: Number(v.duration_minutes) || 60,
          type: v.type || "Entretien",
          interviewer: v.interviewer || "",
          location: v.location || "",
          feedback: v.feedback || "",
          result: v.result || "pending",
        };
        if (!data.candidate_id) {
          throw new Error("Sélectionnez le candidat à rencontrer.");
        }
        if (iv) data.id = iv.id;
        try {
          await App.api("save_interview", { data });
        } catch (err) {
          throw new Error(err.message || "Enregistrement impossible.");
        }
        const rows = (await safe("list_interviews")) || [];
        S.interviews = rows;
        if (alive(root)) {
          paintKpis(root);
          paintTab(root);
        }
        if (onDone) onDone();
      },
    });
    return m;
  }

  async function deleteInterview(root, iv) {
    const ok = await UI.confirm({
      title: "Supprimer l'entretien",
      message: `Supprimer l'entretien du ${App.fmt.dateTime(iv.scheduled_at)} ?`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await App.api("delete_interview", { id: iv.id });
      App.toast("Entretien supprimé", "success");
      await refresh(root);
    } catch (err) {
      /* notification déjà affichée */
    }
  }

  /* ---------------- Vue ---------------- */
  Views.recruitment = {
    title: "Recrutement",
    subtitle: "Offres, candidats et entretiens",
    render: async (el, params) => {
      if (params && params.tab && NEW_LABEL[params.tab]) S.tab = params.tab;
      await loadAll();
      el.innerHTML = `
        <div class="stack" style="gap:16px">
          <div id="rec-kpis" class="grid grid-4"></div>
          <div class="row-between wrap">
            <div id="rec-tabs"></div>
            <button class="btn btn-primary" id="rec-new" type="button"></button>
          </div>
          <div id="rec-panel"></div>
        </div>`;
      const root = el.firstElementChild;
      paintKpis(root);
      paintTab(root);
    },
  };
})();
