// The front page: five doors and their second level. Mounted by the shell into its own shadow root.
PORTAL.view("home", function (root, ctx) {
  var D = ctx.data("fp-data");
  var app = root.getElementById("app");
  if (!D.chargeback) { app.textContent = "No data yet. Load a chargeback export with: python3 -m engine ingest chargeback <file>  then run: python3 -m engine build"; return; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  var ARROW = ["M5 12h14", "M13 6l6 6-6 6"], BACK = ["M19 12H5", "M11 6l-6 6 6 6"];
  function money(v) {
    var a = Math.abs(v), cur = D.source.currency === "EUR" ? "€" : (D.source.currency || "") + " ";
    if (a >= 1e6) return cur + (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1e3) return cur + Math.round(v / 1e3) + "k";
    return cur + Math.round(v);
  }
  function mon(m) { return MONTHS[+m.slice(5) - 1]; }
  function monYear(m) { return mon(m) + " " + m.slice(0, 4); }
  var cb = D.chargeback, pp = D.people, pr = D.projects, org = D.org;
  var first = cb.months[0], last = cb.months[cb.months.length - 1];
  var RANGE = mon(first) + " to " + monYear(last);
  var hcLast = pp.headcount[pp.headcount.length - 1], hcNow = hcLast[0] + hcLast[1];

  // ---- one floating tooltip for every chart mark
  var tip = h("div", { cls: "tip", hidden: "" }); root.appendChild(tip);
  function tipOn(el, title, lines) {
    el.setAttribute("tabindex", "0");
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

  // ---- chart pieces
  // Columns over time. series: one array of values, or two for a stack (first on the baseline).
  function columns(months, series, opts) {
    opts = opts || {};
    var totals = months.map(function (_, i) { return series.reduce(function (a, s) { return a + s[i]; }, 0); });
    var max = Math.max.apply(null, totals), peak = totals.indexOf(max);
    var box = h("div"), cols = h("div", { cls: "cols" + (opts.full ? " full" : ""), style: "--h:" + (opts.height || 72) + "px" });
    months.forEach(function (m, i) {
      var c = h("div", { cls: "col" + (i === months.length - 1 ? " last" : "") });
      var labelled = opts.labels === "all" || (opts.labels !== "none" && (i === months.length - 1 || (opts.labels === "ends" && (i === 0 || i === peak))));
      if (labelled) c.appendChild(h("span", { cls: "v", text: opts.fmt(totals[i]) }));
      for (var s = series.length - 1; s >= 0; s--) {
        var pct = max ? series[s][i] / max * 84 : 0;
        c.appendChild(h("div", { cls: "bar" + (s ? " b2" : "") + (series.length > 1 ? (s === series.length - 1 ? " top" : " base") : ""), style: "height:" + pct + "%" + (s < series.length - 1 ? ";margin-top:2px" : "") }));
      }
      tipOn(c, monYear(m), opts.tip ? opts.tip(i) : [opts.fmt(totals[i])]);
      cols.appendChild(c);
    });
    box.appendChild(cols);
    var ax = h("div", { cls: "axis" });
    months.forEach(function (m, i) { ax.appendChild(h("span", { text: opts.axis === "ends" && i > 0 && i < months.length - 1 ? "" : mon(m) })); });
    box.appendChild(ax);
    return box;
  }
  function rows(list, fmt, lab) {
    var max = Math.max.apply(null, list.map(function (x) { return x[1]; })), box = h("div", { cls: "rows", style: lab ? "--lab:" + lab : "" });
    list.forEach(function (x) {
      var r = h("div", { cls: "row" }, [h("span", { cls: "lab", text: x[0], title: x[0] }),
        h("span", { cls: "track" }, [h("i", { style: "width:" + Math.max(0, x[1] / max * 100) + "%" })]), h("span", { cls: "val", text: fmt(x[1]) })]);
      tipOn(r, x[0], [fmt(x[1])]);
      box.appendChild(r);
    });
    return box;
  }
  function topWithOther(list, n) {
    var top = list.slice(0, n), rest = list.slice(n).reduce(function (a, x) { return a + x[1]; }, 0);
    return rest > 0 ? top.concat([[(list.length - n) + " others", rest]]) : top;
  }
  function split(a, b, la, lb) {
    var box = h("div", { style: "display:grid;gap:6px" });
    box.appendChild(h("div", { cls: "split", role: "img", "aria-label": la + " " + a + ", " + lb + " " + b }, [h("i", { style: "flex:" + a }), h("i", { style: "flex:" + b })]));
    box.appendChild(h("div", { cls: "legend" }, [h("span", {}, [h("i"), la + " " + a]), h("span", {}, [h("i", { cls: "b2" }), lb + " " + b])]));
    return box;
  }
  function pill(kind) { return h("span", { cls: "pill " + kind, text: { live: "Live", ready: "Data ready", need: "Needs data" }[kind] }); }
  function count(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  // ---- the five sections
  var cbGrowth = Math.round((cb.monthly[cb.monthly.length - 1] / cb.monthly[0] - 1) * 100);
  var SECTIONS = [
    { id: "organization", name: "Organization", door: "Know your organization", status: "live", wide: true,
      icon: ["M9 3h6v5H9z", "M3 16h6v5H3z", "M15 16h6v5h-6z", "M12 8v4", "M6 16v-4h12v4"],
      ask: "Who are we, and who leads what?",
      card: function () {
        var faces = h("div", { cls: "faces" });
        org.faces.forEach(function (src) { faces.appendChild(h("img", { src: src, alt: "" })); });
        if (org.leaders > org.faces.length) faces.appendChild(h("span", { cls: "more", text: "+" + (org.leaders - org.faces.length) }));
        return [h("div", { cls: "figure" }, [h("b", { text: String(org.leaders) }), h("span", { text: "leaders on the leadership chart, led by " + org.head.name })]),
          faces,
          h("ul", { cls: "facts" }, [fact(org.digitalCoes, "Digital CoEs"), fact(org.platformCoes, "Platform CoEs"), fact(org.erpTeams, "ERP teams"), fact(org.regions, "CIO regions")])];
      },
      inside: [
        { name: "Leadership team", status: "live", href: D.links.leadership, text: "Domain leaders, digital leaders, CoE leaders and hubs on one chart. Click a person to see every role they hold. Editable, with HTML and PowerPoint download." },
        { name: "Hubs and locations", status: "ready", text: "Where the teams sit and how many people work from each hub." },
        { name: "Applications we support", status: "need", text: "A searchable catalog: owning CoE, users, criticality and health." },
        { name: "Evolution of the organization", status: "need", text: "A timeline of hubs opening, programmes starting and the team growing." }],
      downloads: ["Leadership chart as PowerPoint (works today)", "Leadership chart as HTML (works today)", "Application catalog as Excel"] },
    { id: "chargeback", name: "Chargeback", door: "Chargeback", status: "live", wide: true, href: D.links.chargeback,
      icon: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18", "M15.5 8.5a4.5 4.5 0 1 0 0 7", "M7 10.8h6", "M7 13.2h6"],
      ask: "What do we charge back, to whom, and how is it moving?",
      card: function () {
        return [h("div", { cls: "figure" }, [h("b", { text: money(cb.total) }), h("span", { text: "charged back, " + RANGE })]),
          columns(cb.months, [cb.monthly], { fmt: money, height: 78, axis: "ends" }),
          h("p", { cls: "ask", text: monYear(last) + " is " + (cbGrowth >= 0 ? "up " : "down ") + Math.abs(cbGrowth) + "% on " + mon(first) + "." })];
      },
      inside: [
        { name: "By month", status: "ready", text: "The monthly trend, with what changed against the month before." },
        { name: "By CoE", status: "ready", text: "Which competence centres the cost comes from." },
        { name: "By project", status: "ready", text: "Every project charged, largest first, with hours and amount." },
        { name: "By cost centre", status: "ready", text: cb.costCenters + " cost centres that receive the charge." },
        { name: "By vendor", status: "ready", text: "External spend by supplier." },
        { name: "Line detail", status: "ready", text: "Your existing chargeback page plugs in here: filters, row list and Excel download." }],
      panels: function () {
        return [panel("Charged back per month", RANGE + ", " + D.source.currency, columns(cb.months, [cb.monthly], { fmt: money, height: 190, labels: "ends", full: true })),
          panel("By competence centre", "Largest eight, then the rest", rows(topWithOther(cb.byCoe, 8), money)),
          panel("By function", "The part of the organization the work belongs to", rows(cb.byFunction, money)),
          panel("By type", "Internal staff, external staff and other (travel, licences)", rows(cb.byType, money))];
      },
      downloads: ["Rows as Excel", "This view as HTML", "Monthly summary as PowerPoint"] },
    { id: "operational-kpis", name: "Operational KPIs", door: "Operational KPIs", status: "need",
      icon: ["M3 12h4l2.5-6 4 12 2.5-6h5"],
      ask: "How well are we running the services we support?",
      card: function () {
        return [h("p", { cls: "ask", text: "No source connected yet. This is what the page is designed to show:" }),
          h("ul", { cls: "todo" }, ["Incidents by priority", "Resolved within SLA", "Time to restore", "Availability"].map(function (t) { return h("li", {}, [h("span", { text: t }), h("span", { text: "to come" })]); }))];
      },
      inside: [
        { name: "Incidents by priority", status: "need", text: "P1 to P4 opened and closed each month, by application." },
        { name: "Resolved within SLA", status: "need", text: "Share of tickets closed inside target, against the target line." },
        { name: "Time to restore", status: "need", text: "Mean time to restore service, by priority." },
        { name: "Availability", status: "need", text: "Uptime of the business-critical applications." },
        { name: "Change success", status: "need", text: "Changes delivered without incident or rollback." },
        { name: "Backlog and ageing", status: "need", text: "Open tickets and how long they have waited." }],
      downloads: ["Monthly KPI pack as PowerPoint", "Ticket extract as Excel"] },
    { id: "projects", name: "Projects", door: "Projects", status: "ready",
      icon: ["M4 4h6v16H4z", "M14 4h6v9h-6z"],
      ask: "What are we delivering, and what does each project cost?",
      card: function () {
        return [h("div", { cls: "figure" }, [h("b", { text: count(pr.count) }), h("span", { text: "projects charged, " + RANGE })]),
          rows(pr.top.slice(0, 3), money, "50%")];
      },
      inside: [
        { name: "Project list and spend", status: "ready", text: "All " + pr.count + " projects with amount, hours and people, from chargeback." },
        { name: "Status and RAG", status: "need", text: "Red, amber or green for each ongoing project, with the reason." },
        { name: "Milestones", status: "need", text: "Phase, next milestone and due date on a timeline." },
        { name: "Delivered per year", status: "need", text: "How many projects closed, by type and business unit." }],
      panels: function () { return [panel("Largest projects by amount charged", RANGE, rows(pr.top, money, "46%"))]; },
      downloads: ["Project list as Excel", "Portfolio status as PowerPoint"] },
    { id: "people", name: "People", door: "People", status: "ready",
      icon: ["M9 6a3 3 0 1 0 0 6a3 3 0 0 0 0-6", "M3 20a6 6 0 0 1 12 0", "M17 7.5a2.5 2.5 0 1 0 0 5", "M16.5 15a5 5 0 0 1 4.5 5"],
      ask: "How many are we, where, and in which teams?",
      card: function () {
        return [h("div", { cls: "figure" }, [h("b", { text: count(hcNow) }), h("span", { text: "people charged time in " + monYear(last) })]),
          split(hcLast[0], hcLast[1], "Internal", "External"),
          h("p", { cls: "ask", text: pp.byPlace.length + " locations. " + pp.byPlace[0][0].split(",")[0] + " is the largest with " + pp.byPlace[0][1] + "." })];
      },
      inside: [
        { name: "Headcount trend", status: "ready", text: "People charging time each month, internal and external." },
        { name: "By location", status: "ready", text: "How many people work from each hub." },
        { name: "By CoE", status: "ready", text: "Team sizes across the competence centres." },
        { name: "Skills and roles", status: "need", text: "What the team can do: roles, skills and certifications." },
        { name: "Joiners, leavers and open roles", status: "need", text: "Movement in and out, and positions being hired." }],
      panels: function () {
        var int = pp.headcount.map(function (x) { return x[0]; }), ext = pp.headcount.map(function (x) { return x[1]; });
        var chart = h("div", { style: "display:grid;gap:10px" }, [h("div", { cls: "legend" }, [h("span", {}, [h("i"), "Internal"]), h("span", {}, [h("i", { cls: "b2" }), "External"])]),
          columns(pp.months, [int, ext], { fmt: count, height: 190, labels: "ends", full: true, tip: function (i) { return ["Internal " + int[i], "External " + ext[i], "Total " + (int[i] + ext[i])]; } })]);
        return [panel("People charging time per month", RANGE + ". " + count(pp.total) + " different people over the period.", chart),
          panel("By location, " + monYear(last), "Where people who charged time are based", rows(pp.byPlace, count, "46%"))];
      },
      downloads: ["Headcount by month as Excel", "People summary as PowerPoint"] }
  ];
  function fact(n, label) { return h("li", {}, [h("b", { text: String(n) }), " " + label]); }
  function panel(title, cap, body) { return h("section", { cls: "panel" }, [h("h4", { text: title }), h("p", { cls: "cap", text: cap }), body]); }

  // ---- pages
  function header(sec) {
    var markBox = h("span", { cls: "mark-box" }); markBox.innerHTML = D.mark;       // the emblem ships inside this file's own data block
    var name = h("span", { cls: "name" }, (D.source.org || "Digital Technology Centers").split(" ").map(function (w) { return h("span", { text: w }); }));
    var title = h("h1", {}, sec ? ["Portal · ", h("span", { cls: "acc", text: sec.name })] : ["DTC ", h("span", { cls: "acc", text: "Portal" })]);
    return h("header", { cls: "brand" + (sec ? " inner" : "") }, [h("a", { cls: "lockup", href: "#home", "aria-label": "Portal home" }, [markBox, name]),
      h("span", { cls: "divider", "aria-hidden": "true" }),
      h("div", { cls: "titles" }, [title, h("div", { cls: "sub", text: "Figures to " + monYear(last) + " · prepared " + (D.source.generated || "") })])]);
  }
  function home() {
    var doors = h("nav", { cls: "doors", "aria-label": "Sections" });
    SECTIONS.forEach(function (s) {
      var to = { cls: "door" + (s.wide ? " wide" : ""), href: s.href || "#" + s.id };
      if (/^https?:/.test(to.href)) { to.target = "_blank"; to.rel = "noopener"; }     // a published page opens beside this one
      doors.appendChild(h("a", to, [
        h("div", { cls: "door-head" }, [h("span", { cls: "badge" }, [icon(s.icon)]), h("h2", { text: s.door }), pill(s.status)]),
        h("p", { cls: "ask", text: s.ask }),
        h("div", { cls: "door-body" }, s.card()),
        h("span", { cls: "go" }, ["Open " + s.name, icon(ARROW)])]));
    });
    return [h("p", { cls: "note", text: "Proposal mock. Cost, project and people figures are real, taken from the " + D.source.name + " extract (" + RANGE + "). Organization and Chargeback open working pages; sections marked Needs data are waiting for a source." }),
      h("p", { cls: "lead", text: "Everything about the Digital Technology Centers in one place: who we are, what we cost, how we run, what we deliver and who does the work. Pick a section to go a level deeper." }),
      doors,
      h("p", { cls: "foot", text: "People are counted as everyone who charged time in the month; nobody is named on this page. Leaders are counted from the leadership chart." })];
  }
  function section(s) {
    var out = [h("a", { cls: "back", href: "#home" }, [icon(BACK), "All sections"]),
      h("div", { cls: "sec-head" }, [h("span", { cls: "badge" }, [icon(s.icon)]), h("h2", { text: s.name }), pill(s.status)]),
      h("p", { cls: "sec-ask", text: s.ask })];
    if (s.panels) { out.push(h("h3", { text: "Preview from your data" })); out.push(h("div", { cls: "panels" }, s.panels())); }
    out.push(h("h3", { text: "What you can drill into" }));
    out.push(h("div", { cls: "inside" }, s.inside.map(function (it) {
      var kids = [h("div", { cls: "item-top" }, [h("b", { text: it.name }), pill(it.status)]), h("p", { text: it.text })];
      if (it.href) {
        kids.push(h("span", { cls: "open" }, ["Open", icon(ARROW)]));
        var ext = /^https?:/.test(it.href);
        return h("a", ext ? { cls: "item", href: it.href, target: "_blank", rel: "noopener" } : { cls: "item", href: it.href }, kids);
      }
      return h("div", { cls: "item" + (it.status === "need" ? " wait" : "") }, kids);
    })));
    out.push(h("h3", { text: "Downloads planned for this section" }));
    out.push(h("ul", { cls: "dl" }, s.downloads.map(function (d) { return h("li", {}, [icon(["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"]), d]); })));
    return out;
  }
  function render() {
    var id = (location.hash || "").replace(/^#/, ""), sec = SECTIONS.filter(function (s) { return s.id === id; })[0] || null;
    tip.hidden = true;
    app.textContent = "";
    app.appendChild(h("div", { cls: "wrap" }, [header(sec)].concat(sec ? section(sec) : home())));
    window.scrollTo(0, 0);
  }

  return { show: render };      // the shell calls show() on every route that belongs to this view
});
