// The chargeback view: from the total down to a single line. Every panel can be cut by any dimension, two months
// can be compared, and every bar, name and row narrows the whole view. Mounted by the shell into its own shadow root.
PORTAL.view("chargeback", function (root, ctx) {
  var D = ctx.data("cb-data");
  var app = root.getElementById("app");
  if (!D.rows) { app.textContent = "No data yet. Load a chargeback export with: python3 -m engine ingest chargeback <file>  then run: python3 -m engine build"; return; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var C = {}; D.cols.forEach(function (n, i) { C[n] = i; });
  var DIMS = [
    { key: "fn", label: "Function", many: "functions" },
    { key: "coe", label: "CoE", many: "CoEs" },
    { key: "project", label: "Project", many: "projects" },
    { key: "cc", label: "Cost centre", many: "cost centres" },
    { key: "type", label: "Type", many: "types" },
    { key: "place", label: "Location", many: "locations" },
    { key: "vendor", label: "Vendor", many: "vendors" },
    { key: "manager", label: "Manager", many: "managers" },
    { key: "person", label: "Resource", many: "resources" }
  ];
  var DIM = {}; DIMS.forEach(function (d) { DIM[d.key] = d; });
  var M = D.months, LASTM = M.length - 1;

  // ---- what the viewer has chosen
  var F = {};                                   // dimension -> { index: true, ... } (several values allowed)
  var from = 0, to = LASTM;                     // month range
  var cmpA = Math.max(0, LASTM - 1), cmpB = LASTM, cmpBy = "project";
  var split = "type", heatBy = "coe", rankA = "project", rankB = "cc", rateBy = "place";
  var ex = { by: "person", q: "", sort: "total", dir: -1, page: 0 };
  var ln = { q: "", sort: "amount", dir: -1, page: 0 };
  var openDim = null, openQ = "";

  // ---- small helpers
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in attrs || {}) {
      if (k === "cls") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function icon(paths) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "icon"); s.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) { var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.appendChild(p); });
    return s;
  }
  var ARROW = ["M5 12h14", "M13 6l6 6-6 6"], BACK = ["M19 12H5", "M11 6l-6 6 6 6"], DOWN = ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"];
  var CUR = D.source.currency === "EUR" ? "€" : (D.source.currency || "") + " ";
  function money(v) {
    var a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + CUR + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1e4) return s + CUR + Math.round(a / 1e3) + "k";
    if (a >= 1e3) return s + CUR + (a / 1e3).toFixed(1) + "k";
    return s + CUR + Math.round(a);
  }
  function grouped(v) { return String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function full(v) { return (v < 0 ? "-" : "") + CUR + grouped(v); }
  function signed(v) { return (v >= 0 ? "+" : "-") + money(Math.abs(v)); }
  function pct(v) { return (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)) + "%"; }
  function mon(m) { return MONTHS[+m.slice(5) - 1]; }
  function monYear(m) { return mon(m) + " " + m.slice(0, 4); }
  function name(dim, ix) { return D.dims[dim][ix]; }
  function label(dim, ix) { return dim === "person" && D.personIds[ix] ? D.dims.person[ix] + " (" + D.personIds[ix] + ")" : D.dims[dim][ix]; }

  // ---- one floating tooltip for every mark
  var tip = h("div", { cls: "tip", hidden: "" }); root.appendChild(tip);
  function tipOn(el, title, lines) {
    if (!el.hasAttribute("tabindex") && el.tagName !== "BUTTON") el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", title + ": " + lines.join(", "));
    function show() {
      tip.textContent = ""; tip.appendChild(h("b", { text: title }));
      lines.forEach(function (l) { tip.appendChild(h("div", { text: l })); });
      tip.hidden = false;
      var r = el.getBoundingClientRect(), w = tip.offsetWidth;
      tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
      tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + "px";
    }
    function hide() { tip.hidden = true; }
    el.addEventListener("pointerenter", show); el.addEventListener("pointerleave", hide);
    el.addEventListener("focus", show); el.addEventListener("blur", hide);
  }

  // ---- data
  var MI = {}; M.forEach(function (m, i) { MI[m] = i; });
  function rowsNow(anyMonth) {
    var keys = Object.keys(F), cols = keys.map(function (k) { return C[k]; });
    return D.rows.filter(function (r) {
      if (!anyMonth) { var mi = MI[r[C.month]]; if (mi < from || mi > to) return false; }
      for (var i = 0; i < keys.length; i++) if (!F[keys[i]][r[cols[i]]]) return false;
      return true;
    });
  }
  function sumBy(rows, col, field) {
    var out = {}, f = C[field || "amount"];
    rows.forEach(function (r) { out[r[col]] = (out[r[col]] || 0) + r[f]; });
    return out;
  }
  function ranked(obj) { return Object.keys(obj).map(function (k) { return [k, obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
  // A colour belongs to a member, not to its rank today: the four largest over the whole file keep their colour under any filter.
  var SERIES = ["var(--acc)", "var(--s2)", "var(--s3)", "var(--s4)"], REST = "var(--c5)";
  var COLOUR = {}, GLOBAL = {};
  DIMS.forEach(function (d) {
    GLOBAL[d.key] = ranked(sumBy(D.rows, C[d.key]));
    COLOUR[d.key] = {};
    GLOBAL[d.key].slice(0, 4).forEach(function (x, i) { COLOUR[d.key][x[0]] = SERIES[i]; });
  });

  function toggle(dim, ix) {
    var set = F[dim] || {};
    if (set[ix]) delete set[ix]; else set[ix] = true;
    if (Object.keys(set).length) F[dim] = set; else delete F[dim];
    ex.page = ln.page = 0;
  }
  function only(dim, ix) {                      // a click on a bar or a row: show just this one (or release it)
    var set = F[dim], keys = set ? Object.keys(set) : [];
    if (keys.length === 1 && set[ix]) delete F[dim]; else { F[dim] = {}; F[dim][ix] = true; }
    ex.page = ln.page = 0; render();
  }
  function picked(dim, ix) { return !!(F[dim] && F[dim][ix]); }

  // ---- header, filters
  function header() {
    var markBox = h("span", { cls: "mark-box" }); markBox.innerHTML = D.mark;     // the emblem ships inside this file's own data block
    var nm = h("span", { cls: "name" }, (D.source.org || "Digital Technology Centers").split(" ").map(function (w) { return h("span", { text: w }); }));
    var csv = h("button", { cls: "btn", type: "button" }, [icon(DOWN), "Download lines (CSV)"]);
    csv.addEventListener("click", saveCsv);
    return h("header", { cls: "brand inner" }, [h("a", { cls: "lockup", href: D.links.index, "aria-label": "Portal home" }, [markBox, nm]),
      h("span", { cls: "divider", "aria-hidden": "true" }),
      h("div", { cls: "titles" }, [h("h1", {}, ["Portal · ", h("span", { cls: "acc", text: "Chargeback" })]),
        h("div", { cls: "sub", text: D.source.name + " · " + mon(M[0]) + " to " + monYear(M[LASTM]) + " · prepared " + (D.source.generated || "") })]),
      h("div", { cls: "actions" }, [csv])]);
  }
  function pick(options, value, onPick, attrs) {         // a plain drop-down
    var sel = h("select", attrs || {});
    options.forEach(function (o) { var op = h("option", { value: o[0], text: o[1] }); if (String(o[0]) === String(value)) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", function () { onPick(sel.value); });
    return sel;
  }
  function dimPick(value, onPick, id) { return pick(DIMS.map(function (d) { return [d.key, d.label]; }), value, onPick, { id: id, cls: "mini", "aria-label": "Cut by" }); }
  function monthPick(value, onPick, id, lab) { return pick(M.map(function (m, i) { return [i, monYear(m)]; }), value, function (v) { onPick(+v); }, { id: id, "aria-label": lab }); }

  function filters() {
    var box = h("div", { cls: "filters" });
    box.appendChild(h("label", { cls: "range" }, ["Months", h("span", { cls: "pair" }, [
      monthPick(from, function (v) { from = v; if (to < from) to = from; ex.page = ln.page = 0; render(); }, "f-from", "From month"),
      h("span", { text: "to" }),
      monthPick(to, function (v) { to = v; if (from > to) from = to; ex.page = ln.page = 0; render(); }, "f-to", "To month")])]));
    DIMS.forEach(function (d) {
      var set = F[d.key] ? Object.keys(F[d.key]) : [];
      var text = !set.length ? "All " + d.many : set.length === 1 ? name(d.key, set[0]) : set.length + " " + d.many;
      var btn = h("button", { type: "button", cls: "ddb" + (set.length ? " on" : ""), id: "dd-" + d.key, "aria-haspopup": "listbox", "aria-expanded": openDim === d.key ? "true" : "false" }, [h("span", { text: text })]);
      btn.addEventListener("click", function (e) { e.stopPropagation(); openDim = openDim === d.key ? null : d.key; openQ = ""; render(); });
      var dd = h("div", { cls: "dd" }, [h("span", { cls: "ddl", text: d.label }), btn]);
      if (openDim === d.key) dd.appendChild(popover(d));
      box.appendChild(dd);
    });
    return box;
  }
  // The list under a filter: type to search, tick as many as you like. Figures beside each follow the other filters.
  function popover(d) {
    var saved = F[d.key]; delete F[d.key];
    var totals = sumBy(rowsNow(), C[d.key]); if (saved) F[d.key] = saved;
    var list = GLOBAL[d.key].map(function (x) { return [x[0], totals[x[0]] || 0]; }).sort(function (a, b) { return (picked(d.key, b[0]) - picked(d.key, a[0])) || (b[1] - a[1]); });
    var search = h("input", { type: "search", id: "dd-q", placeholder: "Search " + d.many, "aria-label": "Search " + d.many, value: openQ });
    var opts = h("div", { cls: "opts", role: "listbox", "aria-multiselectable": "true" });
    function draw() {
      opts.textContent = "";
      var q = openQ.toLowerCase(), shown = 0;
      list.forEach(function (x) {
        var text = label(d.key, x[0]);
        if (q && text.toLowerCase().indexOf(q) < 0) return;
        if (++shown > 200) return;
        var on = picked(d.key, x[0]);
        var o = h("button", { type: "button", cls: "opt" + (on ? " on" : ""), role: "option", "aria-selected": on ? "true" : "false" }, [h("span", { cls: "tick", text: on ? "✓" : "" }), h("span", { cls: "ot", text: text }), h("span", { cls: "on2", text: x[1] ? money(x[1]) : "–" })]);
        o.addEventListener("click", function (e) { e.stopPropagation(); toggle(d.key, x[0]); render(); });
        opts.appendChild(o);
      });
      if (!shown) opts.appendChild(h("div", { cls: "muted", style: "padding:8px", text: "No match." }));
      if (shown > 200) opts.appendChild(h("div", { cls: "muted", style: "padding:8px", text: "Showing the first 200. Type to narrow." }));
    }
    search.addEventListener("input", function () { openQ = search.value; draw(); });
    search.addEventListener("click", function (e) { e.stopPropagation(); });
    draw();
    var foot = h("div", { cls: "popf" });
    var clear = h("button", { type: "button", cls: "chipx clear", text: "Clear" }); clear.addEventListener("click", function (e) { e.stopPropagation(); delete F[d.key]; render(); });
    var done = h("button", { type: "button", cls: "chipx", text: "Done" }); done.addEventListener("click", function (e) { e.stopPropagation(); openDim = null; render(); });
    foot.appendChild(clear); foot.appendChild(done);
    var pop = h("div", { cls: "pop" }, [search, opts, foot]);
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    return pop;
  }
  root.addEventListener("click", function () { if (openDim) { openDim = null; render(); } });
  root.addEventListener("keydown", function (e) { if (e.key === "Escape" && openDim) { openDim = null; render(); } });

  function chips() {
    var box = h("div", { cls: "chips" }), any = false;
    if (from > 0 || to < LASTM) {
      any = true;
      var b0 = h("button", { cls: "chipx", type: "button", text: "Months: " + mon(M[from]) + (to > from ? " to " + mon(M[to]) : "") + "  ✕" });
      b0.addEventListener("click", function () { from = 0; to = LASTM; render(); }); box.appendChild(b0);
    }
    Object.keys(F).forEach(function (k) {
      Object.keys(F[k]).forEach(function (ix) {
        any = true;
        var b = h("button", { cls: "chipx", type: "button", text: DIM[k].label + ": " + name(k, ix) + "  ✕", "aria-label": "Remove filter " + DIM[k].label + " " + name(k, ix) });
        b.addEventListener("click", function () { toggle(k, ix); render(); });
        box.appendChild(b);
      });
    });
    if (!any) { box.appendChild(h("span", { text: "Showing everything. Use the filters above, or click any bar, name or row below to narrow the whole view." })); return box; }
    var c = h("button", { cls: "chipx clear", type: "button", text: "Clear all" });
    c.addEventListener("click", function () { F = {}; from = 0; to = LASTM; ex.page = ln.page = 0; render(); });
    box.appendChild(c);
    return box;
  }

  // ---- panels
  function panel(cls, title, cap, body, controls) {
    return h("section", { cls: "panel " + cls }, [h("div", { cls: "panel-head" }, [h("div", {}, [h("h4", { text: title }), h("p", { cls: "cap", text: cap })]),
      controls ? h("div", { cls: "ctl" }, controls) : null]), body]);
  }
  function by(text, control) { return h("label", { cls: "by" }, [text, control]); }
  function tile(k, v, d) { return h("div", { cls: "tile" }, [h("div", { cls: "k", text: k }), h("div", { cls: "v", text: v }), h("div", { cls: "d", text: d || "\u00a0" })]); }

  function tiles(rows, all) {
    var total = rows.reduce(function (a, r) { return a + r[C.amount]; }, 0);
    var staff = rows.filter(function (r) { return r[C.hours] > 0; });
    var hours = staff.reduce(function (a, r) { return a + r[C.hours]; }, 0), staffAmt = staff.reduce(function (a, r) { return a + r[C.amount]; }, 0);
    var rate = {};
    ["Internal", "External"].forEach(function (t) {
      var ix = D.dims.type.indexOf(t), rs = staff.filter(function (r) { return r[C.type] === ix; });
      var hh = rs.reduce(function (a, r) { return a + r[C.hours]; }, 0);
      if (hh) rate[t] = rs.reduce(function (a, r) { return a + r[C.amount]; }, 0) / hh;
    });
    var ext = rows.filter(function (r) { return name("type", r[C.type]) === "External"; }).reduce(function (a, r) { return a + r[C.amount]; }, 0);
    var top = ranked(sumBy(rows, C.project))[0];
    var bm = sumBy(all, C.month), a = bm[M[cmpA]] || 0, b = bm[M[cmpB]] || 0, change = a ? (b / a - 1) * 100 : null;
    var people = {}; staff.forEach(function (r) { if (D.personIds[r[C.person]]) people[r[C.person]] = 1; });
    return h("div", { cls: "tiles" }, [
      tile("Charged back", money(total), mon(M[from]) + (to > from ? " to " + monYear(M[to]) : " " + M[to].slice(0, 4)) + " · " + full(total)),
      tile(monYear(M[cmpB]), money(b), change == null ? "" : (change >= 0 ? "▲ " : "▼ ") + pct(Math.abs(change)) + (change >= 0 ? " up on " : " down on ") + mon(M[cmpA]) + " (" + signed(b - a) + ")"),
      tile("Resources charging", grouped(Object.keys(people).length), grouped(hours) + " hours charged"),
      tile("Cost per hour charged", hours ? CUR + (staffAmt / hours).toFixed(1) : "–", Object.keys(rate).map(function (t) { return t + " " + CUR + rate[t].toFixed(1); }).join(" · ")),
      tile("From external staff", total ? pct(ext / total * 100) : "–", money(ext) + " of " + money(total)),
      tile("Largest project's share", top && total ? pct(top[1] / total * 100) : "–", top ? name("project", top[0]) : "")
    ]);
  }

  function trend(rows) {
    var months = M.slice(from, to + 1), members, seriesOf = function () { return 0; };
    if (split !== "none") {
      var col = C[split], known = COLOUR[split];
      var present = ranked(sumBy(rows, col)).map(function (x) { return x[0]; });
      var keys = present.filter(function (k) { return known[k]; });
      var hasRest = present.some(function (k) { return !known[k]; });
      seriesOf = function (r) { var i = keys.indexOf(String(r[col])); return i < 0 ? keys.length : i; };
      members = keys.map(function (k) { return { label: name(split, k), c: known[k] }; });
      if (hasRest) members.push({ label: "All others", c: REST });
    } else members = [{ label: "Charged back", c: "var(--acc)" }];
    var grid = months.map(function () { return members.map(function () { return 0; }); });
    rows.forEach(function (r) { grid[MI[r[C.month]] - from][seriesOf(r)] += r[C.amount]; });
    var totals = grid.map(function (g) { return g.reduce(function (a, v) { return a + v; }, 0); });
    var max = Math.max.apply(null, totals.concat([1])), peak = totals.indexOf(Math.max.apply(null, totals));
    var cols = h("div", { cls: "cols full", style: "--h:210px" });
    months.forEach(function (m, i) {
      var c = h("button", { cls: "col", type: "button" });
      if (i === 0 || i === months.length - 1 || i === peak) c.appendChild(h("span", { cls: "v", text: money(totals[i]) }));
      for (var s = members.length - 1; s >= 0; s--) {
        var v = grid[i][s]; if (v <= 0) continue;
        c.appendChild(h("div", { cls: "sg", style: "--c:" + members[s].c + ";height:" + (v / max * 84) + "%" }));
      }
      var lines = members.length > 1 ? members.map(function (mm, s) { return mm.label + " " + full(grid[i][s]); }).filter(function (_, s) { return grid[i][s]; }) : [];
      lines.push("Total " + full(totals[i]));
      if (i > 0 && totals[i - 1]) lines.push((totals[i] >= totals[i - 1] ? "▲ " : "▼ ") + pct(Math.abs(totals[i] / totals[i - 1] - 1) * 100) + " on " + mon(months[i - 1]));
      lines.push("Click to show this month only");
      tipOn(c, monYear(m), lines);
      c.addEventListener("click", function () { var mi = from + i; if (from === mi && to === mi) { from = 0; to = LASTM; } else { from = to = mi; } render(); });
      cols.appendChild(c);
    });
    var ax = h("div", { cls: "axis" }); months.forEach(function (m) { ax.appendChild(h("span", { text: mon(m) })); });
    var body = h("div", { style: "display:grid;gap:10px" });
    if (members.length > 1) body.appendChild(h("div", { cls: "legend" }, members.map(function (mm) { return h("span", {}, [h("i", { style: "--c:" + mm.c }), mm.label]); })));
    body.appendChild(h("div", {}, [cols, ax]));
    var sel = pick([["none", "Nothing (total only)"]].concat(DIMS.map(function (d) { return [d.key, d.label]; })), split, function (v) { split = v; render(); }, { id: "c-split", cls: "mini" });
    return panel("w7", "Charged back per month", "The four largest keep their colour; the rest are grouped. Click a month to show only that month.", body, [by("Split by", sel)]);
  }

  function compare(all) {
    var col = C[cmpBy], A = M[cmpA], B = M[cmpB];
    var a = sumBy(all.filter(function (r) { return r[C.month] === A; }), col), b = sumBy(all.filter(function (r) { return r[C.month] === B; }), col);
    var delta = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { delta[k] = (b[k] || 0) - (a[k] || 0); });
    var list = ranked(delta).filter(function (x) { return Math.abs(x[1]) >= 1; });
    var ups = list.filter(function (x) { return x[1] > 0; }).slice(0, 6), downs = list.filter(function (x) { return x[1] < 0; }).slice(-6);
    var shown = ups.concat(downs), max = Math.max.apply(null, shown.map(function (x) { return Math.abs(x[1]); }).concat([1]));
    var box = h("div", { cls: "list" });
    shown.forEach(function (x) {
      var up = x[1] > 0, r = h("button", { cls: "mv", type: "button" }, [h("span", { cls: "lab", text: name(cmpBy, x[0]) }),
        h("span", { cls: "ax" }, [h("i", { cls: up ? "up" : "dn", style: "width:" + (Math.abs(x[1]) / max * 50) + "%" })]), h("span", { cls: "val", text: signed(x[1]) })]);
      tipOn(r, label(cmpBy, x[0]), [mon(A) + " " + full(a[x[0]] || 0), mon(B) + " " + full(b[x[0]] || 0), "Change " + signed(x[1]), "Click to show only this"]);
      r.addEventListener("click", function () { only(cmpBy, +x[0]); });
      box.appendChild(r);
    });
    if (!shown.length) box.appendChild(h("p", { cls: "muted", text: cmpA === cmpB ? "Pick two different months to compare." : "Nothing changed between the two months." }));
    var ta = Object.keys(a).reduce(function (s, k) { return s + a[k]; }, 0), tb = Object.keys(b).reduce(function (s, k) { return s + b[k]; }, 0);
    var body = h("div", { style: "display:grid;gap:10px" }, [h("div", { cls: "legend" }, [h("span", {}, [h("i", { style: "--c:var(--s2)" }), "Increase"]), h("span", {}, [h("i", { style: "--c:var(--s3)" }), "Decrease"])]), box,
      h("p", { cls: "cap", style: "margin:0", text: "Every " + DIM[cmpBy].label.toLowerCase() + " with both months and the change is in the table below: set \"Break down by\" to " + DIM[cmpBy].label + "." })]);
    return panel("w5", "Compare two months", mon(A) + " " + money(ta) + " → " + mon(B) + " " + money(tb) + ". Net " + signed(tb - ta) + ". Largest six each way.", body, [
      by("From", monthPick(cmpA, function (v) { cmpA = v; render(); }, "c-a", "Compare from")), by("To", monthPick(cmpB, function (v) { cmpB = v; render(); }, "c-b", "Compare to")),
      by("By", dimPick(cmpBy, function (v) { cmpBy = v; render(); }, "c-by"))]);
  }

  function heat(rows) {
    var months = M.slice(from, to + 1);
    var totals = ranked(sumBy(rows, C[heatBy])), top = totals.slice(0, 12), rest = totals.slice(12);
    var cell = {};
    rows.forEach(function (r) { var k = r[C[heatBy]] + "|" + r[C.month]; cell[k] = (cell[k] || 0) + r[C.amount]; });
    var lines = top.map(function (x) { return { label: name(heatBy, x[0]), ix: +x[0], total: x[1], v: months.map(function (m) { return cell[x[0] + "|" + m] || 0; }) }; });
    if (rest.length) lines.push({ label: rest.length + " others", ix: null, total: rest.reduce(function (a, x) { return a + x[1]; }, 0),
      v: months.map(function (m) { return rest.reduce(function (a, x) { return a + (cell[x[0] + "|" + m] || 0); }, 0); }) });
    var max = Math.max.apply(null, lines.map(function (l) { return Math.max.apply(null, l.v.concat([0])); }).concat([1]));
    var t = h("table", { cls: "heat" }), hr = h("tr", {}, [h("th")]);
    months.forEach(function (m) { hr.appendChild(h("th", { scope: "col", text: mon(m) })); });
    hr.appendChild(h("th", { scope: "col", text: "Total", style: "text-align:right" }));
    t.appendChild(h("thead", {}, [hr]));
    var tb = h("tbody");
    lines.forEach(function (l) {
      var th = h("th", { cls: "rowh", scope: "row" });
      if (l.ix == null) th.textContent = l.label;
      else { var b = h("button", { type: "button", text: l.label, title: "Show only " + l.label }); b.addEventListener("click", function () { only(heatBy, l.ix); }); th.appendChild(b); }
      var tr = h("tr", {}, [th]);
      l.v.forEach(function (v, i) {
        var td = h("td", { style: "--v:" + (v > 0 ? Math.max(6, Math.sqrt(v / max) * 100) : 0).toFixed(1) });
        tipOn(td, l.label + ", " + monYear(months[i]), [full(v)]);
        tr.appendChild(td);
      });
      tr.appendChild(h("td", { cls: "tot", text: money(l.total) }));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var body = h("div", { style: "display:grid;gap:10px" }, [h("div", { cls: "heat-wrap" }, [t]), h("div", { cls: "scale" }, ["Less", h("i"), "More (up to " + money(max) + " in a month)"])]);
    return panel("", "Where the cost builds up, month by month", "Darker means more charged that month. The largest twelve; click a name to show only its figures.", body,
      [by("Rows", dimPick(heatBy, function (v) { heatBy = v; render(); }, "c-heat"))]);
  }

  function rank(cls, id, dim, setDim, rows) {
    var all = ranked(sumBy(rows, C[dim])).filter(function (x) { return !(dim === "vendor" && name(dim, x[0]) === "Not external"); });
    var total = all.reduce(function (a, x) { return a + x[1]; }, 0), n = 10;
    var list = all.slice(0, n), rest = all.slice(n), max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    var box = h("div", { cls: "list" });
    function line(text, v, ix) {
      var r = h("button", { cls: "rk" + (ix != null && picked(dim, ix) ? " on" : ""), type: "button" }, [h("span", { cls: "lab", text: text }),
        h("span", { cls: "track" }, [h("i", { style: "width:" + Math.max(0, v / max * 100) + "%" })]), h("span", { cls: "val", text: money(v) }), h("span", { cls: "pct", text: total ? pct(v / total * 100) : "" })]);
      tipOn(r, ix == null ? text : label(dim, ix), [full(v), total ? pct(v / total * 100) + " of " + money(total) : ""]);
      if (ix == null) r.disabled = true; else r.addEventListener("click", function () { only(dim, ix); });
      box.appendChild(r);
    }
    list.forEach(function (x) { line(name(dim, x[0]), x[1], +x[0]); });
    if (rest.length) line(rest.length + " others (see the table below)", rest.reduce(function (a, x) { return a + x[1]; }, 0), null);
    if (!all.length) box.appendChild(h("p", { cls: "muted", text: "Nothing in this view." }));
    return panel(cls, "Largest " + DIM[dim].many + (all.length ? " (" + all.length + ")" : ""), "With each one's share. Click one to show only its figures.", box, [by("Show", dimPick(dim, setDim, id))]);
  }

  function rates(rows) {
    var staff = rows.filter(function (r) { return r[C.hours] > 0; });
    var amt = sumBy(staff, C[rateBy]), hrs = sumBy(staff, C[rateBy], "hours");
    var all = Object.keys(amt).filter(function (k) { return hrs[k] >= 40; }).map(function (k) { return [k, amt[k] / hrs[k], hrs[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var list = all.slice(0, 10), max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    var box = h("div", { cls: "list" });
    list.forEach(function (x) {
      var r = h("button", { cls: "rk" + (picked(rateBy, x[0]) ? " on" : ""), type: "button", style: "grid-template-columns:minmax(0,46%) minmax(0,1fr) 64px" }, [h("span", { cls: "lab", text: name(rateBy, x[0]) }),
        h("span", { cls: "track" }, [h("i", { style: "width:" + (x[1] / max * 100) + "%" })]), h("span", { cls: "val", text: CUR + x[1].toFixed(1) })]);
      tipOn(r, label(rateBy, x[0]), [CUR + x[1].toFixed(2) + " per hour", grouped(x[2]) + " hours charged"]);
      r.addEventListener("click", function () { only(rateBy, +x[0]); });
      box.appendChild(r);
    });
    if (!list.length) box.appendChild(h("p", { cls: "muted", text: "No staff hours in this view." }));
    return panel("w4", "Cost per hour", "Amount divided by hours, highest ten" + (all.length > 10 ? " of " + all.length : "") + ". Lines without hours and entries under 40 hours are left out.", box,
      [by("By", dimPick(rateBy, function (v) { rateBy = v; render(); }, "c-rate"))]);
  }

  // ---- tables: sortable headings, a search box, pages
  function pager(state, count, size, redraw) {
    var pages = Math.max(1, Math.ceil(count / size)); if (state.page >= pages) state.page = pages - 1;
    var prev = h("button", { cls: "btn pg", type: "button", "aria-label": "Previous page", text: "‹" }), next = h("button", { cls: "btn pg", type: "button", "aria-label": "Next page", text: "›" });
    prev.disabled = state.page === 0; next.disabled = state.page >= pages - 1;
    prev.addEventListener("click", function () { state.page--; redraw(); }); next.addEventListener("click", function () { state.page++; redraw(); });
    return h("div", { cls: "pager" }, [h("span", { cls: "count", text: count ? grouped(state.page * size + 1) + " to " + grouped(Math.min(count, (state.page + 1) * size)) + " of " + grouped(count) : "0" }), prev, next]);
  }
  function th(text, key, state, redraw, right) {
    var on = state.sort === key, b = h("button", { type: "button", text: text + (on ? (state.dir < 0 ? " ▼" : " ▲") : "") });
    b.addEventListener("click", function () { if (on) state.dir = -state.dir; else { state.sort = key; state.dir = (key === "name" || typeof key === "string" && key.charAt(0) === "t") ? 1 : -1; } state.page = 0; redraw(); });
    return h("th", { scope: "col", cls: (right ? "r" : "") + (on ? " on" : ""), "aria-sort": on ? (state.dir < 0 ? "descending" : "ascending") : "none" }, [b]);
  }
  function searchBox(state, redraw, id, placeholder) {
    var i = h("input", { type: "search", id: id, placeholder: placeholder, "aria-label": placeholder, value: state.q });
    i.addEventListener("input", function () { state.q = i.value; state.page = 0; redraw(); });
    return i;
  }

  // Break down by any dimension: one row per member, one column per month, the total, and the change between the two compared months.
  function explorer(rows, all) {
    var holder = h("div");
    function draw() {
      var dim = ex.by, col = C[dim], months = M.slice(from, to + 1), A = M[cmpA], B = M[cmpB];
      var map = {};
      function get(k) { return map[k] || (map[k] = { k: k, m: {}, total: 0, hours: 0, a: 0, b: 0 }); }
      rows.forEach(function (r) { var g = get(r[col]); g.m[r[C.month]] = (g.m[r[C.month]] || 0) + r[C.amount]; g.total += r[C.amount]; g.hours += r[C.hours]; });
      all.forEach(function (r) { if (r[C.month] === A) get(r[col]).a += r[C.amount]; else if (r[C.month] === B) get(r[col]).b += r[C.amount]; });
      var q = ex.q.toLowerCase();
      var list = Object.keys(map).map(function (k) { var g = map[k]; g.name = label(dim, k); g.change = g.b - g.a; return g; })
        .filter(function (g) { return (g.total || g.a || g.b) && (!q || g.name.toLowerCase().indexOf(q) >= 0); });
      var s = ex.sort;
      list.sort(function (x, y) {
        var a = s === "name" ? x.name : s === "total" ? x.total : s === "hours" ? x.hours : s === "change" ? x.change : (x.m[s] || 0);
        var b = s === "name" ? y.name : s === "total" ? y.total : s === "hours" ? y.hours : s === "change" ? y.change : (y.m[s] || 0);
        return (a < b ? -1 : a > b ? 1 : 0) * ex.dir;
      });
      var size = 15, sum = list.reduce(function (a, g) { return a + g.total; }, 0);
      var head = h("tr", {}, [th(DIM[dim].label, "name", ex, draw)]);
      months.forEach(function (m) { head.appendChild(th(mon(m), m, ex, draw, true)); });
      head.appendChild(th("Total", "total", ex, draw, true)); head.appendChild(th("Hours", "hours", ex, draw, true));
      head.appendChild(th(mon(A) + " → " + mon(B), "change", ex, draw, true));
      var pg = pager(ex, list.length, size, draw);
      var body = h("tbody");
      list.slice(ex.page * size, ex.page * size + size).forEach(function (g) {
        var b = h("button", { type: "button", cls: "cellb", text: g.name, title: "Show only " + g.name }); b.addEventListener("click", function () { only(dim, +g.k); });
        var tr = h("tr", { cls: picked(dim, g.k) ? "picked" : "" }, [h("th", { scope: "row" }, [b])]);
        months.forEach(function (m) { tr.appendChild(h("td", { cls: "r", text: g.m[m] ? money(g.m[m]) : "" , title: g.m[m] ? full(g.m[m]) : "" })); });
        tr.appendChild(h("td", { cls: "r b", text: money(g.total), title: full(g.total) }));
        tr.appendChild(h("td", { cls: "r", text: g.hours ? grouped(g.hours) : "" }));
        tr.appendChild(h("td", { cls: "r " + (g.change > 0 ? "up" : g.change < 0 ? "dn" : ""), text: Math.abs(g.change) >= 1 ? signed(g.change) + (g.a ? "  " + (g.change >= 0 ? "▲" : "▼") + pct(Math.abs(g.change / g.a * 100)) : "  new") : "", title: mon(A) + " " + full(g.a) + ", " + mon(B) + " " + full(g.b) }));
        body.appendChild(tr);
      });
      if (!list.length) body.appendChild(h("tr", {}, [h("td", { colspan: months.length + 4, cls: "muted", text: "Nothing matches." })]));
      var keep = root.activeElement && root.activeElement.id === "ex-q";
      holder.textContent = "";
      holder.appendChild(h("div", { cls: "tbl-wrap" }, [h("table", { cls: "tbl" }, [h("thead", {}, [head]), body])]));
      holder.appendChild(h("div", { cls: "tbl-foot" }, [h("span", { cls: "muted", text: grouped(list.length) + " " + DIM[dim].many + " · " + full(sum) }), pg]));
      if (keep) { var el = root.getElementById("ex-q"); if (el) el.focus(); }
    }
    draw();
    return panel("", "Break down by any dimension", "One row each, month by month, with the change between the two compared months. Click a heading to sort, a name to show only its figures, then break down again to go deeper.", holder,
      [by("Break down by", dimPick(ex.by, function (v) { ex.by = v; ex.page = 0; ex.q = ""; ex.sort = "total"; ex.dir = -1; render(); }, "c-ex")), searchBox(ex, function () { drawEx(); }, "ex-q", "Search")]);
    function drawEx() { draw(); }
  }

  // The lowest level: every chargeback line behind the figures above.
  var LCOLS = [["month", "Month"], ["person", "Resource"], ["pid", "ID"], ["project", "Project"], ["cc", "Cost centre"], ["coe", "CoE"], ["type", "Type"], ["place", "Location"], ["vendor", "Vendor"], ["manager", "Manager"]];
  var NUM_AT = 5;
  function cellText(r, key) {
    if (key === "month") return r[C.month];
    if (key === "pid") return D.personIds[r[C.person]] || "";
    return name(key, r[C[key]]);
  }
  function lines(rows) {
    var holder = h("div");
    function draw() {
      var q = ln.q.toLowerCase();
      var list = !q ? rows.slice() : rows.filter(function (r) { for (var i = 0; i < LCOLS.length; i++) if (cellText(r, LCOLS[i][0]).toLowerCase().indexOf(q) >= 0) return true; return false; });
      var s = ln.sort.replace(/^t:/, "");
      list.sort(function (x, y) {
        var a = s === "amount" || s === "hours" ? x[C[s]] : cellText(x, s), b = s === "amount" || s === "hours" ? y[C[s]] : cellText(y, s);
        return (a < b ? -1 : a > b ? 1 : 0) * ln.dir;
      });
      var size = 25, sum = list.reduce(function (a, r) { return a + r[C.amount]; }, 0), hrs = list.reduce(function (a, r) { return a + r[C.hours]; }, 0);
      var head = h("tr");
      LCOLS.forEach(function (c, i) {
        if (i === NUM_AT) { head.appendChild(th("Hours", "hours", ln, draw, true)); head.appendChild(th("Amount", "amount", ln, draw, true)); }
        head.appendChild(th(c[1], "t:" + c[0], ln, draw));
      });
      var pg = pager(ln, list.length, size, draw), body = h("tbody");
      list.slice(ln.page * size, ln.page * size + size).forEach(function (r) {
        var tr = h("tr");
        LCOLS.forEach(function (c, i) {
          if (i === NUM_AT) {                    // hours and amount sit right after the cost centre, so they are in view without scrolling
            tr.appendChild(h("td", { cls: "r", text: r[C.hours] ? String(r[C.hours]) : "" }));
            tr.appendChild(h("td", { cls: "r b", text: full(r[C.amount]) }));
          }
          var text = c[0] === "month" ? monYear(r[C.month]) : cellText(r, c[0]);
          if (c[0] === "month" || c[0] === "pid") { tr.appendChild(h("td", { text: text })); return; }
          var b = h("button", { type: "button", cls: "cellb", text: text, title: "Show only " + text }); b.addEventListener("click", function () { only(c[0], r[C[c[0]]]); });
          tr.appendChild(h("td", {}, [b]));
        });
        body.appendChild(tr);
      });
      if (!list.length) body.appendChild(h("tr", {}, [h("td", { colspan: LCOLS.length + 2, cls: "muted", text: "Nothing matches." })]));
      var keep = root.activeElement && root.activeElement.id === "ln-q";
      holder.textContent = "";
      holder.appendChild(h("div", { cls: "tbl-wrap" }, [h("table", { cls: "tbl lines" }, [h("thead", {}, [head]), body])]));
      holder.appendChild(h("div", { cls: "tbl-foot" }, [h("span", { cls: "muted", text: grouped(list.length) + " lines · " + grouped(hrs) + " hours · " + full(sum) }), pg]));
      if (keep) { var el = root.getElementById("ln-q"); if (el) el.focus(); }
    }
    draw();
    var csv = h("button", { cls: "btn", type: "button" }, [icon(DOWN), "CSV"]); csv.addEventListener("click", saveCsv);
    return panel("", "Every line", "The lowest level: one line per month, resource, project and cost centre. Click a heading to sort, or any value to show only its lines.", holder,
      [searchBox(ln, function () { draw(); }, "ln-q", "Search lines"), csv]);
  }

  function render() {
    tip.hidden = true;
    var keep = root.activeElement && root.activeElement.id, y = window.scrollY;
    if (cmpA === cmpB && M.length > 1) cmpA = cmpB > 0 ? cmpB - 1 : 1;
    var rows = rowsNow(), all = rowsNow(true);
    var kids = [header(), h("a", { cls: "back", href: D.links.index }, [icon(BACK), "All sections"]), filters(), chips()];
    if (!rows.length) kids.push(h("div", { cls: "empty", text: "Nothing was charged for this combination. Remove a filter to see figures again." }));
    else {
      kids.push(tiles(rows, all));
      kids.push(h("div", { cls: "grid" }, [trend(rows), compare(all), heat(rows), explorer(rows, all),
        rank("w4", "c-ra", rankA, function (v) { rankA = v; render(); }, rows), rank("w4", "c-rb", rankB, function (v) { rankB = v; render(); }, rows), rates(rows),
        lines(rows)]));
    }
    if (D.links.detail) kids.push(h("a", { cls: "detail", href: D.links.detail }, [h("span", { cls: "badge" }, [icon(["M4 5h16", "M4 10h16", "M4 15h16", "M4 20h10"])]),
      h("div", {}, [h("b", { text: "The original chargeback page" }), h("p", { text: "The stand-alone page this view was built from, with its Excel download." })]), h("span", { cls: "open" }, ["Open", icon(ARROW)])]));
    kids.push(h("p", { cls: "foot", text: "All figures follow the filters above. \"Compare two months\" and the change column ignore the month range, so any two months can be compared. Source: " + D.source.name + ", " + grouped(D.source.rowsRead || 0) + " lines read." }));
    app.textContent = "";
    app.appendChild(h("div", { cls: "wrap" }, kids));
    if (openDim) { var qel = root.getElementById("dd-q"); if (qel) { qel.focus(); qel.setSelectionRange(openQ.length, openQ.length); } }
    else if (keep) { var el = root.getElementById(keep); if (el) el.focus(); }
    window.scrollTo(0, y);
  }

  // ---- downloads
  function saveCsv() {
    function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var head = LCOLS.map(function (c) { return c[1]; }).concat(["Function", "Hours", "Amount (" + D.source.currency + ")"]);
    var out = [head.join(",")].concat(rowsNow().map(function (r) {
      return LCOLS.map(function (c) { return q(cellText(r, c[0])); }).concat([q(name("fn", r[C.fn])), r[C.hours], r[C.amount]]).join(",");
    }));
    ctx.offer("dtc-chargeback-lines.csv", "\ufeff" + out.join("\r\n"), "text/csv").catch(function () {});
  }

  render();
  return {};                    // keeps its filters while you look at other pages
});
