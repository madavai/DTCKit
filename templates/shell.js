// The shell: the bar on top and the router underneath. It never leaves this page: every view is part of this
// one file, and moving between them only changes the #name at the end of the address.
(function () {
  var HOSTED = !!(window.claude && window.claude.use);          // inside a Claude artifact
  var downloadsReady = HOSTED ? window.claude.use("downloads").catch(function () { return null; }) : Promise.resolve(null);
  var NS = "http://www.w3.org/2000/svg";
  var VIEWS = { home: "css-portal", chargeback: "css-portal", leadership: "css-leadership" };
  // Where each address lives, and the trail shown in the bar. Anything not listed belongs to the front page.
  var ROUTES = {
    home: { view: "home", trail: [] },
    organization: { view: "home", trail: [["organization", "Organization"]] },
    leadership: { view: "leadership", trail: [["organization", "Organization"], ["leadership", "Leadership team"]] },
    chargeback: { view: "chargeback", trail: [["chargeback", "Chargeback"]] },
    "operational-kpis": { view: "home", trail: [["operational-kpis", "Operational KPIs"]] },
    projects: { view: "home", trail: [["projects", "Projects"]] },
    people: { view: "home", trail: [["people", "People"]] }
  };
  var hosts = {}, mounted = {}, providers = {}, current = null;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    for (k in attrs || {}) { if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function icon(paths) {
    var s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) { var p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.appendChild(p); });
    return s;
  }

  // ---- the bar
  var back = el("button", { class: "ib", type: "button", id: "nav-back", "aria-label": "Back", title: "Back" }, [icon(["M19 12H5", "M11 6l-6 6 6 6"])]);
  var fwd = el("button", { class: "ib", type: "button", id: "nav-forward", "aria-label": "Forward", title: "Forward" }, [icon(["M5 12h14", "M13 6l6 6-6 6"])]);
  var crumbs = el("ol", { class: "crumbs" });
  var note = el("span", { class: "note", id: "shell-note", "aria-live": "polite" });
  var save = el("button", { class: "tb", type: "button", id: "portal-save", title: "Download this portal as one HTML file" }, [icon(["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"]), el("span", { text: "Download HTML" })]);
  var theme = el("button", { class: "tb", type: "button", id: "portal-theme", title: "Switch light and dark" }, [icon(["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"]), el("span", { text: "Switch theme" })]);
  var main = el("main", { id: "hosts" });
  var shell = document.getElementById("shell");
  shell.appendChild(el("div", { class: "bar" }, [el("div", { class: "bar-in" }, [el("div", { class: "nav" }, [back, fwd]),
    el("nav", { "aria-label": "Where you are" }, [crumbs]), el("div", { class: "tools" }, [note, save, theme])])]));
  shell.querySelector("nav[aria-label]").style.cssText = "flex:1 1 220px;min-width:0";
  shell.appendChild(main);
  function say(text) { note.textContent = text || ""; if (text) setTimeout(function () { if (note.textContent === text) note.textContent = ""; }, 4000); }

  // ---- what views get from the shell
  function context(name) {
    return {
      data: function (id) { return JSON.parse(document.getElementById(id).textContent); },
      offer: offer,
      provide: function (id, fn) { providers[id] = fn; },
      active: function () { return current === name; }
    };
  }
  // Hand the viewer a file. Inside Claude it goes through the save prompt; opened as a file it is a normal download.
  function offer(filename, data, type) {
    return downloadsReady.then(function (d) {
      if (d) return d.save({ filename: filename, data: data });
      if (HOSTED) { say("Downloads are not available in this view."); throw { code: "unavailable" }; }
      var a = document.createElement("a"); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type })); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  // ---- views: each gets a shadow root, so its styles and ids cannot collide with another view's
  function host(name) {
    if (hosts[name]) return hosts[name];
    var h = el("div", { class: "host", "data-view": name });
    var root = h.attachShadow({ mode: "open" });
    var st = document.createElement("style"); st.textContent = document.getElementById(VIEWS[name]).textContent; root.appendChild(st);
    root.appendChild(el("div", { id: "app" }));
    main.appendChild(h); hosts[name] = h; mirrorTheme();
    return h;
  }
  function show(name) {
    Object.keys(VIEWS).forEach(function (v) { if (hosts[v]) hosts[v].hidden = v !== name; });
    var h = host(name); h.hidden = false; current = name;
    if (!(name in mounted)) mounted[name] = (PORTAL.views[name] ? PORTAL.views[name](h.shadowRoot, context(name)) : null) || {};
    if (mounted[name].show) mounted[name].show();
  }

  // ---- history: our own trail of visited addresses, so Back and Forward work the same everywhere
  function here() { var h = (location.hash || "").replace(/^#/, ""); return ROUTES[h] ? h : "home"; }
  var trail = [here()], at = 0, stepping = 0, clicked = 0;
  document.addEventListener("click", function (e) {            // a link inside any view starts a new step
    var path = e.composedPath ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i++) {
      if (path[i].tagName === "A" && (path[i].getAttribute("href") || "").charAt(0) === "#") { clicked = Date.now(); break; }
    }
  }, true);
  function route() {
    var h = here();
    if (stepping) { at += stepping; stepping = 0; }
    else if (h !== trail[at]) {
      var fresh = Date.now() - clicked < 800;
      if (!fresh && at > 0 && trail[at - 1] === h) at--;                        // the browser's own Back
      else if (!fresh && at < trail.length - 1 && trail[at + 1] === h) at++;    // the browser's own Forward
      else { trail = trail.slice(0, at + 1); trail.push(h); at = trail.length - 1; }
    }
    clicked = 0;
    back.disabled = at === 0; fwd.disabled = at >= trail.length - 1;
    var r = ROUTES[h];
    crumbs.textContent = "";
    [["home", "Portal"]].concat(r.trail).forEach(function (c, i, all) {
      var last = i === all.length - 1;
      crumbs.appendChild(el("li", {}, [last ? el("span", { "aria-current": "page", text: c[1] }) : el("a", { href: "#" + c[0], text: c[1] })]));
    });
    document.title = r.trail.length ? r.trail[r.trail.length - 1][1] + " · DTC Portal" : "DTC Portal";
    show(r.view);
    window.scrollTo(0, 0);
  }
  function step(by) {
    var to = trail[at + by]; if (to == null) return;
    stepping = by; location.hash = to;
  }
  back.addEventListener("click", function () { step(-1); });
  fwd.addEventListener("click", function () { step(1); });
  document.addEventListener("keydown", function (e) {
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); step(1); }
  });
  window.addEventListener("hashchange", route);

  // ---- theme: one switch for every view
  var doc = document.documentElement;
  function mirrorTheme() {
    Object.keys(hosts).forEach(function (v) { if (doc.dataset.theme) hosts[v].dataset.theme = doc.dataset.theme; else delete hosts[v].dataset.theme; });
  }
  try { var saved = localStorage.getItem("portal-theme"); if (saved && !doc.dataset.theme) doc.dataset.theme = saved; } catch (e) {}
  theme.addEventListener("click", function () {
    var dark = doc.dataset.theme ? doc.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    doc.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("portal-theme", doc.dataset.theme); } catch (e) {}
  });
  new MutationObserver(mirrorTheme).observe(doc, { attributes: true, attributeFilter: ["data-theme"] });

  // ---- the whole portal as one file, with any saved edits inside
  function portalHtml() {
    var out = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<!--page-->\n' +
      '<title>DTC Portal</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style id="shell-style">' + document.getElementById("shell-style").textContent +
      '</style>\n<!--/page-->\n</head>\n<body>\n<!--page-->\n<div id="shell"></div>\n';
    Array.prototype.forEach.call(document.querySelectorAll("script[data-part]"), function (s) {
      var type = s.getAttribute("type"), text = s.textContent;
      if (providers[s.id]) text = JSON.stringify(providers[s.id]()).replace(/</g, "\\u003c");
      out += '<script' + (type ? ' type="' + type + '"' : '') + ' id="' + s.id + '" data-part>' + text + '</' + 'script>\n';
    });
    return out + '<!--/page-->\n</body>\n</html>\n';
  }
  save.addEventListener("click", function () {
    offer("dtc-portal.html", portalHtml(), "text/html").then(function () { say("Portal downloaded"); }, function () {});
  });

  route();
})();
