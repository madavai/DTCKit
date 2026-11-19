// The leadership chart, with Edit mode and PowerPoint export. Mounted by the shell into its own shadow root.
PORTAL.view("leadership", function (root, ctx) {
  var BASE = ctx.data("lt-data");
  if (!BASE.people) { root.getElementById("app").textContent = "No data yet. Add data/leadership.json and run: python3 -m engine build"; return; }
  var D = JSON.parse(JSON.stringify(BASE));
  var HOSTED = !!(window.claude && window.claude.use);   // true inside a Claude artifact, false when opened as a file
  var DRAFT = "dtc-leadership-draft";
  var editing = false, slot = null, selected = null;
  var db = null, lastWrite = "", PH = {};

  root.getElementById("app").innerHTML =
    '<div class="wrap"><div class="top"><h1 id="title"></h1><div class="tools">' +
    '<span class="status" id="status"></span>' +
    '<button class="btn" id="undo" type="button" hidden>Undo</button>' +
    '<button class="btn primary" id="commit" type="button" hidden>Save</button>' +
    '<button class="btn" id="cancel" type="button" hidden>Cancel</button>' +
    '<button class="btn primary" id="edit" type="button" hidden>Edit</button>' +
    '<button class="btn" id="ppt" type="button" hidden>Download PowerPoint</button></div></div>' +
    '<div class="fit" id="fit"><div class="sizer" id="sizer"><div class="stage" id="stage"></div></div></div>' +
    '<section class="who" id="who" aria-live="polite"></section><p class="foot" id="foot"></p></div>';
  var stage = root.getElementById("stage"), who = root.getElementById("who"), statusEl = root.getElementById("status");
  var editBtn = root.getElementById("edit"), pptBtn = root.getElementById("ppt");
  var undoBtn = root.getElementById("undo"), commitBtn = root.getElementById("commit"), cancelBtn = root.getElementById("cancel");
  var before = "", cur = "", undoStack = [], canEdit = false;

  if (!HOSTED) {
    try { var dr = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (dr && dr.updated > (BASE.updated || "")) D = dr; } catch (e) {}
  }
  function defaults() {
    D.labels = D.labels || {};
    var L = D.labels;
    L.hubs = L.hubs || "DTC Hub Leaders"; L.cio = L.cio || "Regional CIO Relationship";
    L.rows = L.rows || ["Domain Leaders", "Digital Leaders", "Digital CoEs", "CoE Leaders"];
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function initials(name) {
    return String(name || "?").split(/\s+/).map(function (w) { return w[0] || ""; }).slice(0, 2).join("").toUpperCase();
  }
  function avatar(p) {
    var a = el("span", "av");
    if (p.photo) {
      var img = document.createElement("img");
      img.alt = ""; img.src = /^(data:|https?:|\/)/.test(p.photo) ? p.photo : "assets/people/" + p.photo;
      img.onerror = function () { a.textContent = initials(p.name); };
      a.appendChild(img);
    } else a.textContent = initials(p.name);
    return a;
  }
  // A text label. In edit mode it can be typed over; the new text is stored at o[k].
  function lab(tag, cls, o, k) {
    var e = el(tag, cls, o[k]);
    if (editing) {
      e.contentEditable = "true"; e.spellcheck = false;
      e.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); e.blur(); } if (ev.key === "Escape") { e.textContent = o[k]; e.blur(); } ev.stopPropagation(); });
      e.addEventListener("blur", function () { var v = e.textContent.replace(/\s+/g, " ").trim(); if (v !== o[k]) { o[k] = v; commit(); } });
    }
    return e;
  }
  // A person box. s = {o, k, roleK, list}: the person id lives at s.o[s.k]; s.list is the array the row can be removed from.
  function pill(s, opts) {
    opts = opts || {};
    var id = s.o[s.k];
    if (!id && !editing) return null;
    var p = D.people[id];
    var b = el("button", "p" + (opts.kind ? " " + opts.kind : "") + (opts.left ? " left" : "") + (p ? "" : " empty"));
    b.type = "button";
    if (p) {
      b.dataset.person = id;
      var n = el("span", "n", p.name);
      if (s.roleK && s.o[s.roleK]) n.appendChild(el("small", "", s.o[s.roleK]));
      b.appendChild(n); b.appendChild(avatar(p));
    } else b.textContent = "Empty";
    if (editing && slot && slot.o === s.o && slot.k === s.k) b.classList.add("sel");
    b.addEventListener("click", function () {
      if (editing) { slot = s; render(); who.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else select(selected === id ? null : id);
    });
    return b;
  }
  function put(parent, node) { if (node) parent.appendChild(node); return node; }
  var FLAGS = {
    IN: '<rect width="24" height="5" fill="#f93"/><rect y="5" width="24" height="5" fill="#fff"/><rect y="10" width="24" height="5" fill="#128807"/><circle cx="12" cy="7.5" r="1.8" fill="none" stroke="#008" stroke-width=".7"/>',
    ES: '<rect width="24" height="15" fill="#c60b1e"/><rect y="3.75" width="24" height="7.5" fill="#ffc400"/>',
    US: '<rect width="24" height="15" fill="#fff"/><g fill="#b22234"><rect width="24" height="1.2"/><rect y="2.3" width="24" height="1.2"/><rect y="4.6" width="24" height="1.2"/><rect y="6.9" width="24" height="1.2"/><rect y="9.2" width="24" height="1.2"/><rect y="11.5" width="24" height="1.2"/><rect y="13.8" width="24" height="1.2"/></g><rect width="10.5" height="8.1" fill="#3c3b6e"/>',
    MX: '<rect width="8" height="15" fill="#006847"/><rect x="8" width="8" height="15" fill="#fff"/><rect x="16" width="8" height="15" fill="#ce1126"/><circle cx="12" cy="7.5" r="1.6" fill="#a67c52"/>',
    FR: '<rect width="8" height="15" fill="#0055a4"/><rect x="8" width="8" height="15" fill="#fff"/><rect x="16" width="8" height="15" fill="#ef4135"/>',
    CA: '<rect width="24" height="15" fill="#fff"/><rect width="6" height="15" fill="#d52b1e"/><rect x="18" width="6" height="15" fill="#d52b1e"/><rect x="10" y="4.5" width="4" height="6" fill="#d52b1e"/>',
    CN: '<rect width="24" height="15" fill="#de2910"/><circle cx="5" cy="4.5" r="2.2" fill="#ffde00"/>',
    PH: '<rect width="24" height="7.5" fill="#0038a8"/><rect y="7.5" width="24" height="7.5" fill="#ce1126"/><path d="M0 0 L10 7.5 L0 15 Z" fill="#fff"/>',
    DE: '<rect width="24" height="5" fill="#000"/><rect y="5" width="24" height="5" fill="#d00"/><rect y="10" width="24" height="5" fill="#ffce00"/>',
    GB: '<rect width="24" height="15" fill="#012169"/><path d="M0 0 L24 15 M24 0 L0 15" stroke="#fff" stroke-width="3"/><path d="M12 0 V15 M0 7.5 H24" stroke="#fff" stroke-width="5"/><path d="M12 0 V15 M0 7.5 H24" stroke="#c8102e" stroke-width="3"/>'
  };
  var COUNTRY = { IN: "India", US: "United States", MX: "Mexico", ES: "Spain", FR: "France", CA: "Canada", CN: "China", PH: "Philippines", DE: "Germany", GB: "United Kingdom" };
  function flag(id) {
    var c = (D.people[id] || {}).country;
    if (!c || !FLAGS[c]) return null;
    var f = el("span", "flag"); f.title = COUNTRY[c] || c;
    f.innerHTML = '<svg viewBox="0 0 24 15" role="img" aria-label="' + (COUNTRY[c] || c) + '">' + FLAGS[c] + "</svg>";
    return f;
  }
  function cell(row, col, span, cls) {
    var c = el("div", "cell" + (cls ? " " + cls : ""));
    if (row) c.style.gridRow = row;
    c.style.gridColumn = (col ? col + " / " : "") + "span " + span;
    return c;
  }
  function addBtn(text, fn) {
    var b = el("button", "add", text); b.type = "button";
    b.addEventListener("click", function () { fn(); commit(); });
    return b;
  }

  function render() {
    defaults();
    var L = D.labels;
    stage.textContent = "";
    stage.classList.toggle("editing", editing);
    var h1 = root.getElementById("title"); h1.textContent = ""; h1.appendChild(lab("span", "", D, "title"));
    var foot = root.getElementById("foot"); foot.textContent = "";
    if (D.footer || editing) { if (!D.footer) D.footer = ""; foot.appendChild(lab("span", "", D, "footer")); }

    // ---- top: hubs, head, CIO relationship
    var crown = el("div", "crown");
    var hubs = el("div", "box hubs");
    D.hubLeaders.forEach(function (h) { hubs.appendChild(lab("span", "chip", h, "hub")); hubs.appendChild(pill({ o: h, k: "person", list: D.hubLeaders }) || el("span")); });
    if (editing) { var a1 = addBtn("+ Add hub", function () { D.hubLeaders.push({ hub: "New hub", person: "" }); }); a1.style.gridColumn = "1 / -1"; hubs.appendChild(a1); }
    hubs.appendChild(lab("span", "tab", L, "hubs"));
    var head = el("div", "head");
    put(head, pill({ o: D.head, k: "person", roleK: "role" }, { kind: "chief" }));
    var staff = el("div", "staff");
    D.staff.forEach(function (s, i) { put(staff, pill({ o: s, k: "person", roleK: "role", list: D.staff }, { left: i % 2 === 1 })); });
    if (editing) staff.appendChild(addBtn("+", function () { D.staff.push({ person: "", role: "Role" }); }));
    head.appendChild(staff);
    var cio = el("div", "box cio");
    D.cioRelationship.forEach(function (r) { cio.appendChild(pill({ o: r, k: "person", list: D.cioRelationship }, { left: true }) || el("span")); cio.appendChild(lab("span", "chip", r, "region")); });
    if (editing) { var a2 = addBtn("+ Add region", function () { D.cioRelationship.push({ region: "New region", person: "" }); }); a2.style.gridColumn = "1 / -1"; cio.appendChild(a2); }
    cio.appendChild(lab("span", "tab", L, "cio"));
    crown.appendChild(hubs); crown.appendChild(head); crown.appendChild(cio);
    stage.appendChild(crown);

    // ---- matrix
    var m = el("div", "matrix");
    var band = el("div", "band"); band.appendChild(lab("span", "tag", D, "pairLabel")); m.appendChild(band);
    ["rl domain arrow", "rl fill arrow", "rl fill r3", "rl line"].forEach(function (cls, i) {
      var l = lab("div", cls, L.rows, i); l.style.gridRow = i + 1; if (i === 1) l.style.setProperty("--arrow", "22px"); m.appendChild(l);
    });
    function row(items, rowNo, kind) {
      var col = 2;
      items.forEach(function (it) {
        var span = it.span || 1, b = pill({ o: it, k: "person" }, { kind: kind });
        if (b) { var c = cell(rowNo, col, span); c.appendChild(b); m.appendChild(c); }
        col += span;
      });
    }
    row(D.domainLeaders, 1, "domain");
    row(D.digitalLeaders, 2, "digital");
    var col = 2;
    D.coes.forEach(function (c) {
      var span = c.span || 1;
      var h = cell(3, col, span, "r3"); h.appendChild(lab("div", "coe", c, "name")); m.appendChild(h);
      var l = cell(4, col, span, "lead" + (span > 1 ? " lead-erp" : ""));
      put(l, pill({ o: c, k: "leader" })); put(l, flag(c.leader));
      m.appendChild(l);
      col += span;
    });
    m.appendChild(el("div", "dash erp"));
    var eg = el("div", "erpgrid r5");
    D.erpCoes.forEach(function (c) {
      var w = el("div", "cell"); w.appendChild(lab("div", "coe", c, "name"));
      put(w, pill({ o: c, k: "leader", list: D.erpCoes })); put(w, flag(c.leader));
      eg.appendChild(w);
    });
    if (editing) eg.appendChild(addBtn("+ Add ERP team", function () { D.erpCoes.push({ name: "New team", leader: "" }); }));
    m.appendChild(eg);
    var pd = el("div", "dash plat"); m.appendChild(pd);
    var pg = el("div", "platgrid r5");
    var ptag = lab("span", "tag ptag", D, "platformLabel"); pg.appendChild(ptag);
    D.platformCoes.forEach(function (g) { g.names.forEach(function (n, i) { pg.appendChild(lab("div", "coe", g.names, i)); }); });
    D.platformCoes.forEach(function (g) { var c = cell(0, 0, g.names.length, "lead"); put(c, pill({ o: g, k: "leader" })); put(c, flag(g.leader)); pg.appendChild(c); });
    m.appendChild(pg);
    stage.appendChild(m);

    // keep all text inside its tile: shrink long names and labels a little before ever breaking a word or spilling out
    Array.prototype.forEach.call(stage.querySelectorAll(".p:not(.chief) .n"), function (n) {
      n.classList.add("tight");
      var fs = 12.5, tall = n.closest(".matrix") ? 38 : 40;
      function over() { return n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > tall + 1; }
      while (over() && fs > 9.5) { fs -= 0.5; n.style.fontSize = fs + "px"; }
      if (n.scrollWidth > n.clientWidth + 1) n.classList.remove("tight");
    });
    Array.prototype.forEach.call(stage.querySelectorAll(".rl, .chip, .tab"), function (c) {
      var fs = 12.5;
      var isRow = c.classList.contains("rl");   // a row label's arrow hangs below it, so only its width is checked
      while (((!isRow && c.scrollHeight > c.clientHeight + 1) || c.scrollWidth > c.clientWidth + 1) && fs > 9) { fs -= 0.5; c.style.fontSize = fs + "px"; }
    });
    Array.prototype.forEach.call(stage.querySelectorAll(".matrix .coe"), function (c) {
      var fs = 12.5;
      while ((c.scrollHeight > c.clientHeight + 0.5 || c.scrollWidth > c.clientWidth + 0.5) && fs > 9) { fs -= 0.5; c.style.fontSize = fs + "px"; }
    });
    editBtn.hidden = editing || !canEdit;
    undoBtn.hidden = commitBtn.hidden = cancelBtn.hidden = !editing;
    undoBtn.disabled = !undoStack.length; commitBtn.disabled = !undoStack.length;
    pptBtn.hidden = editing;
    if (editing) panelEdit(); else select(selected && D.people[selected] ? selected : null);
    layout();
  }

  // ---- roles a person holds, read from the same data
  function rolesOf(id) {
    var out = [];
    if (D.head.person === id) out.push(["", D.head.role]);
    D.staff.forEach(function (s) { if (s.person === id) out.push(["", s.role]); });
    D.hubLeaders.forEach(function (h) { if (h.person === id) out.push(["Hub leader", h.hub]); });
    D.cioRelationship.forEach(function (r) { if (r.person === id) out.push(["Regional CIO relationship", r.region]); });
    function covered(items) {
      var names = [], i = 0;
      items.forEach(function (it) {
        var span = it.span || 1, n = [], c = 0;
        D.coes.forEach(function (coe) { var s = coe.span || 1; if (c >= i && c < i + span) n.push(coe.name); c += s; });
        if (it.person === id) names = names.concat(n);
        i += span;
      });
      return names;
    }
    var dom = covered(D.domainLeaders); if (dom.length) out.push(["Domain leader", dom.join(", ")]);
    var dig = covered(D.digitalLeaders); if (dig.length) out.push(["Digital leader", dig.join(", ")]);
    var lead = D.coes.filter(function (c) { return c.leader === id; }).map(function (c) { return c.name; })
      .concat(D.erpCoes.filter(function (c) { return c.leader === id; }).map(function (c) { return c.name; }));
    D.platformCoes.forEach(function (g) { if (g.leader === id) lead = lead.concat(g.names); });
    if (lead.length) out.push(["CoE leader", lead.join(", ")]);
    return out;
  }
  function select(id) {
    selected = id;
    stage.classList.toggle("focus", !!id);
    Array.prototype.forEach.call(stage.querySelectorAll(".p"), function (b) {
      var on = !!id && b.dataset.person === id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    who.textContent = "";
    if (!id) { who.appendChild(el("p", "muted", "Select anyone on the chart to highlight every place they appear and list the roles they hold.")); return; }
    var p = D.people[id], idb = el("div", "id");
    idb.appendChild(avatar(p));
    var t = el("div"); t.appendChild(el("h2", "", p.name));
    if (p.country && COUNTRY[p.country]) t.appendChild(el("p", "muted", COUNTRY[p.country]));
    idb.appendChild(t); who.appendChild(idb);
    var ul = el("ul", "roles");
    rolesOf(id).forEach(function (r) {
      var li = el("li");
      if (r[0]) { li.appendChild(el("b", "", r[0])); li.appendChild(document.createTextNode(" · " + r[1])); }
      else li.appendChild(el("b", "", r[1]));
      ul.appendChild(li);
    });
    who.appendChild(ul);
    var x = el("button", "btn", "Clear"); x.type = "button"; x.addEventListener("click", function () { select(null); });
    who.appendChild(x);
  }

  // ---- edit panel
  function field(label, control) { var f = el("label", "f", label); f.appendChild(control); return f; }
  function input(value, fn) {
    var i = el("input"); i.type = "text"; i.value = value || "";
    i.addEventListener("change", function () { fn(i.value.trim()); commit(); });
    i.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { i.value = value || ""; i.blur(); ev.stopPropagation(); } });
    return i;
  }
  function panelEdit() {
    who.textContent = "";
    stage.classList.remove("focus");
    if (!slot) {
      who.appendChild(el("p", "muted", "Editing. Click a person's box to change who is in it or update their name, country and photo. Click any label to rename it. " +
        "Nothing is saved until you press Save. Undo steps back one change; Escape or Cancel discards everything since you pressed Edit."));
      return;
    }
    var s = slot, id = s.o[s.k], p = D.people[id], form = el("div", "form");
    var sel = el("select");
    [["", "— Empty —"]].concat(Object.keys(D.people).map(function (k) { return [k, D.people[k].name]; })
      .sort(function (a, b) { return a[1].localeCompare(b[1]); })).concat([["+", "+ New person…"]])
      .forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (o[0] === (id || "")) op.selected = true; sel.appendChild(op); });
    sel.addEventListener("change", function () {
      var v = sel.value;
      if (v === "+") { v = "p" + Date.now().toString(36); D.people[v] = { name: "New person" }; }
      s.o[s.k] = v; commit();
    });
    form.appendChild(field("Person in this box", sel));
    if (s.roleK) form.appendChild(field("Title shown in this box", input(s.o[s.roleK], function (v) { s.o[s.roleK] = v; })));
    if (p) {
      form.appendChild(field("Name", input(p.name, function (v) { p.name = v || p.name; })));
      var cs = el("select");
      [["", "No flag"]].concat(Object.keys(COUNTRY).map(function (k) { return [k, COUNTRY[k]]; }))
        .forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (o[0] === (p.country || "")) op.selected = true; cs.appendChild(op); });
      cs.addEventListener("change", function () { p.country = cs.value; commit(); });
      form.appendChild(field("Country", cs));
      var fi = el("input"); fi.type = "file"; fi.accept = "image/*";
      fi.addEventListener("change", function () {
        var f = fi.files && fi.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var im = new Image();
          im.onload = function () {
            var c = document.createElement("canvas"), sz = Math.min(im.width, im.height); c.width = c.height = 192;
            c.getContext("2d").drawImage(im, (im.width - sz) / 2, Math.max(0, (im.height - sz) / 4), sz, sz, 0, 0, 192, 192);
            p.photo = c.toDataURL("image/jpeg", 0.85); commit();
          };
          im.src = r.result;
        };
        r.readAsDataURL(f);
      });
      form.appendChild(field("Photo (any image; it is cropped to a square)", fi));
    }
    who.appendChild(form);
    var acts = el("div", "acts");
    if (p) acts.appendChild(el("span", "muted", "Name, country and photo change everywhere this person appears."));
    if (p && p.photo) { var rp = el("button", "btn", "Remove photo"); rp.type = "button"; rp.addEventListener("click", function () { p.photo = ""; commit(); }); acts.appendChild(rp); }
    if (s.list) { var rm = el("button", "btn", "Remove this row"); rm.type = "button"; rm.addEventListener("click", function () { s.list.splice(s.list.indexOf(s.o), 1); slot = null; commit(); }); acts.appendChild(rm); }
    var cl = el("button", "btn", "Close"); cl.type = "button"; cl.addEventListener("click", function () { slot = null; render(); }); acts.appendChild(cl);
    who.appendChild(acts);
  }

  // ---- saving
  function status(t) { statusEl.textContent = t; }
  // Every change stays a draft: commit() records it for Undo, and only Save writes it anywhere.
  function commit() {
    undoStack.push(cur); cur = JSON.stringify(D);
    render(); status("Unsaved changes");
  }
  function startEdit() { before = cur = JSON.stringify(D); undoStack = []; editing = true; slot = null; selected = null; status(""); render(); }
  function undo() {
    if (!editing || !undoStack.length) return;
    cur = undoStack.pop(); D = JSON.parse(cur); slot = null; render();
    status(undoStack.length ? "Unsaved changes" : "");
  }
  function cancelEdit() {
    if (!editing) return;
    D = JSON.parse(before); undoStack = []; editing = false; slot = null; render(); status("Changes discarded");
  }
  function saveEdit() {
    if (!editing || !undoStack.length) return;
    var old = JSON.parse(before).people;
    D.updated = new Date().toISOString();
    undoStack = []; editing = false; slot = null; render();
    if (!HOSTED) {
      try { localStorage.setItem(DRAFT, JSON.stringify(D)); status("Saved in this browser. Download HTML to share it."); }
      catch (e) { status("Could not save here. Download HTML to keep your changes."); }
      return;
    }
    status("Saving…");
    var copy = JSON.parse(JSON.stringify(D)), jobs = [];
    Object.keys(copy.people).forEach(function (k) {
      var ph = copy.people[k].photo || "";
      if (ph !== ((old[k] || {}).photo || "")) { PH[k] = ph; jobs.push(db.doc("photos/" + k).set({ src: ph })); }
      delete copy.people[k].photo;
    });
    lastWrite = copy.updated;
    jobs.push(db.doc("leadership/current").set({ json: JSON.stringify(copy), updated: copy.updated }));
    Promise.all(jobs).then(function () { status("Saved for everyone"); }, function () { status("Could not save. You may not have edit access."); });
  }
  function photoFor(id) { return PH[id] !== undefined ? PH[id] : ((BASE.people[id] || {}).photo || ""); }
  if (HOSTED) {
    window.claude.use("db").then(function (d) {
      if (!d) return;
      db = d;
      d.doc("leadership/current").onSnapshot(function (s) {
        if (!s.exists) return;
        var v = s.data();
        if (editing || v.updated === lastWrite || !(v.updated > (D.updated || ""))) return;
        try { var nd = JSON.parse(v.json); } catch (e) { return; }
        Object.keys(nd.people).forEach(function (k) { nd.people[k].photo = photoFor(k); });
        D = nd; slot = null; render();
      }, function () {});
      d.collection("photos").onSnapshot(function (q) {
        var changed = false;
        q.docs.forEach(function (doc) {
          var src = String((doc.data() || {}).src || "");
          if (src && !/^data:image\//.test(src)) return;
          PH[doc.id] = src;
          if (!editing && D.people[doc.id] && D.people[doc.id].photo !== src) { D.people[doc.id].photo = src; changed = true; }
        });
        if (changed) render();
      }, function () {});
      return window.claude.use("user");
    }).then(function (u) { return u ? u.canEdit() : false; }).then(function (ok) { if (ok && db) { canEdit = true; render(); } }, function () {});
  } else { canEdit = true; }

  editBtn.addEventListener("click", startEdit);
  undoBtn.addEventListener("click", undo);
  commitBtn.addEventListener("click", saveEdit);
  cancelBtn.addEventListener("click", cancelEdit);

  // "Download HTML" in the top bar saves the whole portal; it asks this view for the chart as last saved.
  ctx.provide("lt-data", function () { return editing ? JSON.parse(before) : D; });

  document.addEventListener("keydown", function (e) {
    if (!ctx.active()) return;                                   // another page of the portal is showing
    var t = (e.composedPath && e.composedPath()[0]) || e.target;  // the real target, inside this view's shadow root
    if (e.key === "Escape") { if (editing) cancelEdit(); else select(null); }
    else if (editing && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); undo(); }
  });

  // ---- the chart as one PowerPoint slide: every box is a real, editable shape placed where it sits on screen
  var PPTX_LIB = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
  function loadPptx() {
    return new Promise(function (ok, no) {
      if (window.PptxGenJS) return ok();
      var s = document.createElement("script"); s.src = PPTX_LIB; s.onload = function () { ok(); }; s.onerror = no;
      document.head.appendChild(s);
    });
  }
  function flagPng(code) {
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { var c = document.createElement("canvas"); c.width = 96; c.height = 60; c.getContext("2d").drawImage(im, 0, 0, 96, 60); try { ok(c.toDataURL("image/png")); } catch (e) { ok(null); } };
      im.onerror = function () { ok(null); };
      im.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 15" width="96" height="60">' + FLAGS[code] + "</svg>");
    });
  }
  function makeSlide() {
    var C = { green: "3DCD58", greenLine: "3DCD58", greenInk: "3DCD58", onGreen: "FFFFFF", blue: "42B4E6", ink: "26221A", muted: "6D665A", band: "F0F0ED", line: "C9C6BF", white: "FFFFFF" };
    var pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";                      // 13.33 x 7.5 in
    pptx.title = D.title;
    var slide = pptx.addSlide();
    slide.background = { color: C.white };
    var sr = stage.getBoundingClientRect(), sc = sr.width / stage.offsetWidth;
    var W = stage.offsetWidth, H = stage.offsetHeight;
    var k = Math.min(12.93 / W, 6.3 / H), ox = (13.33 - W * k) / 2, oy = 0.78;
    function box(e) { var r = e.getBoundingClientRect(); return { x: ox + (r.left - sr.left) / sc * k, y: oy + (r.top - sr.top) / sc * k, w: r.width / sc * k, h: r.height / sc * k }; }
    function pt(e) { return Math.max(5, parseFloat(getComputedStyle(e).fontSize) * k * 72); }
    function all(q) { return Array.prototype.slice.call(stage.querySelectorAll(q)); }
    function shape(e, kind, o) { var b = box(e); o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h; slide.addShape(kind, o); return b; }
    function label(e, fill, color, lineColor, radius) {
      var b = box(e);
      slide.addText(e.textContent, { shape: radius === 0 ? pptx.ShapeType.rect : pptx.ShapeType.roundRect, rectRadius: radius == null ? b.h / 2 : radius, x: b.x, y: b.y, w: b.w, h: b.h,
        fill: { color: fill }, line: lineColor ? { color: lineColor, width: 1 } : { type: "none" }, color: color, bold: true, fontSize: pt(e), fontFace: "Arial",
        align: "center", valign: "middle", margin: 2, fit: "shrink" });
    }
    slide.addText(D.title, { x: 0.35, y: 0.12, w: 12.6, h: 0.55, fontSize: 26, color: C.green, fontFace: "Arial" });
    if (D.footer) slide.addText(D.footer, { x: 0.35, y: 7.18, w: 6, h: 0.22, fontSize: 8, color: C.muted, fontFace: "Arial" });

    all(".box").forEach(function (e) { shape(e, pptx.ShapeType.roundRect, { rectRadius: 0.08, fill: { color: C.white }, line: { color: C.greenLine, width: 1 } }); });
    all(".band").forEach(function (e) { shape(e, pptx.ShapeType.rect, { fill: { color: C.band }, line: { color: C.line, width: 0.75 } }); });
    all(".dash").forEach(function (e) { shape(e, pptx.ShapeType.roundRect, { rectRadius: 0.08, fill: { type: "none" }, line: { color: C.greenLine, width: 1, dashType: "sysDot" } }); });
    var rl = all(".rl");
    rl.forEach(function (e) {
      if (e.classList.contains("domain")) label(e, C.blue, C.white);
      else if (e.classList.contains("line")) label(e, C.white, C.ink, C.greenLine);
      else label(e, C.green, C.onGreen);
    });
    all(".coe").forEach(function (e) { label(e, C.green, C.onGreen, null, 0.03); });
    all(".chip").forEach(function (e) { label(e, C.green, C.onGreen); });

    var jobs = [];
    all(".p").forEach(function (e) {
      if (!e.dataset.person) return;
      var p = D.people[e.dataset.person], b = box(e), cls = e.classList;
      var fill = cls.contains("domain") ? C.blue : cls.contains("digital") ? C.green : C.white;
      var ink = cls.contains("domain") ? C.white : cls.contains("digital") ? C.onGreen : C.greenInk;
      slide.addShape(pptx.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, rectRadius: b.h / 2, fill: { color: fill },
        line: fill === C.white ? { color: C.greenLine, width: cls.contains("chief") ? 1.5 : 1 } : { type: "none" } });
      var n = e.querySelector(".n"), nb = box(n), small = n.querySelector("small"), size = pt(n) * (cls.contains("chief") ? 1 : 0.88);
      var runs = [{ text: p.name, options: { bold: true, fontSize: size, color: cls.contains("chief") ? C.greenInk : ink, breakLine: !!small } }];
      if (small) runs.push({ text: small.textContent, options: { fontSize: pt(small), color: C.muted, bold: cls.contains("chief") } });
      slide.addText(runs, { x: nb.x, y: b.y, w: nb.w, h: b.h, margin: 0, fontFace: "Arial", valign: "middle", fit: "shrink",
        align: cls.contains("chief") ? "center" : cls.contains("left") ? "right" : "left" });
      var av = e.querySelector(".av"), ab = box(av);
      slide.addShape(pptx.ShapeType.ellipse, { x: ab.x - 0.012, y: ab.y - 0.012, w: ab.w + 0.024, h: ab.h + 0.024, fill: { color: C.white }, line: { color: C.line, width: 0.5 } });
      if (p.photo && /^data:image\//.test(p.photo)) slide.addImage({ data: p.photo, x: ab.x, y: ab.y, w: ab.w, h: ab.h, rounding: true });
      else slide.addText(initials(p.name), { shape: pptx.ShapeType.ellipse, x: ab.x, y: ab.y, w: ab.w, h: ab.h, fill: { color: C.band }, color: C.muted, bold: true, fontSize: Math.max(5, size * 0.9), align: "center", valign: "middle", margin: 0, fontFace: "Arial" });
    });
    var codes = {};
    Object.keys(D.people).forEach(function (id) { var c = D.people[id].country; if (c && FLAGS[c]) codes[c] = null; });
    Object.keys(codes).forEach(function (c) { jobs.push(flagPng(c).then(function (png) { codes[c] = png; })); });
    return Promise.all(jobs).then(function () {
      all(".flag").forEach(function (e) {
        var c = Object.keys(COUNTRY).filter(function (x) { return COUNTRY[x] === e.title; })[0], b = box(e);
        if (codes[c]) slide.addImage({ data: codes[c], x: b.x, y: b.y, w: b.w, h: b.h });
      });
      all(".tab").forEach(function (e) { label(e, C.white, C.ink, C.greenLine); });
      all(".band .tag").forEach(function (e) { label(e, C.white, C.muted, C.line); });
      all(".ptag").forEach(function (e) { label(e, C.green, C.onGreen); });
      return pptx.write({ outputType: "blob" });
    });
  }
  pptBtn.addEventListener("click", function () {
    selected = null; render();
    status("Building the slide…"); pptBtn.disabled = true;
    loadPptx().then(makeSlide).then(function (blob) {
      var name = "dtc-leadership.pptx";
      return ctx.offer(name, blob, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    }).then(function () { status("PowerPoint downloaded"); }, function (e) {
      status(window.PptxGenJS ? (e && e.code ? "" : "Could not build the slide") : "PowerPoint export needs an internet connection");
    }).then(function () { pptBtn.disabled = false; });
  });

  // ---- fit the 1500px drawing to the window, like a slide
  var fit = root.getElementById("fit"), sizer = root.getElementById("sizer");
  function layout() {
    var s = Math.max(0.55, Math.min(1, fit.clientWidth / 1500));
    stage.style.transform = "scale(" + s + ")";
    sizer.style.width = Math.round(1500 * s) + "px";
    sizer.style.height = Math.ceil(stage.offsetHeight * s) + "px";
  }
  window.addEventListener("resize", layout);
  window.addEventListener("load", layout);

  render();
  return { show: render };      // drawn again when shown: sizes can only be measured while visible
});
