// Kippari Pron (ent. Lokikirja) laskenta: ei koske sivuun eikä tallennukseen, joten sama tiedosto toimii myös testeissä (Node).
'use strict';
const MPK = 1852;            // metriä meripeninkulmassa
const SOLMU = 1852 / 3600;   // m/s yhdessä solmussa
const RAD = Math.PI / 180;

function etaisyys(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * RAD / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin((lon2 - lon1) * RAD / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
const valiM = (a, b) => etaisyys(a.lat, a.lon, b.lat, b.lon);

// Matkan tallennin. Sille syötetään GPS-havaintoja {t, lat, lon, acc, sog}; se päättää itse milloin matka alkaa ja päättyy.
class Tallennin {
  constructor(as) {
    this.as = Object.assign({
      auto: true,
      alkuM: 100,        // näin kauas lähtöpaikasta ennen kuin matka alkaa
      alkuNopeus: 1.5,   // m/s (noin 3 solmua) – kävely laiturilla ei saa aloittaa matkaa
      alkuVarmaM: 300,   // näin kaukana matka alkaa hitaastikin
      pysM: 50,          // pysähdys = pysytään tämän säteen sisällä
      pysMin: 15,        // ... näin monta minuuttia
      minM: 200,         // lyhyempi automaattinen matka hylätään
      tarkkuus: 35,      // epätarkemmat havainnot ohitetaan (m)
      valiM: 10, valiS: 30
    }, as || {});
    this.tila = 'lepo'; this.ankkuri = null; this.osumat = 0; this.viime = null; this.m = null; this.pys = null; this.ref = null;
  }
  aloita(t, f) {
    this.tila = 'matka'; this.osumat = 0;
    this.m = { alku: t, loppu: null, pisteet: [], matka: 0, liike: 0, max: 0, katkot: 0 };
    this.pys = null; this.ref = null;
    if (f) this._piste(f, true);
  }
  lopeta(t, kuva) {
    if (this.tila !== 'matka') return null;
    const m = this.m;
    m.loppu = Math.max(m.alku, t || (this.viime ? this.viime.t : m.alku));
    m.pisteet = m.pisteet.filter(p => p[0] <= m.loppu);
    if (kuva) { m.matka = kuva.matka; m.liike = kuva.liike; }
    const v = this.viime;
    this.tila = 'lepo'; this.m = null; this.pys = null; this.ref = null; this.osumat = 0;
    this.ankkuri = v ? { t: v.t, lat: v.lat, lon: v.lon } : null;
    return m;
  }
  _piste(f, pakko) {
    const m = this.m, p = m.pisteet[m.pisteet.length - 1];
    if (!this.ref) this.ref = { lat: f.lat, lon: f.lon };
    const dr = valiM(this.ref, f);
    if (dr >= this.as.valiM) { m.matka += dr; this.ref = { lat: f.lat, lon: f.lon }; }
    if (pakko || !p || etaisyys(p[1], p[2], f.lat, f.lon) >= this.as.valiM || f.t - p[0] >= this.as.valiS * 1000)
      m.pisteet.push([f.t, +f.lat.toFixed(6), +f.lon.toFixed(6), +(f.sog || 0).toFixed(2)]);
  }
  // Palauttaa null tai {tapahtuma:'alkoi'|'paattyi'|'hylatty', matka}
  syota(f) {
    if (f.acc != null && f.acc > this.as.tarkkuus) return null;
    const ed = this.viime; let sog = f.sog, dt = 0;
    if (ed) { dt = (f.t - ed.t) / 1000; if (dt <= 0) return null; }
    if (sog == null || isNaN(sog) || sog < 0) sog = ed ? valiM(ed, f) / dt : 0;
    f = { t: f.t, lat: f.lat, lon: f.lon, acc: f.acc, sog, cog: f.cog };
    this.viime = f;

    if (this.tila === 'lepo') {
      if (!this.ankkuri) { this.ankkuri = { t: f.t, lat: f.lat, lon: f.lon }; return null; }
      const d = valiM(this.ankkuri, f);
      if (d <= this.as.alkuM) { this.ankkuri.t = f.t; this.osumat = 0; return null; }   // yhä lähtöpaikalla
      if (!this.as.auto) return null;
      if (sog >= this.as.alkuNopeus || d >= this.as.alkuVarmaM) {
        if (++this.osumat >= 2) {
          const a = this.ankkuri;
          this.aloita(a.t, { t: a.t, lat: a.lat, lon: a.lon, sog: 0 });
          this._piste(f);
          this.m.liike = (f.t - a.t) / 1000;      // lähtöpaikalta poistumiseen kulunut aika oli jo ajoa
          this.pys = { t: f.t, lat: f.lat, lon: f.lon, matka: this.m.matka, liike: this.m.liike };
          return { tapahtuma: 'alkoi' };
        }
      } else this.osumat = 0;
      return null;
    }

    const m = this.m;
    if (dt > 120) m.katkot++;
    else { if (sog > 0.5) m.liike += dt; if (dt <= 30 && sog > m.max) m.max = sog; }
    this._piste(f);
    if (!this.pys || valiM(this.pys, f) > this.as.pysM) this.pys = { t: f.t, lat: f.lat, lon: f.lon, matka: m.matka, liike: m.liike };
    else if (this.as.auto && f.t - this.pys.t >= this.as.pysMin * 60000) {
      const valmis = this.lopeta(this.pys.t, this.pys);
      return { tapahtuma: valmis.matka < this.as.minM ? 'hylatty' : 'paattyi', matka: valmis };
    }
    return null;
  }
  vie() { return { tila: this.tila, ankkuri: this.ankkuri, viime: this.viime, m: this.m, pys: this.pys, ref: this.ref }; }
  tuo(o) { Object.assign(this, { tila: o.tila, ankkuri: o.ankkuri, viime: o.viime, m: o.m, pys: o.pys, ref: o.ref, osumat: 0 }); }
}

function lahinPaikka(paikat, lat, lon) {
  let paras = null, pd = Infinity;
  for (const p of paikat || []) { const d = etaisyys(p.lat, p.lon, lat, lon); if (d <= (p.sade || 400) && d < pd) { paras = p; pd = d; } }
  return paras;
}

// Kulutus täysien tankkausten väliltä: litrat / moottoritunnit ja litrat / mpk.
function kulutus(tankkaukset) {
  const s = [...tankkaukset].sort((a, b) => a.pvm < b.pvm ? -1 : a.pvm > b.pvm ? 1 : (a.tunnit || 0) - (b.tunnit || 0));
  const valit = []; let ed = null, l = 0;
  for (const t of s) {
    l += t.litrat || 0;
    if (!t.taysi) continue;
    if (ed) {
      const dh = (t.tunnit || 0) - (ed.tunnit || 0), dm = (t.mpk || 0) - (ed.mpk || 0);
      valit.push({ pvm: t.pvm, litrat: l, tunnit: dh, mpk: dm, lh: dh > 0 ? l / dh : null, lmpk: dm > 0 ? l / dm : null });
    }
    ed = t; l = 0;
  }
  const sum = k => valit.reduce((a, v) => a + (v[k] > 0 ? v[k] : 0), 0);
  const L = sum('litrat'), H = sum('tunnit'), M = sum('mpk');
  return { valit, lh: H > 0 ? L / H : null, lmpk: M > 0 ? L / M : null };
}

// Huollon tila: jh = tunteja jäljellä, jp = päiviä jäljellä (null = ei seurata tai ei tiedetä).
function huoltoTila(h, tunnit, nyt) {
  let jh = null, jp = null, era = null;
  if (h.valiH && h.tehtyH != null) jh = h.tehtyH + h.valiH - tunnit;
  if (h.valiKk && h.tehtyPvm) { const d = new Date(h.tehtyPvm); d.setMonth(d.getMonth() + h.valiKk); era = d.getTime(); jp = Math.round((era - nyt) / 864e5); }
  let tila = 'ok';
  if (jh == null && jp == null) tila = 'tuntematon';
  else if ((jh != null && jh <= 0) || (jp != null && jp <= 0)) tila = 'myohassa';
  else if ((jh != null && jh <= 10) || (jp != null && jp <= 30)) tila = 'pian';
  return { tila, jh, jp, era };
}

const ILMANSUUNNAT = ['P', 'KO', 'I', 'KA', 'E', 'LO', 'L', 'LU'];
const ilmansuunta = aste => aste == null ? '' : ILMANSUUNNAT[Math.round(((aste % 360) + 360) % 360 / 45) % 8];

// Tuntidatasta matkan ajan yhteenveto. saa = {time[], tuuli[], suunta[], puuska[], lampo[], sade[]}, aallot = {time[], korkeus[]}
function saaYhteenveto(saa, aallot, alku, loppu) {
  const H = 3600000, a = Math.floor(alku / H) * H, b = Math.max(a, Math.ceil(loppu / H) * H);
  const valitse = (ajat) => ajat.map((s, i) => [Date.parse(s + ':00Z'), i]).filter(x => x[0] >= a && x[0] <= b).map(x => x[1]);
  const ka = x => x.length ? x.reduce((p, c) => p + c, 0) / x.length : null;
  const luvut = (taulu, ix) => ix.map(i => taulu && taulu[i]).filter(v => v != null && !isNaN(v));
  const ix = valitse(saa.time);
  if (!ix.length) return null;
  const tuuli = luvut(saa.tuuli, ix), suunnat = luvut(saa.suunta, ix), puuska = luvut(saa.puuska, ix), sade = luvut(saa.sade, ix);
  let suunta = null;
  if (suunnat.length) { const x = ka(suunnat.map(s => Math.sin(s * RAD))), y = ka(suunnat.map(s => Math.cos(s * RAD))); suunta = Math.round((Math.atan2(x, y) / RAD + 360) % 360); }
  let aalto = null;
  if (aallot && aallot.time) { const k = luvut(aallot.korkeus, valitse(aallot.time)); if (k.length) aalto = Math.max(...k); }
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  return { tuuli: r1(ka(tuuli)), puuska: puuska.length ? r1(Math.max(...puuska)) : null, suunta, lampo: r1(ka(luvut(saa.lampo, ix))), sade: sade.length ? r1(sade.reduce((p, c) => p + c, 0)) : null, aalto: r1(aalto) };
}

function gpx(nimi, pisteet) {
  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kippari Pro" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>' + x(nimi) + '</name><trkseg>\n' +
    pisteet.map(p => '<trkpt lat="' + p[1] + '" lon="' + p[2] + '"><time>' + new Date(p[0]).toISOString() + '</time><extensions><speed>' + (p[3] || 0) + '</speed></extensions></trkpt>').join('\n') + '\n</trkseg></trk>\n</gpx>\n';
}

// ---------- reittisuunnittelu väyliä pitkin ----------
// Lähtötieto: Väyläviraston navigointilinjat, linjat = [{p:[lon,lat,lon,lat,...], s:mitoitussyväys|null, j:väylän numero}].
// Verkko: solmut = linjojen pisteet, kaaret = linjojen osat. Lisäksi yhdistetään risteävät linjat, toiseen linjaan
// päättyvät linjat ja lähekkäiset irralliset päät (viimeksi mainitut merkitään väylän ulkopuolisiksi).
const MERKKILAJIT = { 1: 'Vasen lateraali', 2: 'Oikea lateraali', 3: 'Pohjoisviitta', 4: 'Eteläviitta', 5: 'Länsiviitta', 6: 'Itäviitta', 7: 'Karimerkki', 8: 'Turvavesimerkki', 9: 'Erikoismerkki' };
const ULKOKERROIN = 4;         // väylän ulkopuolinen metri "maksaa" näin monta väylämetriä
function rakennaVerkko(linjat) {
  const lat = [], lon = [], avain = new Map(), seg = [];
  const solmu = (la, lo) => { const k = Math.round(la * 20000) + ',' + Math.round(lo * 10000); let i = avain.get(k); if (i === undefined) { i = lat.length; lat.push(la); lon.push(lo); avain.set(k, i); } return i; };
  linjat.forEach((l, li) => { let ed = -1; for (let i = 0; i + 1 < l.p.length; i += 2) { const s = solmu(l.p[i + 1], l.p[i]); if (ed >= 0 && ed !== s) seg.push({ a: ed, b: s, l: li, x: null }); ed = s; } });
  const aste = new Int32Array(lat.length + 16); for (const s of seg) { aste[s.a]++; aste[s.b]++; }
  // tasokoordinaatit metreinä (riittävän tarkka pienellä alueella)
  const KX = 111320 * Math.cos(60 * RAD), KY = 110574, X = i => lon[i] * KX, Y = i => lat[i] * KY;
  const RUUTU = 400, ruudut = new Map();
  const ruutuun = (s, si) => { const x0 = Math.floor(Math.min(X(s.a), X(s.b)) / RUUTU), x1 = Math.floor(Math.max(X(s.a), X(s.b)) / RUUTU), y0 = Math.floor(Math.min(Y(s.a), Y(s.b)) / RUUTU), y1 = Math.floor(Math.max(Y(s.a), Y(s.b)) / RUUTU);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; let r = ruudut.get(k); if (!r) ruudut.set(k, r = []); r.push(si); } };
  seg.forEach(ruutuun);
  const lisaa = (s, t, n) => { (s.x || (s.x = [])).push([t, n]); };
  // 1) risteävät linjat: leikkauspisteeseen yhteinen solmu
  const nahty = new Set();
  for (const r of ruudut.values()) for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const p = seg[r[i]], q = seg[r[j]]; if (p.l === q.l || p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
    const k = r[i] < r[j] ? r[i] + ',' + r[j] : r[j] + ',' + r[i]; if (nahty.has(k)) continue; nahty.add(k);
    const x1 = X(p.a), y1 = Y(p.a), dx1 = X(p.b) - x1, dy1 = Y(p.b) - y1, x3 = X(q.a), y3 = Y(q.a), dx2 = X(q.b) - x3, dy2 = Y(q.b) - y3, det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) < 1e-9) continue;
    const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / det, u = ((x3 - x1) * dy1 - (y3 - y1) * dx1) / det;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
    const n = solmu((y1 + t * dy1) / KY, (x1 + t * dx1) / KX); lisaa(p, t, n); lisaa(q, u, n);
  }
  // 2) linjan irrallinen pää: liitetään lähimpään toiseen linjaan (alle 80 m) tai merkitään ulkopuolinen yhteys (alle 500 m)
  const ulko = [];
  const lahin = (i, omaLinja, sade) => {
    const px = X(i), py = Y(i), cx = Math.floor(px / RUUTU), cy = Math.floor(py / RUUTU), R = Math.ceil(sade / RUUTU); let paras = null;
    for (let x = cx - R; x <= cx + R; x++) for (let y = cy - R; y <= cy + R; y++) for (const si of ruudut.get(x + ',' + y) || []) {
      const s = seg[si]; if (s.l === omaLinja || s.a === i || s.b === i) continue;
      const ax = X(s.a), ay = Y(s.a), dx = X(s.b) - ax, dy = Y(s.b) - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d <= sade && (!paras || d < paras.d)) paras = { d, s, t, la: (ay + t * dy) / KY, lo: (ax + t * dx) / KX };
    }
    return paras;
  };
  const paat = []; linjat.forEach((l, li) => { if (l.p.length < 4) return; for (const i of [0, l.p.length - 2]) { const n = avain.get(Math.round(l.p[i + 1] * 20000) + ',' + Math.round(l.p[i] * 10000)); if (n !== undefined && aste[n] === 1) paat.push([n, li]); } });
  for (const [n, li] of paat) {
    let h = lahin(n, li, 80), vayla = true; if (!h) { h = lahin(n, li, 500); vayla = false; } if (!h) continue;
    const m = h.t <= 0 ? h.s.a : h.t >= 1 ? h.s.b : solmu(h.la, h.lo);
    if (m !== h.s.a && m !== h.s.b) lisaa(h.s, h.t, m);
    if (m !== n) ulko.push([n, m, vayla ? li : -1]);
  }
  // 3) kaaret
  const naapurit = Array.from({ length: lat.length }, () => []);
  const kaari = (a, b, l) => { if (a === b) return; const d = etaisyys(lat[a], lon[a], lat[b], lon[b]); naapurit[a].push([b, d, l]); naapurit[b].push([a, d, l]); };
  for (const s of seg) { if (!s.x) { kaari(s.a, s.b, s.l); continue; } s.x.sort((p, q) => p[0] - q[0]); let ed = s.a; for (const [, n] of s.x) { kaari(ed, n, s.l); ed = n; } kaari(ed, s.b, s.l); }
  for (const [a, b, l] of ulko) kaari(a, b, l);
  return { lat, lon, naapurit, seg, linjat, KX, KY };
}
// Yhdistää alueittain ladatut väylätiedot yhdeksi aineistoksi. osat = [{alue, haettu, nimet, linjat, merkit, rajoitukset}].
// Väylien nimet numeroidaan uudelleen yhteiseen listaan. haettu = vanhimman osan hakuaika, osat = {alue: {haettu, linjat, merkit, rajoitukset (lukumäärät)}}.
function yhdistaVaylat(osat) {
  const nimet = [], ni = new Map(), linjat = [], merkit = [], rajoitukset = [], tiedot = {}, nahty = new Set(); let haettu = Infinity;
  // Alueiden rajan ylittävä kohde tulee molempien alueiden mukana: sama kohde otetaan vain kerran.
  const uusiKohde = k => { if (nahty.has(k)) return false; nahty.add(k); return true; };
  for (const o of osat) {
    const uusi = o.nimet.map(nm => { let j = ni.get(nm); if (j === undefined) { j = nimet.length; nimet.push(nm); ni.set(nm, j); } return j; });
    for (const l of o.linjat) { let sum = 0; for (const x of l.p) sum += x; if (uusiKohde('l' + l.p.length + ':' + l.p[0] + ',' + l.p[1] + ':' + sum.toFixed(5))) linjat.push({ p: l.p, s: l.s, j: uusi[l.j] }); }
    for (const m of o.merkit) if (uusiKohde('m' + m[0] + ',' + m[1] + ',' + m[3])) merkit.push(m);
    for (const r of o.rajoitukset || []) if (uusiKohde('r' + (r.n || '') + ':' + (r.b || []).join(',') + ':' + (r.k || ''))) rajoitukset.push(r);
    haettu = Math.min(haettu, o.haettu); tiedot[o.alue] = { haettu: o.haettu, linjat: o.linjat.length, merkit: o.merkit.length, rajoitukset: (o.rajoitukset || []).length };
  }
  return { haettu, nimet, linjat, merkit, rajoitukset, osat: tiedot };
}
// Lähin kohta väyläverkolla (vain linjat, joiden syväys riittää).
function lahinVayla(v, la, lo, syvays) {
  const px = lo * v.KX, py = la * v.KY; let paras = null;
  for (const s of v.seg) {
    const L = v.linjat[s.l]; if (syvays && L.s != null && L.s < syvays) continue;
    const ax = v.lon[s.a] * v.KX, ay = v.lat[s.a] * v.KY, dx = v.lon[s.b] * v.KX - ax, dy = v.lat[s.b] * v.KY - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    if (!paras || d < paras.d) paras = { d, s, lat: (ay + t * dy) / v.KY, lon: (ax + t * dx) / v.KX };
  }
  return paras;
}
// Reitti pisteestä toiseen: suoraan lähimmälle väylälle, väyliä pitkin ja lopuksi suoraan kohteeseen.
// Palauttaa null, jos väyläverkkoa pitkin ei pääse perille.
function reitita(v, a, b, as) {
  as = as || {}; const syv = as.syvays || 0;
  const A = lahinVayla(v, a[0], a[1], syv), B = lahinVayla(v, b[0], b[1], syv); if (!A || !B) return null;
  const N = v.lat.length, matka = new Float64Array(N).fill(Infinity), ed = new Int32Array(N).fill(-1), edL = new Int32Array(N).fill(-2), valmis = new Uint8Array(N);
  const keko = [], tyonna = (d, n) => { keko.push([d, n]); let i = keko.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (keko[p][0] <= keko[i][0]) break;[keko[p], keko[i]] = [keko[i], keko[p]]; i = p; } };
  const ota = () => { const y = keko[0], viim = keko.pop(); if (keko.length) { keko[0] = viim; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < keko.length && keko[l][0] < keko[m][0]) m = l; if (r < keko.length && keko[r][0] < keko[m][0]) m = r; if (m === i) break;[keko[m], keko[i]] = [keko[i], keko[m]]; i = m; } } return y; };
  const dA = n => etaisyys(A.lat, A.lon, v.lat[n], v.lon[n]), dB = n => etaisyys(B.lat, B.lon, v.lat[n], v.lon[n]);
  for (const n of [A.s.a, A.s.b]) { matka[n] = dA(n); edL[n] = A.s.l; tyonna(matka[n], n); }
  let jaljella = A.s === B.s ? 0 : 2;
  while (keko.length && jaljella > 0) {
    const [d, n] = ota(); if (valmis[n]) continue; valmis[n] = 1; if (n === B.s.a || n === B.s.b) jaljella--;
    for (const [m, pit, l] of v.naapurit[n]) {
      if (valmis[m]) continue;
      if (l >= 0 && syv && v.linjat[l].s != null && v.linjat[l].s < syv) continue;
      const u = d + pit * (l < 0 ? ULKOKERROIN : 1); if (u < matka[m]) { matka[m] = u; ed[m] = n; edL[m] = l; tyonna(u, m); }
    }
  }
  let ketju = null;
  if (A.s === B.s) ketju = [];
  else { let loppu = -1, paras = Infinity; for (const n of [B.s.a, B.s.b]) if (matka[n] + dB(n) < paras) { paras = matka[n] + dB(n); loppu = n; } if (loppu < 0 || paras === Infinity) return null; ketju = []; for (let n = loppu; n >= 0; n = ed[n]) ketju.push(n); ketju.reverse(); }
  // pisteet: [lat, lon, linja] – linja = sen osuuden linja, joka päättyy tähän pisteeseen (-1 = väylän ulkopuolella)
  const p = [[a[0], a[1], -1], [A.lat, A.lon, -1]];
  ketju.forEach((n, i) => p.push([v.lat[n], v.lon[n], i ? edL[n] : A.s.l]));
  p.push([B.lat, B.lon, B.s.l], [b[0], b[1], -1]);
  let yht = 0, ulkona = 0, minSyv = null; const vaylat = [];
  for (let i = 1; i < p.length; i++) {
    const d = etaisyys(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]); yht += d; const l = p[i][2];
    if (l < 0) { ulkona += d; continue; }
    const L = v.linjat[l]; if (L.s != null && (minSyv == null || L.s < minSyv)) minSyv = L.s;
    const viim = vaylat[vaylat.length - 1]; if (viim && viim.j === L.j) viim.m += d; else vaylat.push({ j: L.j, m: d });
  }
  return { pisteet: p, matka: yht, ulkona, alku: A.d, loppu: B.d, minSyv, vaylat };
}
// Merimerkit reitin varrella kulkujärjestyksessä. merkit = [[lon, lat, lajikoodi, nimi, tyyppi], ...]
function merkitReitilla(merkit, pisteet, sade) {
  sade = sade || 150; const KX = 111320 * Math.cos(60 * RAD), KY = 110574, tulos = [];
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180; for (const p of pisteet) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); }
  const vl = sade / KY, vo = sade / KX, kum = [0]; for (let i = 1; i < pisteet.length; i++) kum.push(kum[i - 1] + etaisyys(pisteet[i - 1][0], pisteet[i - 1][1], pisteet[i][0], pisteet[i][1]));
  for (const m of merkit) {
    if (m[1] < la0 - vl || m[1] > la1 + vl || m[0] < lo0 - vo || m[0] > lo1 + vo) continue;
    const px = m[0] * KX, py = m[1] * KY; let paras = Infinity, kohta = 0;
    for (let i = 1; i < pisteet.length; i++) {
      const ax = pisteet[i - 1][1] * KX, ay = pisteet[i - 1][0] * KY, dx = pisteet[i][1] * KX - ax, dy = pisteet[i][0] * KY - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d < paras) { paras = d; kohta = kum[i - 1] + t * (kum[i] - kum[i - 1]); }
    }
    if (paras <= sade) tulos.push({ lon: m[0], lat: m[1], laji: m[2], nimi: m[3], tyyppi: m[4], sivussa: Math.round(paras), kohta });
  }
  return tulos.sort((a, b) => a.kohta - b.kohta);
}

