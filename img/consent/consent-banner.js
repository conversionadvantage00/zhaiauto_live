/* consent-banner.js, v1.0 — the cookie banner. Needs the head snippet (1-head-snippet.html), which defines window.cookieConsent.
 * It builds the banner itself (no HTML to paste), shows it until the visitor chooses, and re-opens it from any element
 * that has the attribute data-consent-open (a "cookie settings" link in the footer).
 * Declining after having accepted also removes the Google and Meta cookies already set.
 */
(function () {
  var api = window.cookieConsent; if (!api) return;
  var cfg = api.config || {}, T = cfg.text || {};
  var t = function (k, def) { return typeof T[k] === 'string' ? T[k] : def; };
  var TXT = {
    label: t('label', 'Cookie choices'),
    title: t('title', 'Cookies: your call.'),
    body: t('body', 'We’d like to use cookies to see how this site is used and to measure our advertising. We only use them if you say yes.'),
    privacy: t('privacy', 'Privacy policy'),
    accept: t('accept', 'Accept all'),
    decline: t('decline', 'Decline all'),
    choose: t('choose', 'Choose which ones'),
    pickTitle: t('pickTitle', 'Choose your cookies.'),
    save: t('save', 'Save choices'),
    on: t('on', 'On'),
    necessary: t('necessary', 'Necessary'),
    necessaryText: t('necessaryText', 'What the site needs to work. Always on.'),
    analytics: t('analytics', 'Analytics'),
    analyticsText: t('analyticsText', 'Google Analytics: which pages are visited and how people get here.'),
    advertising: t('advertising', 'Advertising'),
    advertisingText: t('advertisingText', 'Google Ads and Meta: measuring our ads and showing them to past visitors.')
  };
  var h = function (tag, cls, text, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text;
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]); return e;
  };
  var btn = function (cls, text, act) { return h('button', cls, text, { type: 'button', 'data-cc': act }); };
  var row = function (name, text, key) {
    var li = h('li', 'cc-row'), s = h('span', 'cc-row-text');
    s.appendChild(h('b', '', name)); s.appendChild(h('i', '', text)); li.appendChild(s);
    if (key) { s.id = 'cc-label-' + key; var b = h('button', 'cc-switch', null, { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-labelledby': s.id, 'data-cc-switch': key }); b.appendChild(h('i')); li.appendChild(b); }
    else li.appendChild(h('span', 'cc-on', TXT.on, { 'aria-hidden': 'true' }));
    return li;
  };
  var build = function () {
    var el = h('aside', 'cc cc-' + (/^(right|center)$/.test(cfg.position) ? cfg.position : 'left'), null, { id: 'cookie-consent', role: 'region', 'aria-label': TXT.label, tabindex: '-1' });
    el.hidden = true;
    var main = h('div', 'cc-view', null, { 'data-cc-view': 'main' });
    main.appendChild(h('p', 'cc-title', TXT.title));
    var p = h('p', 'cc-text', TXT.body + ' ');
    if (cfg.privacyUrl) p.appendChild(h('a', '', TXT.privacy, { href: cfg.privacyUrl }));
    main.appendChild(p);
    var b1 = h('div', 'cc-buttons'); b1.appendChild(btn('cc-button', TXT.accept, 'accept')); b1.appendChild(btn('cc-button', TXT.decline, 'decline')); main.appendChild(b1);
    main.appendChild(btn('cc-link', TXT.choose, 'choose'));
    var pick = h('div', 'cc-view', null, { 'data-cc-view': 'pick' }); pick.hidden = true;
    pick.appendChild(h('p', 'cc-title', TXT.pickTitle));
    var ul = h('ul', 'cc-rows'); ul.appendChild(row(TXT.necessary, TXT.necessaryText)); ul.appendChild(row(TXT.analytics, TXT.analyticsText, 'a')); ul.appendChild(row(TXT.advertising, TXT.advertisingText, 'm')); pick.appendChild(ul);
    var b2 = h('div', 'cc-buttons'); b2.appendChild(btn('cc-button', TXT.save, 'save')); b2.appendChild(btn('cc-button', TXT.accept, 'accept')); pick.appendChild(b2);
    pick.appendChild(btn('cc-link', TXT.decline, 'decline'));
    el.appendChild(main); el.appendChild(pick); document.body.appendChild(el);
    return el;
  };
  var start = function () {
    if (document.getElementById('cookie-consent')) return;
    var el = build(), root = document.documentElement, views = el.querySelectorAll('[data-cc-view]');
    var sw = { a: el.querySelector('[data-cc-switch="a"]'), m: el.querySelector('[data-cc-switch="m"]') };
    var view = function (n) { for (var i = 0; i < views.length; i++) views[i].hidden = views[i].getAttribute('data-cc-view') !== n; };
    var flip = function (b, on) { b.setAttribute('aria-checked', on ? 'true' : 'false'); };
    var isOn = function (b) { return b.getAttribute('aria-checked') === 'true'; };
    var focus = function () { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } };
    var open = function (n, f) {
      var c = api.get(); flip(sw.a, !!(c && c.a)); flip(sw.m, !!(c && c.m)); view(n); el.hidden = false; root.classList.add('cc-open');
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('cc-in'); }); });
      if (f) focus();
    };
    var close = function () { el.classList.remove('cc-in'); root.classList.remove('cc-open'); setTimeout(function () { if (!el.classList.contains('cc-in')) el.hidden = true; }, 450); };
    // cookies the tags may have set before a "no": cleared on this address and its parent addresses
    var sweep = function (a, m) {
      var hn = location.hostname, parts = hn.split('.'), hosts = [hn, '.' + hn];
      for (var i = 1; i < parts.length - 1; i++) hosts.push('.' + parts.slice(i).join('.'));
      document.cookie.split(';').forEach(function (s) {
        var n = s.split('=')[0].trim(); if (!n) return;
        var ana = /^_ga($|_)|^_gid$|^_gat/.test(n), ads = /^_gcl_|^_gac_|^_fbp$|^_fbc$|^_uet/.test(n);
        if ((ana && !a) || (ads && !m)) { document.cookie = n + '=; Max-Age=0; path=/'; hosts.forEach(function (x) { document.cookie = n + '=; Max-Age=0; path=/; domain=' + x; }); }
      });
    };
    var choose = function (a, m) { api.set(a, m); if (!a || !m) { try { sweep(a, m); } catch (e) {} } close(); };
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-cc-switch]'); if (s) { flip(s, !isOn(s)); return; }
      var b = e.target.closest('[data-cc]'); if (!b) return;
      var k = b.getAttribute('data-cc');
      if (k === 'accept') choose(true, true);
      else if (k === 'decline') choose(false, false);
      else if (k === 'save') choose(isOn(sw.a), isOn(sw.m));
      else if (k === 'choose') { view('pick'); focus(); }
    });
    document.addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('[data-consent-open]'); if (o) { e.preventDefault(); open('pick', true); } });
    api.open = function () { open('pick', true); };
    if (!api.get()) setTimeout(function () { open('main', false); }, cfg.delay >= 0 ? cfg.delay : 1200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
