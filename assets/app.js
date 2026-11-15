(function(){
"use strict";
var KEY = "loanTracker.v3";
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var app = document.getElementById("app");
var pad = function(n){ return String(n).padStart(2,"0"); };
var r2 = function(x){ return Math.round((x + Number.EPSILON) * 100) / 100; };
var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); };
var uid = function(){ return Math.random().toString(36).slice(2,10); };
var NOW = new Date();
var TODAY = NOW.getFullYear() + "-" + pad(NOW.getMonth()+1) + "-" + pad(NOW.getDate());

/* ---------- dates ---------- */
function addMonths(iso, k, day){
  var y = +iso.slice(0,4), m = +iso.slice(5,7) - 1 + k;
  var yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  var dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return yy + "-" + pad(mm + 1) + "-" + pad(Math.min(day || +iso.slice(8,10), dim));
}
function days(a, b){ return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
function fmtDate(iso){ return (+iso.slice(8,10)) + " " + MON[+iso.slice(5,7)-1] + " " + iso.slice(0,4); }
function fmtMonth(iso){ return MON[+iso.slice(5,7)-1] + " " + iso.slice(0,4); }

/* ---------- money: base currency (display only, no conversion) ---------- */
var CURRENCIES = {
  INR:{sym:"₹", loc:"en-IN", name:"Indian rupee"}, AED:{sym:"AED ", loc:"en-US", name:"UAE dirham"},
  USD:{sym:"$", loc:"en-US", name:"US dollar"}, EUR:{sym:"€", loc:"en-IE", name:"Euro"}, GBP:{sym:"£", loc:"en-GB", name:"British pound"},
  SAR:{sym:"SAR ", loc:"en-US", name:"Saudi riyal"}, QAR:{sym:"QAR ", loc:"en-US", name:"Qatari riyal"}, OMR:{sym:"OMR ", loc:"en-US", name:"Omani rial"},
  KWD:{sym:"KWD ", loc:"en-US", name:"Kuwaiti dinar"}, BHD:{sym:"BHD ", loc:"en-US", name:"Bahraini dinar"}, SGD:{sym:"S$", loc:"en-SG", name:"Singapore dollar"},
  AUD:{sym:"A$", loc:"en-AU", name:"Australian dollar"}, CAD:{sym:"C$", loc:"en-CA", name:"Canadian dollar"}
};
var CUR = "INR", NF;
function setCurrency(code){
  CUR = CURRENCIES[code] ? code : "INR";
  NF = new Intl.NumberFormat(CURRENCIES[CUR].loc, {minimumFractionDigits:2, maximumFractionDigits:2});
}
setCurrency("INR");
function sym(){ return CURRENCIES[CUR].sym.trim(); }
function num(x){ return NF.format(x); }
function money(x){ return (x < 0 ? "−" : "") + CURRENCIES[CUR].sym + NF.format(Math.abs(x)); }
function moneyHTML(x){ return "<small>" + sym() + "</small>" + NF.format(x); }

/* ---------- EMI maths (calculator only) ---------- */
function emiFor(P, annual, n){
  var r = annual / 1200;
  if (n <= 0) return r2(P);
  if (r === 0) return r2(P / n);
  var f = Math.pow(1 + r, n);
  return r2(P * r * f / (f - 1));
}
function nper(P, annual, emi){
  var r = annual / 1200;
  if (emi <= 0) return Infinity;
  if (r === 0) return Math.ceil(P / emi - 1e-9);
  if (emi <= r2(P * r)) return Infinity;
  return Math.max(1, Math.ceil(-Math.log(1 - P * r / emi) / Math.log(1 + r) - 1e-9));
}
function simulate(bal, annual, emi, m){
  var r = annual / 1200, rows = [], interest = 0;
  for (var k = 1; k <= m && bal > 0.004; k++){
    var open = bal, it = r2(bal * r), prin = r2(emi - it), pay = emi;
    if (k === m || prin >= bal){ prin = bal; pay = r2(prin + it); }
    bal = r2(bal - prin); interest = r2(interest + it);
    rows.push({k:k, open:open, pay:pay, int:it, prin:prin, close:bal});
  }
  return {rows:rows, interest:interest};
}

/* ---------- the tracked loan: daily interest on the outstanding principal ----------
   Interest builds up every day at rate ÷ 365 on the principal still owed (simple interest:
   unpaid interest is not itself charged interest). There are no fixed EMI dates.
   A payment, on any day, clears the interest built up so far, then reduces the principal. */
function ledger(l, upto, extra){
  var dr = l.rate / 36500, P = l.principal, acc = 0, last = l.start, rows = [];
  function accrueTo(d){ if (d <= last) return 0; var it = P * dr * days(last, d); acc += it; last = d; return it; }
  var pays = (l.payments || []).concat(extra ? [extra] : []).filter(function(p){ return p.date <= upto && p.date >= l.start; })
    .sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  pays.forEach(function(p){
    var from = last, opening = P, it = accrueTo(p.date), amt = p.amount;
    var due = r2(acc);
    var toI = Math.min(amt, due); acc = Math.max(0, acc - toI); if (acc < 0.005) acc = 0; amt = r2(amt - toI);
    var toP = Math.min(amt, P); P = r2(P - toP); amt = r2(amt - toP);
    rows.push({id:p.id, date:p.date, from:from, days:days(from, p.date), opening:opening, accrued:r2(it), amount:p.amount,
               toInt:r2(toI), toPrin:r2(toP), excess:amt, bal:P, unpaid:r2(acc), note:p.note || "", trial:p === extra});
  });
  var lastEntry = last;
  accrueTo(upto);
  if (P <= 0.004 && acc < 0.005){ P = 0; acc = 0; }
  return {P:P, acc:r2(acc), rows:rows, lastEntry:lastEntry, sinceDays: Math.max(0, days(lastEntry, upto))};
}
/* Paying once a month from `fromISO`. mode "A": fixed `pay`; "B": interest only, then everything in the last month.
   The last month always clears the loan. */
function simDaily(P, acc, rate, fromISO, pay, m, mode){
  var dr = rate / 36500, rows = [], last = fromISO, newInt = 0, day = +fromISO.slice(8,10);
  for (var k = 1; k <= m && (P > 0.004 || acc > 0.004); k++){
    var dt = addMonths(fromISO, k, day), open = P, it = P * dr * days(last, dt);
    acc += it; newInt += it; last = dt;
    var due = r2(acc), amt = (k === m) ? r2(P + due) : (mode === "B" ? due : pay);
    var toI = Math.min(amt, due); acc = Math.max(0, acc - toI); if (acc < 0.005) acc = 0;
    var toP = Math.min(r2(amt - toI), P); P = r2(P - toP);
    rows.push({k:k, date:dt, open:open, pay:r2(toI + toP), int:r2(it), toI:r2(toI), toP:r2(toP), close:P});
  }
  return {rows:rows, newInt:r2(newInt), closed: P <= 0.004 && acc <= 0.004, P:P};
}
/* same as simDaily but on a given list of payment dates; the last date clears the loan */
function simDates(P, acc, rate, fromISO, dates, pay, mode){
  var dr = rate / 36500, rows = [], last = fromISO, newInt = 0;
  for (var k = 0; k < dates.length && (P > 0.004 || acc > 0.004); k++){
    var dt = dates[k], open = P, it = P * dr * days(last, dt);
    acc += it; newInt += it; last = dt;
    var due = r2(acc), amt = (k === dates.length - 1) ? r2(P + due) : (mode === "B" ? due : pay);
    var toI = Math.min(amt, due); acc = Math.max(0, acc - toI); if (acc < 0.005) acc = 0;
    var toP = Math.min(r2(amt - toI), P); P = r2(P - toP);
    rows.push({k:k + 1, date:dt, open:open, pay:r2(toI + toP), int:r2(it), toI:r2(toI), toP:r2(toP), close:P});
  }
  return {rows:rows, newInt:r2(newInt), closed: P <= 0.004 && acc <= 0.004, P:P};
}
/* the fixed monthly payment that clears the loan in exactly m months */
function payToClose(P, acc, rate, fromISO, m){
  if (m <= 1) return simDaily(P, acc, rate, fromISO, 0, 1, "A").rows[0].pay;
  var lo = 0, hi = P + acc + P * rate / 100;
  for (var i = 0; i < 60; i++){
    var mid = (lo + hi) / 2, s = simDaily(P, acc, rate, fromISO, mid, m, "A");
    var lastPay = s.rows.length ? s.rows[s.rows.length - 1].pay : 0;
    if (s.rows.length < m || lastPay < mid) hi = mid; else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}
/* months needed at a fixed monthly payment (Infinity if it never covers the interest) */
function monthsAt(P, acc, rate, fromISO, pay){
  var firstMonthInt = P * rate / 36500 * 31;
  if (pay <= firstMonthInt + 0.01 && P > 0) return {months:Infinity};
  var dr = rate / 36500, last = fromISO, day = +fromISO.slice(8,10), tot = 0;
  for (var k = 1; k <= 1200; k++){
    var dt = addMonths(fromISO, k, day), it = P * dr * days(last, dt); acc += it; tot += it; last = dt;
    var due = r2(acc);
    if (pay >= r2(P + due)) return {months:k, interest:r2(tot), lastPay:r2(P + due), date:dt};
    var toI = Math.min(pay, due); acc -= toI; P = r2(P - (pay - toI));
  }
  return {months:Infinity};
}
function monthPaid(l, ym){ return r2((l.payments || []).filter(function(p){ return p.date.slice(0,7) === ym; }).reduce(function(s,p){ return s + p.amount; }, 0)); }
function loanInfo(l){
  var L = ledger(l, TODAY);
  var closed = L.P <= 0.004 && L.acc <= 0.004;
  var payoff = r2(L.P + L.acc);
  var paidTotal = r2(L.rows.reduce(function(s,x){ return s + x.amount - x.excess; }, 0));
  var intPaid = r2(L.rows.reduce(function(s,x){ return s + x.toInt; }, 0));
  var daily = r2(L.P * l.rate / 36500);
  var lastPay = L.rows.length ? L.rows[L.rows.length - 1] : null;
  var ym = TODAY.slice(0,7), paidThisMonth = monthPaid(l, ym);
  var goal = l.goal && !closed ? l.goal : null;
  var first = goal ? (goal.first || addMonths(goal.set, 1)) : null;
  var notStarted = goal && TODAY.slice(0,7) < first.slice(0,7);
  var goalLeft = goal && !notStarted ? r2(Math.max(0, goal.amount - paidThisMonth)) : 0;
  var proj = null;
  if (goal && !closed){
    /* the plan's own payment dates (same day each month from its first payment) that are still ahead */
    var dates = [], fd = +first.slice(8,10);
    for (var k = 0; k < 1200; k++){ var dd = addMonths(first, k, fd); if (dd > goal.until) break; if (dd > TODAY) dates.push(dd); }
    if (!dates.length || dates[dates.length - 1] < goal.until) dates.push(goal.until > TODAY ? goal.until : addMonths(TODAY, 1));
    proj = simDates(L.P, L.acc, l.rate, TODAY, dates, goal.option === "B" ? 0 : goal.amount, goal.option === "B" ? "B" : "A");
  }
  return {L:L, closed:closed, payoff:payoff, paidTotal:paidTotal, intPaid:intPaid, prinPaid:r2(l.principal - L.P), daily:daily,
          lastPay:lastPay, paidThisMonth:paidThisMonth, goal:goal, goalLeft:goalLeft, proj:proj, goalFirst:first, notStarted:notStarted,
          pct: closed ? 100 : Math.max(0, Math.min(100, (1 - L.P / l.principal) * 100))};
}
function loanStatus(l, s){
  if (s.closed) return {cls:"", lbl:"Closed", card:"st-done"};
  if (s.goal){
    if (TODAY.slice(0,7) > s.goal.until.slice(0,7)) return {cls:"bad", lbl:"Plan end passed", card:"st-bad"};
    if (s.notStarted) return {cls:"good", lbl:"Plan starts " + fmtDate(s.goalFirst), card:""};
    if (s.goalLeft > 0.5) return {cls:"warn", lbl:money(s.goalLeft) + " left this month", card:"st-warn"};
    return {cls:"good", lbl:"On plan this month", card:""};
  }
  if (s.lastPay && days(s.lastPay.date, TODAY) > 31) return {cls:"warn", lbl:"No payment for " + days(s.lastPay.date, TODAY) + " days", card:"st-warn"};
  return {cls:"acc", lbl:"Active", card:""};
}

/* ---------- storage ---------- */
var storageOk = true;
try { localStorage.setItem(KEY + ".t", "1"); localStorage.removeItem(KEY + ".t"); } catch(e){ storageOk = false; }
function load(){ try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch(e){ storageOk = false; return null; } }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){ storageOk = false; showBanner(); } }
function showBanner(){
  var b = document.getElementById("banner");
  if (storageOk){ b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = '<div class="note">This browser is blocking local storage, so your loans will only last until you close this page. Keep this page open while you work.</div>';
}
function exampleLoan(){
  var l = {id:"ex" + uid(), name:"Car loan", lender:"Example Bank", type:"Car", example:true, principal:500000, rate:9, tenure:60,
           start:"2026-05-05", payments:[], created:TODAY};
  [["2026-06-05",10379.18,"Monthly payment"],["2026-07-08",10379.18,"Monthly payment"],["2026-08-20",15000,"Paid a bit extra"],
   ["2026-09-25",3000,"Interest only"],["2026-10-28",5000,""]].forEach(function(p){ if (p[0] <= TODAY) l.payments.push({id:uid(), date:p[0], amount:p[1], note:p[2]}); });
  return l;
}
var data = load();
if (data && data.currency) setCurrency(data.currency);
if (!data || !Array.isArray(data.loans)) { data = {v:3, loans:[exampleLoan()], gold:[]}; save(); }
if (!Array.isArray(data.gold)) data.gold = [];
data.loans.forEach(function(l){ if (!l.example && l.lender === "Example Bank" && l.name === "Car loan") l.example = true; if (l.example && !l.tenure) l.tenure = 60; });
save();

/* ---------- UI helpers ---------- */
var toastTimer;
function toast(msg){ var t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.hidden = true; }, 2200); }
function copyText(text, label){
  var fallback = function(){ var box = document.getElementById("copybox"), ta = document.getElementById("copybox-text"); ta.hidden = false; document.getElementById("copybox-title").textContent = "Copy this text"; document.getElementById("copybox-hint").textContent = "Your browser blocked automatic copying. Select all of the text below and copy it."; ta.value = text; box.hidden = false; ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(text).then(function(){ toast(label + " copied"); }, fallback); } catch(e){ fallback(); }
}
document.getElementById("copybox-close").addEventListener("click", function(){ document.getElementById("copybox").hidden = true; });
function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ""; }
function nval(id){ var v = val(id); return v === "" ? NaN : Number(v); }
function tenureText(n){ var y = Math.floor(n / 12), m = n % 12; return n < 12 ? plural(n, "month") : plural(y, "year") + (m ? " " + plural(m, "month") : "") ; }
function plural(n, w){ return n + " " + w + (n === 1 ? "" : "s"); }

