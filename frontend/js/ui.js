/* ============================================================
   Gestion RH — Composants d'interface (modales, tableaux, formulaires)
   ============================================================ */
(function () {
  "use strict";
  const UI = (window.UI = {});
  const esc = App.esc;

  UI.toast = App.toast;

  /* ---------------- Modales ---------------- */
  const modalStack = [];

  UI.openModal = function (opts) {
    const root = document.getElementById("modal-root");
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const sizeCls = opts.size ? ` modal-${opts.size}` : "";
    backdrop.innerHTML = `
      <div class="modal${sizeCls}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div class="grow">
            <h3>${esc(opts.title || "")}</h3>
            ${opts.subtitle ? `<p>${opts.subtitle}</p>` : ""}
          </div>
          <button class="icon-btn" data-modal-close title="Fermer"><svg class="ico"><use href="#i-x"/></svg></button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot${opts.footer === false ? " hidden" : ""}"></div>
      </div>`;
    const body = backdrop.querySelector(".modal-body");
    const foot = backdrop.querySelector(".modal-foot");
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    if (opts.footer) foot.innerHTML = opts.footer;

    const handle = {
      el: backdrop,
      body,
      foot,
      close: () => close(),
    };
    function close() {
      const i = modalStack.indexOf(handle);
      if (i >= 0) modalStack.splice(i, 1);
      backdrop.remove();
      if (opts.onClose) opts.onClose();
    }
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop && !opts.persistent) close();
    });
    backdrop.querySelector("[data-modal-close]").onclick = close;
    root.appendChild(backdrop);
    modalStack.push(handle);
    const first = body.querySelector("input,select,textarea,button");
    if (first) setTimeout(() => first.focus(), 60);
    return handle;
  };

  UI.closeModal = function () {
    const top = modalStack[modalStack.length - 1];
    if (top) top.close();
    return !!top;
  };
  UI.closeAllModals = function () {
    while (UI.closeModal()) {}
  };
  UI.hasModal = () => modalStack.length > 0;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalStack.length) UI.closeModal();
  });

  UI.confirm = function (opts) {
    return new Promise((resolve) => {
      let settled = false;
      const m = UI.openModal({
        title: opts.title || "Confirmation",
        size: "sm",
        persistent: false,
        body: `<div class="row" style="align-items:flex-start;gap:14px">
            <div class="kpi-icon ${opts.danger ? "red" : "amber"}" style="width:42px;height:42px;display:grid;place-items:center;border-radius:12px;flex:none">
              <svg class="ico"><use href="${opts.danger ? "#i-alert" : "#i-info"}"/></svg>
            </div>
            <div>
              <p style="font-weight:650;margin-bottom:6px">${esc(opts.messageTitle || opts.title || "Confirmation")}</p>
              <p class="small muted" style="line-height:1.55">${opts.message || ""}</p>
            </div>
          </div>`,
        footer: `
          <button class="btn" data-act="cancel">${esc(opts.cancelLabel || "Annuler")}</button>
          <button class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" data-act="ok">${esc(opts.confirmLabel || "Confirmer")}</button>`,
        onClose: () => {
          if (!settled) resolve(false);
        },
      });
      m.foot.querySelector('[data-act="cancel"]').onclick = () => {
        settled = true;
        m.close();
        resolve(false);
      };
      m.foot.querySelector('[data-act="ok"]').onclick = () => {
        settled = true;
        m.close();
        resolve(true);
      };
    });
  };

  /* ---------------- Formulaires ---------------- */
  function fieldHtml(f, values) {
    const val = values && values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : f.value;
    const id = "f-" + (f.name || App.uid("x"));
    const col = f.col || 6;
    const cls = `col-${col}`;
    const req = f.required ? ' <span class="req">*</span>' : "";
    const help = f.help ? `<span class="help">${esc(f.help)}</span>` : "";

    if (f.type === "section") {
      return `<div class="form-section">${esc(f.label || "")}</div>`;
    }
    if (f.type === "html") {
      return `<div class="${cls}">${typeof f.html === "function" ? f.html(values) : f.html || ""}</div>`;
    }

    let control = "";
    const common = `${f.disabled ? "disabled" : ""} ${f.readonly ? "readonly" : ""}`;
    switch (f.type) {
      case "select": {
        const opts = (f.options || [])
          .map((o) => {
            const value = o.value !== undefined ? o.value : o;
            const label = o.label !== undefined ? o.label : o;
            const sel = String(val) === String(value) ? " selected" : "";
            return `<option value="${esc(value)}"${sel}>${esc(label)}</option>`;
          })
          .join("");
        control = `<select id="${id}" name="${f.name}" ${common} ${f.required ? "required" : ""}>
            ${f.placeholder ? `<option value=""${val === "" || val === undefined || val === null ? " selected" : ""}>${esc(f.placeholder)}</option>` : ""}
            ${opts}
          </select>`;
        break;
      }
      case "textarea":
        control = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(
          f.placeholder || ""
        )}" ${common}>${esc(val || "")}</textarea>`;
        break;
      case "checkbox":
        return `<div class="${cls} field" data-field="${f.name}">
            <label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${
          val ? "checked" : ""
        } ${f.disabled ? "disabled" : ""}/> <span>${f.label || ""}${req}</span></label>
            ${help}
          </div>`;
      case "radio":
        control = `<div class="row wrap" style="gap:14px;padding-top:3px">${
          (f.options || [])
            .map((o) => {
              const value = o.value !== undefined ? o.value : o;
              const label = o.label !== undefined ? o.label : o;
              return `<label class="radio"><input type="radio" name="${f.name}" value="${esc(
                value
              )}" ${String(val) === String(value) ? "checked" : ""}/> <span>${esc(label)}</span></label>`;
            })
            .join("")
        }</div>`;
        break;
      case "number":
        control = `<input type="number" id="${id}" name="${f.name}" value="${
          val === 0 || val ? esc(val) : ""
        }" placeholder="${esc(f.placeholder || "")}" min="${f.min !== undefined ? f.min : ""}" ${
          f.max !== undefined ? `max="${f.max}"` : ""
        } step="${f.step !== undefined ? f.step : "any"}" ${common}/>`;
        break;
      case "date":
      case "time":
      case "email":
      case "password":
      case "tel":
        control = `<input type="${f.type}" id="${id}" name="${f.name}" value="${
          val !== undefined && val !== null ? esc(val) : ""
        }" placeholder="${esc(f.placeholder || "")}" ${common}/>`;
        break;
      default:
        control = `<input type="text" id="${id}" name="${f.name}" value="${
          val !== undefined && val !== null ? esc(val) : ""
        }" placeholder="${esc(f.placeholder || "")}" ${common} autocomplete="off"/>`;
    }
    return `<div class="${cls} field" data-field="${f.name}">
        ${f.label ? `<label for="${id}">${esc(f.label)}${req}</label>` : ""}
        ${control}
        ${f.suffix ? `<span class="help">${esc(f.suffix)}</span>` : ""}
        ${help}
      </div>`;
  }

  /**
   * Ouvre un formulaire dans une modale.
   * opts: {title, subtitle, fields, values, size, submitLabel, cancelLabel, hint, onSubmit}
   * onSubmit(values) : peut être async ; retour `false` garde la modale ouverte.
   */
  UI.form = function (opts) {
    const values = opts.values || {};
    const html = `<form id="ui-form" novalidate>
        <div class="form-grid">${(opts.fields || []).map((f) => fieldHtml(f, values)).join("")}</div>
        <p class="form-error hidden" id="form-error"></p>
        ${opts.hint ? `<div class="alert info mt-8"><svg class="ico"><use href="#i-info"/></svg><div>${opts.hint}</div></div>` : ""}
      </form>`;
    const m = UI.openModal({
      title: opts.title,
      subtitle: opts.subtitle,
      size: opts.size || "lg",
      body: html,
      footer: `${opts.leftFooter || ""}
        <button class="btn" type="button" data-act="cancel">${esc(opts.cancelLabel || "Annuler")}</button>
        <button class="btn btn-primary" type="button" data-act="submit">${esc(opts.submitLabel || "Enregistrer")}</button>`,
      onClose: opts.onClose,
    });

    const form = m.body.querySelector("#ui-form");
    const errorBox = m.body.querySelector("#form-error");
    const submitBtn = m.foot.querySelector('[data-act="submit"]');

    function collect() {
      const out = {};
      (opts.fields || []).forEach((f) => {
        if (!f.name || f.type === "section" || f.type === "html") return;
        if (f.type === "checkbox") {
          out[f.name] = !!form.querySelector(`[name="${f.name}"]`).checked;
          return;
        }
        if (f.type === "radio") {
          const checked = form.querySelector(`[name="${f.name}"]:checked`);
          let v = checked ? checked.value : "";
          if (f.optionType === "number" || (f.options || []).every((o) => String(o.value !== undefined ? o.value : o).match(/^-?\d+(\.\d+)?$/))) {
            v = v === "" ? null : Number(v);
          }
          out[f.name] = v;
          return;
        }
        const el = form.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        let v = el.value;
        if (f.type === "number") {
          v = v === "" ? null : Number(v);
          if (Number.isNaN(v)) v = null;
        } else if (v === "" && (f.emptyAsNull || f.type === "date")) {
          v = f.type === "date" ? "" : null;
        }
        out[f.name] = v;
      });
      return out;
    }

    function validate(values) {
      form.querySelectorAll(".field").forEach((el) => el.classList.remove("invalid"));
      for (const f of opts.fields || []) {
        if (!f.required || !f.name) continue;
        const el = form.querySelector(`[name="${f.name}"]`);
        if (!el) continue;
        const v = f.type === "checkbox" ? el.checked : el.value;
        if (v === "" || v === null || v === undefined) {
          const wrap = el.closest(".field");
          if (wrap) wrap.style.outline = "2px solid var(--danger)";
          setTimeout(() => { if (wrap) wrap.style.outline = ""; }, 2200);
          el.focus();
          return `Le champ « ${f.label || f.name} » est obligatoire.`;
        }
      }
      return null;
    }

    async function submit() {
      const values = collect();
      const invalid = validate(values);
      if (invalid) {
        errorBox.textContent = invalid;
        errorBox.classList.remove("hidden");
        return;
      }
      errorBox.classList.add("hidden");
      const original = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Enregistrement…";
      try {
        const result = opts.onSubmit ? await opts.onSubmit(values) : values;
        if (result === false) {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          return;
        }
        m.close();
        if (opts.successMessage) App.toast(opts.successMessage, "success");
      } catch (err) {
        const msg = typeof err === "string" ? err : err.message || "Erreur lors de l'enregistrement";
        errorBox.textContent = msg;
        errorBox.classList.remove("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });
    m.foot.querySelector('[data-act="submit"]').onclick = submit;
    m.foot.querySelector('[data-act="cancel"]').onclick = () => m.close();
    return m;
  };

  /* ---------------- Tableaux ---------------- */
  function sortRows(columns, rows, key, dir) {
    const col = columns.find((c) => c.key === key);
    const get = (r) =>
      col && col.sortValue ? col.sortValue(r) : r[key];
    const sorted = rows.slice().sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === "") return 1;
      if (vb === null || vb === undefined || vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "fr", { numeric: true });
    });
    return dir === "desc" ? sorted.reverse() : sorted;
  }

  /**
   * Rend un tableau triable dans `container`.
   * opts: {columns, rows, rowKey, onRowClick, empty, foot, sort:{key,dir}, dense, className}
   */
  UI.table = function (container, opts) {
    const columns = opts.columns || [];
    const state = (container.__uiTable = container.__uiTable || {});
    if (opts.resetSort || !state.sort) state.sort = opts.sort || null;
    let rows = opts.rows || [];
    if (state.sort && state.sort.key) {
      rows = sortRows(columns, rows, state.sort.key, state.sort.dir);
    }

    if (!rows.length) {
      container.innerHTML = UI.empty(opts.empty || {});
      if (opts.onEmptyAction) {
        const btn = container.querySelector("[data-empty-action]");
        if (btn) btn.onclick = opts.onEmptyAction;
      }
      return;
    }

    const head = columns
      .map((c) => {
        const sorted = state.sort && state.sort.key === c.key;
        const arrow = sorted ? (state.sort.dir === "asc" ? "▲" : "▼") : "▾";
        const align = c.align === "right" ? "right" : c.align === "center" ? "center" : "";
        const sortAttr = c.sortable === false ? "" : ` class="sortable ${align} ${sorted ? "sorted" : ""}" data-sort="${c.key}"`;
        return `<th${sortAttr || ` class="${align}"`}>${esc(c.label)}${
          c.sortable === false ? "" : `<span class="sort-arrow">${arrow}</span>`
        }</th>`;
      })
      .join("");

    const body = rows
      .map((r, i) => {
        const key = opts.rowKey ? opts.rowKey(r) : i;
        const tds = columns
          .map((c) => {
            const align = c.align === "right" ? "num" : c.align === "center" ? "center" : "";
            const content = c.render ? c.render(r) : r[c.key];
            const cls = [align, c.cls].filter(Boolean).join(" ");
            return `<td class="${cls}">${content === null || content === undefined ? "—" : content}</td>`;
          })
          .join("");
        return `<tr data-key="${esc(key)}" ${
          opts.onRowClick ? 'class="clickable"' : ""
        }>${tds}</tr>`;
      })
      .join("");

    container.innerHTML = `
      <div class="table-wrap ${opts.dense ? "" : "table-in-card"}">
        <table class="table ${opts.className || ""}">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${opts.foot ? `<div class="table-foot">${opts.foot}</div>` : ""}`;

    if (!container.__uiBound) {
      container.__uiBound = true;
      container.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-sort]");
        if (th) {
          const key = th.dataset.sort;
          const st = container.__uiTable.sort;
          container.__uiTable.sort =
            st && st.key === key
              ? { key, dir: st.dir === "asc" ? "desc" : "asc" }
              : { key, dir: "asc" };
          if (opts.onSort) opts.onSort(container.__uiTable.sort);
          const fn = container.__uiRender;
          if (fn) fn();
          return;
        }
        const tr = e.target.closest("tr[data-key]");
        if (tr && opts.onRowClick && !e.target.closest("[data-action]")) {
          const idx = Number(tr.dataset.key);
          const row = isNaN(idx)
            ? (opts.rows || []).find((r) => String(opts.rowKey(r)) === tr.dataset.key)
            : (opts.rows || [])[idx];
          if (row) opts.onRowClick(row, e);
        }
      });
    }
    container.__uiRender = () => UI.table(container, opts);
  };

  /* ---------------- États vides & fragments ---------------- */
  UI.empty = function (opts) {
    const o = opts || {};
    return `<div class="empty">
        <div class="empty-icon"><svg class="ico"><use href="${o.icon || "#i-info"}"/></svg></div>
        <h4>${esc(o.title || "Aucune donnée")}</h4>
        <p>${esc(o.text || "")}</p>
        ${o.action ? `<button class="btn btn-primary" data-empty-action>${o.action}</button>` : ""}
      </div>`;
  };

  UI.card = function (opts) {
    const o = opts || {};
    return `<section class="card ${o.className || ""}">
        ${o.title || o.subtitle || o.actions ? `<div class="card-head">
          <div class="grow"><h3>${o.title || ""}</h3>${o.subtitle ? `<p>${o.subtitle}</p>` : ""}</div>
          ${o.actions ? `<div class="row">${o.actions}</div>` : ""}
        </div>` : ""}
        <div class="card-body ${o.tight ? "tight" : ""}">${o.body || ""}</div>
        ${o.foot ? `<div class="card-foot">${o.foot}</div>` : ""}
      </section>`;
  };

  UI.kpi = function (o) {
    return `<article class="card kpi">
        <div class="kpi-icon ${o.tone || ""}"><svg class="ico ico-lg"><use href="${o.icon || "#i-grid"}"/></svg></div>
        <div class="grow">
          <p class="label">${esc(o.label)}</p>
          <p class="value">${o.value !== undefined && o.value !== null ? o.value : "—"}</p>
          ${o.hint ? `<p class="hint">${o.hint}</p>` : ""}
        </div>
      </article>`;
  };

  UI.avatar = function (name, color, cls) {
    return `<span class="avatar ${cls || ""}" style="background:${color || "#4f46e5"}">${esc(
      App.fmt.initials(name)
    )}</span>`;
  };

  UI.person = function (o) {
    return `<div class="person">
        ${UI.avatar(o.name, o.color, o.size || "")}
        <div class="grow">
          <div class="p-name">${o.link ? `<a href="${o.link}">${esc(o.name)}</a>` : esc(o.name)}</div>
          ${o.sub ? `<div class="p-sub">${esc(o.sub)}</div>` : ""}
        </div>
      </div>`;
  };

  UI.stars = function (rating) {
    const r = Math.round(Number(rating) || 0);
    return `<span class="stars">${"★".repeat(r)}${"☆".repeat(Math.max(0, 5 - r))}</span>`;
  };

  UI.score = function (value, max) {
    const v = Number(value) || 0;
    const m = max || 5;
    const pct = Math.max(0, Math.min(100, (v / m) * 100));
    return `<span class="score"><span class="sc-bar"><span class="sc-fill" style="width:${pct}%"></span></span><b>${App.fmt.num(
      v,
      1
    )}</b></span>`;
  };

  UI.tabs = function (items, active, onSelect) {
    return `<div class="tabs">${items
      .map(
        (t) =>
          `<button data-tab="${t.id}" class="${t.id === active ? "active" : ""}">${esc(t.label)}${
            t.count !== undefined && t.count !== null ? `<span class="count">${t.count}</span>` : ""
          }</button>`
      )
      .join("")}</div>`;
  };

  UI.bindTabs = function (root, handler) {
    root.querySelectorAll(".tabs [data-tab]").forEach((btn) => {
      btn.onclick = () => handler(btn.dataset.tab);
    });
  };

  UI.bar = function (label, value, max, opts) {
    const o = opts || {};
    const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return `<div class="bar-row">
        <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
        <div class="bar-track"><div class="bar-fill ${o.tone || ""}" style="width:${pct}%"></div></div>
        <div class="bar-value">${o.display || App.fmt.num(value)}</div>
      </div>`;
  };

  UI.spark = function (items, opts) {
    const o = opts || {};
    const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
    return `<div class="spark">${items
      .map(
        (i) => `<div class="col">
            <div class="stem" style="height:${Math.max(3, Math.round(((Number(i.value) || 0) / max) * 100))}%">
              <span class="tip">${esc(i.label)} : ${o.display ? o.display(i) : App.fmt.num(i.value)}</span>
            </div>
            <span class="lbl">${esc(i.short || i.label)}</span>
          </div>`
      )
      .join("")}</div>`;
  };

  UI.listItem = function (o) {
    return `<div class="list-item ${o.className || ""}" ${o.attrs || ""}>
        ${o.avatar || ""}
        <div class="li-main">
          <div class="li-title">${o.title}</div>
          ${o.sub ? `<div class="li-sub">${o.sub}</div>` : ""}
        </div>
        ${o.right ? `<div class="li-right">${o.right}</div>` : ""}
        ${o.actions ? `<div class="row">${o.actions}</div>` : ""}
      </div>`;
  };

  UI.alert = function (type, html, icon) {
    return `<div class="alert ${type || "info"}"><svg class="ico"><use href="${
      icon || (type === "danger" ? "#i-alert" : "#i-info")
    }"/></svg><div>${html}</div></div>`;
  };

  UI.kv = function (pairs) {
    return `<dl class="kv">${pairs
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === undefined || v === null || v === "" ? "—" : v}</dd>`)
      .join("")}</dl>`;
  };

  /** Enregistre une ligne d'action simple (délégation d'événements). */
  UI.on = function (root, selector, handler) {
    root.addEventListener("click", (e) => {
      const el = e.target.closest(selector);
      if (el && root.contains(el)) handler(el, e);
    });
  };
})();