// ---------- reitin seuranta ajon aikana ----------
const suuntima = (la1, lo1, la2, lo2) => (Math.atan2(Math.sin((lo2 - lo1) * RAD) * Math.cos(la2 * RAD), Math.cos(la1 * RAD) * Math.sin(la2 * RAD) - Math.sin(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo2 - lo1) * RAD)) / RAD + 360) % 360;
const kulmaEro = (a, b) => ((b - a + 540) % 360) - 180;      // suunnasta a suuntaan b, + = oikealle
// Reitin pisteiden matkat alusta metreinä. pisteet = [[lat, lon, ...], ...]
function reittiMitat(pisteet) { const kum = [0]; for (let i = 1; i < pisteet.length; i++) kum.push(kum[i - 1] + etaisyys(pisteet[i - 1][0], pisteet[i - 1][1], pisteet[i][0], pisteet[i][1])); return kum; }
// Veneen kohta reitillä. kum = reittiMitat(pisteet), ed = edellinen kohta metreinä reitin alusta (null = ei tiedossa).
// Edellisen kohdan lähellä oleva osuus voittaa, jotta samaa väylää edestakaisin kulkeva reitti ei hyppää meno- ja paluuosuuden välillä.
// Palauttaa {i: osuuden loppupisteen indeksi, kohta: m alusta, jaljella: m, etaisyys: m reitistä, sivussa: sama etumerkillä (+ = vene on reitin oikealla puolella),
// lat, lon: lähin kohta reitillä, suunta: reitin suunta siinä, kaannos: {matka, kulma (+ = oikealle), suunta, lat, lon} | null}.
function reittiKohta(pisteet, kum, lat, lon, ed) {
  if (!pisteet || pisteet.length < 2) return null;
  const KX = 111320 * Math.cos(lat * RAD), KY = 110574, px = lon * KX, py = lat * KY; let g = null, l = null;
  for (let i = 1; i < pisteet.length; i++) {
    const ax = pisteet[i - 1][1] * KX, ay = pisteet[i - 1][0] * KY, dx = pisteet[i][1] * KX - ax, dy = pisteet[i][0] * KY - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py), k = kum[i - 1] + t * (kum[i] - kum[i - 1]);
    if (!g || d < g.d) g = { i, t, d, k, risti: dx * (py - ay) - dy * (px - ax) };
    if (ed != null && k >= ed - 300 && k <= ed + 3000 && (!l || d < l.d)) l = { i, t, d, k, risti: dx * (py - ay) - dy * (px - ax) };
  }
  const o = l && l.d <= g.d + 60 ? l : g, a = pisteet[o.i - 1], b = pisteet[o.i], viim = pisteet.length - 1;
  const osuus = j => kum[j] - kum[j - 1] >= 1 ? suuntima(pisteet[j - 1][0], pisteet[j - 1][1], pisteet[j][0], pisteet[j][1]) : null;
  let s0 = null; for (let j = o.i; j <= viim && s0 == null; j++) s0 = osuus(j); for (let j = o.i - 1; j >= 1 && s0 == null; j--) s0 = osuus(j);
  // Seuraava käännös: ensimmäinen kohta edessä, jossa reitin suunta poikkeaa nykyisestä vähintään 25 astetta.
  // Uusi suunta luetaan 250 m käännöksen jälkeen, jotta monesta lyhyestä osuudesta koostuva kaarre näkyy yhtenä käännöksenä.
  let kaannos = null;
  for (let j = o.i + 1; j <= viim && s0 != null; j++) {
    const s = kum[j] - kum[j - 1] >= 5 ? osuus(j) : null; if (s == null || Math.abs(kulmaEro(s0, s)) < 25) continue;
    let s2 = s; for (let m = j + 1; m <= viim && kum[m - 1] - kum[j - 1] < 250; m++) { const x = kum[m] - kum[m - 1] >= 5 ? osuus(m) : null; if (x != null) s2 = x; }
    if (Math.abs(kulmaEro(s0, s2)) < 15) s2 = s;
    kaannos = { matka: kum[j - 1] - o.k, kulma: kulmaEro(s0, s2), suunta: s2, lat: pisteet[j - 1][0], lon: pisteet[j - 1][1] }; break;
  }
  return { i: o.i, kohta: o.k, jaljella: kum[viim] - o.k, etaisyys: o.d, sivussa: o.risti < 0 ? o.d : -o.d, lat: a[0] + o.t * (b[0] - a[0]), lon: a[1] + o.t * (b[1] - a[1]), suunta: s0, kaannos };
}
// GPS-jäljen yksinkertaistus (Douglas–Peucker): jättää pois pisteet, jotka ovat alle tol metrin päässä jäljelle jäävästä viivasta. p = [[lat, lon], ...]
function yksinkertaista(p, tol) {
  if (p.length < 3) return p.slice();
  const KX = 111320 * Math.cos(p[0][0] * RAD), KY = 110574, pida = new Uint8Array(p.length), pino = [[0, p.length - 1]]; pida[0] = pida[p.length - 1] = 1;
  while (pino.length) {
    const [a, b] = pino.pop(), ax = p[a][1] * KX, ay = p[a][0] * KY, dx = p[b][1] * KX - ax, dy = p[b][0] * KY - ay; let m = -1, md = tol;
    for (let i = a + 1; i < b; i++) { const x = p[i][1] * KX, y = p[i][0] * KY, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + t * dx - x, ay + t * dy - y); if (d > md) { md = d; m = i; } }
    if (m >= 0) { pida[m] = 1; pino.push([a, m], [m, b]); }
  }
  return p.filter((x, i) => pida[i]);
}

