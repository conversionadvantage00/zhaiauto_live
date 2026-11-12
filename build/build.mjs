// Zhai Auto live build (round 10, 10 Nov 2026). Cloudflare Pages runs this on every push:
//   Build command: npm run build      Output directory: dist      Env var: SITE_URL (the main address)
// Input: the exported files in the repo root (index.html, privacy.html, img/, _headers). Nothing in them is edited.
// Output (dist/):
//   - img/r/…        every photo as WebP at 480/800/1200/1600/2400 px wide (never wider than the original), and the
//                    banner videos, all with a content hash in the name, so a changed photo always gets a new
//                    address and the files can be cached for a year
//   - index.html     the export + <base>, the image list (window.__CA_RESP) and the main address in canonical/share tags
//   - cars/<slug>/   one page per car on the site: own title, description, share image, Car data for Google and a
//                    plain-HTML summary; the same site code then opens the car full screen
//   - index.html also gets (12 Nov 2026) the dealer + stock data for Google/AI written into the page (JSON-LD) and a plain-HTML
//                    summary of the dealer and every car, which the page removes as it loads; llms.txt = the same as plain text
//   - sitemap.xml, robots.txt, 404.html, _headers, privacy.html and the original img/ files (fallbacks, share images)
// Run locally: npm install && SITE_URL=https://zhaiauto.co.za/ npm run build  (then serve dist/)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://zhaiauto-live.pages.dev/').replace(/\/*$/, '/');
const VERSION = 'r10-1';                       // bump to re-make every image (e.g. after changing quality)
const LADDER = [480, 800, 1200, 1600, 2400];
const QUALITY = k => /^(site|lineup|meta)\//.test(k) ? 72 : 76;
const t0 = Date.now();
const log = (...a) => console.log(`[build ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const once = (s, find, repl, what) => { const n = s.split(find).length - 1; if (n !== 1) throw new Error(`${what}: expected 1 match, found ${n}`); return s.replace(find, repl); };

// ---------- read the export ----------
const HOME_HTML = read('index.html');
const DT = 'id="site-data">';
const da = HOME_HTML.indexOf(DT) + DT.length, db = HOME_HTML.indexOf('</script>', da);
const DATA = JSON.parse(HOME_HTML.slice(da, db));
const D = DATA.dealer;
fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(OUT, {recursive: true});

// ---------- which files does the site use? every string in the data that names a file in img/ ----------
const fileOf = k => /\.[a-z0-9]{2,4}$/i.test(k) ? k : k + '.jpg';     // same rule as IMG() in the page
const keys = new Set();
(function walk(n) {
  if (typeof n === 'string') { if (n.length < 160 && !/^(https?:|data:|blob:|#|\/)/.test(n) && !/\s/.test(n) && n.includes('/') && fs.existsSync(path.join(ROOT, 'img', fileOf(n)))) keys.add(n); return; }
  if (Array.isArray(n)) return n.forEach(walk);
  if (n && typeof n === 'object') Object.values(n).forEach(walk);
})(DATA);

// ---------- photos -> WebP ladder, videos -> hashed copy ----------
const RESP = {};
const noExt = k => k.replace(/\.[a-z0-9]{2,4}$/i, '');
const jobs = [...keys].map(k => async () => {
  const file = path.join(ROOT, 'img', fileOf(k)), buf = fs.readFileSync(file), ext = path.extname(file).slice(1).toLowerCase();
  const hash = crypto.createHash('sha1').update(VERSION).update(buf).digest('hex').slice(0, 10);
  if (/^(mp4|webm|mov)$/.test(ext)) {
    const dest = path.join(OUT, 'img/r', `${noExt(k)}.${hash}.${ext}`);
    fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(file, dest);
    RESP[k] = [hash, 0, ext]; return;
  }
  if (!/^(jpe?g|png|webp)$/.test(ext)) return;
  const meta = await sharp(buf).metadata();
  const max = Math.min(meta.width, LADDER[LADDER.length - 1]);
  const ws = [...new Set([...LADDER.filter(w => w < max), max])];
  for (const w of ws) {
    const dest = path.join(OUT, 'img/r', `${noExt(k)}.${hash}.${w}.webp`);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    await sharp(buf).rotate().resize({width: w, withoutEnlargement: true}).webp({quality: QUALITY(k), effort: 5, smartSubsample: true}).toFile(dest);
  }
  RESP[noExt(k)] = [hash, ws];
});
async function pool(tasks, n) { let i = 0; await Promise.all(Array.from({length: n}, async () => { while (i < tasks.length) await tasks[i++](); })); }
await pool(jobs, Math.max(2, Math.min(8, os.cpus().length)));
log(`${keys.size} files -> ${fs.readdirSync(path.join(OUT, 'img/r'), {recursive: true}).filter(f => /\.\w+$/.test(f)).length} copies in img/r`);

// ---------- originals (fallbacks, share images, logos, fonts); the old phone copies in img/m are not needed here ----------
fs.cpSync(path.join(ROOT, 'img'), path.join(OUT, 'img'), {recursive: true, filter: src => !src.startsWith(path.join(ROOT, 'img', 'm'))});
for (const f of ['privacy.html', '_headers']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));

// ---------- page helpers ----------
const RESP_JSON = JSON.stringify(RESP).replace(/</g, '\\u003c');
const IMGURL = k => SITE + 'img/' + fileOf(k);                        // full-size original, for share previews
const respURL = (k, want) => { const r = RESP[noExt(k)]; if (!r || !r[1]) return 'img/' + fileOf(k); const w = r[1].find(x => x >= want) || r[1][r[1].length - 1]; return `img/r/${noExt(k)}.${r[0]}.${w}.webp`; };
const R = n => 'R' + Math.round(n).toLocaleString('en-ZA').replace(/[,\u00a0\u202f]/g, ' ');
const COND = {new: 'New', demo: 'Demo', used: 'Used'};
const TOWN = (String(D.address || '').split(',').map(x => x.trim()).filter(x => !/^\d{4}$/.test(x)).pop()) || '';
const nameOf = v => `${String(v.title).startsWith(String(v.year)) ? '' : v.year + ' '}${v.title} ${v.sub}`.replace(/\s+/g, ' ').trim();
const SEC_OF = {}; (DATA.sections || []).forEach(s => (s.vehicles || []).forEach(id => { if (!SEC_OF[id]) SEC_OF[id] = s; }));
const onSite = DATA.vehicles.filter(v => SEC_OF[v.id]);

function setHead(html, {base, title, desc, url, image, imageW, imageH, imageAlt, extra}) {
  html = once(html, '<meta charset=utf8>', `<meta charset=utf8>\n<base href="${base}">`, 'charset');
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  const meta = (attr, name, val) => { const re = new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`); if (re.test(html)) html = html.replace(re, `$1${esc(val)}$2`); };
  meta('name', 'description', desc); meta('property', 'og:title', title); meta('property', 'og:description', desc);
  meta('property', 'og:url', url); meta('property', 'og:image', image); meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', desc); meta('name', 'twitter:image', image);
  if (imageW) { meta('property', 'og:image:width', String(imageW)); meta('property', 'og:image:height', String(imageH)); }
  if (imageAlt) meta('property', 'og:image:alt', imageAlt);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  html = once(html, '</head>', `${extra || ''}</head>`, 'head end');
  return html;
}
const shareImg = DATA.meta && DATA.meta.shareImage ? IMGURL(DATA.meta.shareImage) : SITE + 'img/meta/social.jpg';