/* ---------- close-early planner ---------- */
var plannerState = {};
function plannerShell(p, st, intro){
  return '<section class="card" id="' + p + '-planner">' +
    '<div class="card-h"><div><h2>Close-early planner</h2><p class="sub">' + intro + '</p></div></div>' +
    '<div class="fields">' +
      '<label for="' + p + '-pm">Close in (months)<input id="' + p + '-pm" type="number" min="1" step="1" inputmode="numeric" value="' + esc(st.pm) + '"></label>' +
      '<label for="' + p + '-pb">I can pay a month (' + sym() + ') <span class="opt">optional</span><input id="' + p + '-pb" type="number" min="0" step="any" inputmode="decimal" value="' + esc(st.pb) + '" placeholder="e.g. 50000"></label>' +
      '<label for="' + p + '-pf">Early-closure fee % <span class="opt">optional</span><input id="' + p + '-pf" type="number" min="0" step="any" inputmode="decimal" value="' + esc(st.pf) + '" placeholder="e.g. 2"></label>' +
    '</div><div class="out" id="' + p + '-plan-out"></div></section>';
}
function readPlanner(p){
  var st = plannerState[p]; st.pm = val(p + "-pm"); st.pb = val(p + "-pb"); st.pf = val(p + "-pf");
  return {m:nval(p + "-pm"), budget:nval(p + "-pb"), fee:nval(p + "-pf")};
}
/* calculator: a new loan with a normal EMI */
function calcPlannerOut(ctx){
  var out = document.getElementById("c-plan-out"); if (!out) return;
  var q = readPlanner("c"), m = q.m, budget = q.budget, fee = q.fee;
  if (!(m >= 1) || Math.floor(m) !== m){ out.innerHTML = '<p class="err">Enter a whole number of months, 1 or more.</p>'; return; }
  if (m >= ctx.n){ out.innerHTML = '<p class="note">The EMI already closes this loan in ' + plural(ctx.n, "month") + '. Pick fewer months to see an early-closure option.</p>'; return; }
  var emiA = emiFor(ctx.P, ctx.R, m), simA = simulate(ctx.P, ctx.R, emiA, m);
  var feeAmt = fee > 0 ? r2(ctx.P * fee / 100) : 0, saved = r2(ctx.interest - simA.interest - feeAmt);
  var html = '<p class="lead">To close in ' + plural(m, "month") + ' (by <strong>' + fmtMonth(ctx.dateFor(m)) + '</strong>), pay <b>' + money(emiA) + '</b> a month, about ' + (emiA / ctx.emi).toFixed(1) + ' times the normal EMI. That saves <b>' + money(saved) + '</b> in interest' + (feeAmt ? ' after a fee of ' + money(feeAmt) : '') + '.</p>';
  if (budget > 0){
    var mb = nper(ctx.P, ctx.R, budget);
    html += !isFinite(mb) ? '<p class="note bad">' + money(budget) + ' a month does not cover the monthly interest, so the balance would never go down.</p>'
      : '<p class="note ' + (budget >= emiA ? 'good' : 'warn') + '">Paying ' + money(budget) + ' a month closes the loan in ' + plural(mb, "month") + ', by ' + fmtMonth(ctx.dateFor(mb)) + '.</p>';
  }
  html += planTable(simA.rows.map(function(x){ return {date:ctx.dateFor(x.k), open:x.open, pay:x.pay, int:x.int, prin:x.prin, close:x.close}; }));
  out.innerHTML = html;
}
function planTable(rows){
  return '<div><h3 style="font-size:14px;margin-bottom:8px">Month by month</h3><div class="tablebox" style="max-height:300px"><table><thead><tr><th class="l">Pay on</th><th>Principal before</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Principal after</th></tr></thead><tbody>' +
    rows.map(function(x){ return '<tr><td class="l">' + fmtDate(x.date) + '</td><td>' + num(x.open) + '</td><td>' + num(x.pay) + '</td><td>' + num(x.int) + '</td><td>' + num(x.prin) + '</td><td>' + num(x.close) + '</td></tr>'; }).join("") +
    '</tbody></table></div></div>';
}
/* tracked loan: from today's balance, paying once a month on today's date */
function loanPlannerShell(id, st){
  return '<section class="card"><div class="card-h"><h2>Close early</h2></div>' +
    '<div class="fields two">' +
      '<label for="' + id + '-pm">Close in (months)<input id="' + id + '-pm" type="number" min="1" step="1" inputmode="numeric" value="' + esc(st.pm) + '"></label>' +
      '<label for="' + id + '-pb">I can pay / month <span class="opt">optional</span><input id="' + id + '-pb" type="number" min="0" step="any" inputmode="decimal" value="' + esc(st.pb) + '" placeholder="' + sym() + '"></label>' +
    '</div><div class="out" id="' + id + '-plan-out"></div></section>';
}
function loanPlannerOut(l, s){
  var out = document.getElementById(l.id + "-plan-out"); if (!out) return;
  var q = readPlanner(l.id), m = q.m, budget = q.budget, L = s.L;
  if (s.closed){ out.innerHTML = '<p class="note good">This loan is fully repaid.</p>'; return; }
  if (!(m >= 1) || Math.floor(m) !== m || m > 600){ out.innerHTML = '<p class="err">Enter a whole number of months from 1 to 600.</p>'; return; }
  var payA = payToClose(L.P, L.acc, l.rate, TODAY, m);
  var A = simDaily(L.P, L.acc, l.rate, TODAY, payA, m, "A");
  var B = simDaily(L.P, L.acc, l.rate, TODAY, 0, m, "B");
  var intA = r2(L.acc + A.newInt), intB = r2(L.acc + B.newInt);
  var lastA = A.rows[A.rows.length - 1], lastB = B.rows[B.rows.length - 1];
  var html = '<p class="lead">Pay <b>' + money(payA) + '</b> a month to close by <strong>' + fmtDate(lastA.date) + '</strong>.</p>';
  var optA = '<div class="option"><h3>Same every month</h3><dl>' +
    '<div><dt>Monthly</dt><dd>' + num(payA) + '</dd></div>' +
    '<div><dt>Interest</dt><dd>' + num(intA) + '</dd></div></dl>' +
    '<button class="sm primary" data-act="adopt" data-opt="A" data-m="' + m + '" data-amt="' + payA + '" data-until="' + lastA.date + '" data-first="' + A.rows[0].date + '">Use this plan</button></div>';
  var optB = m > 1 ? '<div class="option"><h3>Interest only, then balance</h3><dl>' +
    '<div><dt>Monthly</dt><dd>≈ ' + num(B.rows[0].pay) + '</dd></div>' +
    '<div><dt>Final</dt><dd>' + num(lastB.pay) + '</dd></div>' +
    '<div><dt>Interest</dt><dd>' + num(intB) + '</dd></div></dl>' +
    '<button class="sm" data-act="adopt" data-opt="B" data-m="' + m + '" data-amt="' + B.rows[0].pay + '" data-until="' + lastB.date + '" data-first="' + B.rows[0].date + '">Use this plan</button></div>' : '';
  html += '<div class="options">' + optA + optB + '</div>';
  if (budget > 0){
    var r = monthsAt(L.P, L.acc, l.rate, TODAY, budget);
    html += !isFinite(r.months) ? '<p class="note bad">' + money(budget) + ' a month doesn\'t cover the interest.</p>'
      : '<p class="note ' + (budget >= payA ? 'good' : 'warn') + '">At ' + money(budget) + ' a month you close in ' + plural(r.months, "month") + ', by ' + fmtMonth(r.date) + '.</p>';
  }
  html += '<details class="more"><summary>Month-by-month</summary>' + planTable(A.rows.map(function(x){ return {date:x.date, open:x.open, pay:x.pay, int:x.int, prin:x.toP, close:x.close}; })) + '</details>';
  out.innerHTML = html;
}