// ---------- kallistus puhelimen asentoanturista ----------
// Selaimen kulmista (beta, gamma) lasketaan "ylös"-vektori puhelimen omassa koordinaatistossa (x oikealle, y yläreunaan, z näytöstä ulos).
function ylosVektori(beta, gamma) { const b = beta * RAD, g = gamma * RAD; return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)]; }
// u = ylös nyt, u0 = ylös nollaushetkellä (vene suorassa), kulma = näytön kiertokulma (0 pysty, 90/270 vaaka).
// Oletus: puhelimen vasen–oikea-suunta on veneen poikittaissuunta (näyttö kuljettajaan päin tai puhelin pöydällä yläreuna keulaan).
// Palauttaa asteina: kallistus + = oikealle (styyrpuuriin), trimmi + = keula ylös. null, jos asentoa ei voi tulkita.
function kallistus(u, u0, kulma) {
  const piste = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], yks = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const U = yks(u0), L = kulma === 90 ? [0, -1, 0] : kulma === 270 ? [0, 1, 0] : kulma === 180 ? [-1, 0, 0] : [1, 0, 0];
  let Lh = L.map((x, i) => x - piste(L, U) * U[i]); if (Math.hypot(Lh[0], Lh[1], Lh[2]) < 0.2) return null;      // puhelin kyljellään: poikittaissuuntaa ei voi päätellä
  Lh = yks(Lh); const F = [U[1] * Lh[2] - U[2] * Lh[1], U[2] * Lh[0] - U[0] * Lh[2], U[0] * Lh[1] - U[1] * Lh[0]];
  return { kallistus: Math.atan2(-piste(u, Lh), piste(u, U)) / RAD, trimmi: Math.atan2(piste(u, F), piste(u, U)) / RAD };
}