// ---------- home page ----------
const KM = n => n.toLocaleString('en-ZA').replace(/[,\u00a0\u202f]/g, ' ') + ' km';
const priceOf = v => v.priceMode === 'poa' || !v.price ? 'Price on request' : R(v.price);
const carLine = v => [COND[v.condition] || '', priceOf(v), v.monthlyFixed ? `from ${R(v.monthlyFixed)} pm*` : '', v.condition !== 'new' && typeof v.km === 'number' ? KM(v.km) : '', v.transmission, v.fuel].filter(Boolean).join(', ');
const HOURS = Array.isArray(D.hours) ? D.hours.filter(h => h && h[0]) : [];
const DEPTS = Array.isArray(D.departments) ? D.departments.filter(x => x && x.name) : [];
const SECS = (DATA.sections || []).map(s => ({s, list: (s.vehicles || []).map(id => DATA.vehicles.find(v => v.id === id)).filter(Boolean)})).filter(x => x.list.length);
const ABOUT = ((DATA.page || {}).about || {}), SVC = ((DATA.page || {}).services || {});
const HOME_DESC = (DATA.meta && DATA.meta.description) || '';

// dealer + stock data for search engines and AI assistants, written into the page (crawlers that don't run scripts read it too)
const homeLD = (() => {
  const ap = String(D.address || '').split(',').map(x => x.trim()).filter(Boolean), pc = ap.length > 1 && /^\d{4}$/.test(ap[ap.length - 1]) ? ap.pop() : '';
  const geo = /!2d(-?[\d.]+)!3d(-?[\d.]+)/.exec(D.mapEmbed || '');
  const DAYS = {monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'}, ORDER = Object.values(DAYS);
  const hours = HOURS.map(([d, t]) => { const ds = String(d).toLowerCase().match(/[a-z]+/g) || [], tm = String(t).match(/\d{1,2}:\d{2}/g) || [];
    const names = ds.map(x => DAYS[x]).filter(Boolean); if (!names.length || tm.length < 2) return null;
    const days = names.length === 2 && /–|-|to/.test(d) ? ORDER.slice(ORDER.indexOf(names[0]), ORDER.indexOf(names[1]) + 1) : names;
    return {'@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: tm[0].padStart(5, '0'), closes: tm[1].padStart(5, '0')}; }).filter(Boolean);
  return {'@context': 'https://schema.org', '@type': 'AutoDealer', name: D.name, url: SITE, telephone: D.phone, ...(D.email ? {email: D.email} : {}),
    ...(HOME_DESC ? {description: HOME_DESC} : {}),
    ...(D.logo ? {logo: IMGURL(D.logo), image: IMGURL(D.logo)} : {}),
    address: {'@type': 'PostalAddress', streetAddress: ap[0] || D.address, ...(ap.length > 1 ? {addressLocality: ap[ap.length - 1]} : {}), ...(pc ? {postalCode: pc} : {}), addressCountry: 'ZA'},
    ...(geo ? {geo: {'@type': 'GeoCoordinates', latitude: +geo[2], longitude: +geo[1]}} : {}),
    ...(hours.length ? {openingHoursSpecification: hours} : {}),
    ...(Array.isArray(D.social) && D.social.length ? {sameAs: D.social.map(x => x[1])} : {}),
    makesOffer: onSite.map(v => ({'@type': 'Offer', ...(v.price && v.priceMode !== 'poa' ? {price: v.price} : {}), priceCurrency: 'ZAR', availability: 'https://schema.org/InStock',
      url: `${SITE}cars/${v.slug}/`,
      itemOffered: {'@type': 'Car', name: nameOf(v), brand: {'@type': 'Brand', name: v.make || String(v.title).replace(/^\d{4}\s+/, '').split(' ')[0]}, vehicleModelDate: String(v.year),
        itemCondition: v.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
        ...(v.condition !== 'new' && typeof v.km === 'number' ? {mileageFromOdometer: {'@type': 'QuantitativeValue', value: v.km, unitCode: 'KMT'}} : {}),
        ...(v.images && v.images[0] ? {image: IMGURL(v.images[0])} : {})}}))};
})();

// plain summary of the dealer and every car: for search engines, AI assistants and anyone without JavaScript.
// The one-line script right after it removes it before the page is drawn, so visitors only ever see the full site.
const homeStatic = `<div id="home-static" style="max-width:960px;margin:24px auto;padding:0 16px">
  <h1>${esc(D.name)}: ${esc(ABOUT.title || (DATA.meta && DATA.meta.title) || '')}</h1>
  ${HOME_DESC ? `<p>${esc(HOME_DESC)}</p>` : ''}${ABOUT.text ? `<p>${esc(ABOUT.text)}</p>` : ''}
  <h2>Contact and opening hours</h2>
  <p>${esc(D.address)}. Phone <a href="tel:${esc(String(D.phone).replace(/\s/g, ''))}">${esc(D.phone)}</a>${D.whatsapp ? `, <a href="https://wa.me/${esc(D.whatsapp)}">WhatsApp ${esc(D.mobile || '')}</a>` : ''}${D.email ? `, ${esc(D.email)}` : ''}.</p>
  ${HOURS.length ? `<ul>${HOURS.map(h => `<li>${esc(h[0])}: ${esc(h[1] || '')}</li>`).join('')}</ul>` : ''}
  ${DEPTS.length ? `<ul>${DEPTS.map(x => `<li>${esc(x.name)}: ${esc(x.phone || D.phone)}${x.email ? `, ${esc(x.email)}` : ''}</li>`).join('')}</ul>` : ''}
  ${SECS.map(({s, list}) => `<h2 id="s-${esc(s.id)}">${esc(s.title || s.label || s.id)}</h2>${s.intro ? `<p>${esc(s.intro)}</p>` : ''}
  <ul>${list.map(v => `<li><a href="cars/${esc(v.slug)}/">${esc(nameOf(v))}</a>: ${esc(carLine(v))}</li>`).join('')}</ul>`).join('\n  ')}
  ${Array.isArray(SVC.items) && SVC.items.length ? `<h2>${esc(SVC.title || 'Service and parts')}</h2><ul>${SVC.items.map(x => `<li>${esc(x.title)}: ${esc(x.text || '')}</li>`).join('')}</ul>` : ''}
  <p><small>*Monthly figures are estimates. ${esc(D.priceNote || '')}</small></p>
  <p><a href="privacy.html">Privacy notice</a></p>
</div><script>(function(){var e=document.getElementById('home-static');if(e)e.remove()})()</script>`;

let home = setHead(HOME_HTML, {
  base: './', title: (DATA.meta && DATA.meta.title) || D.name, desc: HOME_DESC,
  url: SITE, image: shareImg,
  extra: `<script>window.__CA_PAGES=1;window.__CA_RESP=${RESP_JSON}</script>\n<script type="application/ld+json">${JSON.stringify(homeLD).replace(/</g, '\\u003c')}</script>\n`,
});
home = once(home, '<main id="top">', `<main id="top">\n${homeStatic}`, 'main (home)');
fs.writeFileSync(path.join(OUT, 'index.html'), home);

// ---------- llms.txt: the same facts as plain text for AI assistants (llmstxt.org layout) ----------
fs.writeFileSync(path.join(OUT, 'llms.txt'), [
  `# ${D.name}`, '',
  `> ${HOME_DESC}`, '',
  ABOUT.text || '', '',
  '## Contact', '',
  `- Address: ${D.address}`, `- Phone: ${D.phone}`, ...(D.mobile ? [`- WhatsApp: ${D.mobile}`] : []), ...(D.email ? [`- Email: ${D.email}`] : []),
  `- Website: ${SITE}`, ...DEPTS.map(x => `- ${x.name}: ${x.phone || D.phone}${x.email ? ', ' + x.email : ''}`), '',
  ...(HOURS.length ? ['## Opening hours', '', ...HOURS.map(h => `- ${h[0]}: ${h[1] || ''}`), ''] : []),
  ...SECS.flatMap(({s, list}) => [`## ${s.title || s.label || s.id}`, '', ...(s.intro ? [s.intro, ''] : []), ...list.map(v => `- [${nameOf(v)}](${SITE}cars/${v.slug}/): ${carLine(v)}${v.stock ? `, stock no. ${v.stock}` : ''}`), '']),
  ...(Array.isArray(SVC.items) && SVC.items.length ? [`## ${SVC.title || 'Service and parts'}`, '', ...SVC.items.map(x => `- ${x.title}: ${x.text || ''}`), ''] : []),
  '## Notes', '',
  `- Stock and prices as published on ${new Date().toISOString().slice(0, 10)}; this file is rebuilt with every site update. Cars not listed here have been sold.`,
  `- *Monthly figures are estimates. ${D.priceNote || ''}`,
  `- Enquiries, test drives, finance applications, trade-in valuations, service bookings and parts requests can be made on the website.`,
  `- [Privacy notice](${SITE}privacy.html)`, '',
].join('\n').replace(/\n{3,}/g, '\n\n'));

// ---------- one page per car ----------
for (const v of onSite) {
  const name = nameOf(v), cond = COND[v.condition] || '';
  const monthly = v.monthlyFixed ? `${R(v.monthlyFixed)} pm` : '';
  const price = v.priceMode === 'poa' || !v.price ? 'Price on request' : R(v.price);
  const facts = [v.condition !== 'new' && typeof v.km === 'number' ? `${v.km.toLocaleString('en-ZA').replace(/[,\u00a0\u202f]/g, ' ')} km` : '', v.transmission, v.fuel, v.colour].filter(Boolean);
  const title = `${cond === 'New' ? 'New' : cond} ${name} for sale in ${TOWN} | ${D.name}`.replace(/^ +/, '');
  const desc = `${cond} ${name} at ${D.name}, ${TOWN}: ${price}${monthly ? ', from ' + monthly : ''}. ${facts.join(', ')}. Enquire, book a test drive or apply for finance online.`.replace(/\s+/g, ' ').trim();
  const url = `${SITE}cars/${v.slug}/`;
  const img0 = v.images && v.images[0];
  let w = 1200, h = 800; try { const m = await sharp(path.join(ROOT, 'img', fileOf(img0))).metadata(); w = m.width; h = m.height; } catch (_) {}
  const ld = {
    '@context': 'https://schema.org', '@type': 'Car', name, url,
    image: (v.images || []).map(IMGURL), brand: {'@type': 'Brand', name: v.make || String(v.title).replace(/^\d{4}\s+/, '').split(' ')[0]},
    vehicleModelDate: String(v.year), itemCondition: v.condition === 'new' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    ...(v.condition !== 'new' && typeof v.km === 'number' ? {mileageFromOdometer: {'@type': 'QuantitativeValue', value: v.km, unitCode: 'KMT'}} : {}),
    ...(v.colour ? {color: v.colour} : {}), vehicleTransmission: v.transmission, fuelType: v.fuel, ...(v.stock ? {sku: String(v.stock)} : {}),
    offers: {'@type': 'Offer', url, priceCurrency: 'ZAR', ...(v.price && v.priceMode !== 'poa' ? {price: v.price} : {}), availability: 'https://schema.org/InStock',
      seller: {'@type': 'AutoDealer', name: D.name, telephone: D.phone, address: D.address, url: SITE}},
  };
  const extra = `<script>window.__CA_PAGES=1;window.__CA_CARPAGE=${JSON.stringify(v.slug)};window.__CA_RESP=${RESP_JSON}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n`;
  let html = setHead(HOME_HTML, {base: '../../', title, desc, url, image: IMGURL(img0), imageW: w, imageH: h, imageAlt: name, extra});
  // plain summary for search engines and for anyone without JavaScript; the page script replaces it with the full car view
  const equip = String(v.extrasText || '').split(/[,;\n|]+/).map(x => x.trim()).filter(x => x.length > 1).slice(0, 30);
  const stat = `<div id="car-static" style="max-width:960px;margin:24px auto;padding:0 16px">
  <p><a href="./">${esc(D.name)}</a> › <a href="./#${esc((SEC_OF[v.id] || {}).id || '')}">${esc((SEC_OF[v.id] || {}).label || (SEC_OF[v.id] || {}).title || 'Vehicles')}</a></p>
  <h1>${esc(name)}</h1>
  <p><b>${esc(price)}</b>${monthly ? ` · from ${esc(monthly)}*` : ''} · ${esc(cond)}${v.stock ? ` · Stock no. ${esc(v.stock)}` : ''}</p>
  <img src="${esc(respURL(img0, 800))}" alt="${esc(name)}" width="800" height="${Math.round(800 * h / w)}" style="max-width:100%;height:auto">
  <ul>${[['Year', v.year], ['Mileage', facts[0] && /km$/.test(facts[0]) ? facts[0] : ''], ['Transmission', v.transmission], ['Fuel', v.fuel], ['Engine', v.engine], ['Colour', v.colour], ['Seats', v.seats]].filter(x => x[1]).map(x => `<li>${esc(x[0])}: ${esc(x[1])}</li>`).join('')}</ul>
  ${v.dealerNotes ? `<p>${esc(v.dealerNotes)}</p>` : ''}${equip.length ? `<h2>Equipment</h2><ul>${equip.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${v.monthlyNote ? `<p><small>*${esc(v.monthlyNote)}</small></p>` : ''}
  <p>Call <a href="tel:${esc(String(D.phone).replace(/\s/g, ''))}">${esc(D.phone)}</a>${D.whatsapp ? ` or <a href="https://wa.me/${esc(D.whatsapp)}">WhatsApp us</a>` : ''}. ${esc(D.address)}.</p>
</div>`;
  html = once(html, '<main id="top">', `<main id="top">\n${stat}`, 'main');
  fs.mkdirSync(path.join(OUT, 'cars', v.slug), {recursive: true});
  fs.writeFileSync(path.join(OUT, 'cars', v.slug, 'index.html'), html);
}
log(`${onSite.length} car pages`);

// ---------- 404 (sold cars, old links): without it Cloudflare would answer every unknown address with the home page ----------
const logo = D.logo ? `<img src="/img/${esc(fileOf(D.logo))}" alt="${esc(D.name)}" style="height:44px">` : `<b>${esc(D.name)}</b>`;
fs.writeFileSync(path.join(OUT, '404.html'), `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Page not found | ${esc(D.name)}</title><link rel="icon" href="/img/meta/favicon.ico">
<style>body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f4f2;color:#141413;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}a.b{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:999px;background:${esc((DATA.theme || {}).accent || '#141413')};color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main>${logo}<h1 style="font-size:24px;margin:24px 0 8px">This car has been sold, or the page has moved</h1><p>Have a look at the cars we have in stock now.</p><a class="b" href="/">See all our cars</a>
<p style="margin-top:22px">Or call <a href="tel:${esc(String(D.phone).replace(/\s/g, ''))}">${esc(D.phone)}</a></p></main></body></html>\n`);

// ---------- sitemap + robots ----------
const today = new Date().toISOString().slice(0, 10);
const urls = [SITE, ...onSite.map(v => `${SITE}cars/${v.slug}/`), SITE + 'privacy.html'];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
log(`done: SITE_URL=${SITE}`);