/* ---------- routing ---------- */
function setTab(name){ document.querySelectorAll(".tabs a").forEach(function(a){ if (a.dataset.tab === name) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); }); }
var loanCtx = null;
function route(){
  var h = location.hash.slice(1); loanCtx = null;
  if (h === "calculator"){ setTab("calculator"); renderCalc(); }
  else if (h === "gold"){ setTab("gold"); renderGold(); }
  else if (h === "ledger"){ setTab("ledger"); renderLedger(); }
  else if (h.indexOf("loan-") === 0){
    var l = data.loans.find(function(x){ return x.id === h.slice(5); });
    setTab("dashboard"); if (l) renderLoan(l); else renderDash();
  } else { setTab("dashboard"); renderDash(); }
}
window.addEventListener("hashchange", function(){ route(); window.scrollTo(0,0); });

/* ---------- My loans ---------- */
function renderDash(){
  var all = data.loans.map(function(l){ return {l:l, s:loanInfo(l)}; });
  var active = all.filter(function(x){ return !x.s.closed; });
  var sum = function(f){ return r2(active.reduce(function(t,x){ return t + f(x); }, 0)); };
  var dailyAll = sum(function(x){ return x.s.daily; });
  var closedCount = all.length - active.length;
  var tiles = '<div class="tiles five">' +
    '<div class="tile"><span class="k">Active loans</span><div class="v">' + active.length + '</div>' + (closedCount ? '<span class="d">' + closedCount + ' closed</span>' : '') + '</div>' +
    '<div class="tile accent"><span class="k">Outstanding principal</span><div class="v">' + moneyHTML(sum(function(x){ return x.s.L.P; })) + '</div></div>' +
    '<div class="tile"><span class="k">Interest due today</span><div class="v">' + moneyHTML(sum(function(x){ return x.s.L.acc; })) + '</div></div>' +
    '<div class="tile"><span class="k">Payoff today</span><div class="v">' + moneyHTML(sum(function(x){ return x.s.payoff; })) + '</div></div>' +
    '<div class="tile"><span class="k">Interest per day</span><div class="v">' + moneyHTML(dailyAll) + '</div><span class="d">≈ ' + money(Math.round(dailyAll * 30)).replace(".00","") + ' a month</span></div>' +
  '</div>';
  var cards = all.length ? '<div class="loan-grid">' + all.map(function(x){
    var l = x.l, s = x.s, st = loanStatus(l, s);
    return (l.example ? '<div class="ex-wrap">' : '') + '<a class="loan-card ' + st.card + '" href="#loan-' + l.id + '">' +
      '<div class="lc-top"><div><div class="lc-name">' + esc(l.name) + ' ' + (l.example ? '<span class="tag">Example</span>' : '') + '</div>' +
      '</div>' +
      '<span class="pill ' + st.cls + '">' + st.lbl + '</span></div>' +
      '<dl class="facts"><div><dt>Interest rate</dt><dd>' + l.rate + '% p.a.</dd></div>' +
      '<div><dt>Tenure</dt><dd>' + (l.tenure ? tenureText(l.tenure) : '–') + '</dd></div>' +
      '<div><dt>Start date</dt><dd>' + fmtDate(l.start) + '</dd></div>' +
      '<div><dt>End date</dt><dd>' + (l.tenure ? fmtDate(addMonths(l.start, l.tenure)) : '–') + '</dd></div></dl>' +
      '<div><div class="lc-meta">Outstanding</div><div class="lc-big">' + moneyHTML(s.L.P) + '</div></div>' +
      '<div class="kv"><div><span>Interest due</span><span>' + num(s.L.acc) + '</span></div>' +
      '<div><span>Payoff</span><span>' + num(s.payoff) + '</span></div>' +
      '<div><span>Last paid</span><span>' + (s.lastPay ? fmtDate(s.lastPay.date) : '–') + '</span></div></div>' +
      (function(){ var e = endPayoffNoPay(l, s); return e ? '<div class="endline"><span>Payoff at end of tenure<small>if nothing more is paid</small></span><span>' + money(e.amount) + '</span></div>' : ''; })() +
      '<div><div class="bar" role="img" aria-label="' + Math.round(s.pct) + '% of principal repaid"><i style="width:' + s.pct.toFixed(1) + '%"></i></div>' +
      '<div class="barlbl"><span>' + Math.round(s.pct) + '% repaid</span></div></div></a>' +
      (l.example ? '<button class="sm ex-remove" data-act="remove-example">Remove example</button></div>' : '');
  }).join("") + '</div>'
  : '<div class="card empty"><h2>No loans yet</h2><p class="muted">Add a loan from the calculator with its amount, rate and start date.</p><a href="#calculator"><button class="primary">Open the calculator</button></a></div>';
  app.innerHTML = '<div class="stack">' +
    '<div class="pagehead"><div><h1>My loans</h1><p class="sub">All your loans at a glance.</p></div>' +
    '<div class="btns"><a href="#calculator"><button class="primary">Add a loan</button></a></div></div>' +
    (data.loans.some(function(l){ return l.example; }) ? '<div class="example-bar"><p><strong>You\'re looking at example data.</strong> Remove it and add your own loans.</p><button class="primary sm" data-act="remove-example">Remove example data</button></div>' : '') +
    tiles + cards +
    '</div>';
}

/* ---------- Ledger ----------
   One row per date: opening outstanding (principal + unpaid interest) + interest added − repayment = closing outstanding. */
