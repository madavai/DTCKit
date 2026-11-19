// The chargeback overview. Mounted by the shell into its own shadow root.
PORTAL.view("chargeback", function (root, ctx) {
  var D = ctx.data("cb-data");
  var app = root.getElementById("app");
  if (!D.rows) { app.textContent = "No data yet. Load a chargeback export with: python3 -m engine ingest chargeback <file>  then run: python3 -m engine build"; return; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var C = {}; D.cols.forEach(function (n, i) { C[n] = i; });
  var DIMS = [
    { key: "fn", label: "Function", all: "All functions" },
    { key: "type", label: "Type", all: "All types" },
    { key: "coe", label: "CoE", all: "All CoEs" },
    { key: "place", label: "Location", all: "All locations" },
    { key: "cc", label: "Cost centre", all: "All cost centres" },
    { key: "project", label: "Project", all: "All projects" }
  ];
  var F = {};                       // dimension key -> chosen index
  var split = "type", moverBy = "project";

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
    if (a >= 1e3) return s + CUR + Math.round(a / 1e3) + "k";
    return s + CUR + Math.round(a);
  }
  function full(v) { return (v < 0 ? "-" : "") + CUR + String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function signed(v) { return (v >= 0 ? "+" : "-") + money(Math.abs(v)); }
  function pct(v) { return (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)) + "%"; }
  function mon(m) { return MONTHS[+m.slice(5) - 1]; }
  function monYear(m) { return mon(m) + " " + m.slice(0, 4); }
  var RANGE = mon(D.months[0]) + " to " + monYear(D.months[D.months.length - 1]);

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
  function rowsNow() {
    var keys = Object.keys(F);
    return D.rows.filter(function (r) { for (var i = 0; i < keys.length; i++) if (r[C[keys[i]]] !== F[keys[i]]) return false; return true; });
  }
  function sumBy(rows, col, field) {
    var out = {}, f = C[field || "amount"];
    rows.forEach(function (r) { out[r[col]] = (out[r[col]] || 0) + r[f]; });
    return out;
  }
  function ranked(obj) { return Object.keys(obj).map(function (k) { return [k, obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
  function name(dim, ix) { return D.dims[dim][ix]; }
  // A colour belongs to a member, not to its rank today: the four largest over the whole file keep their colour under any filter.
  var SERIES = ["var(--acc)", "var(--s2)", "var(--s3)", "var(--s4)"], REST = "var(--c5)";
  var COLOUR = {};
  ["type", "fn", "place"].forEach(function (dim) {
    COLOUR[dim] = {};
    ranked(sumBy(D.rows, C[dim])).slice(0, 4).forEach(function (x, i) { COLOUR[dim][x[0]] = SERIES[i]; });
  });

  function setFilter(dim, ix) {
    if (ix == null || F[dim] === ix) delete F[dim]; else F[dim] = ix;
    render();
  }

  // ---- header and filters
  function header() {
    var markBox = h("span", { cls: "mark-box" }); markBox.innerHTML = D.mark;     // the emblem ships inside this file's own data block
    var nm = h("span", { cls: "name" }, (D.source.org || "Digital Technology Centers").split(" ").map(function (w) { return h("span", { text: w }); }));
    var csv = h("button", { cls: "btn", type: "button" }, [icon(DOWN), "Download data (CSV)"]);
    csv.addEventListener("click", saveCsv);
    return h("header", { cls: "brand inner" }, [h("a", link({ cls: "lockup", "aria-label": "Portal home" }, D.links.index), [markBox, nm]),
      h("span", { cls: "divider", "aria-hidden": "true" }),
      h("div", { cls: "titles" }, [h("h1", {}, ["Portal · ", h("span", { cls: "acc", text: "Chargeback" })]),
        h("div", { cls: "sub", text: D.source.name + " · " + RANGE + " · prepared " + (D.source.generated || "") })]),
      h("div", { cls: "actions" }, [csv])]);
  }
  function link(attrs, href) {
    attrs.href = href;
    if (/^https?:/.test(href)) { attrs.target = "_blank"; attrs.rel = "noopener"; }
    return attrs;
  }
  function filters() {
    var box = h("div", { cls: "filters" });
    DIMS.forEach(function (d) {
      var totals = sumBy(D.rows, C[d.key]);
      var sel = h("select", { id: "f-" + d.key, cls: F[d.key] != null ? "on" : "" }, [h("option", { value: "", text: d.all })]);
      ranked(totals).forEach(function (x) {
        var o = h("option", { value: x[0], text: name(d.key, x[0]) });
        if (F[d.key] === +x[0]) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { if (sel.value === "") delete F[d.key]; else F[d.key] = +sel.value; render(); });
      box.appendChild(h("label", {}, [d.label, sel]));
    });
    return box;
  }
  function chips() {
    var box = h("div", { cls: "chips" }), keys = Object.keys(F);
    if (!keys.length) { box.appendChild(h("span", { text: "Showing everything. Pick a filter above, or click any bar or name below to narrow the page." })); return box; }
    keys.forEach(function (k) {
      var d = DIMS.filter(function (x) { return x.key === k; })[0];
      var b = h("button", { cls: "chipx", type: "button", text: d.label + ": " + name(k, F[k]) + "  ✕", "aria-label": "Remove filter " + d.label });
      b.addEventListener("click", function () { setFilter(k, null); });
      box.appendChild(b);
    });
    var c = h("button", { cls: "chipx clear", type: "button", text: "Clear all" });
    c.addEventListener("click", function () { F = {}; render(); });
    box.appendChild(c);
    return box;
  }

  // ---- panels
  function panel(cls, title, cap, body, control) {
    return h("section", { cls: "panel " + cls }, [h("div", { cls: "panel-head" }, [h("div", {}, [h("h4", { text: title }), h("p", { cls: "cap", text: cap })]), control || null]), body]);
  }
  function seg(options, current, onPick) {
    var box = h("div", { cls: "seg", role: "group" });
    options.forEach(function (o) {
      var b = h("button", { type: "button", cls: o[0] === current ? "on" : "", text: o[1], "aria-pressed": o[0] === current ? "true" : "false" });
      b.addEventListener("click", function () { onPick(o[0]); });
      box.appendChild(b);
    });
    return box;
  }
  function tile(k, v, d) { return h("div", { cls: "tile" }, [h("div", { cls: "k", text: k }), h("div", { cls: "v", text: v }), h("div", { cls: "d", text: d || " " })]); }

  function tiles(rows, byMonth) {
    var total = rows.reduce(function (a, r) { return a + r[C.amount]; }, 0);
    var active = D.months.filter(function (m) { return byMonth[m]; });
    var last = active[active.length - 1], prev = active[active.length - 2];
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
    var change = prev ? (byMonth[last] / byMonth[prev] - 1) * 100 : null;
    return h("div", { cls: "tiles" }, [
      tile("Charged back", money(total), active.length ? mon(active[0]) + " to " + monYear(last) + " · " + full(total) : ""),
      tile(last ? monYear(last) : "Latest month", last ? money(byMonth[last]) : "–", change == null ? "" : (change >= 0 ? "▲ " : "▼ ") + pct(Math.abs(change)) + (change >= 0 ? " up on " : " down on ") + mon(prev)),
      tile("Average per month", active.length ? money(total / active.length) : "–", active.length + " months with charges"),
      tile("Cost per hour charged", hours ? CUR + (staffAmt / hours).toFixed(1) : "–", Object.keys(rate).map(function (t) { return t + " " + CUR + rate[t].toFixed(1); }).join(" · ")),
      tile("From external staff", total ? pct(ext / total * 100) : "–", money(ext) + " of " + money(total)),
      tile("Largest project's share", top && total ? pct(top[1] / total * 100) : "–", top ? name("project", top[0]) : "")
    ]);
  }

  function trend(rows, byMonth) {
    var months = D.months, members = [], seriesOf = function () { return 0; };
    if (split !== "none") {
      var col = C[split], known = COLOUR[split];
      var present = ranked(sumBy(rows, col)).map(function (x) { return x[0]; });
      var keys = present.filter(function (k) { return known[k]; });
      var hasRest = present.some(function (k) { return !known[k]; });
      seriesOf = function (r) { var i = keys.indexOf(String(r[col])); return i < 0 ? keys.length : i; };
      members = keys.map(function (k) { return { label: name(split, k), c: known[k] }; });
      if (hasRest) members.push({ label: "Others", c: REST });
    } else members = [{ label: "Charged back", c: "var(--acc)" }];
    var grid = months.map(function () { return members.map(function () { return 0; }); });
    rows.forEach(function (r) { grid[months.indexOf(r[C.month])][seriesOf(r)] += r[C.amount]; });
    var totals = months.map(function (m) { return byMonth[m] || 0; }), max = Math.max.apply(null, totals.concat([1])), peak = totals.indexOf(Math.max.apply(null, totals));
    var cols = h("div", { cls: "cols full", style: "--h:210px" });
    months.forEach(function (m, i) {
      var c = h("div", { cls: "col" });
      if (i === 0 || i === months.length - 1 || i === peak) c.appendChild(h("span", { cls: "v", text: money(totals[i]) }));
      for (var s = members.length - 1; s >= 0; s--) {
        var v = grid[i][s]; if (v <= 0) continue;
        c.appendChild(h("div", { cls: "sg", style: "--c:" + members[s].c + ";height:" + (v / max * 84) + "%" }));
      }
      var lines = members.length > 1 ? members.map(function (mm, s) { return mm.label + " " + full(grid[i][s]); }).filter(function (_, s) { return grid[i][s]; }) : [];
      lines.push("Total " + full(totals[i]));
      if (i > 0 && totals[i - 1]) lines.push((totals[i] >= totals[i - 1] ? "▲ " : "▼ ") + pct(Math.abs(totals[i] / totals[i - 1] - 1) * 100) + " on " + mon(months[i - 1]));
      tipOn(c, monYear(m), lines);
      cols.appendChild(c);
    });
    var ax = h("div", { cls: "axis" }); months.forEach(function (m) { ax.appendChild(h("span", { text: mon(m) })); });
    var body = h("div", { style: "display:grid;gap:10px" });
    if (members.length > 1) body.appendChild(h("div", { cls: "legend" }, members.map(function (mm) { return h("span", {}, [h("i", { style: "--c:" + mm.c }), mm.label]); })));
    body.appendChild(h("div", {}, [cols, ax]));
    return panel("w7", "Charged back per month", "Stacked by the split you choose. Hover a month for the figures.", body,
      seg([["none", "Total"], ["type", "Type"], ["fn", "Function"], ["place", "Location"]], split, function (v) { split = v; render(); }));
  }

  function movers(rows, byMonth) {
    var active = D.months.filter(function (m) { return byMonth[m]; }), last = active[active.length - 1], prev = active[active.length - 2];
    var control = seg([["project", "Project"], ["coe", "CoE"], ["cc", "Cost centre"]], moverBy, function (v) { moverBy = v; render(); });
    if (!prev) return panel("w5", "What moved", "Needs two months to compare.", h("p", { cls: "muted", text: "Only one month in this view." }), control);
    var col = C[moverBy];
    var a = sumBy(rows.filter(function (r) { return r[C.month] === last; }), col), b = sumBy(rows.filter(function (r) { return r[C.month] === prev; }), col);
    var delta = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { delta[k] = (a[k] || 0) - (b[k] || 0); });
    var list = ranked(delta).filter(function (x) { return Math.abs(x[1]) >= 1; });
    var ups = list.filter(function (x) { return x[1] > 0; }).slice(0, 5), downs = list.filter(function (x) { return x[1] < 0; }).slice(-5).reverse();
    var shown = ups.concat(downs.reverse()), max = Math.max.apply(null, shown.map(function (x) { return Math.abs(x[1]); }).concat([1]));
    var box = h("div", { cls: "list" });
    shown.forEach(function (x) {
      var up = x[1] > 0, r = h("button", { cls: "mv", type: "button" }, [h("span", { cls: "lab", text: name(moverBy, x[0]) }),
        h("span", { cls: "ax" }, [h("i", { cls: up ? "up" : "dn", style: "width:" + (Math.abs(x[1]) / max * 50) + "%" })]), h("span", { cls: "val", text: signed(x[1]) })]);
      tipOn(r, name(moverBy, x[0]), [mon(prev) + " " + full(b[x[0]] || 0), mon(last) + " " + full(a[x[0]] || 0), "Change " + signed(x[1])]);
      r.addEventListener("click", function () { setFilter(moverBy, +x[0]); });
      box.appendChild(r);
    });
    if (!shown.length) box.appendChild(h("p", { cls: "muted", text: "Nothing changed between the two months." }));
    var net = (byMonth[last] || 0) - (byMonth[prev] || 0);
    var body = h("div", { style: "display:grid;gap:10px" }, [h("div", { cls: "legend" }, [h("span", {}, [h("i", { style: "--c:var(--s2)" }), "Increase"]), h("span", {}, [h("i", { style: "--c:var(--s3)" }), "Decrease"])]), box]);
    return panel("w5", "What moved in " + monYear(last), "Against " + mon(prev) + ". Net " + signed(net) + ". Largest five each way.", body, control);
  }

  function heat(rows) {
    var totals = ranked(sumBy(rows, C.coe)), top = totals.slice(0, 10), rest = totals.slice(10);
    var cell = {};
    rows.forEach(function (r) { var k = r[C.coe] + "|" + r[C.month]; cell[k] = (cell[k] || 0) + r[C.amount]; });
    var lines = top.map(function (x) { return { label: name("coe", x[0]), ix: +x[0], total: x[1], v: D.months.map(function (m) { return cell[x[0] + "|" + m] || 0; }) }; });
    if (rest.length) lines.push({ label: rest.length + " other CoEs", ix: null, total: rest.reduce(function (a, x) { return a + x[1]; }, 0),
      v: D.months.map(function (m) { return rest.reduce(function (a, x) { return a + (cell[x[0] + "|" + m] || 0); }, 0); }) });
    var max = Math.max.apply(null, lines.map(function (l) { return Math.max.apply(null, l.v); }).concat([1]));
    var t = h("table", { cls: "heat" }), hr = h("tr", {}, [h("th")]);
    D.months.forEach(function (m) { hr.appendChild(h("th", { scope: "col", text: mon(m) })); });
    hr.appendChild(h("th", { scope: "col", text: "Total", style: "text-align:right" }));
    t.appendChild(h("thead", {}, [hr]));
    var tb = h("tbody");
    lines.forEach(function (l) {
      var th = h("th", { cls: "rowh", scope: "row" });
      if (l.ix == null) th.textContent = l.label;
      else { var b = h("button", { type: "button", text: l.label, title: "Show only " + l.label }); b.addEventListener("click", function () { setFilter("coe", l.ix); }); th.appendChild(b); }
      var tr = h("tr", {}, [th]);
      l.v.forEach(function (v, i) {
        var td = h("td", { style: "--v:" + (v > 0 ? Math.max(6, Math.sqrt(v / max) * 100) : 0).toFixed(1) });
        tipOn(td, l.label + ", " + monYear(D.months[i]), [full(v)]);
        tr.appendChild(td);
      });
      tr.appendChild(h("td", { cls: "tot", text: money(l.total) }));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var body = h("div", { style: "display:grid;gap:10px" }, [h("div", { cls: "heat-wrap" }, [t]), h("div", { cls: "scale" }, ["Less", h("i"), "More (up to " + money(max) + " in a month)"])]);
    return panel("", "Where the cost builds up: CoE by month", "Darker means more charged that month. Click a CoE to show only its figures.", body);
  }

  function rank(cls, title, cap, rows, dim, opts) {
    opts = opts || {};
    var all = ranked(sumBy(rows, C[dim])).filter(function (x) { return !opts.skip || name(dim, x[0]) !== opts.skip; });
    var total = all.reduce(function (a, x) { return a + x[1]; }, 0), n = opts.n || 8;
    var list = all.slice(0, n), rest = all.slice(n), max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    var box = h("div", { cls: "list" });
    function line(label, v, ix) {
      var r = h("button", { cls: "rk" + (ix != null && F[dim] === ix ? " on" : ""), type: "button" }, [h("span", { cls: "lab", text: label }),
        h("span", { cls: "track" }, [h("i", { style: "width:" + Math.max(0, v / max * 100) + "%" })]), h("span", { cls: "val", text: money(v) }), h("span", { cls: "pct", text: total ? pct(v / total * 100) : "" })]);
      tipOn(r, label, [full(v), total ? pct(v / total * 100) + " of " + money(total) : ""]);
      if (ix == null) r.disabled = true; else r.addEventListener("click", function () { setFilter(dim, ix); });
      box.appendChild(r);
    }
    list.forEach(function (x) { line(name(dim, x[0]), x[1], +x[0]); });
    if (rest.length) line(rest.length + " others", rest.reduce(function (a, x) { return a + x[1]; }, 0), null);
    if (!all.length) box.appendChild(h("p", { cls: "muted", text: opts.none || "Nothing in this view." }));
    return panel(cls, title + (all.length ? " (" + all.length + ")" : ""), cap, box);
  }

  function rates(rows) {
    var staff = rows.filter(function (r) { return r[C.hours] > 0; });
    var amt = sumBy(staff, C.place), hrs = sumBy(staff, C.place, "hours");
    var list = Object.keys(amt).filter(function (k) { return hrs[k] >= 100; }).map(function (k) { return [k, amt[k] / hrs[k], hrs[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = Math.max.apply(null, list.map(function (x) { return x[1]; }).concat([1]));
    var box = h("div", { cls: "list" });
    list.forEach(function (x) {
      var r = h("button", { cls: "rk" + (F.place === +x[0] ? " on" : ""), type: "button", style: "grid-template-columns:minmax(0,46%) minmax(0,1fr) 64px" }, [h("span", { cls: "lab", text: name("place", x[0]) }),
        h("span", { cls: "track" }, [h("i", { style: "width:" + (x[1] / max * 100) + "%" })]), h("span", { cls: "val", text: CUR + x[1].toFixed(1) })]);
      tipOn(r, name("place", x[0]), [CUR + x[1].toFixed(2) + " per hour", Math.round(x[2]).toLocaleString("en") + " hours charged"]);
      r.addEventListener("click", function () { setFilter("place", +x[0]); });
      box.appendChild(r);
    });
    if (!list.length) box.appendChild(h("p", { cls: "muted", text: "No staff hours in this view." }));
    return panel("w4", "Cost per hour by location", "Amount divided by hours charged, staff only. Locations under 100 hours are left out.", box);
  }

  function render() {
    tip.hidden = true;
    var keep = root.activeElement && root.activeElement.id;
    var rows = rowsNow(), byMonth = sumBy(rows, C.month);
    var kids = [header(), h("a", link({ cls: "back" }, D.links.index), [icon(BACK), "All sections"]), filters(), chips()];
    if (!rows.length) kids.push(h("div", { cls: "empty", text: "Nothing was charged for this combination. Remove a filter to see figures again." }));
    else {
      kids.push(tiles(rows, byMonth));
      kids.push(h("div", { cls: "grid" }, [trend(rows, byMonth), movers(rows, byMonth), heat(rows),
        rank("w6", "Projects", "Largest first. Click one to show only its figures.", rows, "project", { n: 10 }),
        rank("w6", "Cost centres charged", "Who receives the charge.", rows, "cc", { n: 10 }),
        rank("w4", "Locations", "Where the people charging are based.", rows, "place"),
        rank("w4", "External vendors", "External staff spend by supplier.", rows, "vendor", { skip: "Not external", none: "No external spend in this view." }),
        rates(rows)]));
    }
    if (D.links.detail) kids.push(h("a", link({ cls: "detail" }, D.links.detail), [h("span", { cls: "badge" }, [icon(["M4 5h16", "M4 10h16", "M4 15h16", "M4 20h10"])]),
      h("div", {}, [h("b", { text: "Line detail" }), h("p", { text: "Every charge by person and project, with its own filters, the row list and Excel download." })]), h("span", { cls: "open" }, ["Open", icon(ARROW)])]));
    else kids.push(h("div", { cls: "detail" }, [h("span", { cls: "badge" }, [icon(["M4 5h16", "M4 10h16", "M4 15h16", "M4 20h10"])]),
      h("div", {}, [h("b", { text: "Line detail" }), h("p", { text: "The row-by-row page (person and project, Excel download) is kept in the portal's files and is not published on this link." })])]));
    kids.push(h("p", { cls: "foot", text: "Totals only: nobody is named on this page. Figures follow the filters above. Source: " + D.source.name + ", " + (D.source.rowsRead || "") + " lines read." }));
    app.textContent = "";
    app.appendChild(h("div", { cls: "wrap" }, kids));
    if (keep) { var el = root.getElementById(keep); if (el) el.focus(); }
  }

  // ---- downloads
  function offer(filename, data, type) { ctx.offer(filename, data, type).catch(function () {}); }
  function saveCsv() {
    function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var head = ["Month", "CoE", "Type", "Location", "Project", "Function", "Cost centre", "Vendor", "Amount (" + D.source.currency + ")", "Hours", "People"];
    var keys = ["coe", "type", "place", "project", "fn", "cc", "vendor"];
    var lines = [head.join(",")].concat(rowsNow().map(function (r) {
      return [r[C.month]].concat(keys.map(function (k) { return q(name(k, r[C[k]])); })).concat([r[C.amount], r[C.hours], r[C.people]]).join(",");
    }));
    offer("dtc-chargeback.csv", "﻿" + lines.join("\r\n"), "text/csv");
  }
  render();
  return {};                    // keeps its filters while you look at other pages
});