// ---------- satamat OpenStreetMapista ----------
// Muuntaa Overpass-haun kohteet tiiviiksi listaksi: {n: nimi, la, lo, l: 'satama' | 'polttoaine' | 'luiska' | 'palvelu', t: {palvelutiedot}}.
const SATAMA_TAGIT = ['fee', 'capacity', 'maxdraught', 'maxdraft', 'depth', 'power_supply', 'drinking_water', 'sanitary_dump_station', 'shower', 'toilets', 'sauna', 'internet_access', 'fuel:diesel', 'fuel:octane_95', 'fuel:octane_98', 'opening_hours', 'operator', 'phone', 'contact:phone', 'website', 'contact:website', 'description', 'access', 'surface', 'addr:city', 'seamark:small_craft_facility:category'];
function satamatMuunna(kohteet) {
  const lista = [];
  for (const el of kohteet || []) {
    const t = el.tags || {}, la = el.lat != null ? el.lat : el.center && el.center.lat, lo = el.lon != null ? el.lon : el.center && el.center.lon; if (la == null || lo == null) continue;
    const fc = t['seamark:small_craft_facility:category'] || '', hc = t['seamark:harbour:category'];
    const laji = t.waterway === 'fuel' || /fuel/.test(fc) ? 'polttoaine' : t.leisure === 'marina' || (t['seamark:type'] === 'harbour' && (!hc || hc === 'marina')) ? 'satama' : t.leisure === 'slipway' || /slipway/.test(fc) ? 'luiska' : t['seamark:type'] === 'small_craft_facility' ? 'palvelu' : null;
    const nimi = t['name:fi'] || t.name || ''; if (!laji || (laji === 'satama' && !nimi)) continue;      // nimettömät pienlaiturit jätetään pois
    if (laji === 'luiska' && t.access === 'no') continue;      // käytöstä suljetut luiskat pois
    // sama kohde pisteenä ja alueena; luiskat ovat usein nimettömiä ja lähekkäin, joten niille tiukempi raja
    if (lista.some(s => s.l === laji && (laji === 'luiska' ? etaisyys(s.la, s.lo, la, lo) < (nimi && s.n === nimi ? 400 : 40) : s.n === nimi && etaisyys(s.la, s.lo, la, lo) < 400))) continue;
    const tt = {}; for (const k of SATAMA_TAGIT) if (t[k]) tt[k] = t[k];
    lista.push({ n: nimi, la: +la.toFixed(6), lo: +lo.toFixed(6), l: laji, t: tt });
  }
  return lista;
}