var ledgerView = {loan:"all", monthEnds:true};
function monthEndsBetween(a, b){
  var out = [], y = +a.slice(0,4), m = +a.slice(5,7);
  for (var i = 0; i < 1200; i++){
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate(), d = y + "-" + pad(m) + "-" + pad(last);
    if (d >= b) break;
    if (d > a) out.push(d);
    m++; if (m > 12){ m = 1; y++; }
  }
  return out;
}
function ledgerRowsFor(l, withMonthEnds){
  var dr = l.rate / 36500, P = l.principal, acc = 0, last = l.start;
  var rows = [{date:l.start, kind:"start", entry:"Loan taken", note:"", open:0, interest:0, repay:0, close:r2(l.principal), loan:l}];
  var points = [];
  (l.payments || []).filter(function(p){ return p.date >= l.start && p.date <= TODAY; }).forEach(function(p){ points.push({date:p.date, kind:"pay", amount:p.amount, note:p.note || ""}); });
  if (withMonthEnds) monthEndsBetween(l.start, TODAY).forEach(function(d){ points.push({date:d, kind:"month"}); });
  points.push({date:TODAY, kind:"today"});
  points.sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === "pay" ? -1 : 1); });
  var prevClose = r2(l.principal);
  points.forEach(function(pt){
    if (P <= 0.004 && acc <= 0.004 && pt.kind !== "pay") return;   /* closed: nothing more to show */
    if (pt.date > last){ acc += P * dr * days(last, pt.date); last = pt.date; }
    var applied = 0;
    if (pt.kind === "pay"){
      var amt = pt.amount, due = r2(acc);
      var toI = Math.min(amt, due); acc = Math.max(0, acc - toI); if (acc < 0.005) acc = 0;
      var toP = Math.min(r2(amt - toI), P); P = r2(P - toP);
      applied = r2(toI + toP);
    }
    var close = r2(P + acc);
    var interest = r2(close + applied - prevClose);          /* so every row adds up exactly */
    if (pt.kind !== "pay" && interest === 0 && pt.kind !== "today") { return; }
    rows.push({date:pt.date, kind:pt.kind, entry: pt.kind === "pay" ? "Repayment" : pt.kind === "month" ? "Month end" : "Today",
               note: pt.kind === "pay" ? pt.note + (applied < pt.amount ? (pt.note ? " · " : "") + money(r2(pt.amount - applied)) + " extra not applied" : "") : "",
               open:prevClose, interest:interest, repay:applied, close:close, loan:l});
    prevClose = close;
  });
  return rows;
}
function renderLedger(){
  if (!data.loans.length){
    app.innerHTML = '<div class="stack"><div class="pagehead"><div><h1>Ledger</h1></div></div><div class="card empty"><h2>No loans yet</h2><a href="#calculator"><button class="primary">Add a loan</button></a></div></div>';
    return;
  }
  if (ledgerView.loan !== "all" && !data.loans.some(function(l){ return l.id === ledgerView.loan; })) ledgerView.loan = "all";
  var loans = ledgerView.loan === "all" ? data.loans : data.loans.filter(function(l){ return l.id === ledgerView.loan; });
  var all = ledgerView.loan === "all";
  var rows = [];
  loans.forEach(function(l){ rows = rows.concat(ledgerRowsFor(l, ledgerView.monthEnds)); });
  rows.sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var totInt = r2(rows.reduce(function(s,x){ return s + x.interest; }, 0));
  var totPay = r2(rows.reduce(function(s,x){ return s + x.repay; }, 0));
  var totBorrowed = r2(loans.reduce(function(s,l){ return s + l.principal; }, 0));
  var totNow0 = r2(loans.reduce(function(s,l){ var L = ledger(l, TODAY); return s + L.P + L.acc; }, 0));
  var opts = '<option value="all"' + (all ? ' selected' : '') + '>All loans</option>' + data.loans.map(function(l){ return '<option value="' + l.id + '"' + (l.id === ledgerView.loan ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join("");
  var totNow = totNow0;
  if (all){
    /* combine: one row per repayment / new loan, one merged row per month-end and for today;
       Opening and Outstanding are the totals across every loan on that date */
    var ORDER = {start:0, pay:1, month:2, today:3}, merged = [], byKey = {};
    rows.forEach(function(x){
      if (x.kind === "month" || x.kind === "today"){
        var k = x.kind + x.date;
        if (!byKey[k]){ byKey[k] = {date:x.date, kind:x.kind, entry:x.entry, note:"", interest:0, repay:0, borrow:0, names:[]}; merged.push(byKey[k]); }
        byKey[k].interest = r2(byKey[k].interest + x.interest); byKey[k].names.push(x.loan.name);
      } else merged.push({date:x.date, kind:x.kind, entry:x.entry, note:x.note, interest:x.interest, repay:x.repay, borrow: x.kind === "start" ? x.close : 0, names:[x.loan.name]});
    });
    merged.sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER[a.kind] - ORDER[b.kind]; });
    var running = 0;
    merged.forEach(function(x){ x.open = running; x.close = r2(running + x.borrow + x.interest - x.repay); running = x.close; x.loanLabel = x.names.length > 1 ? "All loans" : x.names[0]; });
    rows = merged;
    totNow = running;
  }
  var body = rows.slice().reverse().map(function(x){
    var cls = x.kind === "pay" ? "lg-pay" : x.kind === "today" ? "lg-today" : x.kind === "start" ? "lg-start" : "lg-month";
    return '<tr class="' + cls + '"><td class="l">' + fmtDate(x.date) + '</td>' +
      (all ? '<td class="l desc">' + esc(x.loanLabel) + '</td>' : '') +
      '<td class="l desc">' + x.entry + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</td>' +
      '<td>' + (x.kind === "start" && !all ? '' : num(x.open)) + '</td>' +
      (all ? '<td class="plus">' + (x.borrow ? '+ ' + num(x.borrow) : '') + '</td>' : '') +
      '<td class="plus">' + (x.interest ? '+ ' + num(x.interest) : '') + '</td>' +
      '<td class="minus">' + (x.repay ? '− ' + num(x.repay) : '') + '</td>' +
      '<td class="eq">' + num(x.close) + '</td></tr>';
  }).join("");
  app.innerHTML = '<div class="stack">' +
    '<div class="pagehead"><div><h1>Ledger</h1><p class="sub">' + (all ? 'Opening total + new loans + interest − repayments = total outstanding, across all your loans.' : 'Opening + interest − repayment = outstanding.') + '</p></div>' +
      '<div class="btns"><button data-act="copy-ledger">Copy CSV</button></div></div>' +
    '<div class="ledger-bar">' +
      '<label for="lg-loan">Loan<select id="lg-loan">' + opts + '</select></label>' +
      '<label class="check" for="lg-month"><input id="lg-month" type="checkbox"' + (ledgerView.monthEnds ? ' checked' : '') + '> Show month-end interest</label>' +
    '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><span class="k">Borrowed</span><div class="v">' + moneyHTML(totBorrowed) + '</div></div>' +
      '<div class="tile"><span class="k">Interest added</span><div class="v">' + moneyHTML(totInt) + '</div></div>' +
      '<div class="tile"><span class="k">Repaid</span><div class="v">' + moneyHTML(totPay) + '</div></div>' +
      '<div class="tile accent"><span class="k">' + (all ? 'Total outstanding today' : 'Outstanding today') + '</span><div class="v">' + moneyHTML(totNow) + '</div></div>' +
    '</div>' +
    '<section class="card" style="padding:0;overflow:hidden"><div class="tablebox ledger" style="border:0;border-radius:0;max-height:none"><table><thead><tr>' +
      '<th class="l">Date</th>' + (all ? '<th class="l">Loan</th>' : '') + '<th class="l">Entry</th><th>' + (all ? 'Total opening' : 'Opening') + '</th>' + (all ? '<th>New loan</th>' : '') + '<th>Interest added</th><th>Repayment</th><th>' + (all ? 'Total outstanding' : 'Outstanding') + '</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table></div></section>' +
  '</div>';
  ledgerCSV = function(){
    var q = function(t){ return '"' + String(t).replace(/"/g,'""') + '"'; };
    var ls = [["Date"].concat(all ? ["Loan"] : []).concat(["Entry","Note", all ? "Total opening" : "Opening outstanding"]).concat(all ? ["New loan"] : []).concat(["Interest added","Repayment", all ? "Total outstanding" : "Closing outstanding"]).join(",")];
    rows.forEach(function(x){ ls.push([x.date].concat(all ? [q(x.loanLabel)] : []).concat([x.entry, q(x.note), (x.kind === "start" && !all) ? "" : x.open.toFixed(2)]).concat(all ? [x.borrow.toFixed(2)] : []).concat([x.interest.toFixed(2), x.repay.toFixed(2), x.close.toFixed(2)]).join(",")); });
    return ls.join("\n");
  };
}
var ledgerCSV = null;

/* ---------- Calculator ---------- */
var calc = {amt:"500000", rate:"9", ten:"60", unit:"m", start:TODAY};
plannerState.c = {pm:"5", pb:"", pf:""};
function readCalc(){
  calc.amt = val("c-amt"); calc.rate = val("c-rate"); calc.ten = val("c-ten"); calc.unit = val("c-unit"); calc.start = val("c-start") || TODAY;
  var P = Number(calc.amt), R = Number(calc.rate), T = Number(calc.ten), n = calc.unit === "y" ? Math.round(T * 12) : Math.round(T), errs = [];
  if (!(P > 0)) errs.push("Enter a loan amount above 0.");
  if (calc.rate === "" || !(R >= 0) || R > 100) errs.push("Enter an annual interest rate between 0 and 100.");
  if (!(n >= 1) || n > 600) errs.push("Enter a tenure between 1 and 600 months (50 years).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calc.start)) errs.push("Pick the loan start date.");
  else if (calc.start > TODAY) errs.push("The start date can't be in the future. Use today's date for a loan you're about to take.");
  return {P:P, R:R, n:n, start:calc.start, errs:errs};
}
function renderCalc(){
  app.innerHTML = '<div class="stack">' +
    '<div class="pagehead"><div><h1>Loan calculator</h1><p class="sub">Enter the loan amount, interest rate and tenure to see what a regular monthly EMI would be. Then save the loan to track what you actually pay.</p></div></div>' +
    '<section class="card"><div class="fields four">' +
      '<label for="c-amt">Loan amount (' + sym() + ')<input id="c-amt" type="number" min="0" step="any" inputmode="decimal" value="' + esc(calc.amt) + '"></label>' +
      '<label for="c-rate">Interest rate (% a year)<input id="c-rate" type="number" min="0" step="any" inputmode="decimal" value="' + esc(calc.rate) + '"></label>' +
      '<label for="c-ten">Tenure<span class="inrow"><input id="c-ten" type="number" min="1" step="any" inputmode="numeric" value="' + esc(calc.ten) + '"><select id="c-unit" aria-label="Tenure unit"><option value="m"' + (calc.unit === "m" ? " selected" : "") + '>months</option><option value="y"' + (calc.unit === "y" ? " selected" : "") + '>years</option></select></span></label>' +
      '<label for="c-start">Loan start date<input id="c-start" type="date" max="' + TODAY + '" value="' + esc(calc.start) + '"></label>' +
    '</div><div id="c-out" class="out"></div></section>' +
    '<div class="loan-layout"><div class="stack">' +
      '<section class="card"><div class="card-h"><div><h2>EMI schedule</h2><p class="sub">If you paid the same EMI once a month from the start date. Interest each month is on the balance still owed.</p></div><button class="sm" data-act="copy-calc-csv">Copy as CSV</button></div><div id="c-sched"></div></section>' +
    '</div><div class="stack">' + plannerShell("c", plannerState.c, "Pick how many months you want to finish in to see the monthly payment you would need.") +
      '<section class="card"><div class="card-h"><div><h2>Track this loan</h2><p class="sub">Saves the amount, rate and start date. You then record each payment whenever you make it, and the balance updates from those payments.</p></div></div>' +
      '<div class="fields two">' +
        '<label for="t-name">Loan name<input id="t-name" type="text" placeholder="e.g. Home loan" maxlength="60"></label>' +
        '<label for="t-lender">Bank or lender <span class="opt">optional</span><input id="t-lender" type="text" maxlength="60"></label>' +
        '<label for="t-type">Loan type<select id="t-type"><option>Personal</option><option>Car</option><option>Home</option><option>Education</option><option>Gold</option><option>Business</option><option>Family or friend</option><option>Other</option></select></label>' +
      '</div>' +
      '<label class="check" style="margin-top:12px" for="t-goal"><input id="t-goal" type="checkbox" checked> Set a monthly plan of the EMI above (you can change it later)</label>' +
      '<div class="btns" style="margin-top:14px"><button class="primary" data-act="track">Track this loan</button><span class="err" id="t-err"></span></div></section>' +
    '</div></div></div>';
  updateCalc();
}
var calcCtx = null, calcRows = [];
function updateCalc(){
  var c = readCalc(), out = document.getElementById("c-out"), sched = document.getElementById("c-sched");
  if (c.errs.length){ out.innerHTML = c.errs.map(function(e){ return '<p class="err">' + e + '</p>'; }).join(""); sched.innerHTML = ""; document.getElementById("c-plan-out").innerHTML = ""; calcCtx = null; return; }
  var emi = emiFor(c.P, c.R, c.n), sim = simulate(c.P, c.R, emi, c.n);
  calcRows = sim.rows;
  var dateFor = function(k){ return addMonths(c.start, k); };
  var total = r2(c.P + sim.interest), pctP = c.P / total * 100;
  out.innerHTML = '<div class="tiles">' +
    '<div class="tile accent"><span class="k">Monthly EMI</span><div class="v">' + moneyHTML(emi) + '</div><span class="d">for ' + plural(c.n, "month") + '</span></div>' +
    '<div class="tile"><span class="k">Total interest</span><div class="v">' + moneyHTML(sim.interest) + '</div><span class="d">' + (sim.interest / c.P * 100).toFixed(1) + '% of the amount borrowed</span></div>' +
    '<div class="tile"><span class="k">Total you pay</span><div class="v">' + moneyHTML(total) + '</div><span class="d">principal plus interest</span></div>' +
    '<div class="tile"><span class="k">Interest on day one</span><div class="v">' + moneyHTML(r2(c.P * c.R / 36500)) + '</div><span class="d">a day on the full amount</span></div></div>' +
    '<div><div class="split" role="img" aria-label="Principal ' + pctP.toFixed(0) + '%, interest ' + (100 - pctP).toFixed(0) + '%"><span class="p" style="width:' + pctP.toFixed(2) + '%"></span><span class="i" style="width:' + (100 - pctP).toFixed(2) + '%"></span></div>' +
    '<div class="legend"><span><b style="background:var(--accent)"></b>Principal ' + pctP.toFixed(1) + '%</span><span><b style="background:var(--warn)"></b>Interest ' + (100 - pctP).toFixed(1) + '%</span></div></div>';
  sched.innerHTML = '<div class="tablebox"><table><thead><tr><th class="l">#</th><th class="l">Month</th><th>Opening balance</th><th>EMI</th><th>Interest</th><th>Principal</th><th>Closing balance</th></tr></thead><tbody>' +
    sim.rows.map(function(x){ return '<tr><td>' + x.k + '</td><td class="l">' + fmtMonth(dateFor(x.k)) + '</td><td>' + num(x.open) + '</td><td>' + num(x.pay) + '</td><td>' + num(x.int) + '</td><td>' + num(x.prin) + '</td><td>' + num(x.close) + '</td></tr>'; }).join("") +
    '</tbody></table></div>';
  calcCtx = {P:c.P, R:c.R, n:c.n, emi:emi, interest:sim.interest, dateFor:dateFor};
  calcPlannerOut(calcCtx);
}

/* ---------- One loan ---------- */
function endPayoffNoPay(l, s){
  if (s.closed || !l.tenure) return null;
  var end = addMonths(l.start, l.tenure), L = s.L;
  return {end:end, amount: end <= TODAY ? s.payoff : r2(L.P + L.acc + L.P * l.rate / 36500 * days(TODAY, end))};
}
function monthsUntil(a, b){ var m = (+b.slice(0,4) - +a.slice(0,4)) * 12 + (+b.slice(5,7) - +a.slice(5,7)); if (addMonths(a, m) > b) m--; return m; }
function endCard(l, s){
  var head = '<section class="card"><div class="card-h"><h2>End of tenure</h2>';
  if (s.closed) return '';
  if (!l.tenure) return head + '</div><p class="muted" style="font-size:13.5px">Add the tenure in Edit details to see this.</p></section>';
  var L = s.L, end = addMonths(l.start, l.tenure);
  head += '<span class="pill">' + fmtDate(end) + '</span></div>';
  if (end <= TODAY) return head + '<p class="note warn">The tenure ended on ' + fmtDate(end) + '. To close the loan today you need ' + money(s.payoff) + '.</p></section>';
  var m = Math.max(1, monthsUntil(TODAY, end));
  var pay = payToClose(L.P, L.acc, l.rate, TODAY, m);
  var sim = simDaily(L.P, L.acc, l.rate, TODAY, pay, m, "A");
  var intAhead = r2(L.acc + sim.newInt);
  var noPay = r2(L.P + L.acc + L.P * l.rate / 36500 * days(TODAY, end));
  return head +
    '<dl class="endlist">' +
      '<div><dt>Pay monthly to finish on time</dt><dd>' + money(pay) + '</dd></div>' +
      '<div><dt>Interest from today</dt><dd>' + money(intAhead) + '</dd></div>' +
      '<div><dt>Total interest over the loan</dt><dd>' + money(r2(s.intPaid + intAhead)) + '</dd></div>' +
      '<div><dt>Total you\'ll have paid</dt><dd>' + money(r2(s.paidTotal + L.P + intAhead)) + '</dd></div>' +
      '<div class="alt"><dt>Owed on ' + fmtDate(end) + ' if you pay nothing more</dt><dd>' + money(noPay) + '</dd></div>' +
    '</dl><p class="muted" style="font-size:12.5px;margin-top:10px">At ' + l.rate + '% p.a., ' + plural(m, "monthly payment") + ' from ' + fmtDate(addMonths(TODAY, 1)) + '.</p></section>';
}
var loanUI = {};
function editCard(l){
  var types = ["Personal","Car","Home","Education","Gold","Business","Family or friend","Other"];
  if (types.indexOf(l.type) < 0 && l.type) types.push(l.type);
  return '<section class="card" id="edit-card"><div class="card-h"><h2>Edit details</h2></div>' +
    '<div class="fields">' +
      '<label for="e-name">Loan name<input id="e-name" type="text" maxlength="60" value="' + esc(l.name) + '"></label>' +
      '<label for="e-lender">Lender <span class="opt">optional</span><input id="e-lender" type="text" maxlength="60" value="' + esc(l.lender) + '"></label>' +
      '<label for="e-type">Type<select id="e-type">' + types.map(function(t){ return '<option' + (t === l.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join("") + '</select></label>' +
      '<label for="e-amt">Amount (' + sym() + ')<input id="e-amt" type="number" min="0" step="any" inputmode="decimal" value="' + l.principal + '"></label>' +
      '<label for="e-rate">Interest rate (% p.a.)<input id="e-rate" type="number" min="0" step="any" inputmode="decimal" value="' + l.rate + '"></label>' +
      '<label for="e-ten">Tenure (months)<input id="e-ten" type="number" min="1" step="1" inputmode="numeric" value="' + (l.tenure || "") + '"></label>' +
      '<label for="e-start">Start date<input id="e-start" type="date" max="' + TODAY + '" value="' + l.start + '"></label>' +
    '</div>' +
    '<p class="err" id="e-err" style="margin-top:10px"></p>' +
    '<div class="btns" style="margin-top:12px;justify-content:space-between"><div class="btns"><button class="primary" data-act="edit-save">Save changes</button><button data-act="edit-cancel">Cancel</button></div>' +
    '<div id="del-zone"><button class="danger" data-act="del-loan">Delete loan</button></div></div></section>';
}
function renderLoan(l){
  var s = loanInfo(l), st = loanStatus(l, s), L = s.L;
  if (!plannerState[l.id]) plannerState[l.id] = {pm:"5", pb:"", pf:""};
  var ui = loanUI[l.id] || (loanUI[l.id] = {amt:"", date:TODAY, note:"", editing:false});
  var facts = [l.rate + '% p.a.', l.tenure ? tenureText(l.tenure) : null, fmtDate(l.start) + (l.tenure ? ' → ' + fmtDate(addMonths(l.start, l.tenure)) : '')].filter(Boolean).join('  ·  ');

  var payRows = L.rows.slice().reverse().map(function(x){
    return '<tr><td class="l">' + fmtDate(x.date) + (x.note ? '<small class="sub-note">' + esc(x.note) + '</small>' : '') + '</td><td>' + num(x.amount) + '</td><td>' + num(x.toInt) + '</td><td>' + num(x.toPrin) + '</td><td>' + num(x.bal) + '</td>' +
      '<td class="l"><button class="icon" data-act="del-pay" data-id="' + x.id + '" aria-label="Delete payment of ' + money(x.amount) + ' on ' + fmtDate(x.date) + '">×</button></td></tr>';
  }).join("");

  var planCard = '';
  if (s.goal){
    var pc = Math.min(100, s.paidThisMonth / s.goal.amount * 100);
    planCard = '<section class="card"><div class="card-h"><h2>My plan</h2><button class="sm" data-act="clear-plan">Remove</button></div>' +
      '<p>' + (s.goal.option === "B" ? 'Interest each month, balance by ' : money(s.goal.amount) + ' a month until ') + fmtDate(s.goal.until) + '</p>' +
      (s.notStarted ? '<p class="muted" style="margin-top:6px;font-size:13.5px">Starts ' + fmtDate(s.goalFirst) + '</p>'
        : '<div class="bar" style="margin-top:12px"><i style="width:' + pc.toFixed(1) + '%"></i></div><div class="barlbl"><span>Paid this month ' + money(s.paidThisMonth) + '</span><span>' + (s.goalLeft > 0.5 ? money(s.goalLeft) + ' left' : 'Done') + '</span></div>') +
      '</section>';
  }

  app.innerHTML = '<div class="stack">' +
    '<div><a class="back" href="#dashboard">← My loans</a><div class="loan-head"><div>' +
      '<h1>' + esc(l.name) + ' ' + (l.example ? '<span class="tag">Example</span>' : '') + ' <span class="pill ' + st.cls + '" style="vertical-align:middle">' + st.lbl + '</span></h1>' +
      '<div class="meta num">' + facts + '</div></div>' +
      (ui.editing ? '' : '<div class="btns">' + (l.example ? '<button class="danger" data-act="remove-example">Remove example</button>' : '') + '<button data-act="edit">Edit details</button></div>') + '</div></div>' +
    (ui.editing ? editCard(l) : '') +
    '<div class="tiles">' +
      '<div class="tile accent"><span class="k">Outstanding</span><div class="v">' + moneyHTML(L.P) + '</div><span class="d">' + Math.round(s.pct) + '% repaid</span></div>' +
      '<div class="tile"><span class="k">Interest due</span><div class="v">' + moneyHTML(L.acc) + '</div></div>' +
      '<div class="tile"><span class="k">Payoff today</span><div class="v">' + moneyHTML(s.payoff) + '</div></div>' +
      '<div class="tile"><span class="k">Interest per day</span><div class="v">' + moneyHTML(s.daily) + '</div></div>' +
    '</div>' +
    '<div class="loan-layout"><div class="stack">' +
      '<section class="card"><div class="card-h"><h2>Record a payment</h2></div>' +
        (s.closed ? '<p class="note good">This loan is fully repaid.</p>' :
        '<div class="quick" style="margin-bottom:14px">' +
          (s.goal && s.goalLeft > 0.5 ? '<button data-act="fill" data-v="' + s.goalLeft + '">Plan <b>' + money(s.goalLeft) + '</b></button>' : '') +
          '<button data-act="fill" data-v="' + L.acc + '">Interest only <b>' + money(L.acc) + '</b></button>' +
          '<button data-act="fill" data-v="' + s.payoff + '">Close loan <b>' + money(s.payoff) + '</b></button></div>' +
        '<div class="fields"><label for="pay-amt">Amount (' + sym() + ')<input id="pay-amt" type="number" min="0" step="any" inputmode="decimal" value="' + esc(ui.amt) + '"></label>' +
          '<label for="pay-date">Date<input id="pay-date" type="date" max="' + TODAY + '" min="' + l.start + '" value="' + esc(ui.date) + '"></label>' +
          '<label for="pay-note">Note <span class="opt">optional</span><input id="pay-note" type="text" maxlength="60" value="' + esc(ui.note) + '"></label></div>' +
        '<div id="pay-out" class="out"></div><div class="btns" style="margin-top:14px"><button class="primary" data-act="record" id="pay-btn" disabled>Record payment</button></div>') +
      '</section>' + planCard +
      '<section class="card chart"><div class="card-h"><h2>Balance</h2></div>' + balanceChart(l, s) + '</section>' +
      '<section class="card"><div class="card-h"><h2>Payments</h2>' + (L.rows.length ? '<button class="sm" data-act="copy-csv">Copy CSV</button>' : '') + '</div>' +
        (L.rows.length ? '<div class="tablebox"><table><thead><tr><th class="l">Date</th><th>Paid</th><th>Interest</th><th>Principal</th><th>Balance</th><th class="l"></th></tr></thead><tbody>' + payRows + '</tbody></table></div>'
          : '<p class="muted">No payments yet.</p>') +
      '</section>' +
    '</div><div class="stack">' + endCard(l, s) + loanPlannerShell(l.id, plannerState[l.id]) + '</div></div></div>';
  loanCtx = {loan:l, s:s};
  loanPlannerOut(l, s);
  updatePay();
}
function updatePay(){
  if (!loanCtx) return;
  var l = loanCtx.loan, out = document.getElementById("pay-out"), btn = document.getElementById("pay-btn");
  if (!out) return;
  var ui = loanUI[l.id]; ui.amt = val("pay-amt"); ui.date = val("pay-date") || TODAY; ui.note = val("pay-note");
  var amt = nval("pay-amt"), date = ui.date;
  if (!(amt > 0)){ out.innerHTML = ''; btn.disabled = true; return; }
  if (date > TODAY){ out.innerHTML = '<p class="err">The date can\'t be in the future.</p>'; btn.disabled = true; return; }
  if (date < l.start){ out.innerHTML = '<p class="err">The date is before the loan started (' + fmtDate(l.start) + ').</p>'; btn.disabled = true; return; }
  var T = ledger(l, TODAY, {id:"trial", date:date, amount:r2(amt), note:ui.note});
  var row = T.rows.filter(function(x){ return x.trial; })[0];
  var html = '<div class="split2"><div><span>To interest</span><span>' + money(row.toInt) + '</span></div><div><span>To principal</span><span>' + money(row.toPrin) + '</span></div><div><span>Balance after</span><span>' + money(row.bal) + '</span></div></div>';
  if (T.P <= 0.004 && T.acc <= 0.004) html += '<p class="note good">This closes the loan.</p>';
  else if (row.excess > 0) html += '<p class="note warn">Only ' + money(r2(amt - row.excess)) + ' is needed. The extra won\'t be applied.</p>';
  else if (row.toPrin === 0 && row.unpaid > 0.5) html += '<p class="note warn">' + money(row.unpaid) + ' of interest stays unpaid.</p>';
  out.innerHTML = html; btn.disabled = false;
}
function balanceChart(l, s){
  var W = 640, H = 200, Lp = 12, Rp = 12, T = 24, B = 30;
  var actual = [{d:l.start, b:l.principal}];
  s.L.rows.forEach(function(x){ var prev = actual[actual.length-1].b; actual.push({d:x.date, b:prev}); actual.push({d:x.date, b:x.bal}); });
  actual.push({d:TODAY, b:s.L.P});
  var proj = s.proj ? [{d:TODAY, b:s.L.P}].concat(s.proj.rows.map(function(x){ return {d:x.date, b:x.close}; })) : [];
  var endD = proj.length ? proj[proj.length-1].d : TODAY;
  var t0 = Date.parse(l.start), t1 = Math.max(Date.parse(endD), t0 + 30 * 864e5);
  var X = function(d){ return Lp + (W - Lp - Rp) * (Date.parse(d) - t0) / (t1 - t0); };
  var Y = function(b){ return T + (H - T - B) * (1 - b / l.principal); };
  var path = function(pts){ return pts.map(function(p, i){ return (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.b).toFixed(1); }).join(""); };
  var aPath = path(actual), tx = X(TODAY);
  var area = aPath + "L" + tx.toFixed(1) + " " + Y(0) + "L" + X(l.start).toFixed(1) + " " + Y(0) + "Z";
  var lblX = tx > W - 170 ? tx - 10 : tx + 10, anchor = tx > W - 170 ? "end" : "start";
  var ty = Y(s.L.P), lblY = ty - T < 26 ? ty + 20 : ty - 10;   /* near the top line: put the label under the point */
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Outstanding principal is ' + money(s.L.P) + ' today">' +
    '<line x1="' + Lp + '" x2="' + (W - Rp) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--line)"/>' +
    '<line x1="' + Lp + '" x2="' + (W - Rp) + '" y1="' + Y(l.principal) + '" y2="' + Y(l.principal) + '" stroke="var(--line)" stroke-dasharray="2 4"/>' +
    '<path d="' + area + '" fill="var(--accent)" fill-opacity="0.16"/>' +
    '<path d="' + aPath + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
    (proj.length > 1 ? '<path d="' + path(proj) + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.8"/>' : '') +
    '<circle cx="' + tx.toFixed(1) + '" cy="' + Y(s.L.P).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>' +
    '<text x="' + lblX.toFixed(1) + '" y="' + lblY.toFixed(1) + '" text-anchor="' + anchor + '" class="today">Today ' + money(s.L.P) + '</text>' +
    '<text x="' + Lp + '" y="' + (T - 9) + '">' + money(l.principal) + '</text>' +
    '<text x="' + Lp + '" y="' + (H - 10) + '">' + fmtDate(l.start) + '</text>' +
    '<text x="' + (W - Rp) + '" y="' + (H - 10) + '" text-anchor="end">' + fmtDate(endD) + '</text></svg>' +
    (proj.length > 1 ? '<div class="legend"><span><i></i>Actual</span><span><i class="dash"></i>Your plan</span></div>' : '');
}

/* ---------- Gold ----------
   Each item: {id, item, grams, karat, holder, since, note, history:[{holder, from, to}]}.
   "holder" is who has / is using the gold now. Insights add up grams per person. */
var KARATS = ["24K","22K","21K","18K","14K","Other"];
var GF = new Intl.NumberFormat("en-US", {minimumFractionDigits:0, maximumFractionDigits:3});
function grams(x){ return GF.format(x) + " g"; }
function pure(g){ var k = parseInt(g.karat, 10); return k > 0 ? g.grams * k / 24 : g.grams; }   /* 24K-equivalent */
function blankGold(){ return {editing:null, item:"", grams:"", karat:"22K", holder:"", since:TODAY, note:"", delAsk:null, filter:"all"}; }
var goldUI = blankGold();
function personKey(n){ return String(n || "").trim().toLowerCase(); }
function goldByPerson(){
  var map = {}, list = [];
  data.gold.forEach(function(g){
    var k = personKey(g.holder);
    if (!map[k]){ map[k] = {name:g.holder.trim(), key:k, grams:0, pure:0, items:0, karats:{}}; list.push(map[k]); }
    var p = map[k]; p.grams += g.grams; p.pure += pure(g); p.items++; p.karats[g.karat] = (p.karats[g.karat] || 0) + g.grams;
  });
  return list.sort(function(a,b){ return b.grams - a.grams; });
}
function renderGold(){
  var G = data.gold, ui = goldUI;
  var people = goldByPerson();
  var total = G.reduce(function(s,g){ return s + g.grams; }, 0), totalPure = G.reduce(function(s,g){ return s + pure(g); }, 0);
  if (ui.filter !== "all" && !people.some(function(p){ return p.key === ui.filter; })) ui.filter = "all";
  var shown = G.filter(function(g){ return ui.filter === "all" || personKey(g.holder) === ui.filter; })
    .slice().sort(function(a,b){ return personKey(a.holder) < personKey(b.holder) ? -1 : personKey(a.holder) > personKey(b.holder) ? 1 : b.grams - a.grams; });
  var top = people[0];

  var tiles = '<div class="tiles">' +
    '<div class="tile accent"><span class="k">Total gold</span><div class="v">' + grams(total) + '</div><span class="d">' + plural(G.length, "item") + '</span></div>' +
    '<div class="tile"><span class="k">24K equivalent</span><div class="v">' + grams(Math.round(totalPure * 1000) / 1000) + '</div><span class="d">pure gold content</span></div>' +
    '<div class="tile"><span class="k">People holding gold</span><div class="v">' + people.length + '</div></div>' +
    '<div class="tile"><span class="k">Most with</span><div class="v" style="font-size:20px">' + (top ? esc(top.name) : '–') + '</div>' + (top ? '<span class="d">' + grams(top.grams) + ' · ' + Math.round(top.grams / total * 100) + '% of all gold</span>' : '') + '</div>' +
  '</div>';

  var names = people.map(function(p){ return '<option value="' + esc(p.name) + '">'; }).join("");
  var form = '<section class="card" id="gold-form"><div class="card-h"><div><h2>' + (ui.editing ? 'Edit gold item' : 'Add gold') + '</h2><p class="sub">Who has or is using each piece now. Changing the person keeps a record of who had it before.</p></div></div>' +
    '<div class="fields">' +
      '<label for="g-item">Item<input id="g-item" type="text" maxlength="60" placeholder="e.g. Chain, Bangle, Coin" value="' + esc(ui.item) + '"></label>' +
      '<label for="g-grams">Weight (grams)<input id="g-grams" type="number" min="0" step="any" inputmode="decimal" value="' + esc(ui.grams) + '"></label>' +
      '<label for="g-karat">Purity<select id="g-karat">' + KARATS.map(function(k){ return '<option' + (k === ui.karat ? ' selected' : '') + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label for="g-holder">With (person)<input id="g-holder" type="text" maxlength="40" list="g-people" placeholder="e.g. Me, Mother" value="' + esc(ui.holder) + '"><datalist id="g-people">' + names + '</datalist></label>' +
      '<label for="g-since">Since<input id="g-since" type="date" max="' + TODAY + '" value="' + esc(ui.since) + '"></label>' +
      '<label for="g-note">Note <span class="opt">optional</span><input id="g-note" type="text" maxlength="80" value="' + esc(ui.note) + '"></label>' +
    '</div>' +
    '<p class="err" id="g-err" style="margin-top:10px"></p>' +
    '<div class="btns" style="margin-top:12px"><button class="primary" data-act="gold-save">' + (ui.editing ? 'Save changes' : 'Add gold') + '</button>' + (ui.editing ? '<button data-act="gold-cancel">Cancel</button>' : '') + '</div></section>';

  var filterOpts = '<option value="all">Everyone</option>' + people.map(function(p){ return '<option value="' + esc(p.key) + '"' + (p.key === ui.filter ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join("");
  var rows = shown.map(function(g){
    var hist = (g.history || []).length ? '<small>Before: ' + g.history.slice().reverse().map(function(h){ return esc(h.holder) + (h.from ? ' (' + fmtDate(h.from) + ' – ' + fmtDate(h.to) + ')' : ''); }).join(", ") + '</small>' : '';
    var act = ui.delAsk === g.id
      ? '<span class="btns" style="justify-content:flex-end"><button class="sm danger solid" data-act="gold-del-yes" data-id="' + g.id + '">Delete</button><button class="sm" data-act="gold-del-no">Keep</button></span>'
      : '<span class="btns" style="justify-content:flex-end;flex-wrap:nowrap"><button class="sm" data-act="gold-edit" data-id="' + g.id + '">Edit</button><button class="icon" data-act="gold-del" data-id="' + g.id + '" aria-label="Delete ' + esc(g.item) + '">×</button></span>';
    return '<tr><td class="l desc"><strong>' + esc(g.item) + '</strong>' + (g.note ? '<small>' + esc(g.note) + '</small>' : '') + '</td>' +
      '<td class="l">' + esc(g.karat) + '</td><td>' + grams(g.grams) + '</td>' +
      '<td class="l desc">' + esc(g.holder) + hist + '</td><td class="l">' + (g.since ? fmtDate(g.since) : '–') + '</td><td>' + act + '</td></tr>';
  }).join("");
  var shownGrams = shown.reduce(function(s,g){ return s + g.grams; }, 0);
  var list = '<section class="card"><div class="card-h"><h2>Gold schedule</h2>' + (G.length ? '<button class="sm" data-act="gold-csv">Copy CSV</button>' : '') + '</div>' +
    (G.length ?
      '<div class="ledger-bar" style="margin-bottom:14px"><label for="g-filter">Show<select id="g-filter">' + filterOpts + '</select></label></div>' +
      '<div class="tablebox"><table><thead><tr><th class="l">Item</th><th class="l">Purity</th><th>Grams</th><th class="l">With</th><th class="l">Since</th><th></th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td class="l desc"><strong>Total' + (ui.filter === "all" ? '' : ' (' + esc(shown[0] ? shown[0].holder : '') + ')') + '</strong></td><td></td><td><strong>' + grams(shownGrams) + '</strong></td><td colspan="3"></td></tr></tfoot></table></div>'
      : '<p class="muted">No gold added yet. Add your first item above.</p>') +
    '</section>';

  var insights = '';
  if (people.length){
    insights = '<section class="card"><div class="card-h"><div><h2>Insights · gold with each person</h2><p class="sub">How many grams are with each person right now.</p></div></div>' +
      '<div class="gold-people">' + people.map(function(p){
        var pct = total > 0 ? p.grams / total * 100 : 0;
        var mix = KARATS.filter(function(k){ return p.karats[k]; }).map(function(k){ return k + ' ' + grams(p.karats[k]); }).join(' · ');
        return '<div class="gp"><div class="gp-top"><div><div class="gp-name">' + esc(p.name) + '</div><div class="lc-meta">' + plural(p.items, "item") + ' · ' + mix + '</div></div>' +
          '<div class="gp-g">' + grams(p.grams) + '<small>' + grams(Math.round(p.pure * 1000) / 1000) + ' as 24K</small></div></div>' +
          '<div class="bar gold" role="img" aria-label="' + Math.round(pct) + '% of all gold"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<div class="barlbl"><span>' + pct.toFixed(1) + '% of all gold</span></div></div>';
      }).join("") + '</div></section>';
  }

  app.innerHTML = '<div class="stack">' +
    '<div class="pagehead"><div><h1>Gold</h1><p class="sub">Every piece of gold, how many grams it weighs, and who has it now.</p></div></div>' +
    tiles + form + list + insights + '</div>';
}
function goldCSV(){
  var q = function(t){ return '"' + String(t == null ? "" : t).replace(/"/g,'""') + '"'; };
  var ls = [["Item","Purity","Grams","With","Since","Note","Earlier holders"].join(",")];
  data.gold.forEach(function(g){ ls.push([q(g.item), g.karat, g.grams, q(g.holder), g.since || "", q(g.note), q((g.history || []).map(function(h){ return h.holder; }).join("; "))].join(",")); });
  ls.push(""); ls.push(["Person","Items","Grams","24K equivalent"].join(","));
  goldByPerson().forEach(function(p){ ls.push([q(p.name), p.items, Math.round(p.grams * 1000) / 1000, Math.round(p.pure * 1000) / 1000].join(",")); });
  return ls.join("\n");
}
function readGoldForm(){
  var ui = goldUI;
  ui.item = val("g-item"); ui.grams = val("g-grams"); ui.karat = val("g-karat"); ui.holder = val("g-holder"); ui.since = val("g-since"); ui.note = val("g-note");
}
function goldClick(act, b){
  var ui = goldUI;
  if (act === "gold-save"){
    readGoldForm();
    var g = Number(ui.grams), err = document.getElementById("g-err");
    var msg = !ui.item ? "Give the item a name." : !(g > 0) ? "Enter the weight in grams, above 0." : !ui.holder ? "Enter who has this gold now."
      : (ui.since && ui.since > TODAY) ? "The date can't be in the future." : "";
    if (msg){ err.textContent = msg; return; }
    /* reuse the existing spelling of a person ("me" -> "Me") so names stay consistent */
    var same = data.gold.find(function(x){ return x.id !== ui.editing && personKey(x.holder) === personKey(ui.holder); });
    if (same) ui.holder = same.holder.trim();
    var rec = {item:ui.item, grams:Math.round(g * 1000) / 1000, karat:ui.karat, holder:ui.holder, since:ui.since || TODAY, note:ui.note};
    if (ui.editing){
      var cur = data.gold.find(function(x){ return x.id === ui.editing; });
      if (cur){
        if (personKey(cur.holder) !== personKey(rec.holder)) (cur.history = cur.history || []).push({holder:cur.holder, from:cur.since || "", to:rec.since});
        Object.assign(cur, rec);
      }
      toast("Gold item updated");
    } else {
      rec.id = uid(); rec.history = []; data.gold.push(rec);
      toast(grams(rec.grams) + " added with " + rec.holder);
    }
    var keepFilter = ui.filter; goldUI = blankGold(); goldUI.filter = keepFilter;
    save(); renderGold();
  }
  else if (act === "gold-cancel"){ var f = ui.filter; goldUI = blankGold(); goldUI.filter = f; renderGold(); }
  else if (act === "gold-edit"){
    var x = data.gold.find(function(y){ return y.id === b.dataset.id; }); if (!x) return;
    Object.assign(goldUI, {editing:x.id, item:x.item, grams:String(x.grams), karat:x.karat, holder:x.holder, since:x.since || TODAY, note:x.note || "", delAsk:null});
    renderGold(); document.getElementById("gold-form").scrollIntoView({behavior:"smooth", block:"start"}); document.getElementById("g-item").focus({preventScroll:true});
  }
  else if (act === "gold-del"){ readGoldForm(); ui.delAsk = b.dataset.id; var y0 = window.scrollY; renderGold(); window.scrollTo(0, y0); }
  else if (act === "gold-del-no"){ readGoldForm(); ui.delAsk = null; var y1 = window.scrollY; renderGold(); window.scrollTo(0, y1); }
  else if (act === "gold-del-yes"){
    readGoldForm();
    data.gold = data.gold.filter(function(z){ return z.id !== b.dataset.id; });
    if (ui.editing === b.dataset.id){ var f2 = ui.filter; goldUI = blankGold(); goldUI.filter = f2; }
    goldUI.delAsk = null; save(); var y2 = window.scrollY; renderGold(); window.scrollTo(0, y2); toast("Gold item deleted");
  }
  else if (act === "gold-csv"){ copyText(goldCSV(), "Gold schedule"); }
}

/* ---------- events ---------- */
function rerenderLoan(l){ var y = window.scrollY; save(); renderLoan(l); window.scrollTo(0, y); }
app.addEventListener("input", function(e){
  var id = e.target.id || "";
  if (/^c-(amt|rate|ten|unit|start)$/.test(id)) updateCalc();
  else if (/^c-p[mbf]$/.test(id)){ if (calcCtx) calcPlannerOut(calcCtx); }
  else if (loanCtx && id.indexOf(loanCtx.loan.id + "-p") === 0) loanPlannerOut(loanCtx.loan, loanCtx.s);
  else if (/^pay-/.test(id)) updatePay();
});
app.addEventListener("change", function(e){
  var id = e.target.id || "";
  if (id === "c-unit" || id === "c-start") updateCalc();
  if (id === "pay-date") updatePay();
  if (id === "lg-loan"){ ledgerView.loan = e.target.value; renderLedger(); }
  if (id === "lg-month"){ ledgerView.monthEnds = e.target.checked; renderLedger(); }
  if (id === "g-filter"){ readGoldForm(); goldUI.filter = e.target.value; renderGold(); }
});
app.addEventListener("click", function(e){
  var b = e.target.closest("[data-act]"); if (!b) return;
  var act = b.dataset.act, l = loanCtx && loanCtx.loan, s = loanCtx && loanCtx.s;
  if (act.indexOf("gold-") === 0){ goldClick(act, b); return; }
  if (act === "fill"){ document.getElementById("pay-amt").value = b.dataset.v; updatePay(); }
  else if (act === "record"){
    var amt = nval("pay-amt"), date = val("pay-date") || TODAY;
    if (!(amt > 0) || date > TODAY || date < l.start) return;
    l.payments.push({id:uid(), date:date, amount:r2(amt), note:val("pay-note")});
    loanUI[l.id] = {amt:"", date:TODAY, note:""};
    rerenderLoan(l); toast("Payment of " + money(r2(amt)) + " recorded");
  }
  else if (act === "del-pay"){ l.payments = l.payments.filter(function(x){ return x.id !== b.dataset.id; }); rerenderLoan(l); toast("Payment deleted"); }
  else if (act === "adopt"){
    l.goal = {option:b.dataset.opt, amount:+b.dataset.amt, months:+b.dataset.m, until:b.dataset.until, first:b.dataset.first, set:TODAY};
    rerenderLoan(l); toast("Plan saved");
  }
  else if (act === "edit"){ loanUI[l.id].editing = true; renderLoan(l); window.scrollTo(0,0); var en = document.getElementById("e-name"); if (en) en.focus(); }
  else if (act === "edit-cancel"){ loanUI[l.id].editing = false; renderLoan(l); }
  else if (act === "edit-save"){
    var eErr = document.getElementById("e-err");
    var nm = val("e-name"), P = nval("e-amt"), R = nval("e-rate"), N = nval("e-ten"), st = val("e-start");
    var firstPay = (l.payments || []).map(function(p){ return p.date; }).sort()[0];
    var msg = !nm ? "Give the loan a name." : !(P > 0) ? "Enter an amount above 0." : !(R >= 0 && R <= 100) ? "Enter an interest rate between 0 and 100."
      : !(N >= 1 && N <= 600 && Math.floor(N) === N) ? "Enter a tenure from 1 to 600 months." : !/^\d{4}-\d{2}-\d{2}$/.test(st) ? "Pick a start date."
      : st > TODAY ? "The start date can't be in the future." : (firstPay && st > firstPay) ? "The start date is after your first payment (" + fmtDate(firstPay) + "). Pick an earlier date or delete that payment." : "";
    if (msg){ eErr.textContent = msg; return; }
    l.name = nm; l.lender = val("e-lender"); l.type = val("e-type"); l.principal = r2(P); l.rate = R; l.tenure = N; l.start = st;
    loanUI[l.id].editing = false; rerenderLoan(l); toast("Loan details saved");
  }
  else if (act === "clear-plan"){ delete l.goal; rerenderLoan(l); }
  else if (act === "del-loan"){ document.getElementById("del-zone").innerHTML = '<div class="note bad"><p style="margin-bottom:8px">Delete ' + esc(l.name) + ' and all its payments? This cannot be undone.</p><div class="btns"><button class="danger solid" data-act="del-yes">Delete</button><button data-act="del-no">Cancel</button></div></div>'; }
  else if (act === "del-no"){ document.getElementById("del-zone").innerHTML = '<button class="danger" data-act="del-loan">Delete loan</button>'; }
  else if (act === "del-yes"){ data.loans = data.loans.filter(function(x){ return x.id !== l.id; }); save(); location.hash = "dashboard"; toast("Loan deleted"); }
  else if (act === "copy-csv"){
    var lines = [["Date","Entry","Days","Interest built up","Paid","To interest","To principal","Principal after","Interest unpaid","Note"].join(",")];
    lines.push([l.start, "Loan starts", "", "", "", "", "", l.principal.toFixed(2), "0.00", ""].join(","));
    s.L.rows.forEach(function(x){ lines.push([x.date, "Payment", x.days, x.accrued.toFixed(2), x.amount.toFixed(2), x.toInt.toFixed(2), x.toPrin.toFixed(2), x.bal.toFixed(2), x.unpaid.toFixed(2), '"' + String(x.note).replace(/"/g, '""') + '"'].join(",")); });
    if (!s.closed) lines.push([TODAY, "Interest so far (not paid)", s.L.sinceDays, "", "", "", "", s.L.P.toFixed(2), s.L.acc.toFixed(2), ""].join(","));
    copyText(lines.join("\n"), "Statement");
  }
  else if (act === "remove-example"){
    data.loans = data.loans.filter(function(x){ return !x.example; });
    save(); if (location.hash && location.hash !== "#dashboard") location.hash = "dashboard"; else renderDash(); toast("Example data removed");
  }
  else if (act === "copy-ledger"){ if (ledgerCSV) copyText(ledgerCSV(), "Ledger"); }
  else if (act === "copy-calc-csv"){
    if (!calcCtx) return;
    var ls = [["No","Month","Opening balance","EMI","Interest","Principal","Closing balance"].join(",")];
    calcRows.forEach(function(x){ ls.push([x.k, fmtMonth(calcCtx.dateFor(x.k)), x.open.toFixed(2), x.pay.toFixed(2), x.int.toFixed(2), x.prin.toFixed(2), x.close.toFixed(2)].join(",")); });
    copyText(ls.join("\n"), "Schedule");
  }
  else if (act === "track"){
    var c2 = readCalc(), err = document.getElementById("t-err");
    if (c2.errs.length){ err.textContent = "Fix the loan details above first."; return; }
    var type = val("t-type");
    var loan = {id:uid(), name: val("t-name") || (type + " loan"), lender: val("t-lender"), type:type, principal:c2.P, rate:c2.R, tenure:c2.n, start:c2.start, payments:[], created:TODAY};
    if (document.getElementById("t-goal").checked) loan.goal = {option:"A", amount:emiFor(c2.P, c2.R, c2.n), months:c2.n, until:addMonths(c2.start, c2.n), first:addMonths(c2.start, 1), set:TODAY};
    data.loans.push(loan); save(); location.hash = "loan-" + loan.id; toast("Loan saved to My loans");
  }
  else if (act === "copy-backup"){ copyText(JSON.stringify(data), "Backup"); }
  else if (act === "show-restore"){ var rr = document.getElementById("restore"); rr.hidden = !rr.hidden; }
  else if (act === "do-restore"){
    var errEl = document.getElementById("restore-err");
    try {
      var d2 = JSON.parse(val("restore-text"));
      if (!d2 || !Array.isArray(d2.loans)) throw new Error("bad");
      d2.loans.forEach(function(x){ if (!x.id || !(x.principal > 0) || !x.start || !Array.isArray(x.payments)) throw new Error("bad"); });
      if (!Array.isArray(d2.gold)) d2.gold = [];
      data = d2; save(); renderDash(); toast("Backup restored");
    } catch(ex){ errEl.textContent = "That text isn't a backup from this app. Copy it again with Copy backup and paste the whole thing."; }
  }
  else if (act === "reset-example"){ document.getElementById("reset-confirm").hidden = false; }
  else if (act === "reset-no"){ document.getElementById("reset-confirm").hidden = true; }
  else if (act === "reset-yes"){ data = {v:3, loans:[exampleLoan()], gold:data.gold || []}; save(); renderDash(); toast("Example data restored"); }
});

var curSel = document.getElementById("cur-select");
curSel.innerHTML = Object.keys(CURRENCIES).map(function(c){ return '<option value="' + c + '"' + (c === CUR ? ' selected' : '') + ' title="' + CURRENCIES[c].name + '">' + c + (CURRENCIES[c].sym.trim() !== c ? ' ' + CURRENCIES[c].sym.trim() : '') + '</option>'; }).join("");
curSel.addEventListener("change", function(){
  setCurrency(curSel.value); data.currency = CUR; save();
  var y = window.scrollY; route(); window.scrollTo(0, y); toast("Showing amounts in " + CUR);
});
/* ---------- install as an app (PWA) ---------- */
var installBtn = document.getElementById("install-btn"), deferredPrompt = null;
var isStandalone = function(){ return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; };
window.addEventListener("beforeinstallprompt", function(e){
  e.preventDefault(); deferredPrompt = e;
  if (!isStandalone()) installBtn.hidden = false;
});
installBtn.addEventListener("click", function(){
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function(){ deferredPrompt = null; installBtn.hidden = true; });
});
window.addEventListener("appinstalled", function(){ installBtn.hidden = true; deferredPrompt = null; toast("App installed"); });
/* iPhone/iPad Safari has no install prompt: show a one-time hint instead */
(function(){
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var seen = false; try { seen = localStorage.getItem("loanTracker.iosHint") === "1"; } catch(e){}
  if (ios && !isStandalone() && !seen){
    installBtn.hidden = false; installBtn.textContent = "Install app";
    installBtn.addEventListener("click", function(){
      if (deferredPrompt) return;
      var box = document.getElementById("copybox");
      document.getElementById("copybox-title").textContent = "Add to Home Screen";
      document.getElementById("copybox-hint").textContent = "In Safari, tap the Share button, then choose \u201cAdd to Home Screen\u201d.";
      document.getElementById("copybox-text").hidden = true;
      box.hidden = false;
      try { localStorage.setItem("loanTracker.iosHint", "1"); } catch(e){}
    });
  }
})();
if ("serviceWorker" in navigator && location.protocol !== "file:"){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("/sw.js").catch(function(){}); });
}

showBanner();
route();
})();
