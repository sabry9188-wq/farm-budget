/* Farm Budget — AMSC cage farm budget planner and tracker
   Data: Supabase (farm-netlog project, budget_* tables). Style: Budget Planner design system. */
(function () {
"use strict";

const SB_URL = "https://fvvmekuuygqiujmvrkgg.supabase.co";
const SB_KEY = "sb_publishable_TZuPsGktngET6EW5OTvj4Q_79FjoiZ5";
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const S = {
  user: null, role: null, years: [], yearId: null, sites: [],
  cats: [], pats: [], lines: [], exps: [],
  ui: { trackerMode: "plan", expFilter: { month: "", cat: "", line: "", site: "", q: "" } }
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
const n2 = v => Number(v || 0);
function money(v, dec = 2) { const x = n2(v); return (x < 0 ? "−" : "") + "AED " + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function num(v, dec = 0) { return n2(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function short(v) { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M"; if (a >= 1e3) return Math.round(v / 1e3) + "k"; return Math.round(v) + ""; }
function pct(v, dec = 0) { return (isFinite(v) ? (v * 100).toFixed(dec) : "0") + "%"; }
function badge(label, tone) { return `<span class="bp-badge${tone ? " bp-badge--" + tone : ""}">${esc(label)}</span>`; }
function progress(v, tone) { const p = Math.max(0, Math.min(100, v * 100)); return `<div class="bp-progress${tone ? " bp-progress--" + tone : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.toFixed(0)}"><div class="bp-progress__fill" style="width:${p}%"></div></div>`; }
const ICON = { success: "✓", danger: "!", warning: "◷", info: "i" };
function insight(tone, title, text) { return `<div class="bp-insight bp-insight--${tone}"><span class="bp-insight__icon" aria-hidden="true">${ICON[tone]}</span><div><div class="bp-insight__title">${esc(title)}</div><div class="bp-insight__text">${esc(text)}</div></div></div>`; }
function stat(label, value, help, b) { return `<div class="bp-stat"><span class="bp-stat__label">${esc(label)}</span><span class="bp-stat__value">${value}</span>${help ? `<span class="bp-stat__help">${help}</span>` : ""}${b || ""}</div>`; }
function toast(msg, err) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (err ? " err" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.className = "toast", err ? 4500 : 2200); }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const isAdmin = () => S.role === "admin";
const canEdit = () => S.role === "admin" || S.role === "editor";
function errMsg(e) { return (e && (e.message || e.error_description)) || String(e); }

async function fetchAll(build) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await build().range(from, from + step - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < step) break;
  }
  return out;
}

/* ---------- data ---------- */
const year = () => S.years.find(y => y.id === S.yearId);
const site = id => S.sites.find(s => s.id === id);
const cat = id => S.cats.find(c => c.id === id);
const pat = id => S.pats.find(p => p.id === id);
const line = id => S.lines.find(l => l.id === id);
const siteName = id => id ? (site(id) || {}).name || "?" : "All sites";

async function loadBase() {
  const [y, s] = await Promise.all([
    sb.from("budget_years").select("*").order("year"),
    sb.from("budget_sites").select("*").order("sort")
  ]);
  if (y.error) throw y.error; if (s.error) throw s.error;
  S.years = y.data; S.sites = s.data;
  const saved = Number(store("fb_year"));
  const thisYear = new Date().getFullYear();
  if (!S.years.find(x => x.id === S.yearId)) {
    S.yearId = (S.years.find(x => x.id === saved) || S.years.find(x => x.year === thisYear) || S.years[S.years.length - 1] || {}).id || null;
  }
}
async function loadYear() {
  if (!S.yearId) { S.cats = S.pats = S.lines = S.exps = []; return; }
  const id = S.yearId;
  const [c, p, l, e] = await Promise.all([
    fetchAll(() => sb.from("budget_categories").select("*").eq("year_id", id).order("sort").order("id")),
    fetchAll(() => sb.from("budget_patterns").select("*").eq("year_id", id).order("id")),
    fetchAll(() => sb.from("budget_lines").select("*").eq("year_id", id).order("sort").order("id")),
    fetchAll(() => sb.from("budget_expenses").select("*").eq("year_id", id).order("spent_on", { ascending: false }).order("id", { ascending: false }))
  ]);
  S.cats = c; S.pats = p.map(x => ({ ...x, shares: x.shares.map(Number) })); S.lines = l; S.exps = e;
}
async function reload() { await loadBase(); await loadYear(); render(); }

/* ---------- calculations ---------- */
function shares(l) { const p = pat(l.pattern_id); return p ? p.shares : Array(12).fill(1 / 12); }
function planMonths(l) { const a = n2(l.annual_amount); return shares(l).map(s => a * s); }
function curMonthIdx() { const y = year(); if (!y) return -1; const now = new Date(); if (y.year < now.getFullYear()) return 11; if (y.year > now.getFullYear()) return -1; return now.getMonth(); }
function expMonth(e) { return Number(e.spent_on.slice(5, 7)) - 1; }
function calc() {
  const m = curMonthIdx();
  const byLine = {};
  S.lines.forEach(l => { const pm = planMonths(l); byLine[l.id] = { plan: pm, act: Array(12).fill(0), annual: n2(l.annual_amount), planTD: pm.slice(0, m + 1).reduce((a, b) => a + b, 0), actTD: 0 }; });
  S.exps.forEach(e => { const r = byLine[e.line_id]; if (!r) return; const mi = expMonth(e); r.act[mi] += n2(e.amount); r.actTD += n2(e.amount); });
  const plan = Array(12).fill(0), act = Array(12).fill(0);
  Object.values(byLine).forEach(r => r.plan.forEach((v, i) => { plan[i] += v; act[i] += r.act[i]; }));
  const total = Object.values(byLine).reduce((a, r) => a + r.annual, 0);
  const spent = act.reduce((a, b) => a + b, 0);
  const planTD = plan.slice(0, m + 1).reduce((a, b) => a + b, 0);
  const approved = S.lines.reduce((a, l) => a + n2(l.approved_amount), 0);
  return { m, byLine, plan, act, total, spent, planTD, approved };
}
function lineStatus(r) {
  if (r.annual > 0 && r.actTD > r.annual + 0.005) return ["Over Budget", "danger"];
  if (r.actTD > r.planTD * 1.1 && r.actTD - r.planTD > 100) return ["Over Plan", "warning"];
  if (r.actTD === 0 && r.planTD > 0) return ["Not Started", "info"];
  if (r.actTD === 0 && r.planTD === 0) return ["Not Due", ""];
  return ["On Track", "success"];
}
function catTotals(C) {
  return S.cats.map(c => {
    const ls = S.lines.filter(l => l.category_id === c.id);
    const budget = ls.reduce((a, l) => a + C.byLine[l.id].annual, 0);
    const spent = ls.reduce((a, l) => a + C.byLine[l.id].actTD, 0);
    const planTD = ls.reduce((a, l) => a + C.byLine[l.id].planTD, 0);
    return { c, ls, budget, spent, planTD };
  });
}

/* ---------- shell ---------- */
const NAV = [
  ["dashboard", "Dashboard", '<path d="M2.5 2.5h4.5v6H2.5zM9 2.5h4.5v3.5H9zM9 8h4.5v5.5H9zM2.5 10.5h4.5v3H2.5z"/>'],
  ["budget", "Budget Setup", '<path d="M3 13.5V7M8 13.5V2.5M13 13.5V9.5M1.5 13.5h13"/>'],
  ["expenses", "Expenses", '<rect x="2" y="3.5" width="12" height="9" rx="2"/><path d="M2 6.5h12M5 10h2"/>'],
  ["tracker", "Monthly Tracker", '<rect x="2.5" y="3" width="11" height="10.5" rx="2"/><path d="M2.5 6.5h11M5.5 1.5v3M10.5 1.5v3"/>'],
  ["patterns", "Monthly Patterns", '<path d="M1.5 12c2-6 4-6 6.5-3s4.5 2 6.5-5"/>'],
  ["sites", "Sites", '<path d="M8 14s-5-4.3-5-8a5 5 0 0 1 10 0c0 3.7-5 8-5 8z"/><circle cx="8" cy="6" r="1.8"/>'],
  ["settings", "Settings & Help", '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>']
];
function route() { const h = (location.hash || "#/dashboard").replace(/^#\//, "").split("?")[0]; return NAV.find(n => n[0] === h) ? h : "dashboard"; }

function shell(content) {
  const y = year(); const r = route();
  return `<div class="app">
  <aside class="side">
    <div class="brand">
      <div class="brand__mark"><svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17c4-7 12-8 19-3-3 1.5-3 4 0 5.5-7 5-15 4-19-2.5z" fill="currentColor"/><circle cx="20" cy="15" r="1.3" fill="#fff"/></svg></div>
      <div><div class="brand__name">Farm Budget</div><div class="brand__sub">AMSC Cage Farm</div></div>
    </div>
    <div>
      <div class="side__label">Budget Year</div>
      <select class="input" id="year-pick" aria-label="Budget year">
        ${S.years.map(x => `<option value="${x.id}" ${x.id === S.yearId ? "selected" : ""}>${x.year} · ${cap(x.status)}</option>`).join("") || `<option>No year yet</option>`}
      </select>
    </div>
    <nav class="bp-nav" aria-label="Main">
      ${NAV.map(n => `<a class="bp-nav__item" href="#/${n[0]}" ${r === n[0] ? 'aria-current="page"' : ""}><svg class="bp-nav__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${n[2]}</svg>${n[1]}</a>`).join("")}
    </nav>
    <div class="side__quick">
      <div class="side__label">Quick Add</div>
      ${canEdit() && y && y.status !== "closed" ? `<button class="bp-quick bp-quick--expense" data-act="add-exp"><span class="bp-quick__plus">+</span>Add Expense</button>` : ""}
      ${isAdmin() && y ? `<button class="bp-quick bp-quick--bill" data-act="add-line"><span class="bp-quick__plus">+</span>Add Budget Line</button>` : ""}
      ${isAdmin() ? `<button class="bp-quick bp-quick--debt" data-act="new-year"><span class="bp-quick__plus">+</span>Start New Year</button>` : ""}
    </div>
    <div class="side__user">
      <div class="hide-sm"><strong style="color:var(--ink)">${esc(S.user.email)}</strong><br>${cap(S.role)}</div>
      <button class="bp-btn bp-btn--sm" data-act="logout">Sign out</button>
    </div>
  </aside>
  <main class="main" id="main">${content}</main>
</div>`;
}
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
function statusBadge(y) { if (!y) return ""; return y.status === "approved" ? badge("Approved", "success") : y.status === "closed" ? badge("Closed", "") : badge("Draft", "warning"); }

function render() {
  const root = $("#root");
  if (!S.user) { root.innerHTML = loginView(); return; }
  if (!S.role) { root.innerHTML = noAccessView(); return; }
  const y = year();
  let body;
  if (!y && route() !== "settings") body = noYearView();
  else body = ({ dashboard: dashView, budget: budgetView, expenses: expView, tracker: trackerView, patterns: patView, sites: sitesView, settings: settingsView })[route()]();
  root.innerHTML = shell(body);
  window.scrollTo(0, 0);
  afterRender();
}
function afterRender() {
  const r = route();
  if (r === "settings" && isAdmin()) loadMembers();
}

/* ---------- auth views ---------- */
function loginView() {
  return `<div class="login"><div class="bp-card">
    <div class="brand"><div class="brand__mark"><svg width="20" height="20" viewBox="0 0 32 32"><path d="M5 17c4-7 12-8 19-3-3 1.5-3 4 0 5.5-7 5-15 4-19-2.5z" fill="currentColor"/></svg></div><div><div class="brand__name">Farm Budget</div><div class="brand__sub">AMSC Cage Farm</div></div></div>
    <h1>Plan the year. Track every dirham.</h1>
    <p class="tag">Sign in with your NetLog account.</p>
    <form id="login-form" class="stack" style="gap:12px">
      <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
      <button class="bp-btn bp-btn--primary" type="submit" style="height:40px">Sign In</button>
      <button class="bp-btn bp-btn--ghost bp-btn--sm" type="button" data-act="forgot">Forgot password?</button>
    </form>
  </div></div>`;
}
function noAccessView() {
  return `<div class="login"><div class="bp-card"><h1>No access yet</h1><p class="tag">You are signed in as <strong>${esc(S.user.email)}</strong>, but this account is not on the budget team. Ask the admin to add you in Settings.</p><button class="bp-btn" data-act="logout">Sign out</button></div></div>`;
}
function noYearView() {
  return `<div class="page-head"><div><h1>No budget year yet</h1><p>Start your first year to set up the budget.</p></div></div>
  <div class="bp-card empty">${isAdmin() ? `<button class="bp-btn bp-btn--primary" data-act="new-year">Start New Year</button>` : "Ask the admin to start a budget year."}</div>`;
}

/* ---------- Dashboard ---------- */
function dashView() {
  const y = year(); const C = calc();
  const remain = C.total - C.spent; const used = C.total ? C.spent / C.total : 0;
  const varTD = C.planTD - C.spent;
  const monthsLeft = C.m < 0 ? 12 : 11 - C.m;
  const perMonth = monthsLeft > 0 ? remain / monthsLeft : 0;
  const toLabel = C.m < 0 ? "Year not started" : "To end of " + MONTHS_LONG[C.m];
  const cats = catTotals(C);

  return `<div class="page-head"><div><h1>${esc(y.title || "Budget " + y.year)}</h1><p>Abu Al Abyad cage farm · Station 05, Offshore 01, Offshore 02 · All amounts in AED</p></div>
    <div class="actions">${statusBadge(y)}<button class="bp-btn" onclick="window.print()">Print / Save PDF</button>${canEdit() && y.status !== "closed" ? `<button class="bp-btn bp-btn--primary" data-act="add-exp">+ Add Expense</button>` : ""}</div></div>

  <div class="grid" style="gap:12px">
    <section class="bp-card hero">
      <div>
        <div class="eyebrow">Remaining Budget · ${y.year}</div>
        <div class="hero__amount ${remain < 0 ? "neg" : ""}">${money(remain)}</div>
        <div class="muted small">Spent ${money(C.spent)} of ${money(C.total)} · ${pct(used, 1)} used</div>
        <div style="margin-top:12px">${progress(used, used > 1 ? "danger" : "")}</div>
      </div>
      <div class="stack" style="gap:10px">
        <div class="row between"><span class="eyebrow">Plan ${esc(toLabel.toLowerCase())}</span><strong class="num">${money(C.planTD)}</strong></div>
        <div class="row between"><span class="eyebrow">Actual spent</span><strong class="num">${money(C.spent)}</strong></div>
        <div class="row between"><span class="eyebrow">Difference</span>${C.m < 0 ? badge("Not started", "info") : varTD >= 0 ? badge(money(varTD) + " under plan", "success") : badge(money(-varTD) + " over plan", "danger")}</div>
        ${C.approved && Math.abs(C.approved - C.total) > 0.5 ? `<div class="row between"><span class="eyebrow">Approved budget</span><strong class="num">${money(C.approved)}</strong></div>` : ""}
      </div>
    </section>

    <div class="stats">
      ${stat("Total Budget", money(C.total, 0), `${S.lines.length} lines`)}
      ${stat("Spent To Date", money(C.spent, 0), `${S.exps.length} expense records`)}
      ${stat("Plan To Date", money(C.planTD, 0), esc(toLabel))}
      ${stat("Left Per Month", monthsLeft > 0 ? money(perMonth, 0) : "—", monthsLeft > 0 ? `${monthsLeft} month(s) after this one` : "Year finished")}
      ${stat("This Month", C.m >= 0 ? money(C.act[C.m], 0) : "—", C.m >= 0 ? `Plan ${money(C.plan[C.m], 0)}` : "")}
    </div>

    <div class="grid g-12">
      <section class="bp-card span-8">
        <div class="row between"><div><h2 class="bp-card__title">Monthly Plan vs Actual</h2><p class="bp-card__sub">Bars show each month. Line shows the running total.</p></div>
        <div class="legend"><span><i style="background:var(--violet-line)"></i>Plan</span><span><i style="background:var(--primary)"></i>Actual</span><span><i style="background:var(--violet);height:3px"></i>Cumulative plan</span><span><i style="background:var(--warning);height:3px"></i>Cumulative actual</span></div></div>
        ${chart(C)}
      </section>
      <section class="bp-card span-4"><h2 class="bp-card__title">Smart Insights</h2><p class="bp-card__sub">Checked against the plan to date.</p><div class="stack">${insights(C, cats).join("")}</div></section>
    </div>

    <div class="grid g-12">
      <section class="bp-card span-7"><h2 class="bp-card__title">Budget By Category</h2><p class="bp-card__sub">Spent against the full-year budget.</p>
        <div class="scroll"><table class="bp-table"><thead><tr><th>Category</th><th class="bp-num">Budget</th><th class="bp-num">Spent</th><th style="width:22%">Used</th><th class="bp-num">Remaining</th></tr></thead><tbody>
        ${cats.map(t => { const u = t.budget ? t.spent / t.budget : 0; return `<tr><td class="line-name">${esc(t.c.name)}</td><td class="bp-num">${money(t.budget, 0)}</td><td class="bp-num">${money(t.spent, 0)}</td><td><div class="row" style="gap:8px;flex-wrap:nowrap"><div style="flex:1">${progress(u, u > 1 ? "danger" : t.spent > t.planTD * 1.1 && t.spent - t.planTD > 100 ? "warning" : "")}</div><span class="small muted num">${pct(u)}</span></div></td><td class="bp-num ${t.budget - t.spent < 0 ? "t-danger" : ""}">${money(t.budget - t.spent, 0)}</td></tr>`; }).join("")}
        </tbody><tfoot><tr><td>Total</td><td class="bp-num">${money(C.total, 0)}</td><td class="bp-num">${money(C.spent, 0)}</td><td>${pct(used)}</td><td class="bp-num">${money(remain, 0)}</td></tr></tfoot></table></div>
      </section>
      <section class="bp-card span-5"><h2 class="bp-card__title">Spending By Site</h2><p class="bp-card__sub">Budget set for each site, and expenses booked to it.</p>${siteTable(C)}</section>
    </div>

    <section class="bp-card"><div class="row between"><div><h2 class="bp-card__title">Recent Expenses</h2><p class="bp-card__sub">Last 8 records.</p></div><a class="bp-btn bp-btn--sm" href="#/expenses">See all</a></div>
      ${expTable(S.exps.slice(0, 8), false)}
    </section>
  </div>`;
}
function siteTable(C) {
  const rows = S.sites.map(s => ({ name: s.name, budget: S.lines.filter(l => l.site_id === s.id).reduce((a, l) => a + n2(l.annual_amount), 0), spent: S.exps.filter(e => e.site_id === s.id).reduce((a, e) => a + n2(e.amount), 0) }));
  rows.push({ name: "Shared (all sites)", budget: S.lines.filter(l => !l.site_id).reduce((a, l) => a + n2(l.annual_amount), 0), spent: S.exps.filter(e => !e.site_id).reduce((a, e) => a + n2(e.amount), 0) });
  return `<table class="bp-table"><thead><tr><th>Site</th><th class="bp-num">Budget</th><th class="bp-num">Spent</th></tr></thead><tbody>${rows.map(r => `<tr><td class="line-name">${esc(r.name)}</td><td class="bp-num">${money(r.budget, 0)}</td><td class="bp-num">${money(r.spent, 0)}</td></tr>`).join("")}</tbody></table>
  <p class="small muted" style="margin:10px 0 0">Shared lines (feed, nets, mooring…) have no site budget. When you add an expense, pick the site so you can see where the money went.</p>`;
}
function insights(C, cats) {
  const out = []; const y = year();
  if (!S.exps.length) out.push(insight("info", "No expenses yet", "Add the first expense to start tracking against the plan."));
  if (C.m >= 0 && S.exps.length) {
    if (C.spent > C.planTD) out.push(insight("warning", "Spending is ahead of plan", `Spent ${money(C.spent, 0)}. Plan to end of ${MONTHS[C.m]} was ${money(C.planTD, 0)} (${pct(C.spent / (C.planTD || 1) - 1)} more).`));
    else out.push(insight("success", "Spending is within plan", `Spent ${money(C.spent, 0)} against ${money(C.planTD, 0)} planned to end of ${MONTHS[C.m]}.`));
  }
  const rows = S.lines.map(l => ({ l, r: C.byLine[l.id] }));
  rows.filter(x => lineStatus(x.r)[0] === "Over Budget").sort((a, b) => (b.r.actTD - b.r.annual) - (a.r.actTD - a.r.annual)).slice(0, 3)
    .forEach(x => out.push(insight("danger", x.l.name + " is over budget", `Spent ${money(x.r.actTD, 0)} against a full-year budget of ${money(x.r.annual, 0)}.`)));
  rows.filter(x => lineStatus(x.r)[0] === "Over Plan").sort((a, b) => (b.r.actTD - b.r.planTD) - (a.r.actTD - a.r.planTD)).slice(0, 3)
    .forEach(x => out.push(insight("warning", x.l.name + " is above plan", `Spent ${money(x.r.actTD, 0)}, plan to date ${money(x.r.planTD, 0)}.`)));
  rows.filter(x => x.l.line_type === "one-off" && x.r.actTD === 0 && x.r.planTD > 0).slice(0, 3)
    .forEach(x => out.push(insight("info", x.l.name + " not bought yet", `${money(x.r.planTD, 0)} was planned by ${MONTHS[C.m]}. Update the pattern if the date moved.`)));
  const top = cats.filter(t => t.spent > 0).sort((a, b) => b.spent - a.spent)[0];
  if (top) out.push(insight("info", "Highest spend: " + top.c.name, `${money(top.spent, 0)} so far, ${pct(top.spent / (C.spent || 1))} of all spending.`));
  if (y && y.status === "draft") out.push(insight("warning", "Budget is still a draft", "Approve it in Budget Setup when the numbers are final. Approval saves the original figures."));
  return out.slice(0, 7);
}
function chart(C) {
  const W = 720, H = 260, L = 48, R = 12, T = 12, B = 28; const iw = W - L - R, ih = H - T - B;
  const cumP = [], cumA = []; C.plan.reduce((a, v, i) => (cumP[i] = a + v), 0); C.act.reduce((a, v, i) => (cumA[i] = a + v), 0);
  const maxBar = Math.max(1, ...C.plan, ...C.act); const maxCum = Math.max(1, cumP[11], cumA[11]);
  const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / p) * p; };
  const mb = nice(maxBar), mc = nice(maxCum);
  const gw = iw / 12, bw = Math.min(16, gw / 3);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly plan and actual spending">`;
  for (let i = 0; i <= 4; i++) { const yy = T + ih - ih * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--border)"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${short(mb * i / 4)}</text>`; }
  const cm = C.m;
  C.plan.forEach((p, i) => {
    const x = L + gw * i + gw / 2; const hp = ih * p / mb, ha = ih * C.act[i] / mb;
    if (i === cm) s += `<rect x="${L + gw * i + 2}" y="${T}" width="${gw - 4}" height="${ih}" rx="6" fill="var(--primary-soft)"/>`;
    s += `<rect x="${x - bw - 1}" y="${T + ih - hp}" width="${bw}" height="${hp}" rx="3" fill="var(--violet-line)"><title>${MONTHS[i]} plan ${money(p, 0)}</title></rect>`;
    s += `<rect x="${x + 1}" y="${T + ih - ha}" width="${bw}" height="${ha}" rx="3" fill="var(--primary)"><title>${MONTHS[i]} actual ${money(C.act[i], 0)}</title></rect>`;
    s += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink-muted)" ${i === cm ? 'font-weight="700"' : ""}>${MONTHS[i]}</text>`;
  });
  const pt = (arr, i) => `${L + gw * i + gw / 2},${T + ih - ih * arr[i] / mc}`;
  s += `<polyline fill="none" stroke="var(--violet)" stroke-width="2" points="${cumP.map((_, i) => pt(cumP, i)).join(" ")}"/>`;
  const lastA = cm < 0 ? -1 : cm; if (lastA >= 0) s += `<polyline fill="none" stroke="var(--warning)" stroke-width="2.5" points="${cumA.slice(0, lastA + 1).map((_, i) => pt(cumA, i)).join(" ")}"/>`;
  s += `<text x="${W - R}" y="${T + 10}" text-anchor="end" font-size="10" fill="var(--violet)">Cumulative scale: ${short(mc)}</text>`;
  return s + `</svg>`;
}

/* ---------- Expenses ---------- */
function lineOptions(selected) {
  return S.cats.map(c => `<optgroup label="${esc(c.name)}">${S.lines.filter(l => l.category_id === c.id).map(l => `<option value="${l.id}" ${l.id === selected ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</optgroup>`).join("");
}
function siteOptions(selected, allLabel = "All sites / shared") {
  return `<option value="">${esc(allLabel)}</option>` + S.sites.map(s => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`).join("");
}
function filteredExps() {
  const f = S.ui.expFilter; const q = f.q.trim().toLowerCase();
  return S.exps.filter(e => {
    if (f.month !== "" && expMonth(e) !== Number(f.month)) return false;
    if (f.line && e.line_id !== Number(f.line)) return false;
    if (f.cat && (line(e.line_id) || {}).category_id !== Number(f.cat)) return false;
    if (f.site === "none" && e.site_id) return false;
    if (f.site && f.site !== "none" && e.site_id !== Number(f.site)) return false;
    if (q && ![e.supplier, e.ref_no, e.description, (line(e.line_id) || {}).name].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}
function expTable(rows, actions) {
  if (!rows.length) return `<div class="empty">No expenses to show.</div>`;
  const edit = actions && canEdit() && year().status !== "closed";
  return `<div class="scroll"><table class="bp-table"><thead><tr><th>Date</th><th>Budget line</th><th>Site</th><th>Supplier</th><th>Ref / Invoice</th><th class="bp-num">Qty</th><th class="bp-num">Amount</th>${edit ? "<th></th>" : ""}</tr></thead><tbody>
  ${rows.map(e => { const l = line(e.line_id) || {}; return `<tr><td class="num" style="white-space:nowrap">${esc(e.spent_on)}</td><td><div class="line-name">${esc(l.name || "?")}</div><div class="line-meta">${esc((cat(l.category_id) || {}).name || "")}${e.description ? " · " + esc(e.description) : ""}</div></td><td>${esc(siteName(e.site_id))}</td><td>${esc(e.supplier || "")}</td><td>${esc(e.ref_no || "")}</td><td class="bp-num">${e.qty != null ? num(e.qty, 2).replace(/\.00$/, "") + " " + esc(e.unit || "") : ""}</td><td class="bp-num"><strong>${money(e.amount)}</strong></td>${edit ? `<td class="bp-num"><button class="icon-btn" data-act="edit-exp" data-id="${e.id}">Edit</button><button class="icon-btn del" data-act="del-exp" data-id="${e.id}">Delete</button></td>` : ""}</tr>`; }).join("")}
  </tbody></table></div>`;
}
function expView() {
  const y = year(); const f = S.ui.expFilter; const rows = filteredExps(); const tot = rows.reduce((a, e) => a + n2(e.amount), 0);
  const open = canEdit() && y.status !== "closed";
  return `<div class="page-head"><div><h1>Expenses ${y.year}</h1><p>Record every bill or purchase against a budget line.</p></div>
    <div class="actions"><button class="bp-btn" data-act="csv-exp">Export CSV</button>${open ? `<button class="bp-btn bp-btn--primary" data-act="add-exp">+ Add Expense</button>` : ""}</div></div>
  ${y.status === "closed" ? `<div style="margin-bottom:12px">${insight("info", "This year is closed", "Expenses cannot be added or changed. Re-open the year in Budget Setup if needed.")}</div>` : ""}
  ${!canEdit() ? `<div style="margin-bottom:12px">${insight("info", "View only", "Your role can view expenses but not add them.")}</div>` : ""}
  <section class="bp-card">
    <div class="form-grid" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px">
      <div class="field"><label>Month</label><select data-filter="month"><option value="">All months</option>${MONTHS_LONG.map((m, i) => `<option value="${i}" ${f.month === String(i) ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      <div class="field"><label>Category</label><select data-filter="cat"><option value="">All categories</option>${S.cats.map(c => `<option value="${c.id}" ${f.cat === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Budget line</label><select data-filter="line"><option value="">All lines</option>${S.cats.map(c => `<optgroup label="${esc(c.name)}">${S.lines.filter(l => l.category_id === c.id).map(l => `<option value="${l.id}" ${f.line === String(l.id) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      <div class="field"><label>Site</label><select data-filter="site"><option value="">All</option>${S.sites.map(s => `<option value="${s.id}" ${f.site === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}<option value="none" ${f.site === "none" ? "selected" : ""}>Shared only</option></select></div>
      <div class="field"><label>Search</label><input data-filter="q" value="${esc(f.q)}" placeholder="Supplier, ref, note"></div>
    </div>
    <div class="row between" style="margin-bottom:8px"><span class="small muted">${rows.length} record(s)</span><span>Total: <strong class="num">${money(tot)}</strong></span></div>
    ${expTable(rows, true)}
  </section>`;
}
function expForm(e) {
  e = e || { spent_on: today(), line_id: null, site_id: null, amount: "", qty: "", unit: "", supplier: "", ref_no: "", description: "" };
  const y = year();
  let d = e.spent_on; if (d.slice(0, 4) !== String(y.year)) d = y.year + d.slice(4);
  return `<h2>${e.id ? "Edit Expense" : "Add Expense"}</h2><p class="bp-card__sub">Budget year ${y.year}. The date must be in ${y.year}.</p>
  <form id="exp-form" class="form-grid" data-id="${e.id || ""}">
    <div class="field"><label>Date</label><input type="date" name="spent_on" value="${esc(d)}" min="${y.year}-01-01" max="${y.year}-12-31" required></div>
    <div class="field wide"><label>Budget line</label><select name="line_id" required><option value="">Choose a line…</option>${lineOptions(e.line_id)}</select></div>
    <div class="field"><label>Site</label><select name="site_id">${siteOptions(e.site_id)}</select></div>
    <div class="field"><label>Amount (AED)</label><input type="number" name="amount" step="0.01" value="${esc(e.amount)}" required placeholder="0.00"></div>
    <div class="field"><label>Quantity</label><input type="number" name="qty" step="any" value="${esc(e.qty == null ? "" : e.qty)}" placeholder="Optional"></div>
    <div class="field"><label>Unit</label><input name="unit" value="${esc(e.unit || "")}" placeholder="kg, L, pcs"></div>
    <div class="field"><label>Ref / Invoice no.</label><input name="ref_no" value="${esc(e.ref_no || "")}"></div>
    <div class="field wide"><label>Supplier</label><input name="supplier" value="${esc(e.supplier || "")}" list="sup-list"><datalist id="sup-list">${[...new Set(S.exps.map(x => x.supplier).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
    <div class="field wide"><label>Note</label><input name="description" value="${esc(e.description || "")}" placeholder="What was bought"></div>
    <p class="small muted full" style="margin:0">Use a minus amount for a refund or credit note.</p>
  </form>
  <div class="foot"><button class="bp-btn" data-act="close">Cancel</button>${e.id ? "" : `<button class="bp-btn" data-act="save-exp" data-more="1">Save &amp; Add Another</button>`}<button class="bp-btn bp-btn--primary" data-act="save-exp">Save</button></div>`;
}
async function saveExp(more) {
  const f = $("#exp-form"); if (!f.reportValidity()) return;
  const fd = new FormData(f); const id = f.dataset.id;
  const rec = { year_id: S.yearId, spent_on: fd.get("spent_on"), line_id: Number(fd.get("line_id")), site_id: fd.get("site_id") ? Number(fd.get("site_id")) : null, amount: Number(fd.get("amount")), qty: fd.get("qty") === "" ? null : Number(fd.get("qty")), unit: fd.get("unit").trim() || null, supplier: fd.get("supplier").trim() || null, ref_no: fd.get("ref_no").trim() || null, description: fd.get("description").trim() || null };
  if (!rec.amount) return toast("Amount cannot be zero", true);
  if (rec.spent_on.slice(0, 4) !== String(year().year)) return toast("Date must be in " + year().year, true);
  const q = id ? sb.from("budget_expenses").update(rec).eq("id", id) : sb.from("budget_expenses").insert(rec);
  const { error } = await q; if (error) return toast(errMsg(error), true);
  toast(id ? "Expense updated" : "Expense saved");
  await loadYear(); render();
  if (more) openDlg(expForm({ spent_on: rec.spent_on, line_id: rec.line_id, site_id: rec.site_id, amount: "", unit: rec.unit, supplier: rec.supplier }));
  else closeDlg();
}

/* ---------- Budget setup ---------- */
function budgetView() {
  const y = year(); const C = calc(); const admin = isAdmin();
  const running = S.lines.filter(l => l.line_type === "running").reduce((a, l) => a + n2(l.annual_amount), 0);
  const oneoff = C.total - running; const appr = y.status !== "draft" || S.lines.some(l => l.approved_amount != null);
  return `<div class="page-head"><div><h1>Budget Setup ${y.year}</h1><p>Set the annual amount, site and monthly pattern for each line.</p></div>
    <div class="actions">${statusBadge(y)}
      <button class="bp-btn" data-act="csv-budget">Export CSV</button>
      ${admin ? (y.status === "draft" ? `<button class="bp-btn bp-btn--primary" data-act="status" data-s="approved">Approve Budget</button>` : y.status === "approved" ? `<button class="bp-btn" data-act="status" data-s="draft">Back To Draft</button><button class="bp-btn bp-btn--danger" data-act="status" data-s="closed">Close Year</button>` : `<button class="bp-btn" data-act="status" data-s="approved">Re-open Year</button>`) : ""}
    </div></div>
  <div class="stats" style="margin-bottom:12px">
    ${stat("Total Budget", money(C.total, 0), "")}
    ${stat("Running Costs", money(running, 0), pct(running / (C.total || 1)) + " of total")}
    ${stat("One-off Items", money(oneoff, 0), pct(oneoff / (C.total || 1)) + " of total")}
    ${stat("Average Per Month", money(C.total / 12, 0), "")}
    ${stat(appr ? "Approved Total" : "Highest Month", appr ? money(C.approved, 0) : money(Math.max(...C.plan), 0), appr ? (Math.abs(C.total - C.approved) > 0.5 ? `Revised by ${money(C.total - C.approved, 0)}` : "No changes since approval") : MONTHS_LONG[C.plan.indexOf(Math.max(...C.plan))])}
  </div>
  ${y.status === "approved" && admin ? `<div style="margin-bottom:12px">${insight("info", "Budget is approved", "You can still change amounts. The original approved figure stays in the Approved column so you can see every revision.")}</div>` : ""}
  ${y.notes ? `<div style="margin-bottom:12px">${insight("info", "Note", y.notes)}</div>` : ""}
  <div class="stack" style="gap:12px">
  ${S.cats.map(c => { const ls = S.lines.filter(l => l.category_id === c.id); const t = ls.reduce((a, l) => a + n2(l.annual_amount), 0);
    return `<section class="bp-card"><div class="cat-head"><div><h2 class="bp-card__title">${esc(c.name)}</h2><span class="small muted">${ls.length} line(s) · ${pct(t / (C.total || 1), 1)} of budget</span></div>
      <div class="row"><strong class="num">${money(t)}</strong>${admin ? `<button class="bp-btn bp-btn--sm" data-act="add-line" data-cat="${c.id}">+ Line</button><button class="icon-btn" data-act="edit-cat" data-id="${c.id}">Rename</button>${ls.length ? "" : `<button class="icon-btn del" data-act="del-cat" data-id="${c.id}">Delete</button>`}` : ""}</div></div>
      ${ls.length ? `<div class="scroll"><table class="bp-table"><thead><tr><th>Budget line</th><th>Site</th><th>Type</th><th>Pattern</th><th class="bp-num">Annual (AED)</th>${appr ? `<th class="bp-num">Approved</th>` : ""}<th class="bp-num">Spent</th><th>Status</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>
      ${ls.map(l => { const r = C.byLine[l.id]; const st = lineStatus(r); const diff = l.approved_amount != null && Math.abs(n2(l.approved_amount) - n2(l.annual_amount)) > 0.005;
        return `<tr><td><div class="line-name">${esc(l.name)}</div>${l.basis ? `<div class="line-meta">${esc(l.basis)}</div>` : ""}</td><td>${esc(siteName(l.site_id))}</td><td>${l.line_type === "one-off" ? badge("One-off", "violet") : badge("Running", "")}</td><td>${esc((pat(l.pattern_id) || {}).name || "Even")}</td><td class="bp-num"><strong>${money(l.annual_amount)}</strong></td>${appr ? `<td class="bp-num ${diff ? "t-warning" : "muted"}">${l.approved_amount == null ? "—" : money(l.approved_amount)}</td>` : ""}<td class="bp-num">${money(r.actTD, 0)}</td><td>${badge(st[0], st[1])}</td>${admin ? `<td class="bp-num"><button class="icon-btn" data-act="edit-line" data-id="${l.id}">Edit</button><button class="icon-btn del" data-act="del-line" data-id="${l.id}">Delete</button></td>` : ""}</tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty">No lines yet.</div>`}
    </section>`; }).join("")}
  ${admin ? `<button class="bp-btn" data-act="add-cat" style="align-self:flex-start">+ Add Category</button>` : ""}
  </div>`;
}
function lineForm(l, catId) {
  l = l || { name: "", category_id: catId || (S.cats[0] || {}).id, site_id: null, annual_amount: "", pattern_id: (S.pats.find(p => p.name === "Even") || S.pats[0] || {}).id, line_type: "running", basis: "" };
  return `<h2>${l.id ? "Edit Budget Line" : "Add Budget Line"}</h2><p class="bp-card__sub">The pattern spreads the annual amount across the months.</p>
  <form id="line-form" class="form-grid" data-id="${l.id || ""}">
    <div class="field full"><label>Line name</label><input name="name" value="${esc(l.name)}" required></div>
    <div class="field wide"><label>Category</label><select name="category_id" required>${S.cats.map(c => `<option value="${c.id}" ${c.id === l.category_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="field wide"><label>Site</label><select name="site_id">${siteOptions(l.site_id)}</select></div>
    <div class="field wide"><label>Annual amount (AED)</label><input type="number" name="annual_amount" step="0.01" min="0" value="${esc(l.annual_amount)}" required></div>
    <div class="field"><label>Type</label><select name="line_type"><option value="running" ${l.line_type === "running" ? "selected" : ""}>Running</option><option value="one-off" ${l.line_type === "one-off" ? "selected" : ""}>One-off</option></select></div>
    <div class="field"><label>Pattern</label><select name="pattern_id">${S.pats.map(p => `<option value="${p.id}" ${p.id === l.pattern_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
    <div class="field full"><label>Basis / how it was worked out</label><input name="basis" value="${esc(l.basis || "")}" placeholder="e.g. 141 t at AED 6.20/kg"></div>
    <div class="full" id="line-preview"></div>
  </form>
  <div class="foot"><button class="bp-btn" data-act="close">Cancel</button><button class="bp-btn bp-btn--primary" data-act="save-line">Save</button></div>`;
}
function linePreview() {
  const f = $("#line-form"); if (!f) return; const fd = new FormData(f);
  const p = pat(Number(fd.get("pattern_id"))); const a = Number(fd.get("annual_amount")) || 0; const sh = p ? p.shares : Array(12).fill(1 / 12);
  $("#line-preview").innerHTML = `<div class="eyebrow" style="margin-bottom:6px">Monthly split</div><div class="scroll"><table class="bp-table bp-table--compact"><thead><tr>${MONTHS.map(m => `<th class="bp-num">${m}</th>`).join("")}</tr></thead><tbody><tr>${sh.map(s => `<td class="bp-num small">${short(a * s)}</td>`).join("")}</tr></tbody></table></div>`;
}
async function saveLine() {
  const f = $("#line-form"); if (!f.reportValidity()) return; const fd = new FormData(f); const id = f.dataset.id;
  const rec = { year_id: S.yearId, name: fd.get("name").trim(), category_id: Number(fd.get("category_id")), site_id: fd.get("site_id") ? Number(fd.get("site_id")) : null, annual_amount: Number(fd.get("annual_amount")), line_type: fd.get("line_type"), pattern_id: fd.get("pattern_id") ? Number(fd.get("pattern_id")) : null, basis: fd.get("basis").trim() || null };
  if (!id) rec.sort = S.lines.filter(l => l.category_id === rec.category_id).length + 1;
  const { error } = id ? await sb.from("budget_lines").update(rec).eq("id", id) : await sb.from("budget_lines").insert(rec);
  if (error) return toast(errMsg(error), true);
  closeDlg(); toast("Line saved"); await loadYear(); render();
}

/* ---------- Tracker ---------- */
function trackerView() {
  const y = year(); const C = calc(); const mode = S.ui.trackerMode;
  const val = (r, i) => mode === "plan" ? r.plan[i] : mode === "actual" ? r.act[i] : r.plan[i] - r.act[i];
  const tot = r => mode === "plan" ? r.annual : mode === "actual" ? r.actTD : r.annual - r.actTD;
  const cell = (v, i) => { const fut = mode !== "plan" && i > C.m; const cls = mode === "variance" && !fut ? (v < -0.5 ? "t-danger" : v > 0.5 ? "t-success" : "") : ""; return `<td class="bp-num small ${i === C.m ? "cur-col" : ""} ${fut ? "future" : ""} ${cls}">${mode !== "plan" && fut ? "" : Math.abs(v) < 0.5 ? "–" : num(v)}</td>`; };
  let body = "";
  catTotals(C).forEach(t => {
    const sub = { plan: Array(12).fill(0), act: Array(12).fill(0), annual: 0, actTD: 0 };
    t.ls.forEach(l => { const r = C.byLine[l.id]; r.plan.forEach((v, i) => { sub.plan[i] += v; sub.act[i] += r.act[i]; }); sub.annual += r.annual; sub.actTD += r.actTD; });
    body += `<tr class="sub-row"><td>${esc(t.c.name)}</td>${MONTHS.map((_, i) => cell(val(sub, i), i)).join("")}<td class="bp-num small">${num(tot(sub))}</td></tr>`;
    body += t.ls.map(l => { const r = C.byLine[l.id]; return `<tr><td style="padding-left:20px"><span class="small">${esc(l.name)}</span></td>${MONTHS.map((_, i) => cell(val(r, i), i)).join("")}<td class="bp-num small"><strong>${num(tot(r))}</strong></td></tr>`; }).join("");
  });
  const all = { plan: C.plan, act: C.act, annual: C.total, actTD: C.spent };
  const cumP = [], cumA = []; C.plan.reduce((a, v, i) => (cumP[i] = a + v), 0); C.act.reduce((a, v, i) => (cumA[i] = a + v), 0);
  const lines = S.lines.map(l => ({ l, r: C.byLine[l.id], st: lineStatus(C.byLine[l.id]) }));
  const order = { "Over Budget": 0, "Over Plan": 1, "Not Started": 2, "On Track": 3, "Not Due": 4 };
  lines.sort((a, b) => order[a.st[0]] - order[b.st[0]] || (b.r.actTD - b.r.planTD) - (a.r.actTD - a.r.planTD));
  return `<div class="page-head"><div><h1>Monthly Tracker ${y.year}</h1><p>${C.m >= 0 ? "Current month: " + MONTHS_LONG[C.m] + " (highlighted)." : "This year has not started yet."} Variance = plan − actual. Green is under plan, red is over.</p></div>
    <div class="actions"><div class="seg" role="group" aria-label="View">${["plan", "actual", "variance"].map(m => `<button data-act="tmode" data-m="${m}" aria-pressed="${mode === m}">${cap(m)}</button>`).join("")}</div><button class="bp-btn" data-act="csv-tracker">Export CSV</button></div></div>
  <section class="bp-card" style="margin-bottom:12px"><h2 class="bp-card__title">Line Status To Date</h2><p class="bp-card__sub">Each line compared with its plan ${C.m >= 0 ? "to the end of " + MONTHS_LONG[C.m] : ""}. Lines with problems are listed first.</p>
    <div class="scroll"><table class="bp-table"><thead><tr><th>Budget line</th><th>Category</th><th class="bp-num">Annual</th><th class="bp-num">Plan to date</th><th class="bp-num">Actual to date</th><th class="bp-num">Difference</th><th style="width:14%">Used of year</th><th>Status</th></tr></thead><tbody>
    ${lines.map(({ l, r, st }) => { const d = r.planTD - r.actTD; const u = r.annual ? r.actTD / r.annual : 0; return `<tr><td class="line-name">${esc(l.name)}</td><td class="small muted">${esc((cat(l.category_id) || {}).name)}</td><td class="bp-num">${num(r.annual)}</td><td class="bp-num">${num(r.planTD)}</td><td class="bp-num">${num(r.actTD)}</td><td class="bp-num ${d < -0.5 ? "t-danger" : d > 0.5 ? "t-success" : ""}">${num(d)}</td><td>${progress(u, u > 1 ? "danger" : "")}</td><td>${badge(st[0], st[1])}</td></tr>`; }).join("")}
    </tbody></table></div></section>
  <section class="bp-card"><h2 class="bp-card__title">${cap(mode)} By Month (AED)</h2><p class="bp-card__sub">${mode === "plan" ? "Annual amount × monthly pattern." : mode === "actual" ? "Sum of expenses recorded in each month." : "Plan minus actual. Future months are blank."}</p>
    <div class="scroll"><table class="bp-table bp-table--compact"><thead><tr><th>Line</th>${MONTHS.map((m, i) => `<th class="bp-num ${i === C.m ? "cur-col" : ""}">${m}</th>`).join("")}<th class="bp-num">${mode === "plan" ? "Total" : mode === "actual" ? "Total" : "Year left"}</th></tr></thead><tbody>${body}</tbody>
    <tfoot><tr><td>Monthly total</td>${MONTHS.map((_, i) => cell(val(all, i), i)).join("")}<td class="bp-num small">${num(tot(all))}</td></tr>
    <tr><td>Cumulative</td>${MONTHS.map((_, i) => { const v = mode === "plan" ? cumP[i] : mode === "actual" ? cumA[i] : cumP[i] - cumA[i]; return cell(v, i); }).join("")}<td></td></tr>
    <tr><td>% of budget</td>${MONTHS.map((_, i) => { const fut = mode !== "plan" && i > C.m; const v = (mode === "actual" ? cumA[i] : cumP[i]) / (C.total || 1); return `<td class="bp-num small ${fut ? "future" : ""}">${mode === "variance" || fut ? "" : pct(v)}</td>`; }).join("")}<td></td></tr></tfoot></table></div></section>`;
}

/* ---------- Patterns ---------- */
function patView() {
  const y = year(); const admin = isAdmin();
  return `<div class="page-head"><div><h1>Monthly Patterns ${y.year}</h1><p>A pattern says what share of a line's annual amount is spent in each month. Each pattern must total 100%.</p></div>
    <div class="actions">${admin ? `<button class="bp-btn bp-btn--primary" data-act="add-pat">+ Add Pattern</button>` : ""}</div></div>
  <div class="stack" style="gap:12px">
  ${S.pats.map(p => { const used = S.lines.filter(l => l.pattern_id === p.id); const t = p.shares.reduce((a, b) => a + b, 0); const ok = Math.abs(t - 1) < 0.0001;
    return `<section class="bp-card"><form class="pat-form" data-id="${p.id}">
      <div class="cat-head"><div class="row" style="gap:10px"><h2 class="bp-card__title" style="margin:0">${esc(p.name)}</h2>${badge(ok ? "OK · 100%" : "CHECK · " + pct(t, 1), ok ? "success" : "danger")}<span class="small muted">Used by ${used.length} line(s)</span></div>
      ${admin ? `<div class="row"><button type="button" class="bp-btn bp-btn--sm" data-act="pat-even" data-id="${p.id}">Make Even</button><button type="button" class="bp-btn bp-btn--sm bp-btn--primary" data-act="save-pat" data-id="${p.id}">Save</button>${used.length ? "" : `<button type="button" class="icon-btn del" data-act="del-pat" data-id="${p.id}">Delete</button>`}</div>` : ""}</div>
      <div class="pct-grid">${p.shares.map((s, i) => `<div class="field"><label>${MONTHS[i]}</label><input type="number" step="0.01" min="0" max="100" name="m${i}" value="${+(s * 100).toFixed(4)}" ${admin ? "" : "disabled"}></div>`).join("")}</div>
      <div class="field" style="margin-top:10px"><label>Note</label><input name="note" value="${esc(p.note || "")}" ${admin ? "" : "disabled"}></div>
      <div class="small muted" style="margin-top:8px" data-total>Total: ${pct(t, 2)}</div>
    </form></section>`; }).join("")}
  </div>`;
}
async function savePat(id) {
  const f = $(`.pat-form[data-id="${id}"]`); const fd = new FormData(f);
  const sh = MONTHS.map((_, i) => (Number(fd.get("m" + i)) || 0) / 100); const t = sh.reduce((a, b) => a + b, 0);
  if (Math.abs(t - 1) > 0.0001) return toast("Pattern must total 100% (now " + (t * 100).toFixed(2) + "%)", true);
  const { error } = await sb.from("budget_patterns").update({ shares: sh, note: fd.get("note").trim() || null }).eq("id", id);
  if (error) return toast(errMsg(error), true); toast("Pattern saved"); await loadYear(); render();
}

/* ---------- Sites ---------- */
function sitesView() {
  const C = calc(); const admin = isAdmin();
  return `<div class="page-head"><div><h1>Sites</h1><p>One land site and two offshore cage sites.</p></div><div class="actions">${admin ? `<button class="bp-btn" data-act="add-site">+ Add Site</button>` : ""}</div></div>
  <div class="grid g-12">
  ${S.sites.map(s => {
    const ls = S.lines.filter(l => l.site_id === s.id); const budget = ls.reduce((a, l) => a + n2(l.annual_amount), 0);
    const ex = S.exps.filter(e => e.site_id === s.id); const spent = ex.reduce((a, e) => a + n2(e.amount), 0);
    const area = s.cage_diameter_m ? Math.PI * Math.pow(s.cage_diameter_m / 2, 2) : 0;
    const vol = area && s.cage_depth_m ? area * s.cage_depth_m : 0;
    const byLine = {}; ex.forEach(e => byLine[e.line_id] = (byLine[e.line_id] || 0) + n2(e.amount));
    const top = Object.entries(byLine).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `<section class="bp-card span-4"><div class="row between"><div><h2 class="bp-card__title">${esc(s.name)}</h2><span class="small muted">${s.kind === "land" ? "Land site" : "Offshore cage site"}</span></div>${admin ? `<button class="icon-btn" data-act="edit-site" data-id="${s.id}">Edit</button>` : ""}</div>
      ${s.notes ? `<p class="small muted">${esc(s.notes)}</p>` : ""}
      <div class="stats stats--4" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:12px 0">
        ${s.kind === "offshore" ? stat("Cages", num(s.cages), "") + stat("Cage Diameter", s.cage_diameter_m ? num(s.cage_diameter_m) + " m" : "—", area ? num(area) + " m² surface each" : "") + stat("Total Surface", area ? num(area * s.cages) + " m²" : "—", "") + stat("Total Volume", vol ? num(vol * s.cages) + " m³" : "—", vol ? "" : "Add net depth to see") : ""}
        ${stat("Site Budget", money(budget, 0), ls.length + " line(s)")}
        ${stat("Spent " + year().year, money(spent, 0), ex.length + " record(s)")}
        ${s.kind === "offshore" && s.cages ? stat("Spent Per Cage", money(spent / s.cages, 0), "") : ""}
      </div>
      <div class="eyebrow" style="margin-bottom:6px">Top spending</div>
      ${top.length ? `<table class="bp-table bp-table--compact"><tbody>${top.map(([lid, v]) => `<tr><td class="small">${esc((line(Number(lid)) || {}).name)}</td><td class="bp-num small">${money(v, 0)}</td></tr>`).join("")}</tbody></table>` : `<div class="small muted">No expenses booked to this site yet.</div>`}
    </section>`; }).join("")}
  </div>`;
}
function siteForm(s) {
  s = s || { code: "", name: "", kind: "offshore", cages: 0, cage_diameter_m: "", cage_depth_m: "", notes: "" };
  return `<h2>${s.id ? "Edit Site" : "Add Site"}</h2><p class="bp-card__sub">Net depth is optional. It is used to show cage volume.</p>
  <form id="site-form" class="form-grid" data-id="${s.id || ""}">
    <div class="field wide"><label>Name</label><input name="name" value="${esc(s.name)}" required></div>
    <div class="field"><label>Code</label><input name="code" value="${esc(s.code)}" required></div>
    <div class="field"><label>Type</label><select name="kind"><option value="land" ${s.kind === "land" ? "selected" : ""}>Land</option><option value="offshore" ${s.kind === "offshore" ? "selected" : ""}>Offshore</option></select></div>
    <div class="field"><label>Cages</label><input type="number" name="cages" min="0" value="${esc(s.cages || 0)}"></div>
    <div class="field"><label>Diameter (m)</label><input type="number" step="0.1" name="cage_diameter_m" value="${esc(s.cage_diameter_m || "")}"></div>
    <div class="field"><label>Net depth (m)</label><input type="number" step="0.1" name="cage_depth_m" value="${esc(s.cage_depth_m || "")}"></div>
    <div class="field full"><label>Notes</label><input name="notes" value="${esc(s.notes || "")}"></div>
  </form>
  <div class="foot"><button class="bp-btn" data-act="close">Cancel</button><button class="bp-btn bp-btn--primary" data-act="save-site">Save</button></div>`;
}

/* ---------- Settings ---------- */
function settingsView() {
  const y = year();
  const steps = [
    ["Start the year", "In December, click Start New Year. Copy last year's lines, or use last year's actual spend as the new amounts."],
    ["Set the budget lines", "In Budget Setup, change each annual amount, pick the site and the type (running or one-off)."],
    ["Set the monthly patterns", "Patterns say when the money is spent: feed follows fish growth, nets in Feb–Mar, a truck in one month."],
    ["Approve the budget", "When management agrees the numbers, click Approve Budget. The original figures are saved for comparison."],
    ["Record every expense", "Each bill or LPO goes in Expenses: date, line, site, amount, supplier and invoice number."],
    ["Check every month", "Look at the Dashboard and Monthly Tracker. Red means over plan. Fix the line, or move money and note why."],
    ["Close the year", "After the last bills are in, click Close Year. Nothing can be changed after that, and the year becomes the base for the next one."]
  ];
  return `<div class="page-head"><div><h1>Settings &amp; Help</h1><p>How the system works, the budget team, and year details.</p></div></div>
  <div class="grid g-12">
    <section class="span-7 stack" style="gap:10px"><h2 class="bp-card__title">How To Use</h2>${steps.map((s, i) => `<div class="bp-step"><span class="bp-step__num">${i + 1}</span><div><div class="bp-step__title">${s[0]}</div><div class="bp-step__text">${s[1]}</div></div></div>`).join("")}</section>
    <div class="span-5 stack" style="gap:12px">
      ${y && isAdmin() ? `<section class="bp-card"><h2 class="bp-card__title">Year ${y.year}</h2><p class="bp-card__sub">Title and notes shown on the dashboard.</p>
        <form id="year-form" class="stack" style="gap:10px"><div class="field"><label>Title</label><input name="title" value="${esc(y.title || "")}"></div><div class="field"><label>Notes</label><textarea name="notes">${esc(y.notes || "")}</textarea></div><button type="button" class="bp-btn bp-btn--primary" data-act="save-year" style="align-self:flex-start">Save</button></form></section>` : ""}
      <section class="bp-card"><h2 class="bp-card__title">Budget Team</h2><p class="bp-card__sub">Admin: set up and approve. Editor: add expenses. Viewer: see only. People need a NetLog login first.</p>
        ${isAdmin() ? `<div id="members"><div class="small muted">Loading…</div></div>
        <form id="member-form" class="form-grid" style="grid-template-columns:2fr 1fr auto;margin-top:12px;align-items:end"><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Role</label><select name="role"><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></div><button type="button" class="bp-btn" data-act="add-member">Add</button></form>` : `<div class="small">Your role: <strong>${cap(S.role)}</strong></div>`}
      </section>
      <section class="bp-card"><h2 class="bp-card__title">Rules Used</h2><div class="stack small muted">
        <div><strong style="color:var(--ink)">Plan to date</strong> = sum of each line's monthly plan up to the end of the current month.</div>
        <div><strong style="color:var(--ink)">Over Plan</strong> = spent more than 110% of plan to date (and more than AED 100 over).</div>
        <div><strong style="color:var(--ink)">Over Budget</strong> = spent more than the full-year amount.</div>
        <div><strong style="color:var(--ink)">Not Started</strong> = something was planned by now but nothing is recorded.</div>
      </div></section>
    </div>
  </div>`;
}
async function loadMembers() {
  const box = $("#members"); if (!box) return;
  const { data, error } = await sb.rpc("budget_list_members");
  if (error) { box.innerHTML = `<div class="small t-danger">${esc(errMsg(error))}</div>`; return; }
  box.innerHTML = `<table class="bp-table"><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>${data.map(m => `<tr><td><div class="line-name">${esc(m.full_name || m.email)}</div><div class="line-meta">${esc(m.email)}</div></td><td>${badge(cap(m.role), m.role === "admin" ? "violet" : m.role === "editor" ? "info" : "")}</td><td class="bp-num">${m.user_id === S.user.id ? "" : `<button class="icon-btn del" data-act="rm-member" data-email="${esc(m.email)}">Remove</button>`}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- new year ---------- */
function newYearForm() {
  const last = S.years[S.years.length - 1]; const ny = last ? last.year + 1 : new Date().getFullYear() + 1;
  return `<h2>Start New Year</h2><p class="bp-card__sub">Creates a draft budget for the new year. Patterns and categories are copied too.</p>
  <form id="ny-form" class="form-grid">
    <div class="field"><label>Year</label><input type="number" name="year" value="${ny}" min="2020" max="2100" required></div>
    <div class="field wide"><label>Copy from</label><select name="src"><option value="">Blank budget</option>${S.years.slice().reverse().map(y => `<option value="${y.id}" ${last && y.id === last.id ? "selected" : ""}>${y.year} budget</option>`).join("")}</select></div>
    <div class="field"><label>Amounts</label><select name="use"><option value="0">Same as budget</option><option value="1">Last year's actual spend</option></select></div>
  </form>
  <div class="foot"><button class="bp-btn" data-act="close">Cancel</button><button class="bp-btn bp-btn--primary" data-act="save-ny">Create</button></div>`;
}

/* ---------- CSV ---------- */
function csv(name, rows) {
  const s = rows.map(r => r.map(v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + s], { type: "text/csv" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- dialog ---------- */
function openDlg(html) { $("#dlg-body").innerHTML = html; const d = $("#dlg"); if (!d.open) d.showModal(); if ($("#line-form")) linePreview(); }
function closeDlg() { const d = $("#dlg"); if (d.open) d.close(); }

/* ---------- events ---------- */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act; const id = b.dataset.id ? Number(b.dataset.id) : null;
  try {
    switch (a) {
      case "logout": await sb.auth.signOut(); S.user = null; S.role = null; render(); break;
      case "forgot": { const em = $("#em").value.trim(); if (!em) return toast("Type your email first", true); const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin }); if (error) throw error; toast("Reset link sent to " + em); break; }
      case "close": closeDlg(); break;
      case "add-exp": if (!S.lines.length) return toast("Add budget lines first", true); openDlg(expForm()); break;
      case "edit-exp": openDlg(expForm(S.exps.find(e => e.id === id))); break;
      case "save-exp": await saveExp(!!b.dataset.more); break;
      case "del-exp": { const e = S.exps.find(x => x.id === id); if (!confirm(`Delete this expense?\n${e.spent_on} · ${money(e.amount)}`)) return; const { error } = await sb.from("budget_expenses").delete().eq("id", id); if (error) throw error; toast("Deleted"); await loadYear(); render(); break; }
      case "csv-exp": csv(`expenses_${year().year}.csv`, [["Date", "Category", "Budget line", "Site", "Supplier", "Ref", "Qty", "Unit", "Amount AED", "Note"], ...filteredExps().map(e => { const l = line(e.line_id) || {}; return [e.spent_on, (cat(l.category_id) || {}).name, l.name, siteName(e.site_id), e.supplier, e.ref_no, e.qty, e.unit, n2(e.amount).toFixed(2), e.description]; })]); break;
      case "add-line": if (!S.cats.length) return toast("Add a category first", true); openDlg(lineForm(null, b.dataset.cat ? Number(b.dataset.cat) : null)); break;
      case "edit-line": openDlg(lineForm(line(id))); break;
      case "save-line": await saveLine(); break;
      case "del-line": { const l = line(id); const n = S.exps.filter(e => e.line_id === id).length; if (n) return toast(`Cannot delete: ${n} expense(s) use this line. Move or delete them first.`, true); if (!confirm("Delete line \"" + l.name + "\"?")) return; const { error } = await sb.from("budget_lines").delete().eq("id", id); if (error) throw error; toast("Line deleted"); await loadYear(); render(); break; }
      case "add-cat": { const name = prompt("New category name"); if (!name || !name.trim()) return; const { error } = await sb.from("budget_categories").insert({ year_id: S.yearId, name: name.trim(), sort: S.cats.length + 1 }); if (error) throw error; await loadYear(); render(); break; }
      case "edit-cat": { const c = cat(id); const name = prompt("Category name", c.name); if (!name || !name.trim()) return; const { error } = await sb.from("budget_categories").update({ name: name.trim() }).eq("id", id); if (error) throw error; await loadYear(); render(); break; }
      case "del-cat": { if (!confirm("Delete this empty category?")) return; const { error } = await sb.from("budget_categories").delete().eq("id", id); if (error) throw error; await loadYear(); render(); break; }
      case "status": { const s = b.dataset.s; const msg = { approved: year().status === "closed" ? "Re-open this year? Expenses can be added again." : "Approve this budget? The current amounts are saved as the approved figures.", draft: "Move back to draft? Approved figures stay saved until you approve again.", closed: "Close this year? Expenses can no longer be added or changed." }[s]; if (!confirm(msg)) return; const { error } = year().status === "closed" && s === "approved" ? await sb.from("budget_years").update({ status: "approved" }).eq("id", S.yearId) : await sb.rpc("budget_set_status", { p_year: S.yearId, p_status: s }); if (error) throw error; toast("Status: " + cap(s)); await reload(); break; }
      case "csv-budget": { const C = calc(); csv(`budget_${year().year}.csv`, [["Category", "Budget line", "Site", "Type", "Pattern", "Annual AED", "Approved AED", ...MONTHS, "Basis"], ...S.lines.map(l => [(cat(l.category_id) || {}).name, l.name, siteName(l.site_id), l.line_type, (pat(l.pattern_id) || {}).name, n2(l.annual_amount).toFixed(2), l.approved_amount == null ? "" : n2(l.approved_amount).toFixed(2), ...C.byLine[l.id].plan.map(v => v.toFixed(2)), l.basis])]); break; }
      case "csv-tracker": { const C = calc(); csv(`tracker_${year().year}.csv`, [["Category", "Budget line", "Row", ...MONTHS, "Total"], ...S.lines.flatMap(l => { const r = C.byLine[l.id]; const c = (cat(l.category_id) || {}).name; return [[c, l.name, "Plan", ...r.plan.map(v => v.toFixed(2)), r.annual.toFixed(2)], [c, l.name, "Actual", ...r.act.map(v => v.toFixed(2)), r.actTD.toFixed(2)]]; })]); break; }
      case "tmode": S.ui.trackerMode = b.dataset.m; render(); break;
      case "add-pat": { const name = prompt("Pattern name (e.g. Q2 only)"); if (!name || !name.trim()) return; const { error } = await sb.from("budget_patterns").insert({ year_id: S.yearId, name: name.trim(), shares: Array(12).fill(1 / 12) }); if (error) throw error; await loadYear(); render(); break; }
      case "pat-even": { const f = $(`.pat-form[data-id="${id}"]`); MONTHS.forEach((_, i) => f.elements["m" + i].value = +(100 / 12).toFixed(4)); f.elements.m11.value = +(100 - 11 * +(100 / 12).toFixed(4)).toFixed(4); patTotal(f); break; }
      case "save-pat": await savePat(id); break;
      case "del-pat": { if (!confirm("Delete this pattern?")) return; const { error } = await sb.from("budget_patterns").delete().eq("id", id); if (error) throw error; await loadYear(); render(); break; }
      case "add-site": openDlg(siteForm()); break;
      case "edit-site": openDlg(siteForm(site(id))); break;
      case "save-site": { const f = $("#site-form"); if (!f.reportValidity()) return; const fd = new FormData(f); const rec = { name: fd.get("name").trim(), code: fd.get("code").trim().toUpperCase(), kind: fd.get("kind"), cages: Number(fd.get("cages")) || 0, cage_diameter_m: fd.get("cage_diameter_m") ? Number(fd.get("cage_diameter_m")) : null, cage_depth_m: fd.get("cage_depth_m") ? Number(fd.get("cage_depth_m")) : null, notes: fd.get("notes").trim() || null }; const sid = f.dataset.id; if (!sid) rec.sort = S.sites.length + 1; const { error } = sid ? await sb.from("budget_sites").update(rec).eq("id", sid) : await sb.from("budget_sites").insert(rec); if (error) throw error; closeDlg(); toast("Site saved"); await reload(); break; }
      case "new-year": openDlg(newYearForm()); break;
      case "save-ny": { const f = $("#ny-form"); if (!f.reportValidity()) return; const fd = new FormData(f); const { data, error } = await sb.rpc("budget_copy_year", { p_src: fd.get("src") ? Number(fd.get("src")) : null, p_new_year: Number(fd.get("year")), p_use_actuals: fd.get("use") === "1" }); if (error) throw error; closeDlg(); S.yearId = data; store("fb_year", String(data)); toast("Year " + fd.get("year") + " created"); location.hash = "#/budget"; await reload(); break; }
      case "save-year": { const fd = new FormData($("#year-form")); const { error } = await sb.from("budget_years").update({ title: fd.get("title").trim() || null, notes: fd.get("notes").trim() || null }).eq("id", S.yearId); if (error) throw error; toast("Saved"); await reload(); break; }
      case "add-member": { const f = $("#member-form"); if (!f.reportValidity()) return; const fd = new FormData(f); const { error } = await sb.rpc("budget_set_member", { p_email: fd.get("email"), p_role: fd.get("role") }); if (error) throw error; toast("Member added"); f.reset(); loadMembers(); break; }
      case "rm-member": { if (!confirm("Remove " + b.dataset.email + " from the budget team?")) return; const { error } = await sb.rpc("budget_set_member", { p_email: b.dataset.email, p_role: "remove" }); if (error) throw error; toast("Removed"); loadMembers(); break; }
    }
  } catch (e) { toast(errMsg(e), true); }
});
function patTotal(f) { let t = 0; MONTHS.forEach((_, i) => t += Number(f.elements["m" + i].value) || 0); const el = f.querySelector("[data-total]"); el.textContent = "Total: " + t.toFixed(2) + "%" + (Math.abs(t - 100) < 0.01 ? " ✓" : " — must be 100%"); el.className = "small " + (Math.abs(t - 100) < 0.01 ? "t-success" : "t-danger"); }
document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.closest(".pat-form")) patTotal(t.closest(".pat-form"));
  if (t.closest("#line-form")) linePreview();
  if (t.dataset.filter === "q") { S.ui.expFilter.q = t.value; clearTimeout(t._h); t._h = setTimeout(() => { render(); const i = $('[data-filter="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 350); }
});
document.addEventListener("change", async ev => {
  const t = ev.target;
  if (t.id === "year-pick") { S.yearId = Number(t.value); store("fb_year", t.value); S.ui.expFilter = { month: "", cat: "", line: "", site: "", q: "" }; try { await loadYear(); } catch (e) { toast(errMsg(e), true); } render(); }
  if (t.dataset.filter && t.dataset.filter !== "q") { S.ui.expFilter[t.dataset.filter] = t.value; render(); }
  if (t.closest("#line-form")) linePreview();
  if (t.name === "line_id" && t.closest("#exp-form")) { const l = line(Number(t.value)); const s = t.form.elements.site_id; if (l && l.site_id && !s.value) s.value = l.site_id; }
});
document.addEventListener("submit", async ev => {
  if (ev.target.id !== "login-form") { ev.preventDefault(); return; }
  ev.preventDefault(); const btn = ev.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value });
  if (error) { toast(errMsg(error), true); btn.disabled = false; btn.textContent = "Sign In"; }
});
window.addEventListener("hashchange", () => { if (S.user && S.role) render(); });

/* ---------- boot ---------- */
let booted = false;
async function onSession(session) {
  S.user = session ? session.user : null;
  if (!S.user) { S.role = null; render(); return; }
  try {
    const { data, error } = await sb.rpc("budget_role"); if (error) throw error;
    S.role = data;
    if (S.role) await reload(); else render();
  } catch (e) { $("#root").innerHTML = `<div class="spinner">Could not load: ${esc(errMsg(e))}</div>`; }
}
sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { setTimeout(async () => { const p = prompt("Type a new password (at least 8 characters)"); if (p && p.length >= 8) { const { error } = await sb.auth.updateUser({ password: p }); toast(error ? errMsg(error) : "Password changed", !!error); } }, 300); }
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !booted)) {
    if (event === "SIGNED_IN" && booted && S.user && session && S.user.id === session.user.id) return;
    booted = true; setTimeout(() => onSession(session), 0);
  }
});
})();