// ---------- vesiliikenteen rajoitusalueet (Väylävirasto: rajoitusalue_a) ----------
// Muuntaa GeoJSON-kohteet tiiviiksi: {n: nimi, t: rajoitustyypit, k: nopeusrajoitus km/h | null, l: lisätieto, p: poikkeus, e: päättyy (ms) | null,
// b: [lon0, lat0, lon1, lat1], m: [monikulmio, ...]}, monikulmio = [ulkokehä, reikä, ...], kehä = [lon, lat, lon, lat, ...].
function rajoituksetMuunna(kohteet) {
  const KX = 111320 * Math.cos(60 * RAD), KY = 110574, lista = [];
  const keha = r => { const o = []; let ex = null, ey = null; r.forEach((c, i) => { const x = c[0] * KX, y = c[1] * KY; if (ex === null || i === r.length - 1 || Math.hypot(x - ex, y - ey) >= 6) { o.push(+c[0].toFixed(6), +c[1].toFixed(6)); ex = x; ey = y; } }); return o; };      // alle 6 m välein olevat pisteet karsitaan
  for (const f of kohteet || []) {
    const g = f.geometry, p = f.properties || {}; if (!g) continue;
    const m = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).map(mk => mk.map(keha)).filter(mk => mk[0] && mk[0].length >= 6); if (!m.length) continue;
    const b = [180, 90, -180, -90]; for (const mk of m) for (let i = 0; i < mk[0].length; i += 2) { b[0] = Math.min(b[0], mk[0][i]); b[2] = Math.max(b[2], mk[0][i]); b[1] = Math.min(b[1], mk[0][i + 1]); b[3] = Math.max(b[3], mk[0][i + 1]); }
    const k = /Nopeusrajoitus/.test(p.rajoitustyyppi || '') && +p.suuruus > 0 ? +p.suuruus : null, e = p.loppupaivamaara ? Date.parse(String(p.loppupaivamaara).replace(/Z$/, '')) + 864e5 : null;
    lista.push({ n: p.nimisijainti || '', t: p.rajoitustyyppi || '', k, l: (p.lisatieto || '').replace(/\s+/g, ' ').trim(), p: (p.poikkeus || '').replace(/\s+/g, ' ').trim().slice(0, 400), e: isNaN(e) ? null : e, b, m });
  }
  return lista;
}
function pisteKehassa(lon, lat, r) { let s = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) s = !s; } return s; }
function pisteAlueessa(lon, lat, a) { if (lon < a.b[0] || lon > a.b[2] || lat < a.b[1] || lat > a.b[3]) return false; for (const mk of a.m) { if (!pisteKehassa(lon, lat, mk[0])) continue; let reiassa = false; for (let i = 1; i < mk.length; i++) if (pisteKehassa(lon, lat, mk[i])) { reiassa = true; break; } if (!reiassa) return true; } return false; }
// Voimassa olevat rajoitukset annetussa kohdassa, tiukin nopeusrajoitus ensin.
function rajoitusKohdassa(lista, lat, lon, nyt) { return (lista || []).filter(a => (!a.e || a.e > nyt) && pisteAlueessa(lon, lat, a)).sort((a, b) => (a.k || 1e9) - (b.k || 1e9)); }

if (typeof module !== 'undefined') module.exports = { yhdistaVaylat, suuntima, kulmaEro, reittiMitat, reittiKohta, yksinkertaista, rajoituksetMuunna, pisteAlueessa, rajoitusKohdassa, satamatMuunna, ylosVektori, kallistus, MERKKILAJIT, rakennaVerkko, lahinVayla, reitita, merkitReitilla, MPK, SOLMU, etaisyys, Tallennin, lahinPaikka, kulutus, huoltoTila, ilmansuunta, saaYhteenveto, gpx };
