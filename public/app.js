"use strict";

const state = {
  overview: null,
  queries: [],
  editingIndex: null,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStatus() {
  const o = state.overview;
  if (!o) return;

  const badge = document.getElementById("status-badge");
  const detail = document.getElementById("status-detail");
  const toggle = document.getElementById("toggle-monitor");

  badge.className = "badge";
  if (o.checking) {
    badge.classList.add("checking");
    badge.textContent = "Checking…";
  } else if (o.running) {
    badge.classList.add("running");
    badge.textContent = "Running";
  } else {
    badge.classList.add("paused");
    badge.textContent = "Paused";
  }

  const parts = [];
  parts.push(`Poll: ${o.pollIntervalSeconds}s`);
  if (o.lastCheckAt) parts.push(`Last check: ${fmtTime(o.lastCheckAt)}`);
  if (o.nextCheckAt) parts.push(`Next: ${fmtTime(o.nextCheckAt)}`);
  if (o.smtpConfigured) parts.push("Email: on");
  else parts.push("Email: off");
  detail.textContent = parts.join(" · ");

  toggle.textContent = o.running ? "Pause" : "Resume";
}

function renderQueries() {
  const tbody = document.getElementById("queries-body");
  const empty = document.getElementById("queries-empty");

  tbody.innerHTML = "";

  if (state.queries.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const statusByName = {};
  if (state.overview && Array.isArray(state.overview.queries)) {
    for (const s of state.overview.queries) statusByName[s.name] = s;
  }

  state.queries.forEach((q, index) => {
    const status = statusByName[q.name];
    const tr = document.createElement("tr");

    const priceRange =
      q.lowPrice !== undefined || q.highPrice !== undefined
        ? `$${q.lowPrice ?? 0} – $${q.highPrice ?? "∞"}`
        : "—";

    const lastCheck = status && status.lastCheckAt ? fmtTime(status.lastCheckAt) : "never";
    const newCount = status ? status.lastNewCount : 0;
    const error = status && status.lastError ? status.lastError : "";

    tr.innerHTML = `
      <td>${escapeHtml(q.name)}</td>
      <td>${escapeHtml(q.searchText)}</td>
      <td>${escapeHtml(priceRange)}</td>
      <td>${lastCheck}</td>
      <td>${newCount > 0 ? `<span class="tag notified">+${newCount}</span>` : `<span class="tag">${newCount}</span>`}</td>
      <td>
        <div class="row-actions">
          <button data-action="edit" data-index="${index}">Edit</button>
          <button data-action="delete" data-index="${index}">Delete</button>
        </div>
      </td>
    `;

    if (error) {
      const errTr = document.createElement("tr");
      errTr.innerHTML = `<td colspan="6" style="color:var(--danger)">Error: ${escapeHtml(error)}</td>`;
      tbody.appendChild(tr);
      tbody.appendChild(errTr);
    } else {
      tbody.appendChild(tr);
    }
  });
}

function openAddForm() {
  state.editingIndex = null;
  document.getElementById("query-form-title").textContent = "Add search";
  document.getElementById("query-form").classList.remove("hidden");
  clearQueryForm();
}

function openEditForm(index) {
  state.editingIndex = index;
  const q = state.queries[index];
  document.getElementById("query-form-title").textContent = `Edit search: ${q.name}`;
  document.getElementById("query-form").classList.remove("hidden");
  fillQueryForm(q);
}

function clearQueryForm() {
  const fields = [
    "q-name",
    "q-searchText",
    "q-lowPrice",
    "q-highPrice",
    "q-categories",
    "q-sellers",
    "q-maxPages",
  ];
  for (const id of fields) document.getElementById(id).value = "";
  for (const id of ["q-buyNow", "q-pickup", "q-oneCent", "q-desc"]) {
    document.getElementById(id).checked = false;
  }
}

function fillQueryForm(q) {
  document.getElementById("q-name").value = q.name || "";
  document.getElementById("q-searchText").value = q.searchText || "";
  document.getElementById("q-lowPrice").value =
    q.lowPrice !== undefined ? q.lowPrice : "";
  document.getElementById("q-highPrice").value =
    q.highPrice !== undefined ? q.highPrice : "";
  document.getElementById("q-categories").value = q.selectedCategoryIds || "";
  document.getElementById("q-sellers").value = q.selectedSellerIds || "";
  document.getElementById("q-maxPages").value = q.maxPages || "";
  document.getElementById("q-buyNow").checked = Boolean(q.searchBuyNowOnly);
  document.getElementById("q-pickup").checked = Boolean(q.searchPickupOnly);
  document.getElementById("q-oneCent").checked = Boolean(q.searchOneCentShippingOnly);
  document.getElementById("q-desc").checked = Boolean(q.searchDescriptions);
}

function readQueryForm() {
  const num = (v) => (v === "" ? undefined : Number(v));
  const str = (v) => (v === "" ? undefined : v);
  return {
    name: document.getElementById("q-name").value.trim(),
    searchText: document.getElementById("q-searchText").value.trim(),
    lowPrice: num(document.getElementById("q-lowPrice").value),
    highPrice: num(document.getElementById("q-highPrice").value),
    selectedCategoryIds: str(document.getElementById("q-categories").value.trim()),
    selectedSellerIds: str(document.getElementById("q-sellers").value.trim()),
    maxPages: num(document.getElementById("q-maxPages").value),
    searchBuyNowOnly: document.getElementById("q-buyNow").checked || undefined,
    searchPickupOnly: document.getElementById("q-pickup").checked || undefined,
    searchOneCentShippingOnly: document.getElementById("q-oneCent").checked || undefined,
    searchDescriptions: document.getElementById("q-desc").checked || undefined,
  };
}

async function saveQuery() {
  const q = readQueryForm();
  if (!q.name || !q.searchText) {
    alert("Name and search terms are required.");
    return;
  }
  try {
    if (state.editingIndex === null) {
      await api("/api/queries", { method: "POST", body: JSON.stringify(q) });
    } else {
      await api(`/api/queries/${state.editingIndex}`, {
        method: "PUT",
        body: JSON.stringify(q),
      });
    }
    document.getElementById("query-form").classList.add("hidden");
    await refresh();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteQuery(index) {
  const q = state.queries[index];
  if (!confirm(`Delete search "${q.name}"?`)) return;
  try {
    await api(`/api/queries/${index}`, { method: "DELETE" });
    await refresh();
  } catch (err) {
    alert(err.message);
  }
}

async function loadSettings() {
  const s = await api("/api/settings");
  document.getElementById("s-interval").value = s.pollIntervalSeconds;
  document.getElementById("s-pageSize").value = s.pageSize;
  document.getElementById("s-maxPages").value = s.maxPages;
  document.getElementById("s-host").value = s.smtp.host || "";
  document.getElementById("s-port").value = s.smtp.port || 587;
  document.getElementById("s-secure").checked = Boolean(s.smtp.secure);
  document.getElementById("s-user").value = s.smtp.user || "";
  document.getElementById("s-pass").value = "";
  document.getElementById("s-pass").placeholder = s.smtp.passSet
    ? "•••• (set — leave blank to keep)"
    : "not set";
  document.getElementById("s-from").value = s.smtp.from || "";
  document.getElementById("s-to").value = s.smtp.to || "";
}

function readSmtpForm() {
  return {
    host: document.getElementById("s-host").value.trim(),
    port: Number(document.getElementById("s-port").value),
    secure: document.getElementById("s-secure").checked,
    user: document.getElementById("s-user").value.trim(),
    pass: document.getElementById("s-pass").value,
    from: document.getElementById("s-from").value.trim(),
    to: document.getElementById("s-to").value.trim(),
  };
}

async function saveSettings() {
  const smtp = readSmtpForm();
  const payload = {
    pollIntervalSeconds: Number(document.getElementById("s-interval").value),
    pageSize: Number(document.getElementById("s-pageSize").value),
    maxPages: Number(document.getElementById("s-maxPages").value),
    smtp,
  };
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    await loadSettings();
    await refresh();
  } catch (err) {
    alert(err.message);
  }
}

async function testSmtp() {
  const resultEl = document.getElementById("smtp-result");
  resultEl.className = "";
  resultEl.textContent = "Testing…";
  try {
    const result = await api("/api/smtp/test", {
      method: "POST",
      body: JSON.stringify({ smtp: readSmtpForm() }),
    });
    if (result.ok) {
      resultEl.textContent = "✓ SMTP connection OK";
      resultEl.className = "ok";
    } else {
      resultEl.textContent = "✗ " + result.error;
      resultEl.className = "err";
    }
  } catch (err) {
    resultEl.textContent = "✗ " + err.message;
    resultEl.className = "err";
  }
}

async function sendTestEmail() {
  const resultEl = document.getElementById("smtp-result");
  resultEl.className = "";
  resultEl.textContent = "Sending test email…";
  try {
    const result = await api("/api/smtp/test-email", {
      method: "POST",
      body: JSON.stringify({ smtp: readSmtpForm() }),
    });
    if (result.ok) {
      resultEl.textContent = "✓ Test email sent";
      resultEl.className = "ok";
    } else {
      resultEl.textContent = "✗ " + result.error;
      resultEl.className = "err";
    }
  } catch (err) {
    resultEl.textContent = "✗ " + err.message;
    resultEl.className = "err";
  }
}

function normalizeImageUrl(url) {
  return url ? url.replace(/\\/g, "/") : "";
}

function renderHistory(history) {
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  list.innerHTML = "";

  if (!history || history.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const entry of history) {
    const li = document.createElement("li");
    const img = normalizeImageUrl(entry.imageURL);
    const thumb = img
      ? `<img class="thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />`
      : `<div class="thumb"></div>`;
    li.innerHTML = `
      ${thumb}
      <div class="meta">
        <span class="title">${escapeHtml(entry.title)}</span>
        <span class="sub">
          <a href="${escapeHtml(entry.listingUrl)}" target="_blank" rel="noopener">View listing</a>
          · $${entry.currentPrice.toFixed(2)} · found ${fmtTime(entry.foundAt)} · "${escapeHtml(entry.searchText)}"
        </span>
      </div>
      <span class="tag ${entry.notified ? "notified" : "quiet"}">
        ${entry.notified ? "emailed" : "not emailed"}
      </span>
    `;
    list.appendChild(li);
  }
}

async function loadHistory() {
  const resp = await api("/api/history?limit=50");
  renderHistory(resp.history);
}

async function refresh() {
  const [overview, queriesResp] = await Promise.all([
    api("/api/overview"),
    api("/api/queries"),
  ]);
  state.overview = overview;
  state.queries = queriesResp.queries;
  renderStatus();
  renderQueries();
  await loadHistory();
}

async function checkNow() {
  const btn = document.getElementById("check-now");
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    state.overview = await api("/api/check", { method: "POST" });
    renderStatus();
    renderQueries();
    await loadHistory();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check now";
  }
}

async function toggleMonitor() {
  const running = state.overview && state.overview.running;
  const path = running ? "/api/monitor/stop" : "/api/monitor/start";
  try {
    state.overview = await api(path, { method: "POST" });
    renderStatus();
  } catch (err) {
    alert(err.message);
  }
}

async function clearHistory() {
  if (!confirm("Clear the find history?")) return;
  await api("/api/history", { method: "DELETE" });
  await loadHistory();
}

function wire() {
  document.getElementById("add-query").addEventListener("click", openAddForm);
  document.getElementById("cancel-query").addEventListener("click", () => {
    document.getElementById("query-form").classList.add("hidden");
  });
  document.getElementById("save-query").addEventListener("click", saveQuery);
  document.getElementById("check-now").addEventListener("click", checkNow);
  document.getElementById("toggle-monitor").addEventListener("click", toggleMonitor);
  document.getElementById("save-settings").addEventListener("click", saveSettings);
  document.getElementById("test-smtp").addEventListener("click", testSmtp);
  document.getElementById("test-email").addEventListener("click", sendTestEmail);
  document.getElementById("clear-history").addEventListener("click", clearHistory);

  document.getElementById("queries-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const index = Number(btn.dataset.index);
    if (btn.dataset.action === "edit") openEditForm(index);
    if (btn.dataset.action === "delete") deleteQuery(index);
  });
}

async function init() {
  wire();
  try {
    await refresh();
    await loadSettings();
  } catch (err) {
    console.error(err);
    alert("Failed to load: " + err.message);
  }
  setInterval(() => {
    refresh().catch(() => {});
  }, 30000);
}

document.addEventListener("DOMContentLoaded", init);
