// Kippari Pron (ent. Lokikirja) käyttöliittymä ja tallennus. Kaikki tieto pysyy tämän laitteen selaimessa (IndexedDB).
'use strict';
const $ = s => document.querySelector(s);
const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x, d = 1) => x == null || isNaN(x) ? '–' : Number(x).toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d });
const luku = s => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
const pad = x => String(x).padStart(2, '0');
const pvm = t => new Date(t).toLocaleDateString('fi-FI');
const klo = t => pad(new Date(t).getHours()) + '.' + pad(new Date(t).getMinutes());
const paiva = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const dtl = t => paiva(t) + 'T' + pad(new Date(t).getHours()) + ':' + pad(new Date(t).getMinutes());
const kesto = s => { s = Math.max(0, Math.round(s / 60)); return s < 60 ? s + ' min' : Math.floor(s / 60) + ' h ' + pad(s % 60) + ' min'; };
const koord = (lat, lon) => { const f = (v, a, b) => { const x = Math.abs(v), d = Math.floor(x); return d + '°' + n((x - d) * 60, 1) + "'" + (v >= 0 ? a : b); }; return f(lat, 'P', 'E') + ' ' + f(lon, 'I', 'L'); };
// Nopeus näytetään asetuksen mukaan solmuina tai km/h; sisäisesti aina m/s.
const kmh = () => T && T.as.yksikko === 'kmh';
const nopeus = ms => ms / (kmh() ? 1 / 3.6 : SOLMU);
const NY = () => kmh() ? 'km/h' : 'kn';
const eur = x => n(x, 2) + ' €';

const HUOLLOT = [['Moottoriöljy ja öljynsuodatin', 100, 12], ['Vetolaitteen / vaihteiston öljy', 100, 12], ['Polttoainesuodatin', 200, 12], ['Impelleri (vesipumpun siipipyörä)', 200, 24],
  ['Sinkkianodit', 0, 12], ['Pohjan pesu ja myrkkymaali', 0, 12], ['Akkujen tarkistus', 0, 12], ['Sammuttimen tarkastus', 0, 12]];
const KULULAJIT = ['Satama ja laituri', 'Huolto ja varaosat', 'Varusteet', 'Vakuutus', 'Talvisäilytys', 'Muu'];
function uusiTila() {
  return { vene: { nimi: '', tunnit0: 0, mpk0: 0, syvays: null, nopeus: 10 }, koti: null, reitit: [], paikat: [], kalapaikat: [], tankkaukset: [], kulut: [],
    huollot: HUOLLOT.map((h, i) => ({ id: 'h' + i, nimi: h[0], valiH: h[1], valiKk: h[2], tehtyPvm: null, tehtyH: null })),
    as: { auto: true, pysMin: 15, seuranta: false, kartta: 's57', karttaV: 2, keulaYlos: false, kartta3d: false, s57Nimet: true, yksikko: 'kn', kallistus: false, kallNolla: null, rajoitus: true, reittiSeuranta: true, reittiSivu: 200, suuntaviiva: true, syvyys: false, kalapaikat: true, tuuli: false, tutka: false, ais: false, satamat: false, luiskat: false, saunat: true }, saajono: [], kopio: null };
}

// ---------- tallennus ----------
const DB = {
  db: null,
  avaa() { return new Promise((ok, ei) => { const r = indexedDB.open('lokikirja', 2); r.onupgradeneeded = () => { const d = r.result, on = n => d.objectStoreNames.contains(n); if (!on('matkat')) d.createObjectStore('matkat', { keyPath: 'id' }); for (const n of ['jaljet', 'kv', 'laatat']) if (!on(n)) d.createObjectStore(n); }; r.onsuccess = () => { DB.db = r.result; ok(); }; r.onerror = () => ei(r.error); }); },
  tx(s, tapa, f) { return new Promise((ok, ei) => { const t = DB.db.transaction(s, tapa); const r = f(t.objectStore(s)); t.oncomplete = () => ok(r && r.result); t.onerror = () => ei(t.error); t.onabort = () => ei(t.error); }); },
  get: (s, k) => DB.tx(s, 'readonly', o => o.get(k)),
  all: s => DB.tx(s, 'readonly', o => o.getAll()),
  put: (s, v, k) => DB.tx(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k)),
  del: (s, k) => DB.tx(s, 'readwrite', o => o.delete(k)),
  tyhjenna: s => DB.tx(s, 'readwrite', o => o.clear()),
  onko: (s, k) => DB.tx(s, 'readonly', o => o.getKey(k)).then(v => v !== undefined),
  maara: s => DB.tx(s, 'readonly', o => o.count())
};

let T, matkat = [], tal, nakyma = 'kartta', valittu = null, vuosi = String(new Date().getFullYear());
let watchId = null, lukko = null, viimeTalletus = 0, saaKaynnissa = false;
const gps = { viime: null, virhe: '' };
const talletaT = () => DB.put('kv', T, 'tila');
const tunnitNyt = () => (T.vene.tunnit0 || 0) + matkat.reduce((a, m) => a + (m.moottori_h || 0), 0);
const mpkNyt = () => (T.vene.mpk0 || 0) + matkat.reduce((a, m) => a + m.matka / MPK, 0);
const vuodelta = (lista, f) => vuosi === 'kaikki' ? lista : lista.filter(x => String(new Date(f(x)).getFullYear()) === vuosi);

function ilmoita(t) { const el = $('#ilmoitus'); el.textContent = t; el.classList.add('on'); clearTimeout(ilmoita.a); ilmoita.a = setTimeout(() => el.classList.remove('on'), 4200); }
function lataa(nimi, sisalto, tyyppi) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([sisalto], { type: tyyppi })); a.download = nimi; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

// ---------- lomake ----------
function lomake(otsikko, kentat, arvot, tallenna, poista) {
  const d = $('#dlg');
  d.innerHTML = '<form method="dialog"><h3>' + e(otsikko) + '</h3>' + kentat.map(k => {
    const v = arvot[k.k], id = 'f_' + k.k;
    if (k.t === 'cb') return '<label class="cb"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '>' + e(k.n) + '</label>';
    if (k.t === 'sel') return '<label>' + e(k.n) + '<select id="' + id + '">' + k.o.map(o => '<option' + (o === v ? ' selected' : '') + '>' + e(o) + '</option>').join('') + '</select></label>';
    if (k.t === 'area') return '<label>' + e(k.n) + '<textarea id="' + id + '" rows="3">' + e(v) + '</textarea></label>';
    if (k.t === 'num') return '<label>' + e(k.n) + '<input id="' + id + '" inputmode="decimal" autocomplete="off" value="' + (v == null ? '' : e(String(v).replace('.', ','))) + '"' + (k.req ? ' required' : '') + '></label>';
    return '<label>' + e(k.n) + '<input id="' + id + '" type="' + (k.t || 'text') + '" value="' + e(v) + '"' + (k.req ? ' required' : '') + '></label>';
  }).join('') + '<div class="napit">' + (poista ? '<button type="button" class="nappi vaara" id="fPoista">Poista</button>' : '') +
    '<button type="button" class="nappi" id="fPeru">Peruuta</button><button class="nappi paa" id="fOk">Tallenna</button></div></form>';
  d.querySelector('#fPeru').onclick = () => d.close();
  if (poista) d.querySelector('#fPoista').onclick = async () => { if (confirm('Poistetaanko pysyvästi?')) { d.close(); await poista(); piirra(); } };
  d.querySelector('form').onsubmit = async ev => {
    ev.preventDefault(); const o = {};
    for (const k of kentat) {
      const el = d.querySelector('#f_' + k.k);
      o[k.k] = k.t === 'cb' ? el.checked : k.t === 'num' ? luku(el.value) : el.value.trim();
      if (k.t === 'num' && k.req && o[k.k] == null) { el.focus(); return; }
    }
    d.close(); await tallenna(o); piirra();
  };
  d.showModal();
}

// ---------- seuranta ja matkan tallennus ----------
function seurantaPaalle(hiljaa) {
  if (!navigator.geolocation) { gps.virhe = 'Tämä selain ei tue paikannusta.'; piirra(); return; }
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(p => {
    let t = p.timestamp; if (!t || Math.abs(t - Date.now()) > 864e5) t = Date.now();
    fix({ t, lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, sog: p.coords.speed, cog: p.coords.heading });
  }, err => {
    gps.virhe = err.code === 1 ? 'Sijaintilupa puuttuu. Salli sijainti tälle sivulle selaimen asetuksista.' : 'Sijaintia ei saada juuri nyt (' + (err.code === 3 ? 'aikakatkaisu' : 'ei signaalia') + ').';
    if (err.code === 1) { seurantaPois(); }
    paivitaLive();
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  if (!T.as.seuranta) { T.as.seuranta = true; talletaT(); }
  gps.virhe = ''; naytto(true);
  if (!hiljaa) piirra();
}
function seurantaPois() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; T.as.seuranta = false; talletaT(); naytto(false);
}
// Sijaintiluvan tila Lisää-sivulle. Selaimen lupatieto (Permissions API) ei ole kaikissa selaimissa, jolloin tila päätellään viimeisestä yrityksestä.
// iPad ja iPhone eivät näytä lupakyselyä eivätkä aina edes vastaa pyyntöön, jos sijaintipalvelut ovat pois tai Safarin sijaintilupa on estetty: se tunnistetaan odotusajasta (gps.eiVastaa).
const onIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IOS_OHJE = 'Tee iPadissa tai iPhonessa näin: 1) Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut: kytke Sijaintipalvelut päälle. 2) Samassa luettelossa Safari-sivustot: valitse "Kysy seuraavalla kerralla tai kun jaan" tai "Appia käytettäessä" ja kytke Tarkka sijainti päälle. 3) Asetukset → Apit → Safari → Sijainti: valitse "Kysy" tai "Salli". 4) Sulje sovellus kokonaan, avaa se uudelleen ja paina nappia. Jos kysely ei vieläkään tule Koti-valikon kuvakkeesta avattuna, avaa sama osoite Safarissa ja paina nappia siellä.';
async function paivitaGpsTila() {
  if (!$('#gpsTila')) return;
  let lupa = gps.lupa || '', selain = 'ei tietoa';
  try { if (navigator.permissions && navigator.permissions.query) { selain = (await navigator.permissions.query({ name: 'geolocation' })).state || selain; if (selain !== 'ei tietoa') lupa = selain; } } catch (x) { }
  const el = $('#gpsTila'); if (!el) return;
  const f = gps.viime, paalla = watchId != null, ios = onIos();
  el.textContent = !window.isSecureContext ? 'Sijainti toimii vain https-osoitteessa. Avaa sovellus sen julkaistusta osoitteesta.'
    : !navigator.geolocation ? 'Tämä selain ei tue paikannusta.'
      : gps.pyynto ? 'Pyydetään sijaintia… Vastaa laitteen kysymykseen "Salli".'
        : gps.eiVastaa && !f ? 'Laite ei näyttänyt lupakyselyä eikä vastannut sijaintipyyntöön. ' + (ios ? 'Näin käy, kun sijaintipalvelut ovat pois päältä tai Safarin sijaintilupa on estetty. ' + IOS_OHJE : 'Tarkista, että sijainti on päällä laitteen asetuksista ja sallittu tälle sivulle, ja paina nappia uudelleen.')
          : lupa === 'denied' ? 'Sijaintilupa on estetty. Selain ei kysy sitä uudelleen itsestään: salli sijainti laitteen asetuksista. ' + (ios ? IOS_OHJE : 'Ohje on napin alla.')
            : lupa === 'granted' ? 'Sijaintilupa on annettu. ' + (paalla ? (f ? 'GPS on päällä, tarkkuus ±' + Math.round(f.acc || 0) + ' m.' : 'GPS on päällä, haetaan sijaintia…') : 'GPS ei ole päällä – käynnistä se napista.')
              : paalla ? 'GPS on käynnistetty' + (f ? ', tarkkuus ±' + Math.round(f.acc || 0) + ' m.' : ', haetaan sijaintia…') + (gps.virhe ? ' ' + gps.virhe : '')
                : 'Sijaintilupaa ei ole vielä annettu. Paina nappia, niin laite kysyy luvan.';
  // tekniset tiedot vianselvitystä varten
  let t = $('#gpsTiedot'); if (!t) { t = document.createElement('div'); t.className = 'pieni'; t.id = 'gpsTiedot'; el.after(t); }
  const koti = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  t.textContent = 'Tekniset tiedot: suojattu yhteys ' + (window.isSecureContext ? 'kyllä' : 'ei') + ' · selaimen lupatila ' + ({ granted: 'sallittu', denied: 'estetty', prompt: 'kysytään' }[selain] || selain) + ' · avattu Koti-valikosta ' + (koti ? 'kyllä' : 'ei') + ' · laite ' + (ios ? 'iPad tai iPhone' : 'muu') + (gps.viimeVirhe ? ' · viimeisin vastaus: ' + gps.viimeVirhe : '');
}
// Pyytää sijaintiluvan suoraan napin painalluksesta (selain näyttää lupakyselyn vain käyttäjän toiminnasta) ja käynnistää seurannan.
// Jos laite ei vastaa 10 sekunnissa mitään, näytetään ohje: iOS ei kutsu virhekäsittelijää, kun kysely jää näyttämättä.
function gpsLupa() {
  if (!window.isSecureContext || !navigator.geolocation) { paivitaGpsTila(); ilmoita(!window.isSecureContext ? 'Sijainti toimii vain https-osoitteessa.' : 'Tämä selain ei tue paikannusta.'); return; }
  const pyynto = gps.pyynto = Date.now(); gps.eiVastaa = false; gps.viimeVirhe = ''; paivitaGpsTila();
  const vastasi = () => { if (gps.pyynto === pyynto) gps.pyynto = 0; gps.eiVastaa = false; };
  setTimeout(() => { if (gps.pyynto !== pyynto) return; gps.pyynto = 0; gps.eiVastaa = true; ilmoita('Laite ei näyttänyt lupakyselyä. Katso ohje Sijainti-kortista.'); paivitaGpsTila(); }, 10000);
  navigator.geolocation.getCurrentPosition(p => {
    vastasi(); gps.lupa = 'granted'; seurantaPaalle(true);
    let t = p.timestamp; if (!t || Math.abs(t - Date.now()) > 864e5) t = Date.now();
    fix({ t, lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, sog: p.coords.speed, cog: p.coords.heading });
    ilmoita('Sijaintilupa on kunnossa ja GPS on päällä.'); paivitaGpsTila();
  }, err => {
    vastasi(); gps.viimeVirhe = 'virhe ' + err.code + (err.message ? ' (' + String(err.message).slice(0, 60) + ')' : '');
    if (err.code === 1) { gps.lupa = 'denied'; gps.virhe = 'Sijaintilupa puuttuu.'; ilmoita('Sijaintilupa on estetty. Salli sijainti laitteen asetuksista – ohje on Sijainti-kortissa.'); }
    else { gps.lupa = 'granted'; seurantaPaalle(true); ilmoita('Lupa on kunnossa, mutta sijaintia ei saatu juuri nyt. Kokeile ulkona tai ikkunan vieressä.'); }      // lupa on, signaali puuttuu: seuranta jää yrittämään
    paivitaGpsTila();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}
// Näyttö pidetään päällä seurannan ajan: useimmat puhelimet katkaisevat selaimen paikannuksen, kun näyttö sammuu.
async function naytto(paalle) {
  try {
    if (paalle && 'wakeLock' in navigator && document.visibilityState === 'visible') lukko = await navigator.wakeLock.request('screen');
    else if (!paalle && lukko) { await lukko.release(); lukko = null; }
  } catch (x) { lukko = null; }
}

function fix(f) {
  gps.viime = f; gps.virhe = '';
  rajoitusTarkista(f);
  reittiSeuraa(f);
  const ev = tal.syota(f);
  if (ev) tapahtuma(ev);
  else if (tal.tila === 'matka' && f.t - viimeTalletus > 30000) { viimeTalletus = f.t; DB.put('kv', tal.vie(), 'kesken'); }
  paivitaLive();
}
async function tapahtuma(ev) {
  if (ev.tapahtuma === 'alkoi') { await DB.put('kv', tal.vie(), 'kesken'); ilmoita('Matka alkoi – tallennetaan.'); }
  else if (ev.tapahtuma === 'hylatty') { await DB.del('kv', 'kesken'); }
  else if (ev.tapahtuma === 'paattyi') { const m = await tallennaMatka(ev.matka); ilmoita('Matka tallennettu: ' + n(m.matka / MPK) + ' mpk, ' + kesto((m.loppu - m.alku) / 1000) + '.'); }
  piirra();
}
let valinta = null;      // Loki-sivun poistotila: valittujen matkojen tunnisteet
async function poistaMatkat(idt) {
  for (const id of idt) { await DB.del('matkat', id); await DB.del('jaljet', id); }
  matkat = matkat.filter(m => !idt.includes(m.id)); T.saajono = T.saajono.filter(x => !idt.includes(x)); await talletaT();
}
const paikkaNimi = p => { if (!p) return ''; const x = lahinPaikka(T.paikat, p[0], p[1]); return x ? x.nimi : ''; };
async function tallennaMatka(m) {
  const pts = m.pisteet, a = pts[0], b = pts[pts.length - 1], k = pts[Math.floor(pts.length / 2)];
  const matka = { id: 'm' + m.alku, alku: m.alku, loppu: m.loppu, matka: Math.round(m.matka), liike: Math.round(m.liike), max: m.max, katkot: m.katkot,
    a: a ? [a[1], a[2]] : null, b: b ? [b[1], b[2]] : null, k: k ? [k[1], k[2]] : null, mista: '', minne: '', moottori_h: Math.round(m.liike / 360) / 10, huom: '', saa: null, kall: m.kall ? Math.round(m.kall) : null };
  matka.mista = paikkaNimi(matka.a); matka.minne = paikkaNimi(matka.b);
  await DB.put('matkat', matka); await DB.put('jaljet', pts, matka.id); await DB.del('kv', 'kesken');
  matkat = matkat.filter(x => x.id !== matka.id); matkat.push(matka);
  T.saajono.push(matka.id); await talletaT();
  paivitaSaat();
  return matka;
}

// ---------- sää (Open-Meteo, mallidataa) ----------
async function paivitaSaat() {
  if (saaKaynnissa || !navigator.onLine || !T.saajono.length) return;
  saaKaynnissa = true;
  try {
    for (const id of [...T.saajono]) {
      const m = matkat.find(x => x.id === id);
      if (m && await haeSaa(m) === false) break;      // ei verkkoa: yritetään myöhemmin
      T.saajono = T.saajono.filter(x => x !== id);
    }
    await talletaT();
  } finally { saaKaynnissa = false; }
  if (nakyma === 'loki' || nakyma === 'yksi' || nakyma === 'lisaa') piirra();
}
async function haeSaa(m) {
  let p = m.k || m.a || m.b;
  if (!p) { const x = T.paikat.find(q => q.nimi && (q.nimi === m.mista || q.nimi === m.minne)); if (x) p = [x.lat, x.lon]; }
  if (!p) return true;
  const q = 'latitude=' + p[0].toFixed(2) + '&longitude=' + p[1].toFixed(2) + '&timezone=UTC&start_date=' + new Date(m.alku).toISOString().slice(0, 10) + '&end_date=' + new Date(m.loppu).toISOString().slice(0, 10);
  const vanha = Date.now() - m.alku > 80 * 864e5;
  try {
    const r = await fetch((vanha ? 'https://archive-api.open-meteo.com/v1/archive?' : 'https://api.open-meteo.com/v1/forecast?') + q + '&wind_speed_unit=ms&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation');
    if (!r.ok) { window.__saaVirhe = r.status; return r.status === 400; }      // 400 = aikaväliä ei ole saatavilla; muut virheet yritetään myöhemmin uudelleen
    const h = (await r.json()).hourly;
    let aallot = null;
    try { const ra = await fetch('https://marine-api.open-meteo.com/v1/marine?' + q + '&hourly=wave_height'); if (ra.ok) { const ha = (await ra.json()).hourly; aallot = { time: ha.time, korkeus: ha.wave_height }; } } catch (x) { }
    m.saa = saaYhteenveto({ time: h.time, tuuli: h.wind_speed_10m, suunta: h.wind_direction_10m, puuska: h.wind_gusts_10m, lampo: h.temperature_2m, sade: h.precipitation }, aallot, m.alku, m.loppu);
    await DB.put('matkat', m);
    return true;
  } catch (x) { return false; }
}
const saaTeksti = s => !s ? '' : [s.tuuli != null ? n(s.tuuli, 0) + ' m/s ' + ilmansuunta(s.suunta) : '', s.aalto != null ? 'aalto ' + n(s.aalto) + ' m' : '', s.lampo != null ? n(s.lampo, 0) + ' °C' : ''].filter(Boolean).join(' · ');

// ---------- näkymät ----------
const paatepiste = (nimi, p) => nimi || (p ? koord(p[0], p[1]) : '–');
function vuosiValinta() {
  const v = new Set([String(new Date().getFullYear())]);
  matkat.forEach(m => v.add(String(new Date(m.alku).getFullYear()))); T.tankkaukset.concat(T.kulut).forEach(x => v.add(x.pvm.slice(0, 4)));
  return '<select data-c="vuosi">' + [...v].sort().reverse().map(y => '<option' + (y === vuosi ? ' selected' : '') + '>' + y + '</option>').join('') + '<option value="kaikki"' + (vuosi === 'kaikki' ? ' selected' : '') + '>Kaikki</option></select>';
}

function nMatka() {
  return     '<div class="kortti"><div class="tila"><span class="pallo" id="lPallo"></span><span id="lTila"></span></div><div class="pieni" id="lSelite"></div>' +
    '' +
    '<div class="luvut live"><div class="luku nop"><b id="lNopeus">–</b><span>' + (kmh() ? 'km/h' : 'solmua') + '</span></div><div class="luku"><b id="lMatka">–</b><span>mpk</span></div><div class="luku"><b id="lAika">–</b><span>kesto</span></div><div class="luku"><b id="lSuunta">–</b><span>suunta</span></div><div class="luku"><b id="lMax">–</b><span>huippu, ' + NY() + '</span></div></div>' +
    '<div class="napit" id="lNapit"></div></div>' +
    '<div class="kortti"><label class="kytkin"><span>Automaattinen aloitus ja lopetus</span><input type="checkbox" data-c="auto"' + (T.as.auto ? ' checked' : '') + '></label><div class="pieni" id="lGps"></div></div>' +
    '<div class="kortti"><h2>' + e(T.vene.nimi || 'Vene') + '</h2><div class="luvut"><div class="luku"><b>' + n(tunnitNyt()) + '</b><span>moottoritunnit</span></div><div class="luku"><b>' + n(mpkNyt(), 0) + '</b><span>mpk yhteensä</span></div><div class="luku"><b>' + matkat.length + '</b><span>matkaa</span></div></div></div>';
}
// Päänäkymä: koko ruudun kartta. Päällä nopeus ja kulkusuunta, kartan napit ja tallennuksen tila.
function nKartta() {
  return '<div class="kokok' + (reitti || omaR ? ' onreitti' : '') + '"><canvas class="kartta taysi" id="lKartta"></canvas><canvas class="kmerkit3d" id="kMerkit3d" hidden></canvas><div class="kvene3d" id="kVene3d" hidden>' + VENE3D + '</div><canvas class="kmerkit3d" id="kSaa3d" hidden></canvas>' +
    '<div class="kyla"><div class="kmittari"><div class="knop"><b id="kNopeus">–</b><span>' + NY() + '</span></div><div class="ksuu"><b id="kSuunta">–</b><span id="kIlmans"></span></div><div class="kraj" id="kRaja" data-a="rajoitusTiedot" hidden><i id="kRajaLuku"></i><span id="kRajaS"></span></div><div class="kkal" id="kKalRivi" hidden><em class="kvene"><i id="kKalViiva"><svg viewBox="0 0 40 34" aria-hidden="true"><path d="M20 2v7" stroke="#12222f" stroke-width="1.6" stroke-linecap="round"/><path d="M12.5 17l2-8h11l2 8z" fill="#cfe6ec" stroke="#0b7a8f" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 17h32l-3.5 8.5q-12.5 5-25 0z" fill="#0b7a8f" stroke="#075565" stroke-width="1.2" stroke-linejoin="round"/><rect x="18" y="24" width="4" height="7" rx="1.2" fill="#12222f"/></svg></i></em><b id="kKal">–</b><span id="kKalS"></span></div></div><button class="ktuuli" id="kTuuli" data-a="tuuliAika" hidden title="Vaihda ennusteen ajankohtaa"><b></b><span></span></button></div>' +
    '<div class="knapit"><button data-a="keskita" id="lKarttaK" aria-label="Keskitä veneeseen" title="Keskitä veneeseen">' + KESKITA + '</button>' +
    '<button data-a="kompassi" id="kKompassi" aria-label="Käännä kartta kulkusuuntaan" title="Käännä kartta kulkusuuntaan"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6"/><path d="M12 3.6l3.1 8.4H8.9z" fill="#e01b24" stroke="none"/><path d="M12 20.4L8.9 12h6.2z" fill="#9aa7b1" stroke="none"/></svg></button>' +
    '<button data-a="zoom" data-id="1" aria-label="Lähennä">+</button><button data-a="zoom" data-id="-1" aria-label="Loitonna">−</button>' +
    '<button data-a="reitti" aria-label="Reittisuunnittelu" title="Reittisuunnittelu"><svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5"/></svg></button>' +
    '<button data-a="kalapaikka" aria-label="Lisää kalapaikka" title="Lisää kalapaikka"><svg viewBox="0 0 24 24"><path d="M2.5 12c2.6-4.6 8.6-6 13-2.6L20.5 6v12l-5-3.4c-4.4 3.4-10.4 2-13-2.6z"/><circle cx="7.5" cy="11" r=".9" fill="currentColor"/></svg></button>' +
    '<button data-a="kartat" aria-label="Karttapohja ja lataus" title="Karttapohja ja lataus"><svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button></div>' +
    '<button class="kais" id="kAis" data-a="aisNyt" hidden title="Päivitä AIS-tiedot nyt"></button><button class="ktutka" id="kTutka" data-a="tutkaAnim" hidden title="Näytä viimeisen tunnin sadekuvat liikkuvana"><b></b><span></span></button><button class="ktila" id="kTila" data-a="matkaSivu"></button>' + (omaR ? omaPalkki() : reittiPalkki()) + '<div class="ktekija"><span id="kTekija">' + nayttoKartta(lv).tekija + '</span><span id="kTutkaL" hidden></span></div></div>';
}
function paivitaLive() {
  const f = gps.viime, m = tal.m, matkalla = tal.tila === 'matka', paalla = watchId != null;
  if ($('#lKartta')) {
    liveKartta(); paivitaReittiPalkki();
    const s = f && paalla && f.cog != null && !isNaN(f.cog) && f.sog > 0.5 ? f.cog : null;
    $('#kNopeus').textContent = f && paalla ? n(nopeus(f.sog)) : '–';
    $('#kSuunta').textContent = s != null ? Math.round(s) + '°' : '–';
    $('#kIlmans').textContent = s != null ? ilmansuunta(s) : 'suunta';
    const rj = $('#kRaja'), on = T.as.rajoitus && paalla && raj.nyt.length > 0; rj.hidden = !on; $('#kNopeus').classList.toggle('yli', !!(on && raj.yli));
    if (on) { rj.classList.toggle('yli', raj.yli); $('#kRajaLuku').textContent = raj.raja != null ? raj.raja : '!'; $('#kRajaS').textContent = raj.raja != null ? 'km/h' + (kmh() ? '' : ' = ' + n(raj.raja / 1.852) + ' kn') : raj.nyt[0].t.split(',')[0]; }
    const t = $('#kTila'); t.className = 'ktila' + (matkalla ? ' rec' : paalla ? ' odota' : '');
    t.textContent = matkalla ? 'Tallennetaan · ' + n(m.matka / MPK, 2) + ' mpk · ' + kesto(((f ? f.t : Date.now()) - m.alku) / 1000) : paalla ? 'Odottaa lähtöä' : (gps.virhe ? 'Sijaintia ei saada' : 'Seuranta pois päältä');
  }
  if (!$('#lTila')) return;
  $('#lPallo').className = 'pallo' + (matkalla ? ' rec' : paalla ? ' odota' : '');
  $('#lTila').textContent = matkalla ? 'Tallennetaan matkaa' : paalla ? 'Odottaa lähtöä' : 'Seuranta ei ole päällä';
  $('#lSelite').textContent = matkalla ? 'Lähtö klo ' + klo(m.alku) + (m.pisteet[0] && paikkaNimi([m.pisteet[0][1], m.pisteet[0][2]]) ? ' · ' + paikkaNimi([m.pisteet[0][1], m.pisteet[0][2]]) : '') + (T.as.auto ? ' · päättyy itsestään, kun vene on ollut paikallaan ' + T.as.pysMin + ' min' : '')
    : paalla ? (T.as.auto ? 'Tallennus alkaa itsestään, kun vene lähtee liikkeelle. Pidä sovellus auki.' : 'Automatiikka on pois – aloita matka napista.')
      : 'Käynnistä seuranta, niin matkat tallentuvat itsestään.';
  $('#lNopeus').textContent = f && paalla ? n(nopeus(f.sog)) : '–';
  $('#lSuunta').textContent = f && paalla && f.cog != null && !isNaN(f.cog) && f.sog > 0.5 ? Math.round(f.cog) + '°' : '–';
  $('#lMatka').textContent = matkalla ? n(m.matka / MPK, 2) : '–';
  $('#lAika').textContent = matkalla ? kesto(((f ? f.t : Date.now()) - m.alku) / 1000) : '–';
  $('#lMax').textContent = matkalla ? n(nopeus(m.max)) : '–';
  const tunnus = (matkalla ? 'm' : paalla ? 'p' : 'e');
  if ($('#lNapit').dataset.t !== tunnus) {
    $('#lNapit').dataset.t = tunnus;
    $('#lNapit').innerHTML = matkalla ? '<button class="nappi paa leva" data-a="lopeta">Lopeta matka</button>'
      : paalla ? '<button class="nappi paa" data-a="aloita">Aloita matka nyt</button><button class="nappi" data-a="seurantaPois">Pysäytä seuranta</button>'
        : '<button class="nappi paa leva" data-a="seuranta">Käynnistä seuranta</button>';
  }
  $('#lGps').textContent = gps.virhe || (!paalla ? 'Seuranta käyttää puhelimen GPS:ää ja pitää näytön päällä.' : f ? 'GPS ±' + Math.round(f.acc || 0) + ' m · ' + koord(f.lat, f.lon) : 'Haetaan sijaintia…');
}

function nLoki() {
  const lista = vuodelta(matkat, m => m.alku).sort((a, b) => b.alku - a.alku);
  const mpk = lista.reduce((a, m) => a + m.matka / MPK, 0), liike = lista.reduce((a, m) => a + m.liike, 0), h = lista.reduce((a, m) => a + (m.moottori_h || 0), 0);
  return '<div class="otsrivi"><h2>Matkat</h2>' + vuosiValinta() + '</div>' +
    '<div class="kortti"><div class="luvut"><div class="luku"><b>' + lista.length + '</b><span>matkaa</span></div><div class="luku"><b>' + n(mpk) + '</b><span>mpk</span></div><div class="luku"><b>' + n(liike / 3600) + '</b><span>h liikkeellä</span></div><div class="luku"><b>' + n(h) + '</b><span>moottori-h</span></div></div></div>' +
    '<div class="kortti">' + (lista.length ? lista.map(m => '<div class="rivi" data-a="' + (valinta ? 'valitse' : 'avaa') + '" data-id="' + m.id + '">' + (valinta ? '<input type="checkbox" class="valruutu" aria-label="Valitse matka"' + (valinta.has(m.id) ? ' checked' : '') + '>' : '') + '<div class="v"><b>' + e(paatepiste(m.mista, m.a)) + ' → ' + e(paatepiste(m.minne, m.b)) + '</b><span class="pieni">' + pvm(m.alku) + ' klo ' + klo(m.alku) + (m.saa ? ' · ' + e(saaTeksti(m.saa)) : '') + '</span></div><div class="o"><b>' + n(m.matka / MPK) + ' mpk</b><span class="pieni">' + kesto((m.loppu - m.alku) / 1000) + '</span></div></div>').join('')
      : '<div class="tyhja">Ei vielä matkoja. Käynnistä seuranta Matka-välilehdeltä tai lisää matka käsin.</div>') + '</div>' +
    (valinta ? '<div class="pieni" style="margin:0 2px 4px">Valitse poistettavat matkat napauttamalla.</div><div class="napit"><button class="nappi" data-a="valintaPois">Peruuta</button><button class="nappi" data-a="valitseKaikki">Valitse kaikki</button><button class="nappi vaara" data-a="poistaValitut"' + (valinta.size ? '' : ' disabled') + '>Poista valitut (' + valinta.size + ')</button></div>'
      : '<div class="napit"><button class="nappi" data-a="uusiMatka">Lisää matka käsin</button><button class="nappi" data-a="csv">Vie taulukkoon (CSV)</button>' + (lista.length ? '<button class="nappi vaara" data-a="valintaTila">Poista matkoja</button>' : '') + '</div>');
}

function nYksi() {
  const m = matkat.find(x => x.id === valittu); if (!m) { nakyma = 'loki'; return nLoki(); }
  const s = m.saa, jonossa = T.saajono.includes(m.id);
  return '<div class="otsrivi"><button class="nappi pien" data-a="takaisin">‹ Matkat</button><span class="pieni">' + pvm(m.alku) + '</span></div>' +
    '<div class="kortti"><h2>' + e(paatepiste(m.mista, m.a)) + ' → ' + e(paatepiste(m.minne, m.b)) + '</h2>' +
    '<div class="luvut"><div class="luku"><b>' + n(m.matka / MPK) + '</b><span>mpk</span></div><div class="luku"><b>' + kesto((m.loppu - m.alku) / 1000) + '</b><span>klo ' + klo(m.alku) + '–' + klo(m.loppu) + '</span></div><div class="luku"><b>' + (m.liike ? n(nopeus(m.matka / m.liike)) : '–') + '</b><span>keskinopeus, ' + NY() + '</span></div><div class="luku"><b>' + (m.max ? n(nopeus(m.max)) : '–') + '</b><span>huippu, ' + NY() + '</span></div><div class="luku"><b>' + n(m.moottori_h) + '</b><span>moottori-h</span></div>' + (m.kall ? '<div class="luku"><b>' + m.kall + '°</b><span>suurin kallistus</span></div>' : '') + '</div>' +
    (m.katkot ? '<p class="pieni">GPS-seurannassa oli ' + m.katkot + ' katkoa, joten matka voi olla todellista lyhyempi.</p>' : '') +
    (m.huom ? '<p>' + e(m.huom).replace(/\n/g, '<br>') + '</p>' : '') + '</div>' +
    (m.a ? karttaHtml('kartta', false) +
      '<div class="kortti"><h2>Nopeus matkan aikana (' + (kmh() ? 'km/h' : 'solmua') + ')</h2><canvas class="kayra" id="kayra"></canvas></div>' : '') +
    '<div class="kortti"><h2>Sää matkan aikana</h2>' + (s ? '<div class="luvut"><div class="luku"><b>' + n(s.tuuli) + '</b><span>tuuli m/s ' + ilmansuunta(s.suunta) + '</span></div><div class="luku"><b>' + n(s.puuska) + '</b><span>puuskat m/s</span></div><div class="luku"><b>' + n(s.aalto) + '</b><span>aalto m</span></div><div class="luku"><b>' + n(s.lampo) + '</b><span>°C</span></div><div class="luku"><b>' + n(s.sade) + '</b><span>sade mm</span></div></div><div class="pieni" style="margin-top:8px">Säämallin arvio matkan keskikohdasta (Open-Meteo), ei mittaus.</div>'
      : '<div class="pieni">' + (jonossa ? 'Sää haetaan, kun verkkoyhteys on käytössä.' : 'Säätä ei ole haettu.') + '</div>') +
    '<div class="napit"><button class="nappi pien" data-a="saaUudelleen">Hae sää uudelleen</button></div></div>' +
    (m.a ? '<div class="kortti"><h2>Aja sama matka uudelleen</h2><div class="pieni">Matkan jälki avautuu pääkartalle reitiksi, jota reitin seuranta opastaa. Tallennettu reitti löytyy myöhemmin reittisuunnittelun listasta.</div><div class="napit"><button class="nappi paa" data-a="matkaKartalle">Näytä pääkartalla</button><button class="nappi" data-a="matkaReitiksi">Tallenna reitiksi</button></div></div>' : '') +
    '<div class="napit"><button class="nappi paa" data-a="muokkaaMatka">Muokkaa</button>' + (m.a ? '<button class="nappi" data-a="gpx">Vie GPX</button>' : '') + '<button class="nappi vaara" data-a="poistaMatka">Poista matka</button></div>';
}

function nKulut() {
  const tk = vuodelta(T.tankkaukset, x => x.pvm).sort((a, b) => a.pvm < b.pvm ? 1 : -1), ku = vuodelta(T.kulut, x => x.pvm).sort((a, b) => a.pvm < b.pvm ? 1 : -1);
  const l = tk.reduce((a, x) => a + x.litrat, 0), pe = tk.reduce((a, x) => a + (x.eur || 0), 0), me = ku.reduce((a, x) => a + x.summa, 0);
  const k = kulutus(T.tankkaukset), mpk = vuodelta(matkat, m => m.alku).reduce((a, m) => a + m.matka / MPK, 0);
  return '<div class="otsrivi"><h2>Polttoaine ja kulut</h2>' + vuosiValinta() + '</div>' +
    '<div class="kortti"><div class="luvut"><div class="luku"><b>' + n(l, 0) + '</b><span>litraa</span></div><div class="luku"><b>' + n(pe, 0) + '</b><span>polttoaine €</span></div><div class="luku"><b>' + n(me, 0) + '</b><span>muut kulut €</span></div><div class="luku"><b>' + n(pe + me, 0) + '</b><span>yhteensä €</span></div>' +
    '<div class="luku"><b>' + n(k.lh) + '</b><span>l / moottori-h</span></div><div class="luku"><b>' + n(k.lmpk, 2) + '</b><span>l / mpk</span></div><div class="luku"><b>' + (mpk > 0 ? n((pe + me) / mpk, 2) : '–') + '</b><span>€ / mpk</span></div></div>' +
    '<div class="pieni" style="margin-top:8px">Kulutus lasketaan kahden täyden tankkauksen väliltä' + (k.valit.length ? ' (' + k.valit.length + ' väliä).' : ' – tarvitaan vähintään kaksi täyttä tankkausta.') + '</div></div>' +
    '<div class="kortti"><h2>Tankkaukset</h2>' + (tk.length ? tk.map(x => '<div class="rivi" data-a="tankkaus" data-id="' + x.id + '"><div class="v"><b>' + n(x.litrat) + ' l' + (x.taysi ? '' : ' (osatäyttö)') + '</b><span class="pieni">' + pvm(x.pvm) + ' · ' + n(x.tunnit) + ' h' + (x.huom ? ' · ' + e(x.huom) : '') + '</span></div><div class="o"><b>' + (x.eur != null ? eur(x.eur) : '') + '</b><span class="pieni">' + (x.eur && x.litrat ? n(x.eur / x.litrat, 3) + ' €/l' : '') + '</span></div></div>').join('') : '<div class="tyhja">Ei tankkauksia.</div>') +
    '<div class="napit"><button class="nappi paa" data-a="tankkaus">Lisää tankkaus</button></div></div>' +
    '<div class="kortti"><h2>Muut kulut</h2>' + (ku.length ? ku.map(x => '<div class="rivi" data-a="kulu" data-id="' + x.id + '"><div class="v"><b>' + e(x.kuvaus || x.laji) + '</b><span class="pieni">' + pvm(x.pvm) + ' · ' + e(x.laji) + '</span></div><div class="o"><b>' + eur(x.summa) + '</b></div></div>').join('') : '<div class="tyhja">Ei kuluja.</div>') +
    '<div class="napit"><button class="nappi paa" data-a="kulu">Lisää kulu</button></div></div>';
}

const huoltoTeksti = t => t.tila === 'tuntematon' ? 'Merkitse' : t.tila === 'myohassa' ? 'Myöhässä' : [t.jh != null ? n(t.jh, 0) + ' h' : '', t.jp != null ? (t.jp > 60 ? Math.round(t.jp / 30) + ' kk' : t.jp + ' pv') : ''].filter(Boolean).join(' / ');
function nHuolto() {
  const h = tunnitNyt(), nyt = Date.now(), jarj = { myohassa: 0, pian: 1, tuntematon: 2, ok: 3 };
  const lista = T.huollot.map(x => ({ x, t: huoltoTila(x, h, nyt) })).sort((a, b) => jarj[a.t.tila] - jarj[b.t.tila]);
  return '<div class="otsrivi"><h2>Huollot</h2><span class="pieni">Moottoritunnit ' + n(h) + ' h</span></div>' +
    '<div class="kortti">' + lista.map(({ x, t }) => '<div class="rivi" data-a="tehty" data-id="' + x.id + '"><div class="v"><b>' + e(x.nimi) + '</b><span class="pieni">' + [x.valiH ? x.valiH + ' h' : '', x.valiKk ? x.valiKk + ' kk' : ''].filter(Boolean).join(' / ') + ' välein' + (x.tehtyPvm ? ' · viimeksi ' + pvm(x.tehtyPvm) + (x.tehtyH != null ? ' (' + n(x.tehtyH) + ' h)' : '') : ' · ei merkintää') + '</span></div><span class="merkki ' + t.tila + '">' + huoltoTeksti(t) + '</span><button class="nappi pien" data-a="huolto" data-id="' + x.id + '">⋯</button></div>').join('') + '</div>' +
    '<div class="pieni" style="margin:0 2px 10px">Napauta riviä, kun huolto on tehty. Välit ovat yleisiä oletuksia – tarkista oikeat arvot moottorin ja veneen ohjekirjasta.</div>' +
    '<div class="napit"><button class="nappi" data-a="huolto">Lisää huoltokohde</button></div>';
}

function nLisaa() {
  const v = T.vene, vanha = kopioVanha();
  return '<div class="kortti"><h2>Vene</h2><div class="rivi" data-a="vene"><div class="v"><b>' + e(v.nimi || 'Nimeä vene') + '</b><span class="pieni">Lähtölukemat: ' + n(v.tunnit0) + ' moottori-h, ' + n(v.mpk0, 0) + ' mpk · syväys ' + (v.syvays ? n(v.syvays) + ' m' : 'ei asetettu') + ' · matkanopeus ' + n(v.nopeus || 10, 0) + ' kn</span></div><span class="pieni">Muokkaa</span></div></div>' +
    '<div class="kortti"><h2>Sijainti (GPS)</h2><div class="pieni" id="gpsTila"></div><div class="napit"><button class="nappi paa" data-a="gpsLupa">Pyydä sijaintilupa ja käynnistä GPS</button></div>' +
    '<div class="pieni">Jos puhelin ei kysy lupaa tai lupa on estetty, salli sijainti puhelimen asetuksista ja paina nappia uudelleen. <b>iPhone ja iPad:</b> Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut päälle → Safari-sivustot → "Kysy" tai "Appia käytettäessä" ja Tarkka sijainti päälle. <b>Android:</b> Asetukset → Sijainti päälle; Chromessa osoiterivin lukko → Käyttöoikeudet → Sijainti → Salli. Valikoiden nimet vaihtelevat hieman laitteen ja version mukaan.</div></div>' +
    '<div class="kortti"><h2>Kotisatama</h2><div class="rivi" data-a="koti"><div class="v"><b>' + e(T.koti ? T.koti.nimi : 'Aseta kotisatama') + '</b><span class="pieni">' + (T.koti ? koord(T.koti.lat, T.koti.lon) : 'Tarvitaan reittiin "Kotisatamaan"') + '</span></div><span class="pieni">' + (T.koti ? 'Vaihda' : 'Aseta') + '</span></div></div>' +
    '<div class="kortti"><h2>Nopeusrajoitukset</h2><label class="kytkin"><span>Näytä rajoitusalueet ja varoita ylinopeudesta</span><input type="checkbox" data-c="rajoitus"' + (T.as.rajoitus ? ' checked' : '') + '></label>' +
    '<div class="pieni" id="rajTila"></div><div class="pieni">Kun ajat rajoitusalueella, kartan mittariin tulee rajoitusmerkki. Ylinopeudesta puhelin värisee ja piippaa, ja nopeuslukema muuttuu punaiseksi. Rajoitukset ovat kilometreinä tunnissa. Vesillä olevat merkit ratkaisevat: aineistossa voi olla puutteita, ja osa rajoituksista ei koske yleistä kulkuväylää.</div>' +
    '<div class="napit"><button class="nappi pien" data-a="rajoitusLataa">Lataa tai päivitä rajoitusalueet</button></div></div>' +
    '<div class="kortti"><h2>Kartan lisätiedot</h2><div class="pieni">Nämä haetaan verkosta, joten ne näkyvät vain, kun yhteys on käytössä.</div>' +
    [["tuuli","Tuuli ja sää","Tuulinuolet, puuskat, lämpötila ja aallonkorkeus kartalla; ennuste 24 tuntia eteenpäin."],["tutka","Sadetutka","Ilmatieteen laitoksen tutkakuva kartan päällä: missä sataa juuri nyt. Päivittyy viiden minuutin välein, ja kartan Sadetutka-napista näkee viimeisen tunnin liikkeen. Vaatii verkkoyhteyden."],["ais","Muut alukset (AIS)","Lähialueen alukset kartalla. Päivittyy noin minuutin välein."],["satamat","Satamat ja polttoaineasemat","Suomenlahden, Saaristomeren ja Selkämeren venesatamat palvelutietoineen. Tiedot tulevat sovelluksen mukana, joten ne näkyvät myös ilman verkkoa."],["luiskat","Veneenlaskuluiskat","Paikat, joissa veneen voi laskea trailerilta veteen. Tiedot tulevat sovelluksen mukana ja näkyvät, kun kartta on lähennetty."],["saunat","Yleiset saunat saarissa","Helsingin ja Espoon edustan saarten saunat, joihin kuka tahansa pääsee vuorolle tai varaamalla. Tiedot tulevat sovelluksen mukana."]].map(k => '<label class="kytkin"><span>' + k[1] + '<br><span class="pieni">' + k[2] + '</span></span><input type="checkbox" data-c="' + k[0] + '"' + (T.as[k[0]] ? ' checked' : '') + '></label>').join('') +
    '<div class="pieni">Lähteet: sää Open-Meteo (säämallin ennuste, ei mittaus), AIS Fintraffic / Digitraffic, satamat OpenStreetMap. Haettaessa palvelut näkevät, mitä kartan aluetta katsot.</div>' +
    '<div class="pieni" id="satamaTila">' + (st => st ? 'Satamatiedot: ' + st.lista.length + ' kohdetta, päivätty ' + pvm(st.haettu) + '.' : '')(lisa.satamat || satamaPaketti()) + '</div>' +
    '<div class="napit"><button class="nappi pien" data-a="satamatPaivita">Päivitä satamatiedot verkosta</button></div></div>' +
    '<div class="kortti"><h2>Kallistusmittari</h2><label class="kytkin"><span>Näytä kallistus kartalla</span><input type="checkbox" data-c="kallistus"' + (T.as.kallistus ? ' checked' : '') + '></label>' +
    '<div class="pieni" id="kallNyt"></div><div class="pieni">Käyttää puhelimen asentoanturia. Kiinnitä puhelin tukevasti telineeseen näyttö itseesi päin (tai laske se tasaiselle alustalle yläreuna keulaan päin) ja paina Nollaa, kun vene on suorassa. Lukema kertoo puhelimen asennon: irrallaan oleva puhelin, kiihdytykset, käännökset ja aallokko vääristävät sitä.</div>' +
    '<div class="napit"><button class="nappi" data-a="kallNolla">Nollaa (vene suorassa)</button></div></div>' +
    '<div class="kortti"><h2>Yksiköt</h2><label class="kytkin"><span>Nopeus</span><select data-c="yksikko"><option value="kn"' + (kmh() ? '' : ' selected') + '>Solmut (kn)</option><option value="kmh"' + (kmh() ? ' selected' : '') + '>Kilometrit tunnissa (km/h)</option></select></label><div class="pieni">Matkat näytetään aina meripeninkulmina (mpk).</div></div>' +
    '<div class="kortti"><h2>Automatiikka</h2><label class="kytkin"><span>Matka päättyy, kun vene on ollut paikallaan</span><select data-c="pysMin">' + [5, 10, 15, 30, 60].map(x => '<option value="' + x + '"' + (x === T.as.pysMin ? ' selected' : '') + '>' + x + ' min</option>').join('') + '</select></label>' +
    '<div class="pieni">Lyhyt aika pilkkoo matkan osiin esimerkiksi tankkauksen tai lounastauon kohdalta.</div></div>' +
    '<div class="kortti"><h2>Paikat</h2>' + (T.paikat.length ? T.paikat.map((p, i) => '<div class="rivi" data-a="paikka" data-id="' + i + '"><div class="v"><b>' + e(p.nimi) + '</b><span class="pieni">' + koord(p.lat, p.lon) + ' · säde ' + (p.sade || 400) + ' m</span></div></div>').join('') : '<div class="pieni">Satamat ja laiturit tunnistetaan sijainnista. Paikka tallentuu, kun nimeät matkan lähtö- tai tulopaikan.</div>') +
    '<div class="napit"><button class="nappi" data-a="paikkaTassa">Tallenna nykyinen sijainti paikaksi</button></div></div>' +
    '<div class="kortti"><h2>Varmuuskopio</h2><div class="pieni">Tiedot ovat vain tämän puhelimen selaimessa. Jos selaimen tiedot tyhjennetään tai puhelin vaihtuu, ne häviävät – vie kopio talteen säännöllisesti.' + (T.kopio ? ' Viimeisin kopio ' + pvm(T.kopio) + '.' : ' Kopiota ei ole vielä otettu.') + (vanha ? ' <b>Ota uusi kopio.</b>' : '') + '</div>' +
    '<div class="napit"><button class="nappi paa" data-a="vie">Vie varmuuskopio</button><button class="nappi" data-a="tuo">Palauta kopiosta</button></div><input type="file" id="tuoTiedosto" accept=".json,application/json" hidden></div>' +
    '<div class="kortti"><h2>Kartat ja väylätiedot ilman verkkoa</h2><div class="pieni">Alla olevat napit lataavat laitteelle valitun merialueen merikartan sekä väylät, merimerkit ja nopeusrajoitusalueet. Alueet ladataan erikseen. Reitti kulkee alueelta toiselle, kun vierekkäiset alueet on ladattu (Suomenlahti–Saaristomeri–Selkämeri). Merikartan katsotut alueet tallentuvat laitteelle myös itsestään; kartalla näkyvän alueen saat talteen kartan tasonapista (alin pyöreä nappi).<span id="karttaTila"></span></div><div class="napit">' + alueNapit() + '<button class="nappi vaara" data-a="tyhjennaKartat">Poista tallennetut kartat</button></div></div>' +
    '<div class="kortti"><h2>Norjan rannikko</h2><div class="pieni">Norjan merikartta (Kartverket) näkyy automaattisesti, kun kartta on Norjan vesillä, ja sen saa myös valittua karttapohjaksi. Alla olevat napit lataavat alueen kartan laitteelle, jolloin se näkyy ilman verkkoa. Norjasta on vain kartta: väylätiedot, nopeusrajoitukset ja syvyyskäyrät eivät kata Norjaa.</div><div class="pieni">Norjan merikartalla satamat ja väylät ovat päällä automaattisesti. Väylät (Kystverketin pää- ja sivuväylät, noin 1 Mt koko maasta) haetaan itsestään, kun Norjan kartta avataan verkossa ensimmäisen kerran; alla olevalla napilla ne voi päivittää. Väylät piirtyvät kartalle violetteina viivoina, ja reittisuunnittelu osaa kulkea niitä pitkin. Väylissä ei ole kulkusyvyyttä eikä merimerkkejä, joten veneen syväystä ei huomioida Norjassa.</div><div class="napit"><button class="nappi paa" data-a="lataaNorjaVaylat">Lataa Norjan väylät</button>' + NORJA.map(a => '<button class="nappi" data-a="lataaNorja" data-id="' + a.id + '">' + a.nimi + '</button>').join('') + '</div></div>' +
    '<div class="kortti"><h2>Kalapaikat (' + T.kalapaikat.length + ')</h2>' + (T.kalapaikat.length ? '<div class="plista">' + T.kalapaikat.map(k => '<div class="rivi" data-a="kalapaikkaAvaa" data-id="' + k.id + '"><div class="v"><b>' + e(k.nimi) + '</b><span class="pieni">' + (k.lajit ? e(k.lajit) + ' · ' : '') + koord(k.lat, k.lon) + '</span></div><span class="pieni">Avaa</span></div>').join('') + '</div>'
      : '<div class="pieni">Ei vielä kalapaikkoja. Lisää paikka kartan kalanapista: omaan sijaintiin tai napauttamalla karttaa. Paikat näkyvät kartalla kalan kuvana, ja ne tallentuvat vain tälle laitteelle ja varmuuskopioon.</div>') + '</div>' +
    '<div class="kortti"><h2>Syvyyskäyrät</h2><div class="pieni">Merikartan syvyyskäyrät (3, 6, 10, 20 metriä ja muut kartoitetut syvyydet) omana karttatasonaan, josta matalikot, penkat ja syvänteiden reunat erottuvat selvästi. Käyrät ladataan alueittain laitteelle, minkä jälkeen ne näkyvät ilman verkkoa. Näkyviin ne kytketään kartan tasonapista kohdasta Syvyyskäyrät.</div>' +
    ALUEET.map(a => '<div class="rivi" data-a="syvyysLataa" data-id="' + a.id + '"><div class="v"><b>' + a.nimi + '</b><span class="pieni" id="syvTila-' + a.id + '">Ei ladattu</span></div><span class="pieni">Lataa</span></div>').join('') +
    '<div class="napit"><button class="nappi vaara pien" data-a="syvyysPoista">Poista ladatut syvyyskäyrät</button></div>' +
    '<div class="pieni">Lähde: Liikenne- ja viestintävirasto Traficom, merikartta-aineisto (latauspäivä näkyy alueen kohdalla). Käyttö Traficomin merikartoitusaineiston lisenssin mukaan: aineistoa ei saa käyttää navigointiin, eikä se täytä asianmukaisen merikartan vaatimuksia. Käyrät on yksinkertaistettu noin 4 metrin tarkkuuteen.</div></div>' +
    (T.saajono.length ? '<div class="kortti"><h2>Sää</h2><div class="pieni">' + T.saajono.length + ' matkan sää odottaa verkkoyhteyttä.</div><div class="napit"><button class="nappi" data-a="saaNyt">Hae nyt</button></div></div>' : '') +
    '<div class="kortti"><h2>Hyvä tietää</h2><div class="pieni">Seuranta toimii vain, kun sovellus on auki ja näyttö päällä; sovellus pitää näytön päällä itse. Sää haetaan Open-Meteosta noin kilometrin tarkkuuteen pyöristetyllä sijainnilla. Karttapohja haetaan Traficomin avoimesta merikarttapalvelusta tai OpenStreetMapista, jolloin palvelu näkee, mitä aluetta katsot. Merikartta on rasterikuva, jota ei päivitetä kuten virallista karttaa – älä navigoi sen varassa. Muuta tietoa laitteelta ei lähde.</div></div>';
}
const kopioVanha = () => (matkat.length || T.tankkaukset.length || T.kulut.length) && (!T.kopio || Date.now() - T.kopio > 30 * 864e5);

function merkit() {
  const h = tunnitNyt(), nyt = Date.now(), maara = T.huollot.filter(x => ['myohassa', 'pian'].includes(huoltoTila(x, h, nyt).tila)).length;
  $('#huoltoMerkki').textContent = maara || '';
  $('#lisaaMerkki').textContent = kopioVanha() ? '!' : '';
  $('#verkko').textContent = navigator.onLine ? '' : 'ei verkkoa';
}
function piirra() {
  const f = { kartta: nKartta, matka: nMatka, loki: nLoki, yksi: nYksi, polttoaine: nKulut, huolto: nHuolto, opas: nOpas, lisaa: nLisaa }[nakyma] || nKartta;
  $('#sisalto').classList.toggle('taysi', nakyma === 'kartta');
  document.documentElement.style.setProperty('--ylak', $('#yla').offsetHeight + 'px');
  $('#sisalto').innerHTML = f();
  document.querySelectorAll('#valikko button').forEach(b => b.classList.toggle('on', b.dataset.n === (nakyma === 'yksi' ? 'loki' : nakyma)));
  merkit();
  lk = null; paivitaLive(); paivitaKall(true);
  if (nakyma === 'yksi' && $('#kartta')) DB.get('jaljet', valittu).then(p => { if (!p || !p.length || !$('#kartta')) return; jalki = p; const uusi = !dv; if (uusi) dv = { lat: 0, lon: 0, z: 10, seuraa: false }; kYksi = new Kartta($('#kartta'), dv); kYksi.pts = p; if (uusi) kYksi.sovita(p); kYksi.piirra(); if ($('#kayra')) piirraKayra($('#kayra'), p); });
  if (nakyma === 'lisaa') { paivitaKarttaTila(); paivitaRajTila(); paivitaGpsTila(); paivitaSyvyysTila(); }
}

// ---------- kartta ----------
// Karttapohjat. Merikartta on Traficomin avoin rasterimerikartta (WMTS), maastokartta OpenStreetMap.
// Merikartan palat tallennetaan laitteelle (IndexedDB "laatat"), joten katsottu tai ladattu alue toimii ilman verkkoa.
const KARTAT = {
  meri: { id: 'meri', nimi: 'Suomen merikartta rasteri', maxZ: 15, talteen: true, tekija: 'Merikartta © Traficom, CC BY 4.0. Ei navigointiin.',
    url: (z, x, y) => 'https://julkinen.traficom.fi/rasteripalvelu/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=Traficom%3A' + (z < 10 ? 'Yleiskartat%20250k' : 'Merikarttasarjat') + '%20public&style=&tilematrixset=WGS84_Pseudo-Mercator&tilematrix=WGS84_Pseudo-Mercator%3A' + z + '&tilerow=' + y + '&tilecol=' + x + '&format=image%2Fpng' },
  satama: { id: 'satama', minZ: 14, talteen: true, url: (z, x, y) => 'https://julkinen.traficom.fi/rasteripalvelu/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=Traficom%3ASatamakartat&style=&tilematrixset=WGS84_Pseudo-Mercator&tilematrix=WGS84_Pseudo-Mercator%3A' + z + '&tilerow=' + y + '&tilecol=' + x + '&format=image%2Fpng' },
  maa: { id: 'maa', nimi: 'Maastokartta', maxZ: 17, talteen: false, tekija: 'Kartta © OpenStreetMapin tekijät. Näkyy vain verkossa.', url: (z, x, y) => 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png' }
};
KARTAT.meri.paalle = KARTAT.satama;
// Merikartta S-57: Traficomin S-57-katselupalvelu (WMS). Palvelu piirtää kuvan pyynnöstä, joten pala pyydetään XYZ-palan rajoilla (EPSG:3857-metreinä).
// Tarkin haettava taso on 15; sitä lähempää näytetään tason 15 pala suurennettuna (nakyZ). Tallennusavaimessa ovat tyyli ja kuvamuoto,
// jotta eri lähteiden ja tyylien palat eivät sekoitu. Tasot alle 8 otetaan yleiskartasta: koko maan piirto S-57:stä kestää palvelussa kymmeniä sekunteja.
const S57_R = 20037508.342789244, S57_TYYLI = 'style-id-220';
function s57Url(z, x, y, tyyli) {
  const s = (2 * S57_R) / 2 ** z, minx = -S57_R + x * s, maxy = S57_R - y * s;
  return 'https://julkinen.traficom.fi/s57/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=cells&STYLES=' + (tyyli || S57_TYYLI) +
    '&SRS=EPSG:3857&BBOX=' + [minx, maxy - s, minx + s, maxy].map(v => v.toFixed(2)).join(',') + '&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng8';
}
// wms = jokainen onnistunut vastaus on kuva (virhe tulee XML:nä), tyhja = tätä pienempi pala on tyhjä tai yksivärinen (mitattu 520–534 tavua),
// rinnakkain ja tauko = latauksen tahti, arvio = mittaukset 2026-11-23: Mt / pala ja palaa sekunnissa (vaihteluväli)
KARTAT.s57 = { id: 's57', avain: 's57|' + S57_TYYLI + '|png8', nimi: 'Suomen merikartta S-57', maxZ: 15, nakyZ: 17.5, talteen: true, wms: true, tyhja: 600, rinnakkain: 2, tauko: 80,
  tekija: 'Lähde: Traficom. Ei navigointikäyttöön. Ei täytä asianmukaisen merikartan vaatimuksia.',
  arvio: { pala: 0.022, osuus: 0.6, k14: 0.014, k15: 0.005, nopeus: [1, 2] },
  url: (z, x, y) => z < 8 ? KARTAT.meri.url(z, x, y) : s57Url(z, x, y) };
// Norjan merikartta: Kartverketin avoin karttapalvelu (WMTS-välimuisti, taso sjokartraster), tavalliset z/y/x-palat tasoilla 4–18 (mitattu 2026-11-24).
// Tyhjä pala on 334–857 tavua. Karttaa käytetään automaattisesti Norjan vesillä (nayttoKartta), vaikka valittuna on Suomen merikartta.
KARTAT.norja = { id: 'norja', nimi: 'Norjan merikartta rasteri', maxZ: 16, talteen: true, tekija: 'Merikartta © Kartverket, CC BY 4.0. Ei navigointikäyttöön.',
  arvio: { pala: 0.02, osuus: 0.6, k14: 0.012, k15: 0.008, nopeus: [4, 10] },
  url: (z, x, y) => 'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/' + z + '/' + y + '/' + x + '.png' };
const POHJAT = ['s57', 'meri', 'norja', 'maa'];
// Oletuspohja vaihtui S-57:ään 2026-11-23: aiemmin tallennettu oletus (vanha merikartta) vaihdetaan kerran, sen jälkeen käyttäjän valinta pysyy.
function karttaOletus(vanha) { if (vanha && vanha.karttaV >= 2) return; if (T.as.kartta === 'meri') T.as.kartta = 's57'; T.as.karttaV = 2; }
// Kartan kierto piirron aikana (radiaaneina): pysty() kääntää merkin ja sen tekstin takaisin pystyyn, kun kartta on käännetty kulkusuuntaan.
// kVenytys: kallistetussa 3D-näkymässä merkit venytetään pystysuunnassa, jotta ne eivät näytä litistyneiltä.
let kKierto = 0, kVenytys = 1;
const pysty = (c, x, y) => { c.save(); if (kKierto || kVenytys !== 1) { c.translate(x, y); if (kKierto) c.rotate(-kKierto); if (kVenytys !== 1) c.scale(1, kVenytys); c.translate(-x, -y); } };
// S-57 ilman merimerkkien nimiä ("by Tero", "bn Harakka") ja loistojen tunnuksia ("Fl(1)G 3s 2M"): palvelun tyyli 202. Syvyysluvut ja symbolit ovat samat.
// Valinta T.as.s57Nimet (kartan valikko). Palat tallentuvat omalla avaimellaan, joten talteen ladattu kartta on valintakohtainen.
const S57_TYYLI_B = 'style-id-202';
KARTAT.s57b = Object.assign({}, KARTAT.s57, { avain: 's57|' + S57_TYYLI_B + '|png8', nimi: 'Suomen merikartta S-57 (ilman merimerkkien nimiä)', url: (z, x, y) => z < 8 ? KARTAT.meri.url(z, x, y) : s57Url(z, x, y, S57_TYYLI_B) });
const s57K = () => T.as.s57Nimet === false ? KARTAT.s57b : KARTAT.s57;
const pohja = () => POHJAT.includes(T.as.kartta) ? T.as.kartta : 's57';
const kartta = () => pohja() === 's57' ? s57K() : KARTAT[pohja()];
const latausKartta = () => kartta().talteen ? kartta() : KARTAT.meri;      // talteen ladataan valittu merikartta
const ylaZ = K => K.nakyZ || K.maxZ + 1.5;
const laattaAvain = K => (K.avain || K.id) + '/';
// Traficom palauttaa kartoittamattomalta alueelta läpinäkyvän palan: sellainen tulkitaan puuttuvaksi.
function tyhjaKuva(im) {
  const c = tyhjaKuva.c || (tyhjaKuva.c = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
  c.canvas.width = c.canvas.height = 8; c.clearRect(0, 0, 8, 8); c.drawImage(im, 0, 0, 8, 8);
  const d = c.getImageData(0, 0, 8, 8).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
  return true;
}
const rajaa = (v, a, b) => Math.max(a, Math.min(b, v));
const mx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z, my = (lat, z) => (1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2 * 256 * 2 ** z;
const lonX = (x, z) => x / (256 * 2 ** z) * 360 - 180, latY = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (256 * 2 ** z)))) / RAD;
let jalki = null, lk = null, kulku = null, kLive = null, kYksi = null, dv = null;
const lv = { lat: 59.95, lon: 25.0, z: 8, seuraa: true, alussa: true };     // päänäkymän kartan tila säilyy välilehteä vaihdettaessa
const KESKITA = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
function karttaHtml(id, paa) {
  return '<div class="kortti"><div class="karttak"><canvas class="kartta' + (paa ? ' paa' : '') + '" id="' + id + '"></canvas><div class="knapit">' +
    '<button data-a="keskita" id="' + id + 'K" aria-label="' + (paa ? 'Keskitä veneeseen' : 'Näytä koko reitti') + '" title="' + (paa ? 'Keskitä veneeseen' : 'Näytä koko reitti') + '">' + KESKITA + '</button>' +
    '<button data-a="zoom" data-id="1" aria-label="Lähennä">+</button><button data-a="zoom" data-id="-1" aria-label="Loitonna">−</button></div></div>' +
    '<div class="ktyo"><select data-c="kartta">' + POHJAT.map(k => '<option value="' + k + '"' + (k === pohja() ? ' selected' : '') + '>' + KARTAT[k].nimi + '</option>').join('') + '</select>' +
    '</div><div class="pieni">' + kartta().tekija + '</div></div>';
}

// Karttapalat: muisti -> laitteen tallennus -> verkko. Palauttaa kuvan, null (ei saatavilla) tai undefined (haku kesken).
const muisti = new Map();
function haeLaatta(K, z, x, y, lataa) {
  // lataa: true / undefined = laitteelta tai verkosta, 'db' = vain laitteelle tallennettu (ei verkkohakua), false = vain jo muistissa oleva
  const avain = laattaAvain(K) + z + '/' + x + '/' + y, vainDb = lataa === 'db'; let m = muisti.get(avain);
  // eiDb = palaa ei ole laitteella, verkosta ei ole vielä kysytty: täysi haku saa yrittää verkkoa
  if (m && !(m.eiDb && !vainDb && lataa !== false)) return m.im || (m.ei || m.eiDb ? null : undefined);
  if (lataa === false) return undefined;
  const dbKatsottu = !!m;
  if (m) m.eiDb = false; else { m = { im: null, ei: false, eiDb: false }; muisti.set(avain, m); }
  if (muisti.size > 900) { let i = 0; for (const k of muisti.keys()) { if (i++ >= 250) break; muisti.delete(k); } }
  const valmis = src => { const im = new Image(); im.onload = () => { if (src.startsWith('blob:')) { URL.revokeObjectURL(src); if (tyhjaKuva(im)) { m.ei = true; laattaSaapui(); return; } } m.im = im; laattaSaapui(); }; im.onerror = () => { m.ei = true; laattaSaapui(); }; im.src = src; };
  if (!K.talteen) { if (vainDb) { m.eiDb = true; return null; } if (navigator.onLine) valmis(K.url(z, x, y)); else m.ei = true; return m.ei ? null : undefined; }
  (async () => {
    let b = null;
    if (!dbKatsottu) try { b = await DB.get('laatat', avain); } catch (x) { }
    if (!b && vainDb) { m.eiDb = true; laattaSaapui(); return; }
    let tilapainen = false;
    if (!b && navigator.onLine) { b = await haeKuva(K.url(z, x, y)); if (b) DB.put('laatat', b, avain).catch(() => { }); else tilapainen = b === undefined; }
    if (b) valmis(URL.createObjectURL(b));
    else {
      m.ei = true; laattaSaapui();
      // palvelun tai yhteyden tilapäinen virhe: pala unohdetaan hetken päästä, jolloin se haetaan uudelleen, jos se on yhä näkyvissä
      if (tilapainen) setTimeout(() => { if (muisti.get(avain) === m) { muisti.delete(avain); laattaSaapui(); } }, 12000);
    }
  })();
  return undefined;
}
// Karttapalan haku verkosta. Palauttaa kuvan, null (palaa ei ole) tai undefined (tilapäinen virhe).
// Karttapalvelu vastaa ruuhkassa satunnaisesti virheellä 500: palvelinvirhe yritetään muutaman kerran uudelleen.
// Yhteysvirhe tai yli 9 sekunnin odotus (heikko verkko merellä) lopettaa heti, ellei sitkea = true (alueen lataus talteen).
async function haeKuva(url, yrityksia, sitkea) {
  for (let i = 0; i < (yrityksia || 4); i++) {
    if (i) await new Promise(ok => setTimeout(ok, 300 + 700 * i + Math.random() * 400));
    try {
      const r = await fetch(url, AbortSignal.timeout ? { signal: AbortSignal.timeout(sitkea ? 20000 : 9000) } : undefined);
      if (r.ok) return /^image/.test(r.headers.get('content-type') || '') ? await r.blob() : null;
      if (r.status < 500 && r.status !== 429 && r.status !== 408) return null;
    } catch (x) { if (!sitkea || !navigator.onLine) return undefined; }
  }
  return undefined;
}
function laattaSaapui() { for (const k of [kLive, kYksi]) if (k && k.cv.isConnected) k.pyyda(); }
// Alueen palat tasoilta z0..z1. b = {lo0, lo1, la0 (etelä), la1 (pohjoinen)}
function laattaLista(b, z0, z1) {
  const l = [];
  for (let z = z0; z <= z1; z++) { const n = 2 ** z - 1, f = v => rajaa(Math.floor(v / 256), 0, n);
    for (let x = f(mx(b.lo0, z)); x <= f(mx(b.lo1, z)); x++) for (let y = f(my(b.la1, z)); y <= f(my(b.la0, z)); y++) l.push([z, x, y]); }
  return l;
}
async function lataaLaatat(lista, edistys, tila) {
  // tila.K = ladattava karttapohja (oletus: valittu merikartta). Jo tallessa olevat palat ohitetaan, joten keskeytynyt lataus jatkuu siitä, mihin jäi.
  // edistys(tehty, kaikki, lisa): lisa = ladattu määrä ja arvio jäljellä olevasta ajasta.
  const K = tila.K || latausKartta(), e = laattaAvain(K), t0 = Date.now(); let i = 0, ok = 0, ennestaan = 0, puuttuu = 0, perakkain = 0;
  const lisa = () => {
    let s = tila.tavut ? ' · ladattu ' + (tila.tavut < 10485760 ? (tila.tavut / 1048576).toFixed(1).replace('.', ',') : Math.round(tila.tavut / 1048576)) + ' Mt' : '';
    if (ok >= 20) { const min = (Date.now() - t0) / ok * (lista.length - i) / 60000; s += ' · jäljellä noin ' + (min < 1.5 ? 'minuutti' : min < 90 ? Math.round(min) + ' min' : (min / 60).toFixed(1).replace('.', ',') + ' h'); }
    return s;
  };
  const tyo = async () => {
    while (i < lista.length && !tila.peru) {
      const [z, x, y] = lista[i++], avain = e + z + '/' + x + '/' + y;
      try {
        if (await DB.onko('laatat', avain)) ennestaan++;
        else {
          const b = await haeKuva(K.url(z, x, y), 4, true);
          if (b) { await DB.put('laatat', b, avain); ok++; perakkain = 0; tila.tavut = (tila.tavut || 0) + b.size; }
          else {
            puuttuu++;
            // WMS-palvelusta jokainen pala pitäisi saada: usea peräkkäinen virhe tarkoittaa, että palvelu tai yhteys ei toimi
            if (K.wms && ++perakkain >= 8) { tila.virhe = true; tila.peru = true; }
          }
          if (K.tauko) await new Promise(o => setTimeout(o, K.tauko));
        }
        const S = K.paalle, sa = 'satama/' + z + '/' + x + '/' + y;       // tarkimmilla tasoilla myös satamakartta
        if (S && z >= S.minZ && !(await DB.onko('laatat', sa))) {
          // tasolla 15 satamakartta haetaan vain, jos tason 14 emopalassa on karttaa: satamakarttoja on vain pienillä alueilla
          const emo = z > S.minZ ? await DB.get('laatat', 'satama/' + (z - 1) + '/' + (x >> 1) + '/' + (y >> 1)) : null;
          if (z === S.minZ || (emo && emo.size > TYHJA_PALA) || tila.kaikkiSatamat) { const b = await haeKuva(S.url(z, x, y), 4, true); if (b) await DB.put('laatat', b, sa); }
        }
      } catch (x) { puuttuu++; if (x && x.name === 'QuotaExceededError') { tila.taynna = true; tila.peru = true; } }
      edistys(ok + ennestaan + puuttuu, lista.length, lisa());
    }
  };
  await Promise.all(Array.from({ length: K.rinnakkain || 4 }, tyo));
  for (const [k, m] of muisti) if (m.ei || m.eiDb) muisti.delete(k);      // aiemmin puuttuneet haetaan uudelleen
  return { ok, ennestaan, puuttuu };
}

// Yksi karttanäkymä. v = {lat, lon, z, seuraa}: keskipiste ja zoomaus (z voi olla murtoluku, jolloin palat skaalataan).
class Kartta {
  constructor(cv, v) { this.cv = cv; this.v = v; this.pts = []; this.vene = null; this.onMuutos = null; this.raf = 0; this._kuuntele(); }
  sovita(pts) {
    const W = this.cv.clientWidth, H = this.cv.clientHeight, v = this.v;
    const la = pts.map(p => p[1]), lo = pts.map(p => p[2]), la0 = Math.min(...la), la1 = Math.max(...la), lo0 = Math.min(...lo), lo1 = Math.max(...lo);
    let z = kartta().maxZ; for (; z > 3; z--) if (mx(lo1, z) - mx(lo0, z) <= W - 60 && my(la0, z) - my(la1, z) <= H - 60) break;
    v.z = z; v.lon = (lo0 + lo1) / 2; v.lat = latY((my(la0, 0) + my(la1, 0)) / 2, 0);
  }
  // Kulkusuuntaan käännetty kartta (kierto radiaaneina, 0 = pohjoinen ylhäällä): piirtoalue on näyttöä suurempi neliö, jota käännetään näytön keskipisteen ympäri.
  // Kallistetussa 3D-näkymässä (this.kall) piirtoalusta on näyttöä suurempi ja vene on sen alaosassa: ankkuri = kartan keskikohdan paikka piirtoalustalla.
  ankkuri() { const W = this.cv.clientWidth, H = this.cv.clientHeight; return this.kall ? [W / 2, H - this.kall.ala] : [W / 2, H / 2]; }
  koko() { const W = this.cv.clientWidth, H = this.cv.clientHeight; if (!this.kierto && !this.kall) return [W, H, W, H]; const a = this.ankkuri(), D = 2 * Math.ceil(Math.hypot(Math.max(a[0], W - a[0]), Math.max(a[1], H - a[1]))); return [W, H, D, D]; }
  // näytön kohta -> piirtoalueen kohta (sama kuin näytön kohta, kun karttaa ei ole käännetty)
  virt(x, y) { const [, , vW, vH] = this.koko(), a = this.ankkuri(), k = this.kierto || 0, sx = x - a[0], sy = y - a[1], co = Math.cos(k), si = Math.sin(k); return [sx * co + sy * si + vW / 2, sy * co - sx * si + vH / 2]; }
  pyyda() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.piirra(); }); }
  siirra(dx, dy) { const v = this.v, k = this.kierto || 0; if (k) { const co = Math.cos(k), si = Math.sin(k); [dx, dy] = [dx * co + dy * si, dy * co - dx * si]; } v.lon = lonX(mx(v.lon, v.z) + dx, v.z); v.lat = rajaa(latY(my(v.lat, v.z) + dy, v.z), -80, 84); v.seuraa = false; this.pyyda(); if (this.onMuutos) this.onMuutos(); }
  // kx, ky = kohta, jonka ympäri zoomataan (sormien keskipiste); seuratessa aina veneen ympäri
  zoomaa(dz, kx, ky) {
    const v = this.v, W = this.cv.clientWidth, H = this.cv.clientHeight, z1 = rajaa(v.z + dz, 4, ylaZ(nayttoKartta(v)));
    if (z1 === v.z) return;
    // Zoomataan sormien tai hiiren kohtaan. Venettä seurataan edelleen vain, jos kohta on veneen vieressä.
    if (kx != null && v.seuraa && Math.hypot(kx - this.ankkuri()[0], ky - this.ankkuri()[1]) > 70) { v.seuraa = false; if (this.onMuutos) this.onMuutos(); }
    if (kx == null || v.seuraa) v.z = z1;
    else { const q = this.virt(kx, ky), m = this.koko(), ux = q[0] - m[2] / 2, uy = q[1] - m[3] / 2, lon = lonX(mx(v.lon, v.z) + ux, v.z), lat = latY(my(v.lat, v.z) + uy, v.z); v.z = z1; v.lon = lonX(mx(lon, z1) - ux, z1); v.lat = latY(my(lat, z1) - uy, z1); }
    this.pyyda();
  }
  // Osoittimen kohta piirtoalustan koordinaateissa. Kallistetussa näkymässä näytön kohta projisoidaan takaisin kartan tasolle:
  // alusta on käännetty kulman th verran vaakasuoran akselin ympäri veneen kohdalta (bx, by), katselupiste etäisyydellä P.
  kohta(e) {
    const cv = this.cv, K = this.kall;
    if (!K) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    const r = cv.parentElement.getBoundingClientRect(), sx = e.clientX - r.left - K.bx, sy = e.clientY - r.top - K.by, si = Math.sin(K.th), ni = sy * si + K.P * Math.cos(K.th);
    const d = Math.max(-0.9 * K.P / si, ni > 1 ? Math.min(3 * K.dmax, -K.P * sy / ni) : 3 * K.dmax), m = K.P / (K.P + d * si);      // d = etäisyys veneestä eteenpäin kartan tasolla, m = mittakaava sillä etäisyydellä
    return [cv.clientWidth / 2 + sx / m, cv.clientHeight - K.ala - d];
  }
  _kuuntele() {
    const cv = this.cv, os = new Map(); let veto = false;
    const kohta = e => this.kohta(e);
    cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (x) { } os.set(e.pointerId, kohta(e)); if (os.size === 1) veto = false; });
    cv.addEventListener('pointermove', e => {
      const ed = os.get(e.pointerId); if (!ed) return; const nyt = kohta(e);
      if (os.size === 1) {
        if (!veto && Math.hypot(nyt[0] - ed[0], nyt[1] - ed[1]) < 6) return;     // pelkkä napautus ei siirrä karttaa
        veto = true; this.siirra(ed[0] - nyt[0], ed[1] - nyt[1]);
      } else if (os.size === 2) {
        let t; for (const [id, p] of os) if (id !== e.pointerId) t = p;
        const d0 = Math.hypot(ed[0] - t[0], ed[1] - t[1]), d1 = Math.hypot(nyt[0] - t[0], nyt[1] - t[1]);
        if (!this.v.seuraa) this.siirra((ed[0] - nyt[0]) / 2, (ed[1] - nyt[1]) / 2);
        if (d0 > 10 && d1 > 10) this.zoomaa(Math.log2(d1 / d0), (nyt[0] + t[0]) / 2, (nyt[1] + t[1]) / 2);
      }
      os.set(e.pointerId, nyt);
    });
    const loppu = e => { os.delete(e.pointerId); };
    cv.addEventListener('pointerup', e => {
      if (os.size === 1 && !veto && napautusCb && this === kLive) { const k = this.virt(...kohta(e)), v = this.v, m = this.koko(); napautusCb(latY(my(v.lat, v.z) + k[1] - m[3] / 2, v.z), lonX(mx(v.lon, v.z) + k[0] - m[2] / 2, v.z)); }
      else if (os.size === 1 && !veto && this === kLive) { const k = this.virt(...kohta(e)); karttaNapautus(k[0], k[1]); }
      loppu(e);
    });
    cv.addEventListener('pointercancel', loppu);
    cv.addEventListener('wheel', e => { e.preventDefault(); const k = kohta(e); this.zoomaa(-e.deltaY / 300, k[0], k[1]); }, { passive: false });
  }
  piirra() {
    const cv = this.cv, v = this.v, K = nayttoKartta(v), [Wr, Hr, W, H] = this.koko(); if (!Wr || !cv.isConnected) return;
    const dpr = Math.min(window.devicePixelRatio || 1, Math.max(1, Math.sqrt(7e6 / (Wr * Hr)))); cv.width = Wr * dpr; cv.height = Hr * dpr;      // suuri 3D-alusta piirretään karkeammin, ettei muisti lopu
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    // W ja H ovat tästä eteenpäin piirtoalueen koko: käännetyssä kartassa näyttöä suurempi neliö, muuten näytön koko
    const kierto = this.kierto || 0; kKierto = kierto; cv.dataset.kierto = Math.round(kierto / RAD);
    const rajaus = !!(kierto || this.kall), [ax, ay] = this.ankkuri(), co = Math.cos(kierto), si = Math.sin(kierto); kVenytys = this.kall ? 1 / Math.cos(this.kall.th) : 1;
    if (rajaus) { c.translate(ax, ay); c.rotate(kierto); c.translate(-W / 2, -H / 2); }
    v.z = rajaa(v.z, 4, ylaZ(K));
    // Tarkempaan tasoon vaihdetaan jo hieman ennen puoliväliä, jotta kuva pysyy terävänä.
    const zi = rajaa(Math.round(v.z + .25), 3, K.maxZ), L = 256 * 2 ** (v.z - zi), ox = mx(v.lon, v.z) - W / 2, oy = my(v.lat, v.z) - H / 2, n = 2 ** zi; let piirretty = 0, tarkkoja = 0;
    for (let tx = Math.floor(ox / L); tx <= Math.floor((ox + W) / L); tx++) for (let ty = Math.floor(oy / L); ty <= Math.floor((oy + H) / L); ty++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const dx = tx * L - ox, dy = ty * L - oy;
      // käännetyssä tai kallistetussa kartassa piirtoalue on neliö: palat, jotka jäävät piirtoalustan ulkopuolelle, jätetään hakematta
      if (rajaus) { const qx = dx + L / 2 - W / 2, qy = dy + L / 2 - H / 2, px = ax + qx * co - qy * si, py = ay + qx * si + qy * co; if (px < -L || py < -L || px > Wr + L || py > Hr + L) continue; }
      const im = haeLaatta(K, zi, tx, ty);
      if (im) { c.drawImage(im, dx, dy, L + .6, L + .6); piirretty++; }
      // Pala puuttuu tai on vielä tulossa: näytetään karkeampi taso suurennettuna, jos sellainen on.
      else for (let d = 1; d <= 6 && zi - d >= 3; d++) {
        // Kun tarkin pala on vielä tulossa verkosta, karkeampi taso haetaan heti laitteen tallennuksesta ('db') odottamatta verkkoa.
        const p = haeLaatta(K, zi - d, tx >> d, ty >> d, im === null ? true : 'db');
        if (p) { const k = 256 / 2 ** d; c.drawImage(p, (tx - ((tx >> d) << d)) * k, (ty - ((ty >> d) << d)) * k, k, k, dx, dy, L + .6, L + .6); piirretty++; break; }
        if (p === undefined) break;
      }
      // Lähelle zoomattaessa päälle piirretään tarkempi satamakartta siellä, missä sellainen on.
      if (K.paalle && zi >= K.paalle.minZ) { const s = haeLaatta(K.paalle, zi, tx, ty); if (s) { c.drawImage(s, dx, dy, L + .6, L + .6); tarkkoja++; } }
    }
    cv.dataset.laatat = piirretty; cv.dataset.tarkkoja = tarkkoja; cv.dataset.pohja = K.id;
    if (this === kLive) { const te = $('#kTekija'); if (te && te.textContent !== K.tekija) te.textContent = K.tekija; }      // lähdemerkintä seuraa näytettävää karttaa
    const X = lon => mx(lon, v.z) - ox, Y = lat => my(lat, v.z) - oy, pts = this.pts;
    const piste = (p, vari) => { c.beginPath(); c.arc(X(p[2]), Y(p[1]), 6, 0, 7); c.fillStyle = vari; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke(); };
    c.lineJoin = c.lineCap = 'round';
    // Suunniteltu reitti: sininen väylää pitkin, oranssi katkoviiva väylän ulkopuolella.
    const R = this.reitti;
    if (R && R.length > 1) {
      const veda = (ulkona, w, vari, katko) => { c.setLineDash(katko); c.lineWidth = w; c.strokeStyle = vari; c.beginPath(); for (let i = 1; i < R.length; i++) { if ((R[i][2] < 0) !== ulkona) continue; c.moveTo(X(R[i - 1][1]), Y(R[i - 1][0])); c.lineTo(X(R[i][1]), Y(R[i][0])); } c.stroke(); };
      veda(false, 8, '#fff', []); veda(true, 7, '#fff', []); veda(false, 4.5, '#1565c0', []); veda(true, 4, '#e8590c', [1, 9]); c.setLineDash([]);
      // Reitin seuranta: jo ajettu osuus harmaana, seuraava käännös keltaisella renkaalla ja sivussa ollessa viiva veneestä reitille.
      const q = this.reittiKohta;
      if (q && q.i < R.length) {
        c.lineWidth = 4.5; c.strokeStyle = '#9aa7b1'; c.beginPath(); c.moveTo(X(R[0][1]), Y(R[0][0])); for (let i = 1; i < q.i; i++) c.lineTo(X(R[i][1]), Y(R[i][0])); c.lineTo(X(q.lon), Y(q.lat)); c.stroke();
        if (q.kaannos) { c.beginPath(); c.arc(X(q.kaannos.lon), Y(q.kaannos.lat), 8, 0, 7); c.fillStyle = '#ffd43b'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#12222f'; c.stroke(); }
        if (q.etaisyys > 40 && this.vene) { c.setLineDash([6, 6]); c.lineWidth = 2.5; c.strokeStyle = '#e01b24'; c.beginPath(); c.moveTo(X(this.vene.lon), Y(this.vene.lat)); c.lineTo(X(q.lon), Y(q.lat)); c.stroke(); c.setLineDash([]); }
      }
      const a = R[0], b = R[R.length - 1];
      c.beginPath(); c.arc(X(a[1]), Y(a[0]), 5, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1565c0'; c.stroke();
      c.beginPath(); c.arc(X(b[1]), Y(b[0]), 9, 0, 7); c.fillStyle = '#1565c0'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); c.beginPath(); c.arc(X(b[1]), Y(b[0]), 3, 0, 7); c.fillStyle = '#fff'; c.fill();
    }
    if (pts.length > 1) for (const [w, vari] of [[7, '#fff'], [4, '#e01b24']]) { c.lineWidth = w; c.strokeStyle = vari; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(X(p[2]), Y(p[1])) : c.moveTo(X(p[2]), Y(p[1]))); c.stroke(); }
    if (pts.length) piste(pts[0], '#1f8a4c');
    if (this.lisat) { this.lisat(c, X, Y, W, H, v.z); lisatAjasta(); }
    if (this === kLive) { merkit3d(this, X, Y, W, H, v.z); saa3dPaivita(); }
    const b = this.vene;
    // 3D-näkymässä vene on kartan päällä oleva kolmiulotteisen näköinen kuva (vene3d), ei kartan pintaan piirretty litteä merkki
    const kuvana = this === kLive && vene3d(this, b, b ? X(b.lon) : 0, b ? Y(b.lat) : 0, W, H);
    if (!b) { if (pts.length) piste(pts[pts.length - 1], '#c0392b'); return; }
    // Suuntaviiva: punainen katkoviiva veneen keulasta kulkusuuntaan ruudun reunaan asti. Näytetään vain, kun sijainti on tuore ja kulkusuunta tiedossa.
    const viiva = !!(this.suuntaviiva && b.suunta != null && !b.himmea); cv.dataset.suuntaviiva = viiva ? '1' : '0';
    if (viiva) {
      const x0 = X(b.lon), y0 = Y(b.lat), pit = Math.hypot(W, H), dx = Math.sin(b.suunta * RAD), dy = -Math.cos(b.suunta * RAD);
      for (const [w, vari, katko] of [[7.5, 'rgba(255,255,255,.9)', []], [3.6, '#e01b24', [13, 9]]]) { c.setLineDash(katko); c.lineCap = 'butt'; c.lineWidth = w; c.strokeStyle = vari; c.beginPath(); c.moveTo(x0 + dx * 20, y0 + dy * 20); c.lineTo(x0 + dx * pit, y0 + dy * pit); c.stroke(); }
      c.setLineDash([]); c.lineCap = 'round';
    }
    if (kuvana) return;
    // Oma vene ylhäältä päin, keula kulkusuuntaan.
    c.save(); c.translate(X(b.lon), Y(b.lat)); c.rotate((b.suunta || 0) * RAD);
    // Vanavesi: nopeuden mukaan pitenevä vaahtovana perän takana (vain liikkeessä)
    if (b.nopeus > 1 && !b.himmea) {
      const L = rajaa(b.nopeus * 1.944 * 5, 16, 75), g = c.createLinearGradient(0, 18, 0, 18 + L); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.lineCap = 'round'; c.strokeStyle = g;
      c.lineWidth = 7; c.globalAlpha = .45; c.beginPath(); c.moveTo(0, 20); c.lineTo(0, 18 + L * .85); c.stroke(); c.globalAlpha = 1;
      c.lineWidth = 2.6; c.setLineDash([6, 5]); c.beginPath(); for (const s of [-1, 1]) { c.moveTo(s * 8, 17); c.quadraticCurveTo(s * (9 + L * .1), 18 + L * .5, s * (8 + L * .34), 18 + L); } c.stroke(); c.setLineDash([]);
    }
    // Sama vene kuin 3D-näkymän kuvassa (VENE3D), suoraan ylhäältä: valkoinen kansi, tumma reunus, tuulilasi, hytin katto, punainen perälista ja perämoottori.
    const tumma = b.himmea ? '#7d8a94' : '#0f2a43', runko = () => { c.beginPath(); c.moveTo(0, -22); c.bezierCurveTo(11, -11, 12.5, 6, 10, 18); c.lineTo(-10, 18); c.bezierCurveTo(-12.5, 6, -11, -11, 0, -22); c.closePath(); };
    c.lineJoin = 'round';
    c.fillStyle = b.himmea ? '#5d6f7d' : '#12222f'; c.beginPath(); c.rect(-3.2, 17, 6.4, 6.5); c.fill();      // perämoottori
    runko(); c.lineWidth = 6.5; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke();                           // vaalea reunus erottaa veneen kartasta
    runko(); c.fillStyle = b.himmea ? '#d5dbdf' : '#f4f7f9'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = tumma; c.stroke();
    c.beginPath(); c.moveTo(-8.6, 15); c.lineTo(8.6, 15); c.lineWidth = 2.2; c.strokeStyle = b.himmea ? '#9aa7b1' : '#e01b24'; c.stroke();      // perälista
    c.lineWidth = 1.3; c.strokeStyle = tumma;
    c.beginPath(); c.moveTo(-6, -7); c.lineTo(6, -7); c.lineTo(7.6, -0.5); c.lineTo(-7.6, -0.5); c.closePath(); c.fillStyle = b.himmea ? '#b9c4cb' : '#8fcbe0'; c.fill(); c.stroke();      // tuulilasi
    c.beginPath(); c.rect(-7.6, -0.5, 15.2, 10); c.fillStyle = b.himmea ? '#c4ccd1' : '#e3eaee'; c.fill(); c.stroke();      // hytin katto
    c.beginPath(); c.moveTo(-3.6, -15); c.quadraticCurveTo(0, -19.5, 3.6, -15); c.strokeStyle = '#8a98a3'; c.stroke();      // keulakaide
    c.restore();
  }
}
const seuraaMerkki = () => { const b = $('#lKarttaK'); if (b) b.classList.toggle('on', lv.seuraa); const k = $('#kKompassi'); if (k) { k.classList.toggle('on', !!T.as.keulaYlos); k.classList.toggle('kolmed', !!T.as.kartta3d); k.firstElementChild.style.transform = 'rotate(' + (kLive && kLive.kierto ? kLive.kierto / RAD : 0) + 'deg)'; } };
// Kompassinappi: kartta käännetään niin, että veneen kulkusuunta osoittaa ylös. Kulkusuunta tiedetään vasta, kun vene liikkuu.
const kiertoNyt = () => T.as.keulaYlos && kulku != null ? -kulku * RAD : 0;
// 3D-näkymä: pääkartan piirtoalusta suurennetaan ja kallistetaan CSS:n perspektiivillä 45° taaksepäin niin, että vene on ruudun alaosassa ja edessä oleva alue näkyy pitkälle.
// Mitat lasketaan ruudun koosta: P = katseluetäisyys, by = veneen korkeus ruudulla, ala = alustaa veneen takana, dmax = alustaa veneen edessä.
// 3D-näkymän vene: takaa ja yläviistosta kuvattu vene, joka sijoitetaan veneen kohtaan näytöllä ja pysyy pystyssä.
// Kohta lasketaan samalla projektiolla kuin kallistettu kartta: x, y = veneen paikka piirtoalueella, vW, vH = piirtoalueen koko.
// Palauttaa true, kun kuva hoitaa veneen näyttämisen (litteää merkkiä ei silloin piirretä).
const VENE3D = '<svg viewBox="0 0 80 100" aria-hidden="true">' +
  // vanavesi: näkyy vain liikkeessä (luokka vauhti), pituus nopeuden mukaan (--vp), vaahto valuu taaksepäin
  '<defs><linearGradient id="vanaG" gradientUnits="userSpaceOnUse" x1="0" y1="84" x2="0" y2="172"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
  '<g class="vana" fill="none" stroke="url(#vanaG)" stroke-linecap="round"><path d="M40 90L40 160" stroke-width="13" opacity=".4"/><path class="vv" d="M30 86Q22 122 3 170M50 86Q58 122 77 170" stroke-width="3.4"/></g>' +
  '<ellipse cx="42" cy="72" rx="25" ry="27" fill="rgba(0,0,0,.2)"/>' +
  '<path d="M22 70L58 70L55 85Q40 90 25 85Z" fill="#0f2a43"/><path d="M24 78Q40 83 56 78" fill="none" stroke="#e01b24" stroke-width="2.4"/>' +
  '<rect x="35.5" y="83" width="9" height="11" rx="2.5" fill="#12222f"/>' +
  '<path d="M40 7C56 21 60 44 58 70L22 70C20 44 24 21 40 7Z" fill="#f4f7f9" stroke="#0f2a43" stroke-width="2.2" stroke-linejoin="round"/>' +
  '<path d="M33 23Q40 13 47 23" fill="none" stroke="#8a98a3" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M30 32L50 32L53 44L27 44Z" fill="#8fcbe0" stroke="#0f2a43" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M27 44L53 44L52 58L28 58Z" fill="#e3eaee" stroke="#0f2a43" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M28 58L52 58L52 65L28 65Z" fill="#aab8c1" stroke="#0f2a43" stroke-width="1.6" stroke-linejoin="round"/><rect x="36" y="59.5" width="8" height="5.5" fill="#0f2a43"/></svg>';
function vene3d(k, b, x, y, vW, vH) {
  const el = $('#kVene3d'); if (!el) return false;
  const K = k.kall; if (!K || !b) { el.hidden = true; return false; }
  const a = k.ankkuri(), kr = k.kierto || 0, co = Math.cos(kr), si = Math.sin(kr), qx = x - vW / 2, qy = y - vH / 2;
  const px = a[0] + qx * co - qy * si, py = a[1] + qx * si + qy * co, d = a[1] - py, m = K.P / (K.P + d * Math.sin(K.th));
  let rel = ((b.suunta || 0) * RAD + kr) % (2 * Math.PI); if (rel > Math.PI) rel -= 2 * Math.PI; if (rel < -Math.PI) rel += 2 * Math.PI;
  // kuva on piirretty takaapäin: jos vene ei osoita näytöllä suunnilleen ylöspäin tai projektio ei kelpaa, käytetään litteää merkkiä
  if (!(m > 0.25 && m < 3) || Math.abs(rel) > 50 * RAD) { el.hidden = true; return false; }
  const sx = K.bx + (px - k.cv.clientWidth / 2) * m, sy = K.by - d * Math.cos(K.th) * m;
  el.hidden = sx < -60 || sx > K.W + 60 || sy < -60 || sy > K.H + 80;
  el.classList.toggle('himmea', !!b.himmea);
  const vauhti = b.nopeus > 1 && !b.himmea; el.classList.toggle('vauhti', vauhti); if (vauhti) el.style.setProperty('--vp', rajaa(b.nopeus * 1.944 / 14, .4, 1.15).toFixed(2));
  el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-62%) scale(' + rajaa(m, .55, 1.25).toFixed(3) + ') rotate(' + (rel / RAD).toFixed(1) + 'deg)';
  el.dataset.x = Math.round(sx); el.dataset.y = Math.round(sy);
  return true;
}
// 3D-näkymän merimerkit: väylätietojen merkit (vayla.merkit = [lon, lat, laji, nimi, rakenne]) piirretään pystyssä seisovina kuvina
// kallistetun kartan päälle omalle, kallistamattomalle piirtoalustalle (#kMerkit3d). Paikka lasketaan samalla projektiolla kuin veneen kuva.
// Kuvat ovat yksinkertaistuksia: väri lajin mukaan, muoto rakenteen mukaan. Linjataulun ja loiston todellista väritystä aineisto ei kerro.
function merkit3d(k, X, Y, vW, vH, z) {
  const el = $('#kMerkit3d'); if (!el) return;
  const K = k.kall, kyltit = (K && lisa.kyltit) || [], alukset = (K && lisa.alukset3d) || [], merkit = K && vayla && z >= 11.5 ? vayla.merkit : [];
  if (!K || (!merkit.length && !kyltit.length && !alukset.length)) { el.hidden = true; el.dataset.n = el.dataset.kyltit = el.dataset.alukset = 0; return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2); el.hidden = false; el.width = K.W * dpr; el.height = K.H * dpr;
  const c = el.getContext('2d'); c.scale(dpr, dpr);
  const a = k.ankkuri(), kr = k.kierto || 0, co = Math.cos(kr), si = Math.sin(kr), sth = Math.sin(K.th), cth = Math.cos(K.th), cw = k.cv.clientWidth / 2, zk = .8 * rajaa(2 ** ((z - 14) * .5), .6, 1.25);
  // piirtoalueen kohta -> [näytön y, näytön x, mittakaava] tai null, jos kohta ei ole näkyvissä
  const nayttoon = (x, y) => {
    const qx = x - vW / 2, qy = y - vH / 2, px = a[0] + qx * co - qy * si, py = a[1] + qx * si + qy * co, d = a[1] - py, m = K.P / (K.P + d * sth);
    if (!(m > .3 && m < 2.2)) return null;
    const sx = K.bx + (px - cw) * m, sy = K.by - d * cth * m; return sx < -30 || sx > K.W + 30 || sy < -10 || sy > K.H + 80 ? null : [sy, sx, m];
  };
  let lista = [], kl = [];
  for (const mk of merkit) { const x = X(mk[0]), y = Y(mk[1]); if (x < 0 || y < 0 || x > vW || y > vH) continue; const p = nayttoon(x, y); if (p) { p.push(mk, null); lista.push(p); } }
  if (lista.length > 300) { lista.sort((p, q) => q[2] - p[2]); lista.length = 300; }      // tiheässä saaristossa vain lähimmät
  // Pystykyltit: satamat ja palvelut, saunat ja omat kalapaikat. Kyltin taulun kohdalle kirjataan myös napautusalue kartan tasolle.
  for (const ky of kyltit) { const p = nayttoon(ky.x, ky.y); if (p) { p.push(null, ky); kl.push(p); } }
  if (kl.length > 120) { kl.sort((p, q) => q[2] - p[2]); kl.length = 120; }
  for (const p of kl) { const ky = p[4], s = rajaa(p[2], .5, 1.15), d = 34 * s / (cth * p[2]); ky.n = [p[1], p[0], s]; lisa.osumat.push({ x: ky.x - d * si, y: ky.y - d * co, r: ky.r + 6, laji: ky.laji, d: ky.d }); }
  // AIS-alukset kolmiulotteisina hahmoina, keula kulkusuuntaan
  const al = []; for (const u of alukset) { const p = nayttoon(u.x, u.y); if (p) { p.push(null, null, u); al.push(p); } }
  lista = lista.concat(kl, al); lista.sort((p, q) => p[0] - q[0]);                            // kaukaisimmat ensin, lähimmät päälle
  for (const [sy, sx, m, mk, ky, alus] of lista) {
    c.globalAlpha = rajaa((m - .3) / .22, .25, 1);                                        // kaukaisimmat haalistuvat
    if (alus) { c.globalAlpha = 1; piirraAlus3d(c, sx, sy, m * rajaa(2 ** ((z - 13) * .45), .55, 1.5), alus, kr, cth, sth); }
    else if (mk) piirraMerkki3d(c, sx, sy, m * zk, mk); else piirraKyltti3d(c, sx, sy, rajaa(m, .5, 1.15), ky);
  }
  tyhjennaPaneelit(c, el);
  el.dataset.n = lista.length - kl.length - al.length; el.dataset.kyltit = kl.length; el.dataset.alukset = al.length;
}
// Tyhjentää 3D-kerroksesta (merkit, sade) kartan päällä olevien mittarien, palkkien ja nappien alueet.
// iPadin Safari näytti kerroksen niiden läpi piirtojärjestyksestä huolimatta, joten kerrokseen ei jätetä niiden kohdalle mitään.
// c = kerroksen piirtoyhteys CSS-pikseleissä, el = kerroksen canvas. Läpinäkyvät kehykset (esim. nappirivi) käydään läpi lapsi kerrallaan.
function tyhjennaPaneelit(c, el) {
  const emo = el.parentElement; if (!emo) return; const r0 = emo.getBoundingClientRect();
  c.save(); c.setTransform(c.getTransform().a, 0, 0, c.getTransform().d, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  const kay = e => {
    for (const x of e.children) {
      if (x.tagName === 'CANVAS' || x.hidden || x.classList.contains('kvene3d')) continue;
      const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (/^(transparent|rgba\(0, 0, 0, 0\))$/.test(s.backgroundColor)) { kay(x); continue; }
      const r = x.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const pr = s.borderTopLeftRadius || '', sade = Math.min(/%/.test(pr) ? Math.min(r.width, r.height) / 2 : parseFloat(pr) || 0, r.width / 2, r.height / 2) + 2;
      c.beginPath(); if (c.roundRect) c.roundRect(r.left - r0.left - 2, r.top - r0.top - 2, r.width + 4, r.height + 4, sade); else c.rect(r.left - r0.left - 2, r.top - r0.top - 2, r.width + 4, r.height + 4); c.fill();
    }
  };
  kay(emo); c.restore();
}
// Pystykyltti: tolppa ja sen päässä kohteen kuvake; nimi tolpan juurella, kun kohde on lähellä.
// AIS-alus 3D-näkymässä: runko, kansi ja kansirakenne nostetaan veden pinnasta pystyyn (särmiö), jolloin alus näyttää oikealta mistä suunnasta tahansa.
// Koko ja väritys aluksen tyypin ja AIS-tietojen mittojen mukaan (symbolinen, ei mittakaavassa). kr = kartan kierto, cth/sth = kallistuksen kosini ja sini.
function alusMalli(u) {
  const t = u.tieto || {}, k = t.shipType, pit = (t.referencePointA || 0) + (t.referencePointB || 0);
  const L = pit > 5 ? rajaa(18 + pit * .22, 20, 72) : null;
  if (k === 36) return { L: L || 24, W: 7, h: 3, runko: '#f4f7f9', kansi: '#dfe7ec', purje: true };
  if (k === 37) return { L: L || 22, W: 8, h: 3.5, runko: '#f4f7f9', kansi: '#dfe7ec', talo: [.15, .5, .6, 4, '#ffffff'] };
  if (k >= 60 && k < 70) return { L: L || 54, W: 13, h: 7, runko: '#ffffff', kansi: '#dfe7ec', talo: [-.38, .34, .82, 9, '#f4f7f9'], raita: '#1565c0', piippu: '#1565c0' };
  if (k >= 80 && k < 90) return { L: L || 58, W: 12, h: 5, runko: '#7a1f1f', kansi: '#b9584a', talo: [-.46, -.22, .8, 9, '#f4f7f9'], piippu: '#12222f' };
  if (k >= 70 && k < 80) return { L: L || 58, W: 12, h: 6, runko: '#243b53', kansi: '#8a98a3', talo: [-.46, -.24, .8, 10, '#f4f7f9'], piippu: '#e8590c', kontit: true };
  if (k === 50 || k === 51 || k === 55) return { L: L || 24, W: 8, h: 4, runko: k === 51 ? '#e8590c' : '#12222f', kansi: '#dfe7ec', talo: [-.05, .3, .7, 5, k === 51 ? '#ffd43b' : '#f4f7f9'] };
  if (k === 52) return { L: L || 26, W: 10, h: 5, runko: '#12222f', kansi: '#8a4b16', talo: [0, .32, .7, 7, '#f4f7f9'], piippu: '#12222f' };
  if (k === 30) return { L: L || 26, W: 8, h: 4, runko: '#1f6f78', kansi: '#dfe7ec', talo: [.08, .4, .7, 5, '#f4f7f9'] };
  return { L: L || 34, W: 10, h: 5, runko: '#455a64', kansi: '#aab8c1', talo: [-.4, -.1, .75, 7, '#f4f7f9'] };
}
function piirraAlus3d(c, x, y, s, u, kr, cth, sth) {
  const M = alusMalli(u), L = M.L, W = M.W, rel = u.suunta * RAD + kr, co = Math.cos(rel), si = Math.sin(rel), tumma = '#12222f';
  // aluksen oma koordinaatisto (lx = oikealle, ly = keulaan, kork = ylös) -> näyttö
  const P = (lx, ly, kork) => [x + (lx * co + ly * si) * s, y - (-lx * si + ly * co) * cth * s - kork * sth * s];
  const syv = (lx, ly) => -lx * si + ly * co;      // etäisyys katsojasta poispäin: suurempi = kauempana
  // särmiö: pohjan ääriviiva nostetaan välille h0..h1; sivut kaukaisimmasta lähimpään, lopuksi kansi
  const sarmio = (aari, h0, h1, sivu, kansi) => {
    const n = aari.length, sivut = []; for (let i = 0; i < n; i++) { const a = aari[i], b = aari[(i + 1) % n]; sivut.push([syv((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), a, b]); }
    sivut.sort((p, q) => q[0] - p[0]); c.lineJoin = 'round'; c.lineWidth = .9; c.strokeStyle = tumma;
    for (const [, a, b] of sivut) { const p1 = P(a[0], a[1], h0), p2 = P(b[0], b[1], h0), p3 = P(b[0], b[1], h1), p4 = P(a[0], a[1], h1); c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.lineTo(p4[0], p4[1]); c.closePath(); c.fillStyle = sivu; c.fill(); c.stroke(); }
    c.beginPath(); aari.forEach((a, i) => { const p = P(a[0], a[1], h1); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.closePath(); c.fillStyle = kansi; c.fill(); c.stroke();
  };
  const laatikko = (y0, y1, lev, h0, h1, sivu, katto) => sarmio([[-lev / 2, y0], [lev / 2, y0], [lev / 2, y1], [-lev / 2, y1]], h0, h1, sivu, katto);
  c.save();
  // varjo ja liikkuvan aluksen vanavesi veden pinnassa
  const runko = [[0, L / 2], [W * .42, L * .3], [W / 2, L * .08], [W / 2, -L / 2], [-W / 2, -L / 2], [-W / 2, L * .08], [-W * .42, L * .3]];
  c.beginPath(); runko.forEach((a, i) => { const p = P(a[0] * 1.15 + 1.5, a[1] * 1.04, 0); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.closePath(); c.fillStyle = 'rgba(0,0,0,.2)'; c.fill();
  if (u.a.sog > 1) { const v = rajaa(u.a.sog * 1.6, 6, 36), a = P(0, -L / 2, 0), g = c.createLinearGradient(a[0], a[1], ...P(0, -L / 2 - v, 0)); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.strokeStyle = g; c.lineCap = 'round'; c.lineWidth = 1.6 * s; c.beginPath(); for (const d of [-1, 1]) { const p1 = P(d * W * .45, -L / 2, 0), p2 = P(d * (W * .5 + v * .3), -L / 2 - v, 0); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); } c.stroke(); }
  sarmio(runko, 0, M.h, M.runko, M.kansi);
  if (M.raita) { c.strokeStyle = M.raita; c.lineWidth = 1.4 * s; c.beginPath(); for (const d of [-1, 1]) { const p1 = P(d * W / 2, -L / 2, M.h * .55), p2 = P(d * W / 2, L * .08, M.h * .55); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); } c.stroke(); }
  // kansirakenteet aluksen pituussuunnassa; kauempana oleva pää piirretään ensin
  const osat = [];
  if (M.kontit) for (let i = 0; i < 3; i++) { const y0 = -L * .2 + i * L * .2; osat.push([y0, y0 + L * .17, W * .74, M.h, M.h + 4, ['#c0504d', '#1976d2', '#1f8a4c'][i], ['#d9756f', '#5a9fe0', '#58b07e'][i]]); }
  if (M.talo) { const [a, b, lev, kork, vari] = M.talo; osat.push([L * a, L * b, W * lev, M.h, M.h + kork, '#cfd8dd', vari]); if (M.piippu) osat.push([L * (a + (b - a) * .25), L * (a + (b - a) * .5), W * .3, M.h + kork, M.h + kork + 4, M.piippu, M.piippu]); }
  osat.sort((p, q) => (co >= 0 ? q[0] - p[0] : p[0] - q[0]) || p[3] - q[3]);
  for (const o of osat) laatikko(...o);
  if (M.purje) { const j = P(0, L * .08, M.h), h = P(0, L * .08, M.h + 30), pe = P(0, -L * .38, M.h + 3), ke = P(0, L * .46, M.h + 1);
    c.beginPath(); c.moveTo(h[0], h[1]); c.lineTo(pe[0], pe[1]); c.lineTo(j[0], j[1]); c.closePath(); c.fillStyle = 'rgba(255,255,255,.95)'; c.fill(); c.lineWidth = .9; c.strokeStyle = tumma; c.stroke();
    c.beginPath(); c.moveTo(h[0], h[1]); c.lineTo(ke[0], ke[1]); c.lineTo(j[0], j[1]); c.closePath(); c.fillStyle = 'rgba(235,242,247,.95)'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(j[0], j[1]); c.lineTo(h[0], h[1]); c.lineWidth = 1.3; c.stroke(); }
  c.restore();
  if (u.nimi && s > .5) { c.save(); c.font = '600 ' + Math.round(10.5 + 2 * Math.min(s, 1)) + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineJoin = 'round'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; const ty = y + (L / 2 * cth + 5) * s; c.strokeText(u.nimi, x, ty); c.fillStyle = '#4b1d8f'; c.fillText(u.nimi, x, ty); c.restore(); }
}
function piirraKyltti3d(c, x, y, s, ky) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(2, 0, 7, 2.6, 0, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.fillRect(-2.2, -24, 4.4, 24); c.fillStyle = '#44525c'; c.fillRect(-1.1, -24, 2.2, 24);
  ky.f(c, 0, -34, ky.d);
  c.restore();
  if (ky.nimi && s > .62) { c.save(); c.font = '600 ' + Math.round(11 + 2 * s) + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineJoin = 'round'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; c.strokeText(ky.nimi, x, y + 4); c.fillStyle = ky.vari; c.fillText(ky.nimi, x, y + 4); c.restore(); }
}
// 3D-näkymän sää: sade ruudulla omalla piirtoalustallaan (#kSaa3d) noin 14 kertaa sekunnissa. Tuuli näkyy kartan tuulinuolina ja aallonkorkeutena (piirraLisat), ei viiruina.
// Tuulen suunta ja nopeus (pisaroiden kallistus) = lähin tuuliennusteen piste (kytkin Tuuli ja sää), sade = sadetutkan kuva veneen kohdalla (kytkin Sadetutka) tai ennusteen sademäärä.
const saa3d = { v: 0, suu: 0, sade: 0, ajastin: 0 };
function saa3dSeis() { if (saa3d.ajastin) { clearInterval(saa3d.ajastin); saa3d.ajastin = 0; } const el = $('#kSaa3d'); if (el) el.hidden = true; }
// Sataako tutkakuvan mukaan kohdassa: 0 = ei, 0,5 = sadetta, 1 = voimakasta (värin perusteella, karkea arvio).
function tutkaSade(lat, lon) {
  const t = tutka.ajat[tutka.anim ? tutka.i : tutka.ajat.length - 1] || 0, im = tutka.kuvat.get(t); if (!im) return 0;
  const avain = t + '|' + lat.toFixed(2) + '|' + lon.toFixed(2); if (tutkaSade.a === avain) return tutkaSade.v;
  const B = TUTKA.b, a = mercM(B.lo0, B.la0), b = mercM(B.lo1, B.la1), p = mercM(lon, lat), x = Math.round((p[0] - a[0]) / (b[0] - a[0]) * im.naturalWidth), y = Math.round((b[1] - p[1]) / (b[1] - a[1]) * im.naturalHeight); let v = 0;
  if (x >= 1 && y >= 1 && x < im.naturalWidth - 1 && y < im.naturalHeight - 1) try {
    const cv = tutkaSade.cv || (tutkaSade.cv = document.createElement('canvas')); cv.width = cv.height = 3;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(im, x - 1, y - 1, 3, 3, 0, 0, 3, 3);
    const d = c.getImageData(0, 0, 3, 3).data; let n = 0, lammin = 0; for (let i = 0; i < 36; i += 4) if (d[i + 3] > 40) { n++; if (d[i] > d[i + 2] + 40) lammin++; }
    if (n >= 2) v = lammin >= 2 ? 1 : .5;
  } catch (x) { }
  tutkaSade.a = avain; tutkaSade.v = v; return v;
}
function saa3dPaivita() {
  let v = 0, suu = 0, sade = 0;
  if (kLive && kLive.kall) {
    const tu = T.as.tuuli && lisa.tuuli, i = TUNNIT[lisa.tunti];
    if (tu) { let p = null, pd = Infinity; for (const q of tu.p) { const d = (q.lat - lv.lat) ** 2 + ((q.lon - lv.lon) * .5) ** 2; if (d < pd) { pd = d; p = q; } }
      if (p && p.nop[i] != null) { v = p.nop[i]; suu = p.suu[i] || 0; if (!T.as.tutka && p.sade && p.sade[i] > 0.1) sade = rajaa(p.sade[i] / 4, .3, 1); } }
    if (T.as.tutka) sade = tutkaSade(lv.lat, lv.lon);
  }
  saa3d.v = v; saa3d.suu = suu; saa3d.sade = sade;
  if (sade > 0) { if (!saa3d.ajastin) saa3d.ajastin = setInterval(saa3dAskel, 70); } else saa3dSeis();
}
function saa3dAskel() {
  const el = $('#kSaa3d'), K = kLive && kLive.kall;
  if (!el || !K || nakyma !== 'kartta' || !kLive.cv.isConnected || !(saa3d.sade > 0)) { saa3dSeis(); return; }
  if (el.width !== K.W || el.height !== K.H) { el.width = K.W; el.height = K.H; } el.hidden = false;
  const c = el.getContext('2d'), th = (saa3d.suu + 180) * RAD + (kLive.kierto || 0), ux = Math.sin(th);
  c.clearRect(0, 0, K.W, K.H);
  if (saa3d.sade > 0) {
    // sade: harmaa verho ja tuulen mukaan kallistuvat pisarat ruudun tasossa
    const N = Math.round(50 + 150 * saa3d.sade), kallistus = rajaa(ux * saa3d.v * .04, -.6, .6), L = 15 + 9 * saa3d.sade;
    c.fillStyle = 'rgba(40,60,80,' + (.07 + .09 * saa3d.sade).toFixed(2) + ')'; c.fillRect(0, 0, K.W, K.H);
    c.strokeStyle = 'rgba(225,238,248,.6)'; c.lineWidth = 1.2; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < N; i++) { const x = Math.random() * (K.W + 60) - 30, y = Math.random() * K.H; c.moveTo(x, y); c.lineTo(x + kallistus * L, y + L); }
    c.stroke();
    c.strokeStyle = 'rgba(40,70,100,.35)'; c.beginPath();
    for (let i = 0; i < N / 2; i++) { const x = Math.random() * (K.W + 60) - 30, y = Math.random() * K.H; c.moveTo(x, y); c.lineTo(x + kallistus * L, y + L); }
    c.stroke();
  }
  tyhjennaPaneelit(c, el);
  el.dataset.sade = saa3d.sade;
}
function piirraMerkki3d(c, x, y, s, mk) {
  const laji = mk[2], ty = mk[4] || '', tumma = '#12222f', kelta = '#ffd43b', puna = '#d62828', vihrea = '#1f8a4c', valk = '#f4f7f9', harmaa = '#8a98a3';
  const varit = { 1: [puna], 2: [vihrea], 3: [tumma, kelta], 4: [kelta, tumma], 5: [kelta, tumma, kelta], 6: [tumma, kelta, tumma], 7: [tumma, puna, tumma], 8: [puna], 9: [kelta] }[laji] || [harmaa];
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineWidth = 1.1; c.strokeStyle = tumma;
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(2.5, 0, 9, 3.2, 0, 0, 7); c.fill();      // varjo veden pinnalla
  // pystykappale: pohja kohdassa y0, korkeus h, leveys alhaalla w ja ylhäällä w2, värit ylhäältä alas vaakaraitoina
  const kappale = (w, h, y0, vr, w2) => {
    const n = vr.length, lev = t => w2 + (w - w2) * t;
    for (let i = 0; i < n; i++) { const ya = y0 - h + h * i / n, yb = y0 - h + h * (i + 1) / n, wa = lev(i / n), wb = lev((i + 1) / n); c.beginPath(); c.moveTo(-wa / 2, ya); c.lineTo(wa / 2, ya); c.lineTo(wb / 2, yb); c.lineTo(-wb / 2, yb); c.closePath(); c.fillStyle = vr[i]; c.fill(); }
    if (laji === 8) { c.fillStyle = '#fff'; c.fillRect(-w2 * .17, y0 - h, w2 * .34, h); }      // turvavesimerkki: punavalkoiset pystyraidat
    c.beginPath(); c.moveTo(-w2 / 2, y0 - h); c.lineTo(w2 / 2, y0 - h); c.lineTo(w / 2, y0); c.lineTo(-w / 2, y0); c.closePath(); c.stroke();
  };
  const kartio = (cy, ylos, r) => { c.beginPath(); if (ylos) { c.moveTo(0, cy - r); c.lineTo(r, cy + r); c.lineTo(-r, cy + r); } else { c.moveTo(0, cy + r); c.lineTo(r, cy - r); c.lineTo(-r, cy - r); } c.closePath(); c.fillStyle = tumma; c.fill(); };
  const pallo = (cy, r, vari) => { c.beginPath(); c.arc(0, cy, r, 0, 7); c.fillStyle = vari; c.fill(); c.stroke(); };
  // huippumerkki kappaleen yläreunan yl päälle: kardinaalimerkeissä kaksi kartiota (pohjois: kärjet ylös, etelä: alas, länsi: kärjet vastakkain, itä: kannat vastakkain)
  const huippu = yl => {
    if (laji >= 3 && laji <= 6) { const u = { 3: [1, 1], 4: [0, 0], 5: [0, 1], 6: [1, 0] }[laji]; c.fillStyle = tumma; c.fillRect(-.6, yl - 16, 1.2, 16); kartio(yl - 12.5, u[0], 3.3); kartio(yl - 4.8, u[1], 3.3); }
    else if (laji === 7) { c.fillStyle = tumma; c.fillRect(-.6, yl - 14, 1.2, 14); pallo(yl - 11.5, 3, tumma); pallo(yl - 4.5, 3, tumma); }
    else if (laji === 8) { c.fillStyle = tumma; c.fillRect(-.6, yl - 8, 1.2, 8); pallo(yl - 7, 3.2, puna); }
    else if (laji === 2) { c.beginPath(); c.moveTo(0, yl - 8); c.lineTo(4, yl); c.lineTo(-4, yl); c.closePath(); c.fillStyle = vihrea; c.fill(); c.stroke(); }      // oikean reunan merkin kartiohuippu
  };
  const lyhty = (yl, w) => { c.fillStyle = tumma; c.fillRect(-w / 2, yl - 6, w, 6); c.beginPath(); c.arc(0, yl - 3, 2.1, 0, 7); c.fillStyle = kelta; c.fill(); c.beginPath(); c.moveTo(-w / 2 - 1, yl - 6); c.lineTo(0, yl - 10); c.lineTo(w / 2 + 1, yl - 6); c.closePath(); c.fillStyle = tumma; c.fill(); };
  if (ty === 'Viitta') { kappale(4.6, 40, 0, varit, 4.2); if (laji === 2) { c.beginPath(); c.moveTo(0, -46); c.lineTo(2.1, -40); c.lineTo(-2.1, -40); c.closePath(); c.fillStyle = vihrea; c.fill(); c.stroke(); } else if (laji === 7 || laji === 8) huippu(-40); }
  else if (ty === 'Poiju') { kappale(12, 28, 0, varit, 8); huippu(-28); }
  else if (ty === 'Reunamerkki') { c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.lineTo(7.5, -6); c.lineTo(-7.5, -6); c.closePath(); c.fillStyle = '#aab8c1'; c.fill(); c.stroke(); kappale(10, 28, -6, varit, 9); huippu(-34); }
  else if (/majakka/i.test(ty)) { kappale(15, 50, 0, [valk, puna, valk], 9); lyhty(-50, 9); }
  else if (/loisto/i.test(ty)) { kappale(10, 28, 0, [valk], 7); lyhty(-28, 7); }
  else if (ty === 'Linjamerkki') { c.fillStyle = '#555'; c.fillRect(-1, -24, 2, 24); c.beginPath(); c.rect(-7.5, -42, 15, 19); c.fillStyle = kelta; c.fill(); c.fillStyle = puna; c.fillRect(-2.5, -42, 5, 19); c.beginPath(); c.rect(-7.5, -42, 15, 19); c.stroke(); }
  else if (ty === 'Kummeli') kappale(17, 20, 0, [valk], 7);
  else if (ty === 'Tutkamerkki') { c.fillStyle = '#555'; c.fillRect(-1, -30, 2, 30); c.beginPath(); c.moveTo(0, -44); c.lineTo(7, -35); c.lineTo(0, -26); c.lineTo(-7, -35); c.closePath(); c.fillStyle = '#c4ccd1'; c.fill(); c.stroke(); }
  else { c.fillStyle = '#555'; c.fillRect(-1, -28, 2, 28); c.beginPath(); c.rect(-4.5, -36, 9, 9); c.fillStyle = harmaa; c.fill(); c.stroke(); }
  c.restore();
}
function kallistusAseta() {
  const cv = kLive.cv, p = cv.parentElement;
  if (!T.as.kartta3d) { if (kLive.kall) { kLive.kall = null; cv.style.cssText = ''; p.style.perspective = p.style.perspectiveOrigin = ''; p.classList.remove('k3d'); } return; }
  const W = p.clientWidth, H = p.clientHeight; if (!W || (kLive.kall && kLive.kall.W === W && kLive.kall.H === H)) return;
  const P = Math.round(1.15 * H), by = Math.round(0.74 * H), ala = Math.round(0.3 * H), dmax = Math.round(2.8 * H), cw = Math.round(2.72 * W), ch = dmax + ala;
  // Perspektiivi annetaan kartan omassa muunnoksessa (ei emoelementin perspective-ominaisuutena): katoamispiste on muunnoksen keskipiste eli veneen kohta,
  // joten kuva on sama, mutta merkit, mittarit ja napit eivät joudu samaan kolmiulotteiseen tilaan (iPadin Safari piirsi ne muuten väärässä järjestyksessä).
  p.style.perspective = p.style.perspectiveOrigin = ''; p.classList.add('k3d');
  Object.assign(cv.style, { position: 'absolute', left: (W - cw) / 2 + 'px', top: by - dmax + 'px', width: cw + 'px', height: ch + 'px', transformOrigin: '50% ' + dmax + 'px', transform: 'perspective(' + P + 'px) rotateX(45deg)' });
  kLive.kall = { W, H, P, th: 45 * RAD, bx: W / 2, by, ala, dmax };
}
function karttaUudelleen() {
  if (nakyma === 'yksi' && kYksi && kYksi.cv.isConnected) kYksi.piirra();
  if (nakyma === 'kartta') { lk = null; liveKartta(); }
}
// Päänäkymän kartta: aina näkyvissä, oma vene ja kuljettu matka punaisena viivana.
// Veneen sijainti päivittyy korkeintaan 2 s välein ja vain kun on liikuttu 10 m.
function liveKartta() {
  const cv = $('#lKartta'); if (!cv) return;
  if (!kLive || kLive.cv !== cv) { kLive = new Kartta(cv, lv); kLive.onMuutos = seuraaMerkki; lk = null; }
  kLive.reitti = reitti && !omaR ? reitti.r.pisteet : null; kLive.lisat = piirraLisat; kLive.suuntaviiva = T.as.suuntaviiva; kLive.reittiKohta = !omaR && seurPaalla() && seur.aktiivinen ? seur.k : null; kallistusAseta(); if (!liike.a) kLive.kierto = kiertoNyt();      // omaa reittiä muokatessa näytetään vain muokattava reitti
  const f = gps.viime, paalla = watchId != null || tal.tila === 'matka';
  if (!f || !paalla) {            // ei sijaintia juuri nyt: viimeisin tunnettu paikka, muuten Suomenlahti
    if (lk) return; lk = { tyhja: true };
    const s = T.sij;
    if (s && lv.alussa) { lv.z = 12; lv.alussa = false; }
    if (s && lv.seuraa) { lv.lat = s[0]; lv.lon = s[1]; }
    kLive.pts = []; kLive.vene = s ? { lat: s[0], lon: s[1], himmea: true, suunta: kulku } : null;
    kLive.piirra(); seuraaMerkki(); return;
  }
  const ed = lk && !lk.tyhja ? lk : null;
  if (ed && (Date.now() - ed.aika < 2000 || etaisyys(ed.lat, ed.lon, f.lat, f.lon) < 10)) return;
  if (f.cog != null && !isNaN(f.cog) && f.cog >= 0 && f.sog > 0.5) kulku = f.cog;
  else if (ed) kulku = (Math.atan2(Math.sin((f.lon - ed.lon) * RAD) * Math.cos(f.lat * RAD), Math.cos(ed.lat * RAD) * Math.sin(f.lat * RAD) - Math.sin(ed.lat * RAD) * Math.cos(f.lat * RAD) * Math.cos((f.lon - ed.lon) * RAD)) / RAD + 360) % 360;
  lk = { aika: Date.now(), lat: f.lat, lon: f.lon }; T.sij = [f.lat, f.lon];
  if (lv.alussa) { lv.z = 12; lv.alussa = false; }
  kLive.pts = tal.m ? tal.m.pisteet.concat([[f.t, f.lat, f.lon, f.sog]]) : [];
  // Pehmeä liike: vene ja kartta liukuvat edellisestä paikasta uuteen paikannusten välisen ajan kuluessa (eivät hyppää).
  const b0 = kLive.vene;
  if (PEHMEA() && ed && b0 && !b0.himmea && etaisyys(b0.lat, b0.lon, f.lat, f.lon) < 400) {
    liike.a = { lat0: b0.lat, lon0: b0.lon, s0: b0.suunta, k0: kLive.kierto || 0, lat1: f.lat, lon1: f.lon, s1: kulku, nopeus: f.sog, t0: Date.now(), kesto: rajaa(Date.now() - ed.aika, 700, 3000) };
    if (!liike.ajastin) liike.ajastin = setInterval(liikeAskel, 70);
    liikeAskel(); return;
  }
  liikeSeis();
  if (lv.seuraa) { lv.lat = f.lat; lv.lon = f.lon; }
  kLive.vene = { lat: f.lat, lon: f.lon, suunta: kulku, nopeus: f.sog }; kLive.kierto = kiertoNyt();
  kLive.piirra(); seuraaMerkki();
}
// Pehmeän liikkeen tila ja askel. Kulmat (veneen suunta asteina, kartan kierto radiaaneina) liu'utetaan lyhintä tietä.
// Itsetestissä (?testi) liike on pois, koska tarkistukset lukevat tilan heti paikannuksen jälkeen; window.__pehmea = true ottaa sen käyttöön.
const liike = { a: null, ajastin: 0 };
const PEHMEA = () => !/[?&]testi/.test(location.search) || !!window.__pehmea;
const kulmaVali = (a, b, t, kierros) => { let d = (b - a) % kierros; if (d > kierros / 2) d -= kierros; if (d < -kierros / 2) d += kierros; return a + d * t; };
function liikeSeis() { liike.a = null; if (liike.ajastin) { clearInterval(liike.ajastin); liike.ajastin = 0; } }
function liikeAskel() {
  const a = liike.a; if (!a || !kLive || !kLive.cv.isConnected || nakyma !== 'kartta') { liikeSeis(); return; }
  const t = rajaa((Date.now() - a.t0) / a.kesto, 0, 1), lat = a.lat0 + (a.lat1 - a.lat0) * t, lon = a.lon0 + (a.lon1 - a.lon0) * t, k1 = kiertoNyt();
  kLive.vene = { lat, lon, suunta: a.s1 == null ? null : a.s0 == null ? a.s1 : (kulmaVali(a.s0, a.s1, t, 360) + 360) % 360, nopeus: a.nopeus };
  kLive.kierto = t >= 1 ? k1 : kulmaVali(a.k0, k1, t, 2 * Math.PI);
  if (lv.seuraa) { lv.lat = lat; lv.lon = lon; }
  kLive.piirra(); seuraaMerkki();
  if (t >= 1) liikeSeis();
}

// Kartta-alueen lataus talteen: päänäkymässä näkyvä alue valitulla tarkkuudella.
const LAATTARAJA = 4000, LAATTAKOKO = 0.09;      // Mt / pala, arvio koelatauksista
function lataaAlueIkkuna() {
  if (!kartta().talteen) { ilmoita('Vain merikartan voi ladata talteen. Vaihda karttapohjaksi jokin merikartoista.'); return; }
  if (!kLive) return;
  const K = nayttoKartta(lv), palaMt = K.arvio ? K.arvio.pala : LAATTAKOKO;
  if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
  const b = nakymaRajat(kLive);
  const tasot = [[11, 'Yleiskuva', 'reittien suunnitteluun'], [13, 'Tarkka', 'väylät ja merimerkit erottuvat'], [15, 'Tarkin', 'satamat ja kapeikot']].map(t => t.concat(laattaLista(b, 8, t[0]).length));
  const d = $('#dlg'), tila = { peru: false, K };
  d.innerHTML = '<form method="dialog"><h3>Lataa kartta talteen</h3><div class="pieni">Talteen ladataan kartalla nyt näkyvä alue (' + K.nimi + '), ja se näkyy sen jälkeen ilman verkkoa. Loitonna tai siirrä karttaa ensin, jos haluat eri alueen. Koot ovat arvioita.</div>' +
    tasot.map((t, i) => '<label class="cb"><input type="radio" name="taso" value="' + t[0] + '"' + (t[3] > LAATTARAJA ? ' disabled' : '') + '><span><b>' + t[1] + '</b> – ' + t[2] + '<br><span class="pieni">' + (t[3] > LAATTARAJA ? 'liian suuri alue (' + t[3] + ' palaa) – lähennä karttaa' : t[3] + ' palaa, noin ' + Math.max(1, Math.round(t[3] * palaMt)) + ' Mt') + '</span></span></label>').join('') +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  const eka = [...d.querySelectorAll('input[name=taso]')].filter(x => !x.disabled); if (eka.length) eka[Math.min(1, eka.length - 1)].checked = true; else d.querySelector('#lOk').disabled = true;
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  d.querySelector('#lOk').onclick = async () => {
    const valinta = d.querySelector('input[name=taso]:checked'); if (!valinta) return;
    const lista = laattaLista(b, 8, +valinta.value), ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    d.querySelector('#lOk').disabled = true; d.querySelectorAll('input[name=taso]').forEach(x => x.disabled = true); d.querySelector('#lPeru').textContent = 'Keskeytä'; ed.hidden = false;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
    const r = await lataaLaatat(lista, (n, kaikki, lisa) => { ed.value = n / kaikki; tx.textContent = n + ' / ' + kaikki + ' palaa' + (lisa || ''); }, tila);
    tx.textContent = (tila.virhe ? 'Karttapalvelu ei vastaa, lataus pysäytettiin. Yritä myöhemmin uudelleen – jo ladatut palat säilyvät. ' : tila.peru ? 'Keskeytetty. ' : 'Valmis. ') + 'Ladattu ' + r.ok + ', ennestään tallessa ' + r.ennestaan + (r.puuttuu ? ', ei saatavilla ' + r.puuttuu + ' (alueelta ei ole karttaa tai yhteys katkesi)' : '') + '.';
    d.querySelector('#lPeru').textContent = 'Sulje'; karttaUudelleen();
  };
  d.showModal();
}
// Kokonaiset merialueet kerralla talteen: merikartta ja alueen väylätiedot. Jo ladatut palat ohitetaan, joten keskeytynyt lataus jatkuu samasta napista.
// b = alueen rajat, avain = väylätietojen tallennusavain (kv), vaylaMt = väylätietojen kokoarvio.
const ALUEET = [
  { id: 'suomenlahti', nimi: 'Suomenlahti', kuvaus: 'Hangosta Virolahdelle', avain: 'vaylat', vaylaMt: 15, b: { lo0: 22.4, lo1: 28.0, la0: 59.55, la1: 60.70 } },
  { id: 'saaristomeri', nimi: 'Saaristomeri', kuvaus: 'Hangon länsipuolelta Kustaviin ja Kökariin (Turku, Parainen, Nauvo, Korppoo, Utö)', avain: 'vaylat-saaristomeri', vaylaMt: 10, b: { lo0: 20.6, lo1: 22.4, la0: 59.65, la1: 60.70 } },
  { id: 'selkameri', nimi: 'Selkämeri', kuvaus: 'Uudestakaupungista Kaskisiin', avain: 'vaylat-selkameri', vaylaMt: 5, b: { lo0: 20.6, lo1: 21.85, la0: 60.70, la1: 62.60 } },
  // Sisävedet (2026-11-23). kartta = alueen karttapohja: S-57-aineisto kattaa Saimaan, mutta ei Päijännettä eikä Näsijärveä, joilta on vain vanha merikartta.
  { id: 'saimaa', nimi: 'Saimaa', kuvaus: 'Lappeenrannasta ja Imatralta Mikkeliin, Savonlinnaan, Varkauteen ja Joensuuhun', avain: 'vaylat-saimaa', vaylaMt: 15, kartta: 's57', b: { lo0: 27.0, lo1: 30.0, la0: 61.0, la1: 62.65 } },
  { id: 'paijanne', nimi: 'Päijänne', kuvaus: 'Lahdesta ja Heinolasta Jyväskylään', avain: 'vaylat-paijanne', vaylaMt: 3, kartta: 'meri', b: { lo0: 24.9, lo1: 26.1, la0: 60.95, la1: 62.30 } },
  { id: 'nasijarvi', nimi: 'Näsijärvi', kuvaus: 'Tampereelta Ruovedelle ja Virroille', avain: 'vaylat-nasijarvi', vaylaMt: 2, kartta: 'meri', b: { lo0: 23.4, lo1: 24.2, la0: 61.45, la1: 62.30 } }
];
// Norjan rannikko ladattavina alueina (vain kartta: väylätiedot, rajoitusalueet ja syvyyskäyrät ovat Suomen viranomaisilta eivätkä kata Norjaa).
// Samoista rajoista päätellään, milloin kartan keskikohta on Norjan vesillä.
const NORJA = [
  { id: 'no-oslo', nimi: 'Oslonvuono ja Skagerrak', kuvaus: 'Ruotsin rajalta Oslon kautta Kristiansandiin', b: { lo0: 8.0, lo1: 11.6, la0: 57.9, la1: 59.95 } },
  { id: 'no-etela', nimi: 'Lounaisrannikko', kuvaus: 'Kristiansandista Lindesnesin ympäri Stavangeriin', b: { lo0: 4.8, lo1: 8.0, la0: 57.9, la1: 59.5 } },
  { id: 'no-lansi', nimi: 'Länsi-Norjan vuonot', kuvaus: 'Haugesund, Hardangerinvuono, Bergen ja Sognevuono', b: { lo0: 4.4, lo1: 7.8, la0: 59.5, la1: 61.4 } },
  { id: 'no-more', nimi: 'Nordfjord ja Møre', kuvaus: 'Florøstä Ålesundin ja Geirangerin kautta Kristiansundiin', b: { lo0: 4.6, lo1: 9.0, la0: 61.4, la1: 63.3 } },
  { id: 'no-trondelag', nimi: 'Trøndelag', kuvaus: 'Trondheiminvuono ja rannikko Rørvikiin', b: { lo0: 7.5, lo1: 12.5, la0: 63.3, la1: 65.2 } },
  { id: 'no-helgeland', nimi: 'Helgeland ja Bodø', kuvaus: 'Brønnøysundista Bodøhön', b: { lo0: 10.5, lo1: 16.5, la0: 65.2, la1: 67.6 } },
  { id: 'no-lofootit', nimi: 'Lofootit ja Vesterålen', kuvaus: 'Vestfjorden, Lofootit, Vesterålen ja Narvik', b: { lo0: 11.5, lo1: 17.5, la0: 67.6, la1: 69.4 } },
  { id: 'no-tromssa', nimi: 'Tromssa', kuvaus: 'Senja, Tromssa ja Lyngen', b: { lo0: 16.5, lo1: 22.5, la0: 68.9, la1: 70.5 } },
  { id: 'no-finnmark', nimi: 'Finnmark', kuvaus: 'Altasta Nordkappin kautta Kirkkoniemeen', b: { lo0: 21.5, lo1: 31.5, la0: 69.6, la1: 71.4 } }
];
// Norjan väylät (Kystverket: Hovedled og biled) ovat pieni aineisto, joten koko maa ladataan kerralla omana väyläalueenaan.
const NORJA_VAYLA = { id: 'norja', nimi: 'Norja', avain: 'vaylat-norja', norja: true };
const VAYLA_ALUEET = ALUEET.concat([NORJA_VAYLA]);
const NORJA_VAYLA_URL = 'https://services.kystverket.no/wfs.ashx?service=WFS&version=1.1.0&request=GetFeature&srsName=EPSG:4326&typeName=layer_552';
async function lataaVaylatNorja(edistys, alue) {
  if (edistys) edistys('Haetaan Norjan väyliä…');
  const r = await fetch(NORJA_VAYLA_URL); if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = farledMuunna(await r.text()); if (d.linjat.length < 100) throw new Error('väyliä ei saatu');
  await DB.put('kv', { haettu: Date.now(), nimet: d.nimet, linjat: d.linjat, merkit: [], rajoitukset: [] }, alue.avain);
  vayla = null; verkko = null; return vaylatMuistiin();
}
// Norjan väylälinjat piirtoa varten: jokaiselle linjalle rajat (näkymän ulkopuoliset ohitetaan) ja tieto pääväylästä.
const linjaRajat = (linjat, nimet) => linjat.map(l => { const b = [180, 90, -180, -90]; for (let i = 0; i < l.p.length; i += 2) { b[0] = Math.min(b[0], l.p[i]); b[2] = Math.max(b[2], l.p[i]); b[1] = Math.min(b[1], l.p[i + 1]); b[3] = Math.max(b[3], l.p[i + 1]); } return { p: l.p, b, paa: /\(pääväylä\)$/.test(nimet[l.j] || '') }; });
// Norjan merikartassa väylälinjoja ei ole piirretty, joten ne piirretään kartan päälle: pääväylä yhtenäisenä, sivuväylä katkoviivana.
function piirraNorjaVaylat(c, X, Y, W, H, z) {
  if (!norjaLinjat || !norjaNyt() || z < 7) return;      // näkyvät aina Norjan merikartalla, ei erillistä valintaa
  c.save(); c.lineJoin = c.lineCap = 'round'; c.globalAlpha = .8;
  for (const paa of [false, true]) {
    c.beginPath(); let n = 0;
    for (const l of norjaLinjat) { if (l.paa !== paa || X(l.b[2]) < 0 || X(l.b[0]) > W || Y(l.b[1]) < 0 || Y(l.b[3]) > H) continue; n++; for (let i = 0; i < l.p.length; i += 2) i ? c.lineTo(X(l.p[i]), Y(l.p[i + 1])) : c.moveTo(X(l.p[i]), Y(l.p[i + 1])); }
    if (!n) continue;
    c.setLineDash([]); c.lineWidth = paa ? 5 : 4; c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke();
    c.setLineDash(paa ? [] : [9, 7]); c.lineWidth = paa ? 2.4 : 1.7; c.strokeStyle = '#6a1b9a'; c.stroke();
  }
  c.restore();
}
const alueKartta = a => a.kartta === 's57' ? s57K() : a.kartta ? KARTAT[a.kartta] : latausKartta();
// Näytettävä karttapohja kartan keskikohdassa: S-57:n katvealueilla (Päijänne, Näsijärvi) näytetään automaattisesti vanha merikartta.
function nayttoKartta(v) {
  const K = kartta(); if (K.id === 'maa' || K.id === 'norja') return K;
  // Norjan vesillä näytetään Norjan merikartta, koska Suomen kartat eivät ulotu sinne
  if (v.z >= 5.5 && norjassa(v.lat, v.lon, NORJA)) return KARTAT.norja;
  if (!K.wms) return K;
  for (const a of ALUEET) if (a.kartta === 'meri' && v.lon >= a.b.lo0 && v.lon < a.b.lo1 && v.lat >= a.b.la0 && v.lat < a.b.la1) return KARTAT.meri;
  return K;
}
const SUOMENLAHTI = ALUEET[0].b;
const alueNapit = luokka => ALUEET.map(a => '<button' + (luokka === 'dlg' ? ' type="button" class="nappi"' : ' class="nappi' + (a === ALUEET[0] ? ' paa' : '') + '" data-a="lataaKokoAlue" data-id="' + a.id + '"') + ' data-alue="' + a.id + '">Lataa ' + a.nimi + ': kartta ja väylätiedot</button>').join('');
// Tarkat tasot (14 ja 15) koko alueelta vain sieltä, missä kartassa on sisältöä: noin kaksi kolmasosaa paloista on tyhjää avomerta tai maata,
// ja tyhjän palan tunnistaa tiedoston koosta. Taso kerrallaan: ladataan niiden palojen neljä alipalaa, joissa on karttaa.
const TYHJA_PALA = 1500;      // tavua: tätä pienempi kuva on tyhjä (tyhjä pala on noin 800 tavua)
async function lataaTarkat(b, maxZ, edistys, tila) {
  // S-57 (wms): tyhjän palan raja on pienempi, ja pala, jota ei saatu haettua, ei ole tyhjä – sen alipalat haetaan varmuuden vuoksi.
  const K = tila.K || latausKartta(), e = laattaAvain(K), raja = K.tyhja || TYHJA_PALA, eiOle = K.wms ? raja + 1 : 0;
  let emot = laattaLista(b, 13, 13); const yht = { ok: 0, ennestaan: 0, puuttuu: 0 };
  for (let z = 14; z <= maxZ && !tila.peru; z++) {
    const lista = [];
    for (let i = 0; i < emot.length && !tila.peru; i += 24) {
      const koot = await Promise.all(emot.slice(i, i + 24).map(t => DB.get('laatat', e + t[0] + '/' + t[1] + '/' + t[2]).then(k => k ? k.size : eiOle, () => eiOle)));
      koot.forEach((koko, j) => { if (koko > raja) { const t = emot[i + j]; for (const dx of [0, 1]) for (const dy of [0, 1]) lista.push([z, t[1] * 2 + dx, t[2] * 2 + dy]); } });
    }
    if (!lista.length) break;
    const r = await lataaLaatat(lista, (k, kaikki, lisa) => edistys(z, k, kaikki, lisa), tila);
    yht.ok += r.ok; yht.ennestaan += r.ennestaan; yht.puuttuu += r.puuttuu; emot = lista;
  }
  return yht;
}
// Karttapaketti (.kpak): tietokoneella valmiiksi ladattu alue (karttapalat, väylätiedot ja syvyyskäyrät) yhdessä tiedostossa.
// Rakenne: "KPAK1\n", tietueet peräkkäin, hakemisto (JSON) ja 40 merkin loppumerkintä "KPAK1 <hakemiston alku> <pituus>".
// Tiedostoa luetaan paloina (File.slice), joten satojen megatavujen paketti ei tarvitse yhtä paljon muistia.
const KPAK_TAULUKOT = Object.assign(Object.create(null), { Float32Array, Float64Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array });
async function kpakLue(f) {
  if (f.size < 60 || await f.slice(0, 6).text() !== 'KPAK1\n') throw new Error('Tiedosto ei ole Kippari Pron karttapaketti (.kpak).');
  const m = /^KPAK1 (\d+) (\d+) *$/.exec(await f.slice(f.size - 40).text());
  if (!m || +m[1] < 6 || +m[1] + +m[2] > f.size - 40) throw new Error('Karttapaketti on vajaa – tiedoston siirto on luultavasti katkennut.');
  let h = null; try { h = JSON.parse(await f.slice(+m[1], +m[1] + +m[2]).text()); } catch (x) { }
  if (!h || !Array.isArray(h.laatat) || !Array.isArray(h.kv)) throw new Error('Karttapaketin sisällysluettelo ei aukea.');
  h.loppu = +m[1]; return h;
}
// Tuo paketin sisällön laitteen tallennukseen. edistys(tehty, kaikki, lisa). Palauttaa { palat, ohi, tavut, tiedot: [tekstit] }.
// Paketista hyväksytään vain karttapalat sekä alueiden väylätiedot ja syvyyskäyrät – muihin tallennuksiin (matkat, asetukset) se ei voi kirjoittaa.
async function kpakTuo(f, h, edistys, tila) {
  const tulos = { palat: 0, ohi: 0, tavut: 0, tiedot: [] }, L = h.laatat, N = L.length, sallitut = new Map(), syvMuuttui = [];
  for (const a of ALUEET) { sallitut.set(a.avain, [a, 'v']); sallitut.set('syvyys-' + a.id, [a, 's']); }
  const taulukko = (nimi, v) => {
    if (!(v && typeof v.__t === 'string' && typeof v.b64 === 'string')) return v;
    const C = KPAK_TAULUKOT[v.__t]; if (!C) throw new Error('tuntematon tietotyyppi');
    const b = atob(v.b64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new C(u.buffer);
  };
  for (const r of h.kv) {
    if (tila.peru) break;
    const [k, a, n] = r, s = sallitut.get(k); if (!s || !(a >= 6 && n > 0 && a + n <= h.loppu)) continue;
    const nimi = (s[1] === 'v' ? 'väylätiedot' : 'syvyyskäyrät') + ' (' + s[0].nimi + ')';
    edistys(0, N, ' · ' + nimi);
    let o = null; try { o = JSON.parse(await f.slice(a, a + n).text(), taulukko); } catch (x) { }
    if (!o || !(s[1] === 'v' ? Array.isArray(o.linjat) && Array.isArray(o.merkit) : o.p && o.alku && o.s)) { tulos.tiedot.push(nimi + ' eivät auenneet'); continue; }
    let ed = null; try { ed = await DB.get('kv', k); } catch (x) { }
    // laitteella olevia uudempia tietoja ei korvata paketin vanhemmilla
    if (ed && ed.haettu >= o.haettu) { tulos.tiedot.push(nimi + ': laitteella on jo yhtä uudet (' + pvm(ed.haettu) + ')'); continue; }
    await DB.put('kv', o, k); tulos.tiedot.push(nimi + ' tuotu (haettu ' + pvm(o.haettu) + ')');
    if (s[1] === 's') syvMuuttui.push(s[0].id);
  }
  // Karttapalat erissä: yksi tiedoston luku ja yksi tallennustapahtuma erää kohti
  const kelpo = /^([\w|.\-]+\/)?\d+\/\d+\/\d+$/, mt = () => ' · ' + (tulos.tavut < 10485760 ? (tulos.tavut / 1048576).toFixed(1).replace('.', ',') : Math.round(tulos.tavut / 1048576)) + ' Mt';
  for (let i = 0; i < N && !tila.peru;) {
    const a0 = L[i][1]; let j = i, a1 = a0;
    while (j < N && j - i < 400 && L[j][1] >= a1 && L[j][1] + L[j][2] - a0 <= 4194304) { a1 = L[j][1] + L[j][2]; j++; }
    if (j === i) { j = i + 1; a1 = a0 + L[i][2]; }
    if (!(a0 >= 6 && a1 > a0 && a1 <= h.loppu && a1 - a0 <= 33554432)) { tulos.ohi += j - i; i = j; continue; }
    const buf = await f.slice(a0, a1).arrayBuffer(); let palat = 0, ohi = 0, tavut = 0;
    try {
      await DB.tx('laatat', 'readwrite', o => {
        for (let q = i; q < j; q++) {
          const [k, a, n] = L[q];
          if (typeof k === 'string' && kelpo.test(k) && n > 0) { o.put(new Blob([buf.slice(a - a0, a - a0 + n)], { type: 'image/png' }), k); palat++; tavut += n; } else ohi++;
        }
      });
    } catch (x) { if (x && x.name === 'QuotaExceededError') { tila.taynna = true; break; } throw x; }
    tulos.palat += palat; tulos.ohi += ohi; tulos.tavut += tavut; i = j;
    edistys(i, N, mt());
  }
  for (const [k, m] of muisti) if (m.ei || m.eiDb) muisti.delete(k);      // aiemmin puuttuneet palat haetaan nyt laitteelta
  vayla = null; verkko = null; await vaylatMuistiin();
  if (syvMuuttui.length) { for (const id of syvMuuttui) delete syv.osat[id]; syv.ladattu = false; if (T.as.syvyys) await syvyysMuistiin(); }
  return tulos;
}
async function lataaAlueKokoIkkuna(alue) {
  // K = ladattava merikartta: valittu karttapohja, tai vanha merikartta, jos valittuna on maastokartta
  const K = alueKartta(alue), ar = K.arvio || { pala: LAATTAKOKO, osuus: 0.33, k14: 0.018, k15: 0.009 };
  const lista = laattaLista(alue.b, 8, 13), mt = Math.round(lista.length * ar.pala / 10) * 10, d = $('#dlg'), tila = { peru: false, K };
  const min = k => Math.max(5, Math.round(lista.length / 9348 * k / 5) * 5);
  // S-57: kesto mitatusta tahdista (palaa sekunnissa, vaihteluväli)
  const aikaT = m => m < 90 ? Math.max(5, Math.round(m / 5) * 5) + ' min' : (m / 60 < 10 ? (m / 60).toFixed(1).replace('.', ',') : Math.round(m / 60)) + ' h';
  const kesto = k => aikaT(k / ar.nopeus[1] / 60) + ' – ' + aikaT(k / ar.nopeus[0] / 60);
  // arvio tarkkojen tasojen määrästä: Suomenlahden otannassa noin kolmasosassa tason 13 paloista oli karttasisältöä (S-57:ssä selvästi useammassa)
  const n13 = laattaLista(alue.b, 13, 13).length, e14 = Math.round(n13 * ar.osuus * 4 / 100) * 100, e15 = Math.round(e14 * 4 * 0.85 / 100) * 100, sata = x => Math.max(10, Math.round(x / 10) * 10);
  const tarkkuudet = [[13, 'Perus', 'väylät, syvyydet ja merimerkit erottuvat', ''],
    [14, 'Tarkka', 'lisäksi tarkempi taso rannikolta, saaristosta ja väyliltä', 'noin ' + e14 + ' palaa lisää, arviolta ' + sata(e14 * ar.k14) + ' Mt' + (ar.nopeus ? ' ja ' + kesto(e14) : '')],
    [15, 'Tarkin', 'kartan tarkin taso' + (K.paalle ? ' ja satamakartat' : '') + ' rannikolta, saaristosta ja väyliltä', 'noin ' + (e14 + e15) + ' palaa lisää, arviolta ' + sata(e14 * ar.k14 + e15 * ar.k15) + ' Mt ja ' + (ar.nopeus ? kesto(e14 + e15) : e14 + e15 < 22000 ? 'alle tunti' : '1–2 tuntia')]];
  let tilaa = '';
  try { const s = await navigator.storage.estimate(); if (s && s.quota) { const vapaa = (s.quota - (s.usage || 0)) / 1048576; tilaa = ' Selain antaa sovellukselle tilaa vielä noin ' + (vapaa > 2000 ? n(vapaa / 1024, 1) + ' Gt' : Math.round(vapaa) + ' Mt') + '.' + (vapaa < mt ? ' <b>Se ei ehkä riitä koko lataukseen.</b>' : ''); } } catch (x) { }
  d.innerHTML = '<form method="dialog"><h3>Lataa kartta ja väylätiedot: ' + alue.nimi + '</h3><div class="pieni">' + K.nimi + ' ' + alue.kuvaus + ' tarkkuudella, jolla väylät, syvyydet ja merimerkit erottuvat. ' + lista.length + ' karttapalaa, arviolta ' + mt + ' Mt ja ' + (ar.nopeus ? kesto(lista.length) : min(15) + '–' + min(40) + ' minuuttia') + '.' + tilaa + '</div>' +
    (alue.kartta === 'meri' ? '<div class="pieni">Tältä alueelta ei ole S-57-karttaa, joten talteen ladataan rasterimerikartta. Sovellus näyttää sen täällä automaattisesti, vaikka karttapohjaksi on valittu S-57.</div>' : '') +
    (K.wms ? '<div class="pieni">Karttapalvelu piirtää jokaisen S-57-palan pyynnöstä, joten lataus on selvästi hitaampi kuin rasterimerikartalla ja paloja haetaan vain kaksi kerrallaan. Ajat ja koot ovat arvioita pienestä otoksesta. Rasterimerikartan palat säilyvät laitteella erikseen.</div>' : '') +
    '<h4>Kartan tarkkuus</h4>' + tarkkuudet.map(t => '<label class="cb"><input type="radio" name="tark" value="' + t[0] + '"' + (t[0] === 13 ? ' checked' : '') + '><span><b>' + t[1] + '</b> – ' + t[2] + (t[3] ? '<br><span class="pieni">' + t[3] + '</span>' : '') + '</span></label>').join('') +
    '<div class="pieni">Perustarkkuudella kartta ei tarkennu ilman verkkoa, kun zoomaat lähelle. Tarkat tasot ladataan vain sieltä, missä kartassa on sisältöä; avomeri jää perustarkkuuteen. Tarkemman tason voi ladata myöhemmin samasta napista – jo ladatut palat ohitetaan.</div>' +
    '<div class="pieni">Samalla ladataan alueen väylät, merimerkit ja nopeusrajoitusalueet (noin ' + alue.vaylaMt + ' Mt), jolloin myös reittisuunnittelu, reitin seuranta ja rajoitusvaroitukset toimivat ilman verkkoa.</div>' +
    '<div class="pieni">Käytä Wi-Fiä ja pidä sovellus auki latauksen ajan. Jos lataus keskeytyy, paina samaa nappia uudelleen – jo ladatut palat ohitetaan.</div>' +
    '<h4>Tuo valmiista tiedostosta</h4><div class="pieni">Jos sinulla on tietokoneella tehty karttapaketti (.kpak) alueesta ' + alue.nimi + ', voit tuoda kartan, väylätiedot ja syvyyskäyrät siitä. Tuonti ei tarvitse verkkoa. Siirrä tiedosto ensin tälle laitteelle ja valitse se napista ”Tuo kpak-tiedostosta”.</div>' +
    '<input type="file" id="lKpak" hidden>' +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi" id="lTuo">Tuo kpak-tiedostosta</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  // Tuonti karttapaketista: valittu tiedosto tarkistetaan ja tuodaan heti
  const kp = d.querySelector('#lKpak'), lukitse = p => { d.querySelector('#lOk').disabled = p; d.querySelector('#lTuo').disabled = p; d.querySelectorAll('input[name=tark]').forEach(x => x.disabled = p); d.querySelector('#lPeru').textContent = p ? 'Keskeytä' : 'Sulje'; };
  d.querySelector('#lTuo').onclick = () => { kp.value = ''; kp.click(); };
  kp.onchange = () => { if (kp.files[0]) tuoKpak(kp.files[0]); };
  const tuoKpak = async f => {
    const ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    lukitse(true); tila.peru = false; tila.taynna = false; tx.textContent = 'Luetaan karttapakettia…';
    try {
      const h = await kpakLue(f);
      ed.hidden = false; ed.value = 0;
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
      naytto(true);
      const r = await kpakTuo(f, h, (k, kaikki, lisa) => { ed.value = kaikki ? k / kaikki : 1; tx.textContent = 'Tuodaan: ' + k + ' / ' + kaikki + ' karttapalaa' + (kaikki ? ' (' + Math.round(k / kaikki * 100) + ' %)' : '') + (lisa || ''); }, tila);
      window.__kpak = { h: { nimi: h.nimi, alue: h.alue, paloja: h.laatat.length }, r, taynna: !!tila.taynna, peru: !!tila.peru };
      if (watchId == null) naytto(false);
      if (!d.contains(tx)) { karttaUudelleen(); return; }      // ikkuna on jo suljettu tai korvattu toisella
      tx.textContent = (tila.taynna ? 'Laitteen tallennustila loppui kesken. ' : tila.peru ? 'Keskeytetty – valitse sama tiedosto uudelleen, niin tuonti tehdään loppuun. ' : 'Valmis. ') +
        'Paketti: ' + (h.nimi || f.name) + (h.tehty ? ', tehty ' + pvm(h.tehty) : '') + '. Tuotu ' + r.palat + ' karttapalaa (' + Math.round(r.tavut / 1048576) + ' Mt)' + (r.ohi ? ', ohitettu ' + r.ohi + ' virheellistä' : '') + '. ' +
        (r.tiedot.length ? r.tiedot.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join('. ') + '. ' : '') +
        (h.alue && h.alue !== alue.id ? 'Huom: paketti on eri alueelta kuin tämä ikkuna – sen sisältö tuotiin silti. ' : '') +
        (h.karttaAvain && h.karttaAvain !== laattaAvain(K) ? 'Paketin kartta näkyy, kun karttapohjaksi on valittu sama kartta kuin paketissa. ' : '') +
        (h.lahteet ? h.lahteet : '');
    } catch (x) {
      if (watchId == null) naytto(false);
      window.__kpak = { virhe: String(x && x.message || x) };
      if (d.contains(tx)) tx.textContent = 'Tuonti ei onnistunut: ' + (x && x.message || x);
    }
    if (d.contains(tx)) { lukitse(false); tila.peru = false; }
    karttaUudelleen(); paivitaKarttaTila();
  };
  d.querySelector('#lOk').onclick = async () => {
    if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
    const ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    const maxZ = +((d.querySelector('input[name=tark]:checked') || {}).value || 13);
    lukitse(true); ed.hidden = false;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
    tila.tavut = 0; tila.virhe = false;
    naytto(true);
    // 1) väylätiedot: haetaan, jos niitä ei ole tai ne ovat yli vuorokauden vanhat (keskeytyneen latauksen jatko ei hae niitä turhaan uudelleen)
    let vt = '';
    await vaylatMuistiin(); const osa = () => vayla && vayla.osat[alue.id];
    if (osa() && Date.now() - osa().haettu < 864e5) vt = 'Väylätiedot ovat ajan tasalla (haettu ' + pvm(osa().haettu) + '). ';
    else try { await lataaVaylat(t => { tx.textContent = t; }, alue); vt = 'Väylätiedot ladattu: ' + osa().linjat + ' väyläosuutta, ' + osa().merkit + ' merimerkkiä ja ' + osa().rajoitukset + ' rajoitusaluetta. '; }
    catch (x) { vt = osa() ? 'Väylätietojen päivitys ei onnistunut, käytössä ovat aiemmat (' + pvm(osa().haettu) + '). ' : 'Väylätietojen lataus ei onnistunut – paina nappia uudelleen. '; }
    window.__vt = vt;
    // 2) karttapalat
    const r = tila.peru ? { ok: 0, ennestaan: 0, puuttuu: 0 } : await lataaLaatat(lista, (k, kaikki, lisa) => { ed.value = k / kaikki; tx.textContent = k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)' + (lisa || ''); }, tila);
    // 3) tarkat tasot sieltä, missä kartassa on sisältöä
    const rt = !tila.peru && maxZ > 13 ? await lataaTarkat(alue.b, maxZ, (z, k, kaikki, lisa) => { ed.value = k / kaikki; tx.textContent = 'Tarkka taso ' + (z - 13) + ' / ' + (maxZ - 13) + ': ' + k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)' + (lisa || ''); }, tila) : null;
    if (watchId == null) naytto(false);
    if (!d.contains(tx)) { karttaUudelleen(); return; }      // ikkuna on jo korvattu toisella
    if (rt) { r.ok += rt.ok; r.ennestaan += rt.ennestaan; r.puuttuu += rt.puuttuu; }
    tx.textContent = vt + 'Kartta: ' + (tila.taynna ? 'Puhelimen tallennustila loppui kesken. ' : tila.virhe ? 'Karttapalvelu ei vastaa (useita virheitä peräkkäin), lataus pysäytettiin. Yritä myöhemmin uudelleen samasta napista – jo ladatut palat säilyvät. ' : tila.peru ? 'Keskeytetty – jatka painamalla nappia uudelleen. ' : 'Valmis. ') + 'Ladattu ' + r.ok + ', ennestään tallessa ' + r.ennestaan + (r.puuttuu ? ', ei saatavilla ' + r.puuttuu + ' (ei karttaa alueelta tai yhteys katkesi)' : '') + '.';
    lukitse(false); tila.peru = false; karttaUudelleen(); paivitaKarttaTila();
  };
  d.showModal();
}
// Norjan alueen lataus talteen: pelkkä merikartta (tasot 8–13 ja halutessa tarkemmat sieltä, missä kartassa on sisältöä).
async function lataaNorjaIkkuna(alue) {
  if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
  const K = KARTAT.norja, ar = K.arvio, lista = laattaLista(alue.b, 8, 13), d = $('#dlg'), tila = { peru: false, K };
  const n13 = laattaLista(alue.b, 13, 13).length, e14 = Math.round(n13 * ar.osuus * 4 / 100) * 100, e15 = Math.round(e14 * 4 * 0.85 / 100) * 100, kymp = x => Math.max(10, Math.round(x / 10) * 10);
  const tarkkuudet = [[13, 'Perus', 'väylät, syvyydet ja merimerkit erottuvat', lista.length + ' palaa, arviolta ' + kymp(lista.length * ar.pala) + ' Mt'],
    [14, 'Tarkka', 'lisäksi tarkempi taso rannikolta ja vuonoista', 'noin ' + e14 + ' palaa lisää, arviolta ' + kymp(e14 * ar.k14) + ' Mt'],
    [15, 'Tarkin', 'kaksi tarkempaa tasoa rannikolta ja vuonoista', 'noin ' + (e14 + e15) + ' palaa lisää, arviolta ' + kymp(e14 * ar.k14 + e15 * ar.k15) + ' Mt']];
  let tilaa = '';
  try { const s = await navigator.storage.estimate(); if (s && s.quota) { const vapaa = (s.quota - (s.usage || 0)) / 1048576; tilaa = ' Selain antaa sovellukselle tilaa vielä noin ' + (vapaa > 2000 ? n(vapaa / 1024, 1) + ' Gt' : Math.round(vapaa) + ' Mt') + '.' + (vapaa < lista.length * ar.pala ? ' <b>Se ei ehkä riitä koko lataukseen.</b>' : ''); } } catch (x) { }
  d.innerHTML = '<form method="dialog"><h3>Lataa Norjan merikartta: ' + alue.nimi + '</h3><div class="pieni">' + alue.kuvaus + '. Koot ovat arvioita pienestä otoksesta.' + tilaa + '</div>' +
    '<div class="pieni">Norjasta ladataan vain merikartta (Kartverket). Väylätiedot, reititys väyliä pitkin, nopeusrajoitusalueet ja syvyyskäyrät eivät kata Norjaa. Oman reitin voi piirtää kartalle. Ei navigointikäyttöön.</div>' +
    '<h4>Kartan tarkkuus</h4>' + tarkkuudet.map(t => '<label class="cb"><input type="radio" name="tark" value="' + t[0] + '"' + (t[0] === 13 ? ' checked' : '') + '><span><b>' + t[1] + '</b> – ' + t[2] + '<br><span class="pieni">' + t[3] + '</span></span></label>').join('') +
    '<div class="pieni">Käytä Wi-Fiä ja pidä sovellus auki latauksen ajan. Jos lataus keskeytyy, paina samaa nappia uudelleen – jo ladatut palat ohitetaan.</div>' +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  d.querySelector('#lOk').onclick = async () => {
    const ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti'), maxZ = +((d.querySelector('input[name=tark]:checked') || {}).value || 13);
    d.querySelector('#lOk').disabled = true; d.querySelectorAll('input[name=tark]').forEach(x => x.disabled = true); d.querySelector('#lPeru').textContent = 'Keskeytä'; ed.hidden = false;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
    tila.tavut = 0; tila.virhe = false; naytto(true);
    // Norjan väylät samalla, jos niitä ei ole tai ne ovat yli vuorokauden vanhat
    await vaylatMuistiin(); if (!(vayla && vayla.osat.norja && Date.now() - vayla.osat.norja.haettu < 864e5)) try { await lataaVaylat(t => { tx.textContent = t; }, NORJA_VAYLA); } catch (x) { }
    const r = await lataaLaatat(lista, (k, kaikki, lisa) => { ed.value = k / kaikki; tx.textContent = k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)' + (lisa || ''); }, tila);
    const rt = !tila.peru && maxZ > 13 ? await lataaTarkat(alue.b, maxZ, (z, k, kaikki, lisa) => { ed.value = k / kaikki; tx.textContent = 'Tarkka taso ' + (z - 13) + ' / ' + (maxZ - 13) + ': ' + k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)' + (lisa || ''); }, tila) : null;
    if (watchId == null) naytto(false);
    window.__norja = { r, rt };
    if (!d.contains(tx)) { karttaUudelleen(); return; }
    if (rt) { r.ok += rt.ok; r.ennestaan += rt.ennestaan; r.puuttuu += rt.puuttuu; }
    tx.textContent = (tila.taynna ? 'Puhelimen tallennustila loppui kesken. ' : tila.virhe ? 'Karttapalvelu ei vastaa (useita virheitä peräkkäin), lataus pysäytettiin. Yritä myöhemmin uudelleen samasta napista – jo ladatut palat säilyvät. ' : tila.peru ? 'Keskeytetty – jatka painamalla nappia uudelleen. ' : 'Valmis. ') + 'Ladattu ' + r.ok + ', ennestään tallessa ' + r.ennestaan + (r.puuttuu ? ', ei saatavilla ' + r.puuttuu : '') + '.';
    d.querySelector('#lPeru').textContent = 'Sulje'; d.querySelector('#lOk').disabled = false; d.querySelectorAll('input[name=tark]').forEach(x => x.disabled = false); tila.peru = false; karttaUudelleen(); paivitaKarttaTila();
  };
  d.showModal();
}
async function paivitaKarttaTila() {
  const el = $('#karttaTila'); if (!el) return;
  let teksti = 'Tallessa ' + await DB.maara('laatat') + ' karttapalaa';
  try { const s = await navigator.storage.estimate(); if (s && s.usage) teksti += ' · sovelluksen tiedot yhteensä noin ' + Math.max(1, Math.round(s.usage / 1048576)) + ' Mt'; } catch (x) { }
  await vaylatMuistiin();
  teksti += vayla ? '. Väylätiedot tallessa: ' + VAYLA_ALUEET.filter(a => vayla.osat[a.id]).map(a => a.nimi + ' (haettu ' + pvm(vayla.osat[a.id].haettu) + ')').join(', ') : '. Väylätietoja ei ole vielä ladattu';
  if ($('#karttaTila')) $('#karttaTila').textContent = teksti + '.';
}

// Nopeuskäyrä: jokaisen reittipisteen nopeus solmuina ajan funktiona.
function piirraKayra(cv, pts) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const tyyli = getComputedStyle(document.documentElement), vari = k => tyyli.getPropertyValue(k).trim();
  const kn = pts.map(p => nopeus(p[3] || 0)), suurin = Math.max(...kn, 1), askel = suurin > 40 ? 20 : suurin > 20 ? 10 : suurin > 8 ? 5 : suurin > 4 ? 2 : 1, ylin = Math.ceil(suurin / askel) * askel;
  const vas = 30, ala = 18, yla = 6, t0 = pts[0][0], t1 = Math.max(pts[pts.length - 1][0], t0 + 1);
  const X = t => vas + (t - t0) / (t1 - t0) * (W - vas - 4), Y = v => yla + (1 - v / ylin) * (H - yla - ala);
  c.font = '11px system-ui,sans-serif'; c.fillStyle = vari('--himmea'); c.strokeStyle = vari('--viiva'); c.lineWidth = 1; c.textBaseline = 'middle';
  for (let v = 0; v <= ylin; v += askel) { c.beginPath(); c.moveTo(vas, Y(v)); c.lineTo(W - 4, Y(v)); c.stroke(); c.textAlign = 'right'; c.fillText(v, vas - 6, Y(v)); }
  c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillText(klo(t0), vas, H - 3); c.textAlign = 'right'; c.fillText(klo(t1), W - 4, H - 3);
  // yli 2 min aukko (GPS-katko) katkaisee käyrän
  const osat = []; let osa = [];
  pts.forEach((p, i) => { if (i && p[0] - pts[i - 1][0] > 120000) { osat.push(osa); osa = []; } osa.push([X(p[0]), Y(kn[i])]); }); osat.push(osa);
  for (const s of osat) {
    if (s.length < 2) continue;
    c.beginPath(); s.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]));
    c.lineWidth = 2; c.lineJoin = 'round'; c.strokeStyle = vari('--korostus'); c.stroke();
    c.lineTo(s[s.length - 1][0], Y(0)); c.lineTo(s[0][0], Y(0)); c.closePath(); c.globalAlpha = .16; c.fillStyle = vari('--korostus'); c.fill(); c.globalAlpha = 1;
  }
  cv.dataset.pisteita = pts.length;
}

// ---------- toiminnot ----------
const uusiId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Kun matkan päätepiste nimetään, paikka opitaan ja sama nimi annetaan muillekin nimettömille matkoille.
function opiPaikka(nimi, p) {
  if (!nimi || !p || lahinPaikka(T.paikat, p[0], p[1]) || T.paikat.some(x => x.nimi.toLowerCase() === nimi.toLowerCase())) return;
  T.paikat.push({ nimi, lat: p[0], lon: p[1], sade: 400 });
  for (const m of matkat) {
    let muutos = false;
    if (!m.mista && m.a && paikkaNimi(m.a)) { m.mista = paikkaNimi(m.a); muutos = true; }
    if (!m.minne && m.b && paikkaNimi(m.b)) { m.minne = paikkaNimi(m.b); muutos = true; }
    if (muutos) DB.put('matkat', m);
  }
}
const A = {
  seuranta() { seurantaPaalle(); },
  gpsLupa() { gpsLupa(); },
  seurantaPois() { seurantaPois(); piirra(); },
  aloita() { const f = gps.viime; tal.aloita(f ? f.t : Date.now(), f); DB.put('kv', tal.vie(), 'kesken'); piirra(); },
  async lopeta() { const f = gps.viime, m = tal.lopeta(f ? Math.max(f.t, tal.m.alku) : Date.now()); if (!m) return; const t = await tallennaMatka(m); nakyma = 'yksi'; valittu = t.id; piirra(); },
  avaa(id) { valittu = id; nakyma = 'yksi'; dv = null; jalki = null; piirra(); window.scrollTo(0, 0); },
  zoom(d) { const k = nakyma === 'kartta' ? kLive : kYksi; if (k) k.zoomaa(+d); },
  keskita() {
    if (nakyma === 'yksi') { if (kYksi && jalki) { kYksi.sovita(jalki); kYksi.piirra(); } return; }
    if (!gps.viime && !T.sij) { ilmoita('Sijaintia ei ole vielä. Käynnistä seuranta.'); return; }
    lv.seuraa = true; karttaUudelleen();
  },
  lataaAlue() { lataaAlueIkkuna(); },
  async kompassi() {
    // kolme tilaa vuorotellen: pohjoinen ylhäällä -> kulkusuunta ylhäällä -> kulkusuunta ylhäällä ja kartta kallistettuna (3D)
    if (!T.as.keulaYlos) { T.as.keulaYlos = true; T.as.kartta3d = false; } else if (!T.as.kartta3d) T.as.kartta3d = true; else { T.as.keulaYlos = false; T.as.kartta3d = false; }
    await talletaT();
    if (T.as.keulaYlos) { if (gps.viime || T.sij) lv.seuraa = true; ilmoita(T.as.kartta3d ? '3D-näkymä: kartta on kallistettu kulkusuuntaan.' : kulku == null ? 'Kartta kääntyy kulkusuuntaan, kun vene liikkuu.' : 'Kartta osoittaa veneen kulkusuuntaan.'); } else ilmoita('Pohjoinen ylhäällä.');
    karttaUudelleen(); seuraaMerkki();
  },
  matkaSivu() { nakyma = 'matka'; piirra(); },
  // Kartan asetukset: karttapohjan vaihto ja karttojen lataus talteen.
  kartat() {
    const d = $('#dlg');
    d.innerHTML = '<form method="dialog"><h3>Kartta</h3><label>Karttapohja<select id="kPohja">' + POHJAT.map(k => '<option value="' + k + '"' + (k === pohja() ? ' selected' : '') + '>' + KARTAT[k].nimi + '</option>').join('') + '</select></label>' +
      '<label class="cb"><input type="checkbox" id="kNimet"' + (T.as.s57Nimet !== false ? ' checked' : '') + '>Merimerkkien nimet ja loistojen tunnukset (S-57)</label>' +
      '<div class="pieni">Ilman valintaa kartalta jäävät pois tekstit kuten "by Tero" ja "Fl(1)G 3s 2M". Talteen ladattu kartta on valintakohtainen: ilman verkkoa näkyy se versio, joka oli valittuna latauksen aikana.</div>' +
      [["tuuli","Tuuli ja sää","Tuulinuolet, puuskat, lämpötila ja aallonkorkeus kartalla; ennuste 24 tuntia eteenpäin."],["tutka","Sadetutka (Ilmatieteen laitos)",""],["ais","Muut alukset (AIS)","Lähialueen alukset kartalla. Päivittyy noin minuutin välein."],["satamat","Satamat ja polttoaineasemat","Venesatamat palvelutietoineen. Haetaan kerran ja jää talteen."],["luiskat","Veneenlaskuluiskat","Paikat, joissa veneen voi laskea trailerilta veteen."],["saunat","Yleiset saunat saarissa","Helsingin ja Espoon edustan saarten yleiset ja varattavat saunat."]].map(k => '<label class="cb"><input type="checkbox" data-lisa="' + k[0] + '"' + (T.as[k[0]] ? ' checked' : '') + '>' + k[1] + '</label>').join('') +
      '<label class="cb"><input type="checkbox" id="kKall"' + (T.as.kallistus ? ' checked' : '') + '>Näytä kallistusmittari kartalla</label>' +
      '<label class="cb"><input type="checkbox" id="kSuuntaviiva"' + (T.as.suuntaviiva ? ' checked' : '') + '>Veneen suuntaviiva</label>' +
      '<div class="pieni" id="kSuuntaTila">' + (!paikkaTuore() ? 'Suuntaviiva näkyy, kun GPS on päällä ja vene liikkuu.' : kulku == null ? 'Kulkusuuntaa ei vielä tiedetä: viiva ilmestyy, kun vene on liikkunut noin 10 metriä.' : 'Kulkusuunta nyt ' + Math.round(kulku) + '° ' + ilmansuunta(kulku) + '.') + '</div>' +
      '<label class="cb"><input type="checkbox" id="kKalat"' + (T.as.kalapaikat ? ' checked' : '') + '>Omat kalapaikat</label>' +
      '<label class="cb"><input type="checkbox" id="kSyvyys"' + (T.as.syvyys ? ' checked' : '') + '>Syvyyskäyrät</label><div class="pieni" id="kSyvyysTila"></div>' +
      '<label class="cb"><input type="checkbox" id="kSeur"' + (T.as.reittiSeuranta ? ' checked' : '') + '>Seuraa reittiä ajon aikana</label>' +
      '<label>Varoita, kun vene on sivussa reitistä<select id="kSivu">' + [[100, 'yli 100 m'], [200, 'yli 200 m'], [500, 'yli 500 m'], [0, 'ei varoitusta']].map(x => '<option value="' + x[0] + '"' + (x[0] === T.as.reittiSivu ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      '<div class="pieni">Seuranta näyttää kartalla olevasta reitistä jäljellä olevan matkan, arvioidun tuloajan ja seuraavan käännöksen. Se tarvitsee sijainnin, eli seurannan pitää olla päällä Matka-välilehdellä.</div>' +
      '<div class="pieni">Kartalla juuri nyt näkyvän alueen saa talteen puhelimeen, jolloin se näkyy ilman verkkoa. Kokonaiset alueet (Suomenlahti, Saimaa ja muut) ladataan Lisää-välilehdeltä.</div>' +
      '<button type="button" class="nappi" id="kAlue">Lataa näkyvä alue talteen</button>' +
      '<div class="napit"><button type="button" class="nappi paa" id="kSulje">Sulje</button></div></form>';
    d.querySelector('#kPohja').onchange = async ev => { T.as.kartta = ev.target.value; await talletaT(); piirra(); };
    d.querySelector('#kNimet').onchange = async ev => { T.as.s57Nimet = ev.target.checked; await talletaT(); karttaUudelleen(); };
    d.querySelectorAll('[data-lisa]').forEach(el => el.onchange = async () => { T.as[el.dataset.lisa] = el.checked; await talletaT(); if (kLive) kLive.piirra(); lisatPaivita(); });
    d.querySelector('#kKall').onchange = async ev => { T.as.kallistus = ev.target.checked && await kallPaalle(); if (!T.as.kallistus) kallPois(); ev.target.checked = T.as.kallistus; await talletaT(); paivitaKall(true); };
    d.querySelector('#kSuuntaviiva').onchange = async ev => { T.as.suuntaviiva = ev.target.checked; await talletaT(); karttaUudelleen(); };
    d.querySelector('#kKalat').onchange = async ev => { T.as.kalapaikat = ev.target.checked; await talletaT(); karttaUudelleen(); };
    const syvTila = async () => { await syvyysMuistiin(); const el = d.querySelector('#kSyvyysTila'); if (el) el.textContent = Object.keys(syv.osat).length ? 'Näkyvät, kun kartta on lähennetty. Punainen 3 m, oranssi 6 m, sininen 7–10 m, tummansininen sitä syvemmät. Ei navigointiin.' : 'Syvyyskäyriä ei ole vielä ladattu. Lataa ne Lisää-sivun kohdasta Syvyyskäyrät.'; };
    syvTila();
    d.querySelector('#kSyvyys').onchange = async ev => { T.as.syvyys = ev.target.checked; await talletaT(); await syvTila(); karttaUudelleen(); };
    d.querySelector('#kSeur').onchange = async ev => {
      T.as.reittiSeuranta = ev.target.checked; await talletaT(); seurNollaa();
      if (T.as.reittiSeuranta && reitti && !paikkaTuore()) ilmoita('Reitin seuranta tarvitsee sijainnin. Käynnistä seuranta Matka-välilehdeltä.');
      if (T.as.reittiSeuranta && paikkaTuore()) reittiSeuraa(gps.viime);
      karttaUudelleen(); paivitaReittiPalkki();
    };
    d.querySelector('#kSivu').onchange = async ev => { T.as.reittiSivu = +ev.target.value; seur.sivussa = false; seur.halytyksia = 0; await talletaT(); if (paikkaTuore()) reittiSeuraa(gps.viime); paivitaReittiPalkki(); };
    d.querySelector('#kAlue').onclick = () => { d.close(); lataaAlueIkkuna(); };
    d.querySelector('#kSulje').onclick = () => d.close();
    d.showModal();
  },
  lataaSuomenlahti() { lataaAlueKokoIkkuna(ALUEET[0]); },
  lataaNorja(id) { const a = NORJA.find(x => x.id === id); if (a) lataaNorjaIkkuna(a); },
  async lataaNorjaVaylat() {
    if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
    ilmoita('Haetaan Norjan väyliä…');
    try { await lataaVaylat(null, NORJA_VAYLA); ilmoita('Norjan väylät ladattu: ' + vayla.osat.norja.linjat + ' väyläosuutta.'); } catch (x) { ilmoita('Norjan väylien lataus ei onnistunut. Yritä hetken kuluttua uudelleen.'); }
    if (nakyma === 'lisaa') piirra(); else karttaUudelleen();
  },
  lataaKokoAlue(id) { const a = ALUEET.find(x => x.id === id); if (a) lataaAlueKokoIkkuna(a); },
  async tyhjennaKartat() { if (!confirm('Poistetaanko kaikki talteen ladatut kartat laitteelta?')) return; await DB.tyhjenna('laatat'); muisti.clear(); ilmoita('Tallennetut kartat poistettu.'); piirra(); },
  takaisin() { nakyma = 'loki'; piirra(); },
  async poistaMatka() {
    const m = matkat.find(x => x.id === valittu); if (!m) return;
    if (!confirm('Poistetaanko matka ' + pvm(m.alku) + ' (' + n(m.matka / MPK) + ' mpk) pysyvästi? Myös reitti poistuu, ja matkan moottoritunnit vähenevät kokonaislukemasta.')) return;
    await poistaMatkat([m.id]); nakyma = 'loki'; piirra(); ilmoita('Matka poistettu.');
  },
  valintaTila() { valinta = new Set(); piirra(); },
  valintaPois() { valinta = null; piirra(); },
  valitse(id) { if (!valinta) return; valinta.has(id) ? valinta.delete(id) : valinta.add(id); piirra(); },
  valitseKaikki() { vuodelta(matkat, m => m.alku).forEach(m => valinta.add(m.id)); piirra(); },
  async poistaValitut() {
    if (!valinta || !valinta.size) return; const maara = valinta.size;
    if (!confirm('Poistetaanko ' + maara + (maara === 1 ? ' matka' : ' matkaa') + ' pysyvästi? Myös reitit poistuvat, ja matkojen moottoritunnit vähenevät kokonaislukemasta.')) return;
    await poistaMatkat([...valinta]); valinta = null; piirra(); ilmoita(maara + (maara === 1 ? ' matka poistettu.' : ' matkaa poistettu.'));
  },
  uusiMatka() {
    const nyt = Date.now();
    lomake('Lisää matka', [{ k: 'mista', n: 'Mistä' }, { k: 'minne', n: 'Minne' }, { k: 'alku', n: 'Lähtö', t: 'datetime-local', req: 1 }, { k: 'loppu', n: 'Tulo', t: 'datetime-local', req: 1 }, { k: 'mpk', n: 'Matka (mpk)', t: 'num', req: 1 }, { k: 'moottori_h', n: 'Moottoritunnit', t: 'num' }, { k: 'huom', n: 'Muistiinpanot', t: 'area' }],
      { alku: dtl(nyt - 7200000), loppu: dtl(nyt) }, async o => {
        const a = new Date(o.alku).getTime(), b = Math.max(a, new Date(o.loppu).getTime());
        const m = { id: 'm' + a, alku: a, loppu: b, matka: Math.round(o.mpk * MPK), liike: Math.round((b - a) / 1000), max: 0, katkot: 0, a: null, b: null, k: null, mista: o.mista, minne: o.minne, moottori_h: o.moottori_h != null ? o.moottori_h : Math.round((b - a) / 360000) / 10, huom: o.huom, saa: null };
        await DB.put('matkat', m); matkat = matkat.filter(x => x.id !== m.id); matkat.push(m); T.saajono.push(m.id); await talletaT(); paivitaSaat();
      });
  },
  muokkaaMatka() {
    const m = matkat.find(x => x.id === valittu);
    lomake('Muokkaa matkaa', [{ k: 'mista', n: 'Mistä' }, { k: 'minne', n: 'Minne' }, { k: 'mpk', n: 'Matka (mpk)', t: 'num', req: 1 }, { k: 'moottori_h', n: 'Moottoritunnit', t: 'num' }, { k: 'huom', n: 'Muistiinpanot', t: 'area' }],
      { mista: m.mista, minne: m.minne, mpk: Math.round(m.matka / MPK * 100) / 100, moottori_h: m.moottori_h, huom: m.huom }, async o => {
        m.mista = o.mista; m.minne = o.minne; m.matka = Math.round(o.mpk * MPK); m.moottori_h = o.moottori_h || 0; m.huom = o.huom;
        opiPaikka(o.mista, m.a); opiPaikka(o.minne, m.b);
        await DB.put('matkat', m); await talletaT();
      }, async () => { await poistaMatkat([m.id]); nakyma = 'loki'; });
  },
  async gpx() { const m = matkat.find(x => x.id === valittu), p = await DB.get('jaljet', valittu); if (p) lataa('matka-' + paiva(m.alku) + '.gpx', gpx(paatepiste(m.mista, m.a) + ' - ' + paatepiste(m.minne, m.b), p), 'application/gpx+xml'); },
  async saaUudelleen() { const m = matkat.find(x => x.id === valittu); if (!navigator.onLine) { ilmoita('Ei verkkoyhteyttä.'); return; } const ok = await haeSaa(m); ilmoita(ok && m.saa ? 'Sää päivitetty.' : 'Säätä ei saatu tälle matkalle.'); piirra(); },
  csv() {
    const r = [['Päivä', 'Lähtö', 'Tulo', 'Mistä', 'Minne', 'Matka mpk', 'Kesto min', 'Liikkeellä min', 'Keskinopeus ' + NY(), 'Huippu ' + NY(), 'Moottori-h', 'Tuuli m/s', 'Puuska m/s', 'Tuulen suunta', 'Lämpö C', 'Aalto m', 'Muistiinpanot']];
    const d = (x, k = 1) => x == null || isNaN(x) ? '' : String(Math.round(x * 10 ** k) / 10 ** k).replace('.', ',');
    for (const m of [...matkat].sort((a, b) => a.alku - b.alku)) { const s = m.saa || {}; r.push([pvm(m.alku), klo(m.alku), klo(m.loppu), m.mista, m.minne, d(m.matka / MPK, 2), Math.round((m.loppu - m.alku) / 60000), Math.round(m.liike / 60), m.liike ? d(nopeus(m.matka / m.liike)) : '', d(nopeus(m.max)), d(m.moottori_h), d(s.tuuli), d(s.puuska), ilmansuunta(s.suunta), d(s.lampo), d(s.aalto), m.huom]); }
    lataa('kippari-pro-matkat.csv', '﻿' + r.map(x => x.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv');
  },
  tankkaus(id) {
    const x = T.tankkaukset.find(t => t.id === id);
    lomake(x ? 'Muokkaa tankkausta' : 'Lisää tankkaus', [{ k: 'pvm', n: 'Päivä', t: 'date', req: 1 }, { k: 'litrat', n: 'Litrat', t: 'num', req: 1 }, { k: 'eur', n: 'Hinta yhteensä (€)', t: 'num' }, { k: 'taysi', n: 'Tankki tuli täyteen', t: 'cb' }, { k: 'tunnit', n: 'Moottoritunnit tankatessa', t: 'num' }, { k: 'mpk', n: 'Kokonaismatka tankatessa (mpk)', t: 'num' }, { k: 'huom', n: 'Paikka / muistiinpano' }],
      x || { pvm: paiva(Date.now()), taysi: true, tunnit: Math.round(tunnitNyt() * 10) / 10, mpk: Math.round(mpkNyt() * 10) / 10, huom: gps.viime ? paikkaNimi([gps.viime.lat, gps.viime.lon]) : '' },
      async o => { if (x) Object.assign(x, o); else T.tankkaukset.push(Object.assign({ id: uusiId() }, o)); await talletaT(); },
      x && (async () => { T.tankkaukset = T.tankkaukset.filter(t => t !== x); await talletaT(); }));
  },
  kulu(id) {
    const x = T.kulut.find(t => t.id === id);
    lomake(x ? 'Muokkaa kulua' : 'Lisää kulu', [{ k: 'pvm', n: 'Päivä', t: 'date', req: 1 }, { k: 'laji', n: 'Laji', t: 'sel', o: KULULAJIT }, { k: 'summa', n: 'Summa (€)', t: 'num', req: 1 }, { k: 'kuvaus', n: 'Kuvaus' }],
      x || { pvm: paiva(Date.now()), laji: KULULAJIT[0] },
      async o => { if (x) Object.assign(x, o); else T.kulut.push(Object.assign({ id: uusiId() }, o)); await talletaT(); },
      x && (async () => { T.kulut = T.kulut.filter(t => t !== x); await talletaT(); }));
  },
  tehty(id) {
    const x = T.huollot.find(h => h.id === id);
    lomake('Tehty: ' + x.nimi, [{ k: 'pvm', n: 'Päivä', t: 'date', req: 1 }, { k: 'tunnit', n: 'Moottoritunnit silloin', t: 'num' }, { k: 'kulu', n: 'Kulu (€), jos haluat kirjata', t: 'num' }],
      { pvm: paiva(Date.now()), tunnit: Math.round(tunnitNyt() * 10) / 10 },
      async o => { x.tehtyPvm = o.pvm; x.tehtyH = o.tunnit; if (o.kulu) T.kulut.push({ id: uusiId(), pvm: o.pvm, laji: KULULAJIT[1], summa: o.kulu, kuvaus: x.nimi }); await talletaT(); });
  },
  huolto(id) {
    const x = T.huollot.find(h => h.id === id);
    lomake(x ? 'Muokkaa huoltokohdetta' : 'Lisää huoltokohde', [{ k: 'nimi', n: 'Nimi', req: 1 }, { k: 'valiH', n: 'Väli moottoritunteina (tyhjä = ei seurata)', t: 'num' }, { k: 'valiKk', n: 'Väli kuukausina (tyhjä = ei seurata)', t: 'num' }],
      x ? { nimi: x.nimi, valiH: x.valiH || null, valiKk: x.valiKk || null } : {},
      async o => { o.valiH = o.valiH || 0; o.valiKk = o.valiKk || 0; if (x) Object.assign(x, o); else T.huollot.push(Object.assign({ id: uusiId(), tehtyPvm: null, tehtyH: null }, o)); await talletaT(); },
      x && (async () => { T.huollot = T.huollot.filter(h => h !== x); await talletaT(); }));
  },
  vene() {
    lomake('Vene', [{ k: 'nimi', n: 'Veneen nimi' }, { k: 'tunnit0', n: 'Moottoritunnit ennen tätä sovellusta', t: 'num' }, { k: 'mpk0', n: 'Ajettu matka ennen tätä sovellusta (mpk)', t: 'num' }, { k: 'syvays', n: 'Veneen syväys (m) – reitti käyttää vain riittävän syviä väyliä', t: 'num' }, { k: 'nopeus', n: 'Matkanopeus reitin aika-arvioon (solmua)', t: 'num' }], T.vene,
      async o => { T.vene = { nimi: o.nimi, tunnit0: o.tunnit0 || 0, mpk0: o.mpk0 || 0, syvays: o.syvays || null, nopeus: o.nopeus || 10 }; await talletaT(); });
  },
  paikka(i) {
    const p = T.paikat[+i];
    lomake('Paikka', [{ k: 'nimi', n: 'Nimi', req: 1 }, { k: 'sade', n: 'Tunnistussäde (m)', t: 'num' }], { nimi: p.nimi, sade: p.sade || 400 },
      async o => { p.nimi = o.nimi; p.sade = Math.max(50, o.sade || 400); await talletaT(); }, async () => { T.paikat.splice(+i, 1); await talletaT(); });
  },
  paikkaTassa() {
    const f = gps.viime;
    if (!f) { ilmoita('Sijaintia ei ole vielä. Käynnistä seuranta Matka-välilehdeltä.'); return; }
    lomake('Uusi paikka', [{ k: 'nimi', n: 'Nimi (esim. kotisatama)', req: 1 }], {}, async o => { T.paikat.push({ nimi: o.nimi, lat: f.lat, lon: f.lon, sade: 400 }); await talletaT(); });
  },
  async vie() {
    const jaljet = {}; for (const m of matkat) { const p = await DB.get('jaljet', m.id); if (p) jaljet[m.id] = p; }
    T.kopio = Date.now(); await talletaT();
    lataa('kippari-pro-' + paiva(Date.now()) + '.json', JSON.stringify({ lokikirja: 1, tila: T, matkat, jaljet }), 'application/json'); piirra();
  },
  tuo() { $('#tuoTiedosto').click(); },
  saaNyt() { if (!navigator.onLine) ilmoita('Ei verkkoyhteyttä.'); else paivitaSaat(); }
};
// ---------- reittisuunnittelu ----------
// Väylät ja merimerkit: Väyläviraston avoin data (navigointilinjat ja turvalaitteet). Tiedot ladataan kerran laitteelle,
// minkä jälkeen reititys toimii ilman verkkoa. Paikan nimihaku: omat paikat ja merimerkkien nimet laitteelta, muut OpenStreetMapin Nominatimista.
let vayla = null, verkko = null, reitti = null, napautusCb = null, norjaLinjat = null;      // reitti = {mista, minne, r, merkit}
const rs = { mista: { sijainti: true, nimi: 'Nykyinen sijainti' }, minne: null };
const VAYLA_URL = (t, b) => 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&bbox=' + [b.lo0, b.la0, b.lo1, b.la1].join(',') + ',EPSG:4326&typeNames=vesivaylatiedot:' + t;
// Väylätiedot tallennetaan alueittain (kv: alue.avain) ja yhdistetään muistissa yhdeksi aineistoksi (vayla).
async function vaylatMuistiin() {
  if (vayla) return vayla;
  const osat = []; norjaLinjat = null; for (const a of VAYLA_ALUEET) try { const o = await DB.get('kv', a.avain); if (o && o.linjat) { o.alue = a.id; osat.push(o); if (a.norja) norjaLinjat = linjaRajat(o.linjat, o.nimet); } } catch (x) { }
  if (!vayla && osat.length) { vayla = yhdistaVaylat(osat); verkko = null; }
  return vayla;
}
// Päivittää jo ladatut alueet; jos mitään ei ole ladattu, ladataan Suomenlahti.
async function paivitaVaylat(edistys) {
  await vaylatMuistiin(); const lista = VAYLA_ALUEET.filter(a => vayla && vayla.osat[a.id]);
  for (const a of lista.length ? lista : [ALUEET[0]]) await lataaVaylat(t => edistys && edistys(a.nimi + ': ' + t), a);
  return vayla;
}
async function lataaVaylat(edistys, alue) {
  alue = alue || ALUEET[0];
  if (alue.norja) return lataaVaylatNorja(edistys, alue);
  const hae = async (t, teksti) => { if (edistys) edistys(teksti); const r = await fetch(VAYLA_URL(t, alue.b)); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()).features || []; };
  const nimet = [], ni = new Map(), linjat = [], nahty = new Set(), merkit = [], nahtyM = new Set();
  for (const t of ['navigointilinjat_uusi', 'navigointilinjat_muut_vaylanpitajat']) for (const f of await hae(t, 'Haetaan väyliä…')) {
    const p = f.properties, g = f.geometry; if (!g || nahty.has(p.navigointilinjaid)) continue; nahty.add(p.navigointilinjaid);
    const nimi = ((/\[\s*\d*\s*:?\s*([^\]]+)\]/.exec(p.vaylan_nimi || '') || [])[1] || 'Nimetön väylä').trim();
    let j = ni.get(nimi); if (j === undefined) { j = nimet.length; nimet.push(nimi); ni.set(nimi, j); }
    for (const osa of g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]) { const pp = []; for (const c of osa) pp.push(+c[0].toFixed(6), +c[1].toFixed(6)); linjat.push({ p: pp, s: p.mitoitussyvays, j }); }
  }
  for (const t of ['turvalaitteet_uusi', 'turvalaitteet_muut_vaylanpitajat']) for (const f of await hae(t, 'Haetaan merimerkkejä…')) {
    const p = f.properties, g = f.geometry; if (!g || nahtyM.has(p.turvalaitenumero)) continue; nahtyM.add(p.turvalaitenumero);
    const c = g.type === 'MultiPoint' ? g.coordinates[0] : g.coordinates; merkit.push([+c[0].toFixed(6), +c[1].toFixed(6), p.navigointilajikoodi, p.nimifi || '', p.turvalaitetyyppifi || '']);
  }
  if (!linjat.length) throw new Error('väyliä ei saatu');
  const rajoitukset = rajoituksetMuunna(await hae('rajoitusalue_a_uusi', 'Haetaan rajoitusalueita…'));
  await DB.put('kv', { haettu: Date.now(), nimet, linjat, merkit, rajoitukset }, alue.avain);
  vayla = null; verkko = null; return vaylatMuistiin();
}
async function vaylaverkko() { await vaylatMuistiin(); if (!vayla) return null; if (!verkko) verkko = rakennaVerkko(vayla.linjat); return verkko; }
const paikkaNyt = () => gps.viime && watchId != null ? [gps.viime.lat, gps.viime.lon] : T.sij || null;
const kohta = x => !x ? null : x.sijainti ? paikkaNyt() : [x.lat, x.lon];
const merkkiNimi = m => (MERKKILAJIT[m[2]] || m[4] || 'Merkki') + (m[3] ? ' ' + m[3] : '');

async function laskeReitti() {
  const v = await vaylaverkko(); if (!v) { ilmoita('Lataa ensin väylätiedot.'); return false; }
  const a = kohta(rs.mista), b = kohta(rs.minne);
  if (!a) { ilmoita('Lähtöpaikkaa ei tiedetä. Käynnistä seuranta tai vaihda lähtöpaikka.'); return false; }
  if (!b) { ilmoita('Valitse ensin kohde.'); return false; }
  const r = reitita(v, a, b, { syvays: T.vene.syvays || 0 });
  if (!r) { ilmoita('Reittiä ei löytynyt väyliä pitkin' + (T.vene.syvays ? ' veneen syväyksellä ' + n(T.vene.syvays) + ' m.' : '.')); return false; }
  reitti = { mista: Object.assign({}, rs.mista), minne: Object.assign({}, rs.minne), r, merkit: merkitReitilla(vayla.merkit, r.pisteet, 150) };
  return true;
}
function naytaReitti() {
  nakyma = 'kartta'; lv.seuraa = false; lv.alussa = false; seurNollaa(); if (paikkaTuore()) reittiSeuraa(gps.viime); piirra();
  if (kLive && reitti) { kLive.sovita(reitti.r.pisteet.map(p => [0, p[0], p[1]])); kLive.piirra(); seuraaMerkki(); }
}
const reittiAika = r => kesto(r.matka / MPK / (T.vene.nopeus || 10) * 3600);
const reittiNimi = () => reitti.nimi || reitti.mista.nimi + ' → ' + reitti.minne.nimi;
const reittiPerus = () => n(reitti.r.matka / MPK) + ' mpk · noin ' + reittiAika(reitti.r) + (reitti.r.ulkona > 1000 ? ' · ' + n(reitti.r.ulkona / MPK) + ' mpk väylän ulkopuolella' : '');

// ---------- reitin seuranta ajon aikana ----------
// Jokaisella paikannuksella lasketaan veneen kohta kartalla olevalla reitillä: jäljellä oleva matka, tuloaika, seuraava käännös ja etäisyys reitistä.
// Seuranta aktivoituu vasta, kun vene on käynyt reitillä, joten kaukaa suunniteltu reitti ei hälytä.
const seur = { p: null, kum: null, k: null, aktiivinen: false, sivussa: false, halytyksia: 0, aani: 0, perilla: false, v: null };
const paikkaTuore = () => !!gps.viime && (watchId != null || tal.tila === 'matka');
const seurPaalla = () => !!(T.as.reittiSeuranta && reitti && seur.k && seur.p === reitti.r.pisteet && paikkaTuore());
function seurNollaa() { Object.assign(seur, { p: null, kum: null, k: null, aktiivinen: false, sivussa: false, halytyksia: 0, aani: 0, perilla: false }); }
const matkaT = m => m < 463 ? Math.round(m / 10) * 10 + ' m' : n(m / MPK) + ' mpk';
function reittiSeuraa(f) {
  if (!T.as.reittiSeuranta || !reitti) { if (seur.p) seurNollaa(); return; }
  const P = reitti.r.pisteet;
  if (seur.p !== P) { seurNollaa(); seur.p = P; seur.kum = reittiMitat(P); }
  const ed = seur.aktiivinen && seur.k ? seur.k.kohta : 0, k = reittiKohta(P, seur.kum, f.lat, f.lon, ed); seur.k = k; if (!k) return;
  if (f.sog != null && !isNaN(f.sog)) seur.v = seur.v == null ? f.sog : seur.v + 0.15 * (f.sog - seur.v);
  const vara = Math.max(150, (f.acc || 0) * 2);
  if (!seur.aktiivinen) { if (k.etaisyys > vara) return; seur.aktiivinen = true; }
  if (!seur.perilla && k.jaljella < 100 && k.etaisyys < vara) { seur.perilla = true; halyta('Perillä: ' + reitti.minne.nimi); }
  else if (seur.perilla && k.jaljella > 400) seur.perilla = false;
  const raja = T.as.reittiSivu;
  if (!raja) { seur.sivussa = false; return; }
  if (k.etaisyys > raja + (f.acc || 0)) {
    if (!seur.sivussa) { seur.sivussa = true; seur.halytyksia = 0; }
    // hälytys toistuu korkeintaan minuutin välein ja kolme kertaa, kunnes vene palaa reitille
    if (seur.halytyksia < 3 && Date.now() - seur.aani > 60000) { seur.aani = Date.now(); seur.halytyksia++; halyta('Olet sivussa reitistä: reitti on ' + matkaT(k.etaisyys) + (k.sivussa > 0 ? ' vasemmalla.' : ' oikealla.')); }
  } else if (k.etaisyys < raja * 0.7) { seur.sivussa = false; seur.aani = 0; }
}
function paivitaReittiPalkki() {
  const b = $('#kReittiN'), s = $('#kReittiS'); if (!b || !reitti) return;
  const k = seur.k, on = seurPaalla();
  $('#kReitti').classList.toggle('sivussa', on && seur.aktiivinen && seur.sivussa && !seur.perilla);
  let t1 = reittiNimi(), t2 = reittiPerus();
  if (on && !seur.aktiivinen) t2 = 'Reitille ' + matkaT(k.etaisyys) + ' · reitin pituus ' + n(reitti.r.matka / MPK) + ' mpk';
  else if (on) {
    const v = seur.v > 1 ? seur.v : (T.vene.nopeus || 10) * SOLMU, aste = x => String(Math.round(x) % 360).padStart(3, '0') + '°';
    t2 = 'Jäljellä ' + matkaT(k.jaljella) + ' · klo ' + klo(Date.now() + k.jaljella / v * 1000);
    if (seur.perilla) { t1 = 'Perillä: ' + reitti.minne.nimi; t2 = 'Reitti ' + n(reitti.r.matka / MPK) + ' mpk'; }
    else if (seur.sivussa) t1 = 'Reitti on ' + matkaT(k.etaisyys) + (k.sivussa > 0 ? ' vasemmalla' : ' oikealla');
    else if (k.kaannos) { t1 = 'Käännös ' + (k.kaannos.kulma > 0 ? 'oikealle ' : 'vasemmalle ') + matkaT(k.kaannos.matka); t2 = '→ ' + aste(k.kaannos.suunta) + ' · ' + matkaT(k.jaljella) + ' · klo ' + klo(Date.now() + k.jaljella / v * 1000); }
    else t1 = 'Suoraan perille';
  }
  if (b.textContent !== t1) b.textContent = t1;
  if (s.textContent !== t2) s.textContent = t2;
}
// Aiemmin ajettu matka reittinä. x = {nimi, mista, minne, pisteet: [lat, lon, lat, lon, ...]} (yksinkertaistettu GPS-jälki).
function jalkiReitti(x) {
  const p = []; for (let i = 0; i + 1 < x.pisteet.length; i += 2) p.push([x.pisteet[i], x.pisteet[i + 1], 0]);
  const kum = reittiMitat(p);
  return { mista: Object.assign({}, x.mista), minne: Object.assign({}, x.minne), nimi: x.nimi, jalki: true, r: { pisteet: p, matka: kum[kum.length - 1], ulkona: 0, alku: 0, loppu: 0, minSyv: null, vaylat: [] }, merkit: vayla ? merkitReitilla(vayla.merkit, p, 150) : [] };
}
const litista = p => { const t = []; for (const q of p) t.push(+q[0].toFixed(5), +q[1].toFixed(5)); return t; };
async function matkaReittina(id) {
  const m = matkat.find(x => x.id === id), j = m && await DB.get('jaljet', id);
  if (!j || j.length < 2) { ilmoita('Tällä matkalla ei ole tallennettua jälkeä.'); return null; }
  const p = yksinkertaista(j.map(q => [q[1], q[2]]), 12), a = p[0], b = p[p.length - 1];
  const mista = { nimi: paatepiste(m.mista, m.a), lat: a[0], lon: a[1] }, minne = { nimi: paatepiste(m.minne, m.b), lat: b[0], lon: b[1] };
  return { nimi: mista.nimi + ' – ' + minne.nimi + ' (' + pvm(m.alku) + ')', mista, minne, pisteet: litista(p) };
}
// ---------- oma reitti: pisteet napautetaan kartalle ----------
// Vaiheet: 'alku' (lähtöpiste kartalta tai nimellä) -> 'loppu' (määränpää) -> 'vali' (välipisteiden lisäys, siirto ja poisto).
// Valmis reitti on pisteviiva kuten lokista avattu jälki (reitti.jalki), lisäksi reitti.oma = true, jolloin sitä voi muokata uudelleen.
let omaR = null;      // { p: [{lat, lon, nimi}], vaihe, valittu: pisteen indeksi | null, historia: [kumottavat tilat], id, nimi }
const satamatNimetyt = () => ((lisa.satamat || satamaPaketti() || { lista: [] }).lista).filter(x => x.n);
// Pisteen nimi: oma paikka, alle 400 m päässä oleva satama tai koordinaatit.
function pisteNimi(la, lo) {
  const oma = paikkaNimi([la, lo]); if (oma) return oma;
  let paras = null, pd = 400; for (const x of satamatNimetyt()) { const d = etaisyys(la, lo, x.la, x.lo); if (d < pd) { pd = d; paras = x; } }
  return paras ? paras.n : koord(la, lo);
}
const omaMatka = () => { let d = 0; for (let i = 1; i < omaR.p.length; i++) d += etaisyys(omaR.p[i - 1].lat, omaR.p[i - 1].lon, omaR.p[i].lat, omaR.p[i].lon); return d; };
const omaKuuntele = () => { napautusCb = (la, lo) => omaNapautus(la, lo); };
function omaAloita(pohja) {
  omaR = pohja || { p: [], vaihe: 'alku', valittu: null, historia: [] };
  nakyma = 'kartta'; lv.seuraa = false; lv.alussa = false; omaKuuntele(); piirra();
  if (!pohja) ilmoita('Napauta reitin lähtöpaikkaa kartalla tai hae se nimellä.');
}
// Lähtöpisteen tai määränpään asetus (kartalta tai nimihausta).
function omaAseta(p) {
  if (!omaR) return;
  if (omaR.vaihe === 'alku') { omaR.p = [p]; omaR.vaihe = 'loppu'; ilmoita('Lähtö: ' + p.nimi + '. Napauta nyt määränpäätä tai hae se nimellä.'); }
  else if (omaR.vaihe === 'loppu') { omaR.p.push(p); omaR.vaihe = 'vali'; ilmoita('Määränpää: ' + p.nimi + '. Lisää välipisteitä napauttamalla karttaa.'); }
  omaKuuntele(); nakyma = 'kartta'; piirra();
  if (omaR.vaihe === 'vali' && kLive) { kLive.sovita(omaR.p.map(q => [0, q.lat, q.lon])); kLive.piirra(); seuraaMerkki(); }
}
function omaNapautus(la, lo) {
  if (!omaR) return; la = +la.toFixed(6); lo = +lo.toFixed(6);
  if (omaR.vaihe !== 'vali') { omaAseta({ lat: la, lon: lo, nimi: pisteNimi(la, lo) }); return; }
  const z = lv.z, px = q => [mx(q.lon, z), my(q.lat, z)], t = [mx(lo, z), my(la, z)];
  // osuiko napautus olemassa olevaan pisteeseen? -> valinta päälle tai pois
  let osuma = -1, pd = 26; omaR.p.forEach((q, i) => { const k = px(q), d = Math.hypot(k[0] - t[0], k[1] - t[1]); if (d < pd) { pd = d; osuma = i; } });
  if (osuma >= 0) { omaR.valittu = omaR.valittu === osuma ? null : osuma; piirra(); return; }
  omaR.historia.push(JSON.stringify(omaR.p)); if (omaR.historia.length > 40) omaR.historia.shift();
  if (omaR.valittu != null) { const q = omaR.p[omaR.valittu]; q.lat = la; q.lon = lo; q.nimi = pisteNimi(la, lo); omaR.valittu = null; }      // valittu piste siirtyy napautettuun kohtaan
  else {      // uusi välipiste siihen reitin osuuteen, jota napautus on lähinnä
    let paras = 1, bd = Infinity;
    for (let i = 1; i < omaR.p.length; i++) { const a = px(omaR.p[i - 1]), b = px(omaR.p[i]), dx = b[0] - a[0], dy = b[1] - a[1], u = Math.max(0, Math.min(1, ((t[0] - a[0]) * dx + (t[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(a[0] + u * dx - t[0], a[1] + u * dy - t[1]); if (d < bd) { bd = d; paras = i; } }
    omaR.p.splice(paras, 0, { lat: la, lon: lo, nimi: '' });
  }
  piirra();
}
function omaValmis() {
  if (!omaR || omaR.p.length < 2) { ilmoita('Reittiin tarvitaan lähtöpiste ja määränpää.'); return; }
  const p = omaR.p, a = p[0], b = p[p.length - 1], paa = q => ({ nimi: q.nimi || pisteNimi(q.lat, q.lon), lat: q.lat, lon: q.lon });
  const x = { nimi: omaR.nimi, mista: paa(a), minne: paa(b), pisteet: litista(p.map(q => [q.lat, q.lon])) };
  reitti = jalkiReitti(x); reitti.oma = true;
  const t = omaR.id && T.reitit.find(q => q.id === omaR.id);      // tallennetun reitin muokkaus päivittää tallennuksen
  if (t) { Object.assign(t, { mista: x.mista, minne: x.minne, pisteet: x.pisteet, matka: Math.round(reitti.r.matka), oma: true }); reitti.id = t.id; reitti.nimi = t.nimi; talletaT(); }
  omaR = null; napautusCb = null; naytaReitti();
  ilmoita('Oma reitti valmis: ' + n(reitti.r.matka / MPK) + ' mpk.' + (t ? ' Tallennettu reitti päivitettiin.' : ' Tallenna se kirjanmerkkinapista.'));
}
function omaPalkki() {
  const v = omaR.vaihe, p = omaR.p, napit = [];
  let ots, teksti;
  if (v === 'alku') { ots = 'Oma reitti: lähtöpiste'; teksti = 'Napauta lähtöpaikkaa kartalla tai hae se nimellä.'; }
  else if (v === 'loppu') { ots = 'Oma reitti: määränpää'; teksti = 'Lähtö: ' + p[0].nimi + '. Napauta määränpäätä kartalla tai hae se nimellä.'; }
  else {
    const d = omaMatka(); ots = n(d / MPK) + ' mpk · noin ' + kesto(d / MPK / (T.vene.nopeus || 10) * 3600) + ' · ' + (p.length - 2) + (p.length - 2 === 1 ? ' välipiste' : ' välipistettä');
    teksti = omaR.valittu != null ? (omaR.valittu === 0 ? 'Lähtöpiste' : omaR.valittu === p.length - 1 ? 'Määränpää' : 'Välipiste ' + omaR.valittu) + ' valittu: napauta uutta paikkaa siirtääksesi sen tai poista se roskakorista.' : 'Napauta karttaa lisätäksesi välipisteen. Napauta pistettä valitaksesi sen.';
  }
  if (v !== 'vali') napit.push('<button data-a="omaNimi" aria-label="Hae paikka nimellä" title="Hae paikka nimellä"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg></button>');
  else {
    if (omaR.valittu != null) napit.push('<button data-a="omaPoista" aria-label="Poista valittu piste" title="Poista valittu piste"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg></button>');
    else napit.push('<button data-a="omaKumoa" aria-label="Kumoa viimeisin muutos" title="Kumoa viimeisin muutos"' + (omaR.historia.length ? '' : ' disabled') + '>↶</button>');
    napit.push('<button data-a="omaValmis" class="on" aria-label="Reitti valmis" title="Reitti valmis">✓</button>');
  }
  napit.push('<button data-a="omaPeru" aria-label="Peruuta" title="Peruuta">✕</button>');
  return '<div class="kreitti" id="kOma"><div class="v"><b id="oOts">' + e(ots) + '</b><span id="oTeksti">' + e(teksti) + '</span></div>' + napit.join('') + '</div>';
}
Object.assign(A, {
  omaReitti() { omaAloita(); },
  omaNimi() {
    if (!omaR || omaR.vaihe === 'vali') return;
    valitsePaikka(omaR.vaihe === 'alku' ? 'Mistä lähdetään?' : 'Minne mennään?', p => omaAseta({ lat: p.lat, lon: p.lon, nimi: p.nimi }), { sijainti: true, kiintea: true, peru: omaKuuntele });
  },
  omaKumoa() { if (!omaR || !omaR.historia.length) return; omaR.p = JSON.parse(omaR.historia.pop()); omaR.valittu = null; piirra(); },
  omaPoista() {
    if (!omaR || omaR.valittu == null) return;
    if (omaR.p.length <= 2) { ilmoita('Reitissä pitää olla lähtöpiste ja määränpää. Siirrä piste napauttamalla sille uusi paikka.'); return; }
    omaR.historia.push(JSON.stringify(omaR.p)); omaR.p.splice(omaR.valittu, 1); omaR.valittu = null; piirra();
  },
  omaValmis() { omaValmis(); },
  omaPeru() { omaR = null; napautusCb = null; piirra(); },
  // Valmiin oman reitin pisteet takaisin muokattaviksi.
  omaMuokkaa() {
    if (!reitti || !reitti.oma) return; const P = reitti.r.pisteet;
    omaAloita({ p: P.map((q, i) => ({ lat: q[0], lon: q[1], nimi: i === 0 ? reitti.mista.nimi : i === P.length - 1 ? reitti.minne.nimi : '' })), vaihe: 'vali', valittu: null, historia: [], id: reitti.id, nimi: reitti.nimi });
  }
});
const reittiPalkki = () => !reitti ? '' : '<div class="kreitti" id="kReitti"><div class="v" data-a="reittiTiedot"><b id="kReittiN">' + e(reittiNimi()) + '</b><span id="kReittiS">' + e(reittiPerus()) + '</span></div>' +
  '<button data-a="reittiTallenna"' + (reitti.id ? ' class="on"' : '') + ' aria-label="' + (reitti.id ? 'Nimeä tai poista tallennettu reitti' : 'Tallenna reitti') + '" title="' + (reitti.id ? 'Nimeä tai poista tallennettu reitti' : 'Tallenna reitti') + '"><svg viewBox="0 0 24 24"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></svg></button>' +
  '<button data-a="reittiKaanna" aria-label="Käännä reitti" title="Käännä reitti"><svg viewBox="0 0 24 24"><path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/></svg></button><button data-a="reittiPois" aria-label="Poista reitti" title="Poista reitti">✕</button></div>';

// Paikan valinta: oma sijainti, kotisatama, omat paikat, nimihaku tai napautus kartalta. o.sijainti = tarjotaanko "Nykyinen sijainti", o.kiintea = sijainti muutetaan koordinaateiksi.
function valitsePaikka(otsikko, cb, o) {
  o = o || {}; const d = $('#dlg');
  const rivi = (p, lisa) => '<div class="rivi" data-i="' + lista.push(p) + '"><div class="v"><b>' + e(p.nimi) + '</b><span class="pieni">' + e(lisa) + '</span></div></div>';
  let lista = [];
  const oletus = () => { lista = []; return (o.sijainti ? rivi({ sijainti: true, nimi: 'Nykyinen sijainti' }, paikkaNyt() ? koord(...paikkaNyt()) : 'sijaintia ei vielä ole') : '') + (T.koti && !o.eiKotia ? rivi(T.koti, 'Kotisatama') : '') + T.paikat.filter(p => !T.koti || p.nimi !== T.koti.nimi).map(p => rivi({ nimi: p.nimi, lat: p.lat, lon: p.lon }, 'Oma paikka')).join('') + T.kalapaikat.map(k => rivi({ nimi: k.nimi, lat: k.lat, lon: k.lon }, 'Kalapaikka' + (k.lajit ? ': ' + k.lajit : ''))).join('') + lahiSatamat(); };
  // Satamat sovelluksen mukana tulevasta tai laitteelle päivitetystä satamaluettelosta: löytyvät nimellä myös ilman verkkoa.
  const satamaLista = () => ((lisa.satamat || satamaPaketti() || { lista: [] }).lista).filter(s => s.n);
  const satamaLaji = s => (s.l === 'satama' ? 'Satama' : s.l === 'luiska' ? 'Veneenlaskuluiska' : s.l === 'polttoaine' ? 'Polttoaineasema' : 'Veneilyn palvelu') + (s.t && s.t['addr:city'] ? ', ' + s.t['addr:city'] : '');
  // viisi lähintä satamaa nykyisestä sijainnista
  const lahiSatamat = () => { const s = paikkaNyt(); if (!s) return ''; return satamaLista().filter(x => x.l === 'satama').map(x => [etaisyys(s[0], s[1], x.la, x.lo), x]).sort((a, b) => a[0] - b[0]).slice(0, 5).map(([d, x]) => rivi({ nimi: x.n, lat: x.la, lon: x.lo }, satamaLaji(x) + ' · ' + n(d / MPK) + ' mpk täältä')).join(''); };
  d.innerHTML = '<form method="dialog"><h3>' + e(otsikko) + '</h3><div class="hakurivi"><input id="pHaku" placeholder="Sataman tai paikan nimi, esim. Porvoo" autocomplete="off" enterkeyhint="search"><button type="button" class="nappi" id="pHae">Hae</button></div>' +
    '<div id="pLista" class="plista">' + (oletus() || '<div class="pieni">Hae satamaa tai paikkaa nimellä tai valitse se kartalta.</div>') + '</div>' +
    '<div class="napit"><button type="button" class="nappi" id="pPeru">Peruuta</button><button type="button" class="nappi" id="pKartta">Valitse kartalta</button></div></form>';
  const valmis = p => {
    if (p.sijainti && (o.kiintea || !paikkaNyt())) { const s = paikkaNyt(); if (!s) { ilmoita('Sijaintia ei ole vielä. Käynnistä seuranta Matka-välilehdeltä.'); return; } p = { nimi: paikkaNimi(s) || koord(s[0], s[1]), lat: s[0], lon: s[1] }; }
    d.close(); cb(p);
  };
  d.querySelector('#pLista').onclick = ev => { const r = ev.target.closest('[data-i]'); if (r) valmis(lista[+r.dataset.i - 1]); };
  const hae = async () => {
    const q = d.querySelector('#pHaku').value.trim(), el = d.querySelector('#pLista'); if (q.length < 2) return;
    lista = []; const pieni = q.toLowerCase();
    let h = T.paikat.filter(p => p.nimi.toLowerCase().includes(pieni)).map(p => rivi({ nimi: p.nimi, lat: p.lat, lon: p.lon }, 'Oma paikka')).join('');
    h += T.kalapaikat.filter(k => (k.nimi + ' ' + (k.lajit || '')).toLowerCase().includes(pieni)).map(k => rivi({ nimi: k.nimi, lat: k.lat, lon: k.lon }, 'Kalapaikka' + (k.lajit ? ': ' + k.lajit : ''))).join('');
    // satamat: nimen alusta osuvat ensin, sitten lähimmät
    const tama = paikkaNyt(), osuvat = satamaLista().filter(x => x.n.toLowerCase().includes(pieni) || (x.t && (x.t['addr:city'] || '').toLowerCase().includes(pieni)));
    h += osuvat.map(x => [(x.n.toLowerCase().startsWith(pieni) ? 0 : 1e7) + (x.l === 'satama' ? 0 : 5e6) + (tama ? etaisyys(tama[0], tama[1], x.la, x.lo) : 0), x]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => rivi({ nimi: x.n, lat: x.la, lon: x.lo }, satamaLaji(x) + (tama ? ' · ' + n(etaisyys(tama[0], tama[1], x.la, x.lo) / MPK) + ' mpk täältä' : ''))).join('');
    // yleiset saunat: nimellä tai saaren nimellä, ja sanalla "sauna" kahdeksan lähintä
    { const k = tama || [lv.lat, lv.lon], sa = /saun/.test(pieni) ? saunaLista() : saunaLista().filter(x => (x.n + ' ' + x.saari).toLowerCase().includes(pieni));
      h += sa.map(x => [etaisyys(k[0], k[1], x.la, x.lo), x]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([et, x]) => rivi({ nimi: x.n, lat: x.la, lon: x.lo }, 'Yleinen sauna, ' + x.saari + ' · ' + n(et / MPK) + ' mpk ' + (tama ? 'täältä' : 'kartan keskeltä'))).join(''); }
    // hakusana "luiska" tai "veneenlasku": lähimmät veneenlaskuluiskat, myös nimettömät
    if (/luisk|veneenlasku|ramp/.test(pieni)) { const k = tama || [lv.lat, lv.lon], kaikki = (lisa.satamat || satamaPaketti() || { lista: [] }).lista;
      h += kaikki.filter(x => x.l === 'luiska' && !osuvat.includes(x)).map(x => [etaisyys(k[0], k[1], x.la, x.lo), x]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([et, x]) => rivi({ nimi: x.n || 'Veneluiska ' + (x.t && x.t['addr:city'] || koord(x.la, x.lo)), lat: x.la, lon: x.lo }, satamaLaji(x) + ' · ' + n(et / MPK) + ' mpk ' + (tama ? 'täältä' : 'kartan keskeltä'))).join(''); }
    await vaylatMuistiin();
    if (vayla) h += vayla.merkit.filter(m => m[3] && m[3].toLowerCase().includes(pieni)).sort((a, b) => a[3].length - b[3].length).slice(0, 6).map(m => rivi({ nimi: m[3], lat: m[1], lon: m[0] }, 'Merimerkki: ' + (MERKKILAJIT[m[2]] || m[4]))).join('');
    el.innerHTML = h + '<div class="pieni" id="pTila">' + (navigator.onLine ? 'Haetaan…' : 'Ei verkkoa: haku näyttää omat paikat, satamat ja merimerkit.') + '</div>';
    if (!navigator.onLine) return;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=fi&countrycodes=fi,ee,se&viewbox=19,61.5,30.5,59&q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error(r.status);
      const t = (await r.json()).map(x => rivi({ nimi: (x.name || x.display_name.split(',')[0]).trim(), lat: +x.lat, lon: +x.lon }, x.display_name.split(',').slice(1, 4).join(',').trim())).join('');
      const tila = d.querySelector('#pTila'); if (tila) tila.outerHTML = t || (h ? '' : '<div class="pieni">Ei löytynyt. Kokeile toista nimeä tai valitse paikka kartalta.</div>');
    } catch (x) { const tila = d.querySelector('#pTila'); if (tila) tila.textContent = 'Nimihaku ei juuri nyt onnistunut. Valitse paikka kartalta.'; }
  };
  d.querySelector('#pHae').onclick = hae;
  d.querySelector('form').onsubmit = ev => { ev.preventDefault(); hae(); };
  d.querySelector('#pPeru').onclick = () => { d.close(); if (o.peru) o.peru(); };
  d.querySelector('#pKartta').onclick = () => {
    d.close(); nakyma = 'kartta'; piirra(); ilmoita('Napauta haluamaasi kohtaa kartalla.');
    napautusCb = (la, lo) => { napautusCb = null; cb({ nimi: paikkaNimi([la, lo]) || koord(la, lo), lat: la, lon: lo }); };
  };
  d.showModal();
}

function reittiIkkuna() {
  const d = $('#dlg');
  const piirraIkkuna = async () => {
    await vaylatMuistiin();
    d.innerHTML = '<form method="dialog"><h3>Reittisuunnittelu</h3>' +
      (vayla ? '<div class="rivi" id="rMista"><div class="v"><span class="pieni">Mistä</span><b>' + e(rs.mista ? rs.mista.nimi : 'Valitse lähtöpaikka') + '</b></div><span class="pieni">Vaihda</span></div>' +
        '<div class="rivi" id="rMinne"><div class="v"><span class="pieni">Minne</span><b>' + e(rs.minne ? rs.minne.nimi : 'Valitse kohde') + '</b></div><span class="pieni">Vaihda</span></div>' +
        '<div class="napit"><button type="button" class="nappi" id="rKaanna">Käännä suunta</button><button type="button" class="nappi" id="rKoti">Kotisatamaan</button></div>' +
        '<button type="button" class="nappi" id="rOma">Piirrä oma reitti kartalle</button>' +
        (T.reitit.length ? '<h4>Tallennetut reitit</h4><div class="plista">' + T.reitit.map(x => '<div class="rivi" data-r="' + x.id + '"><div class="v"><b>' + e(x.nimi) + '</b><span class="pieni">' + e(x.mista.nimi) + ' → ' + e(x.minne.nimi) + (x.matka ? ' · ' + n(x.matka / MPK) + ' mpk' : '') + (x.pisteet ? (x.oma ? ' · oma reitti' : ' · ajettu jälki') : '') + '</span></div><button type="button" class="nappi pien" data-rm="' + x.id + '" aria-label="Nimeä tai poista">⋯</button></div>').join('') + '</div>'
          : '<div class="pieni">Tallennettuja reittejä ei vielä ole. Suunniteltu reitti tallennetaan kartan reittipalkin kirjanmerkkinapista.</div>') +
        '<div class="pieni">Reitti kulkee Väyläviraston väyliä pitkin' + (T.vene.syvays ? ' ja käyttää vain väyliä, joiden syväys on vähintään ' + n(T.vene.syvays) + ' m' : '') + '. Väylätiedot: ' + VAYLA_ALUEET.filter(a => vayla.osat[a.id]).map(a => a.nimi).join(' ja ') + ', haettu ' + pvm(vayla.haettu) + ' (' + vayla.linjat.length + ' väyläosuutta, ' + vayla.merkit.length + ' merimerkkiä' + (vayla.rajoitukset ? ', ' + vayla.rajoitukset.length + ' rajoitusaluetta' : '') + '). <b>Reitti on suunnittelun apu – tarkista se merikartalta, älä navigoi sen varassa.</b></div>' +
        '<div class="napit"><button type="button" class="nappi" id="rSulje">Sulje</button><button type="button" class="nappi paa" id="rLaske">Suunnittele reitti</button></div>' +
        '<button type="button" class="nappi pien" id="rPaivita">Päivitä väylätiedot</button>'
        : '<div class="pieni">Reittisuunnittelu tarvitsee alueen väylät ja merimerkit sekä nopeusrajoitusalueet (Väyläviraston avoin data, 5–15 Mt alueelta). Ne ladataan kerran laitteelle, ja sen jälkeen reitit lasketaan ilman verkkoa. Valitse alue; toisen alueen voi ladata myöhemmin kartan tasonapista.</div><div class="pieni" id="rTila"></div>' +
        VAYLA_ALUEET.map(a => '<button type="button" class="nappi paa rLataa" data-alue="' + a.id + '">Lataa väylätiedot: ' + a.nimi + '</button>').join('') +
        '<div class="pieni">Oman reitin voit piirtää ilman väylätietojakin: napautat reitin pisteet itse kartalle.</div><button type="button" class="nappi" id="rOma">Piirrä oma reitti kartalle</button>' +
        '<div class="napit"><button type="button" class="nappi" id="rSulje">Sulje</button></div>') + '</form>';
    d.querySelector('#rSulje').onclick = () => d.close();
    const lataa = async nappi => {
      if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
      nappi.disabled = true; const tila = d.querySelector('#rTila');
      try { const paivita = t => { if (tila) tila.textContent = t; else nappi.textContent = t; }, a = VAYLA_ALUEET.find(x => x.id === nappi.dataset.alue); if (a) await lataaVaylat(paivita, a); else await paivitaVaylat(paivita); ilmoita('Väylätiedot ladattu.'); }
      catch (x) { ilmoita('Väylätietojen lataus ei onnistunut. Yritä hetken kuluttua uudelleen.'); }
      piirraIkkuna();
    };
    d.querySelector('#rOma').onclick = () => { d.close(); omaAloita(); };
    if (!vayla) { d.querySelectorAll('.rLataa').forEach(el => el.onclick = () => lataa(el)); return; }
    d.querySelector('#rPaivita').onclick = ev => lataa(ev.target);
    // tallennettu reitti: napautus avaa sen kartalle, ⋯ nimeää tai poistaa
    d.querySelectorAll('[data-r]').forEach(el => el.onclick = async ev => {
      const x = T.reitit.find(q => q.id === el.dataset.r); if (!x) return;
      if (ev.target.closest('[data-rm]')) { muokkaaReittia(x, true); return; }
      if (x.pisteet) { reitti = jalkiReitti(x); reitti.id = x.id; if (x.oma) reitti.oma = true; d.close(); naytaReitti(); return; }      // ajettu jälki: ei lasketa väyliä pitkin
      rs.mista = Object.assign({}, x.mista); rs.minne = Object.assign({}, x.minne);
      if (await laskeReitti()) { reitti.id = x.id; reitti.nimi = x.nimi; if (Math.round(reitti.r.matka) !== x.matka) { x.matka = Math.round(reitti.r.matka); talletaT(); } d.close(); naytaReitti(); }
    });
    d.querySelector('#rMista').onclick = () => valitsePaikka('Mistä lähdetään?', p => { rs.mista = p; reittiIkkuna(); }, { sijainti: true, peru: reittiIkkuna });
    d.querySelector('#rMinne').onclick = () => valitsePaikka('Minne mennään?', p => { rs.minne = p; reittiIkkuna(); }, { sijainti: true, peru: reittiIkkuna });
    d.querySelector('#rKaanna').onclick = () => { const x = rs.mista; rs.mista = rs.minne; rs.minne = x; piirraIkkuna(); };
    d.querySelector('#rKoti').onclick = () => { d.close(); A.reittiKotiin(); };
    d.querySelector('#rLaske').onclick = async () => { if (await laskeReitti()) { d.close(); naytaReitti(); } };
  };
  piirraIkkuna(); if (!d.open) d.showModal();
}
// Tallennetun reitin nimen vaihto ja poisto. takaisin = palataanko reitti-ikkunaan.
function muokkaaReittia(x, takaisin) {
  lomake('Tallennettu reitti', [{ k: 'nimi', n: 'Reitin nimi', req: 1 }], { nimi: x.nimi },
    async o => { x.nimi = o.nimi; if (reitti && reitti.id === x.id) reitti.nimi = o.nimi; await talletaT(); if (takaisin) reittiIkkuna(); },
    async () => { T.reitit = T.reitit.filter(q => q !== x); if (reitti && reitti.id === x.id) { delete reitti.id; delete reitti.nimi; } await talletaT(); ilmoita('Tallennettu reitti poistettu.'); if (takaisin) reittiIkkuna(); });
}
function reittiTiedotIkkuna() {
  if (!reitti) return; const d = $('#dlg'), r = reitti.r;
  const vaylat = r.vaylat.filter(x => x.m >= 150);
  d.innerHTML = '<form method="dialog"><h3>' + e(reitti.mista.nimi) + ' → ' + e(reitti.minne.nimi) + '</h3>' +
    '<div class="luvut"><div class="luku"><b>' + n(r.matka / MPK) + '</b><span>mpk</span></div><div class="luku"><b>' + reittiAika(r) + '</b><span>nopeudella ' + n(T.vene.nopeus || 10, 0) + ' kn</span></div><div class="luku"><b>' + (r.minSyv != null ? n(r.minSyv) : '–') + '</b><span>pienin väyläsyväys, m</span></div></div>' +
    (reitti.oma ? '<div class="pieni"><b>Tämä on itse piirtämäsi reitti.</b> Viivat kulkevat suoraan pisteestä toiseen, eikä sovellus tarkista, onko välissä maata, matalikkoa tai kiviä. Tarkista jokainen osuus merikartalta ja lisää välipisteitä tarvittaessa.</div><button type="button" class="nappi" id="tMuokkaa">Muokkaa reittipisteitä</button>'
      : reitti.jalki ? '<div class="pieni"><b>Tämä reitti on aiemmin ajetun matkan GPS-jälki</b>, josta on karsittu pisteitä. Se ei kulje väylätietojen mukaan eikä tiedä syvyyksistä: vedenkorkeus, merimerkit ja olosuhteet ovat voineet muuttua. Tarkista reitti merikartalta.</div>'
      : '<div class="pieni"><b>Tarkista reitti merikartalta ennen lähtöä.</b> Väylän ulkopuoliset osuudet (oranssi katkoviiva) ovat suoria viivoja, jotka voivat kulkea maan tai matalikon yli: lähdössä ' + Math.round(r.alku) + ' m, perillä ' + Math.round(r.loppu) + ' m' + (r.ulkona - r.alku - r.loppu > 50 ? ' ja väylien välillä ' + Math.round(r.ulkona - r.alku - r.loppu) + ' m' : '') + '.' +
      (T.vene.syvays && r.minSyv != null ? '' : ' Veneen syväystä ei ole asetettu, joten reitti voi käyttää matalia väyliä.') + '</div>' +
      '<h4>Väylät järjestyksessä</h4><div class="plista">' + vaylat.map(x => '<div class="rivi"><div class="v"><b>' + e(vayla.nimet[x.j] || 'Nimetön väylä') + '</b></div><div class="o">' + n(x.m / MPK) + ' mpk</div></div>').join('') + '</div>') +
    (seurPaalla() && seur.aktiivinen ? '<div class="pieni">Seuranta: reitistä ajettu ' + matkaT(seur.k.kohta) + ', jäljellä ' + matkaT(seur.k.jaljella) + ', etäisyys reitistä ' + Math.round(seur.k.etaisyys) + ' m.</div>' : '') +
    (!reitti.jalki && paikkaNyt() ? '<button type="button" class="nappi" id="tUusi">Laske reitti uudelleen nykyisestä sijainnista</button>' : '') +
    '<h4>Merimerkit reitin varrella (' + reitti.merkit.length + ')</h4><div class="plista">' + (reitti.merkit.length ? reitti.merkit.map(m => '<div class="rivi"><div class="v"><b>' + e(MERKKILAJIT[m.laji] || m.tyyppi) + '</b><span class="pieni">' + e(m.nimi) + '</span></div><div class="o">' + n(m.kohta / MPK) + ' mpk</div></div>').join('') : '<div class="pieni">Ei merkkejä 150 metrin säteellä reitistä.</div>') + '</div>' +
    '<div class="napit"><button type="button" class="nappi paa" id="tSulje">Sulje</button></div></form>';
  d.querySelector('#tSulje').onclick = () => d.close();
  const muok = d.querySelector('#tMuokkaa'); if (muok) muok.onclick = () => { d.close(); A.omaMuokkaa(); };
  const uusi = d.querySelector('#tUusi');
  if (uusi) uusi.onclick = async () => { d.close(); rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' }; rs.minne = Object.assign({}, reitti.minne); if (await laskeReitti()) { naytaReitti(); ilmoita('Reitti laskettu uudelleen nykyisestä sijainnista.'); } };
  d.showModal();
}
Object.assign(A, {
  // Lokin matka pääkartalle reitiksi, jota voi seurata ajon aikana.
  async matkaKartalle() {
    const x = await matkaReittina(valittu); if (!x) return;
    reitti = jalkiReitti(x); naytaReitti();
    ilmoita(!T.as.reittiSeuranta ? 'Matka on kartalla reittinä. Reitin seurannan saat päälle kartan tasonapista.' : paikkaTuore() ? 'Matka on kartalla reittinä.' : 'Matka on kartalla reittinä. Seuranta opastaa, kun sijainti on päällä.');
  },
  async matkaReitiksi() {
    const x = await matkaReittina(valittu); if (!x) return;
    lomake('Tallenna matka reitiksi', [{ k: 'nimi', n: 'Reitin nimi', req: 1 }], { nimi: x.nimi }, async o => {
      const r = jalkiReitti(x);
      T.reitit.push({ id: uusiId(), nimi: o.nimi, mista: x.mista, minne: x.minne, matka: Math.round(r.r.matka), luotu: Date.now(), pisteet: x.pisteet });
      await talletaT(); ilmoita('Reitti tallennettu: ' + o.nimi + '. Se löytyy kartan reittisuunnittelusta.');
    });
  },
  reitti() { reittiIkkuna(); },
  reittiTiedot() { reittiTiedotIkkuna(); },
  // Tallentaa kartalla olevan reitin nimellä. Talteen menevät lähtö- ja kohdepiste; reitti lasketaan avattaessa uudelleen ajantasaisista väylistä.
  reittiTallenna() {
    if (!reitti) return;
    const vanha = reitti.id && T.reitit.find(q => q.id === reitti.id); if (vanha) { muokkaaReittia(vanha, false); return; }
    const p = reitti.r.pisteet, kiintea = (x, k) => x.sijainti ? { nimi: paikkaNimi([k[0], k[1]]) || 'Lähtöpaikka', lat: k[0], lon: k[1] } : { nimi: x.nimi, lat: x.lat, lon: x.lon };
    const mista = kiintea(reitti.mista, p[0]), minne = kiintea(reitti.minne, p[p.length - 1]);
    lomake('Tallenna reitti', [{ k: 'nimi', n: 'Reitin nimi', req: 1 }], { nimi: mista.nimi + ' – ' + minne.nimi }, async o => {
      const x = { id: uusiId(), nimi: o.nimi, mista, minne, matka: Math.round(reitti.r.matka), luotu: Date.now() };
      if (reitti.oma) x.oma = true;
      if (reitti.jalki) x.pisteet = litista(reitti.r.pisteet);      // ajettu jälki tallennetaan pisteinä, koska sitä ei voi laskea väylistä uudelleen
      T.reitit.push(x); reitti.id = x.id; reitti.nimi = x.nimi; await talletaT(); ilmoita('Reitti tallennettu: ' + x.nimi);
    });
  },
  reittiPois() { reitti = null; seurNollaa(); piirra(); },
  // Sama reitti toiseen suuntaan: kohteesta takaisin lähtöpaikkaan.
  async reittiKaanna() {
    if (!reitti) return; const p0 = reitti.r.pisteet[0];
    if (reitti.jalki) { const oma = reitti.oma; reitti = jalkiReitti({ mista: reitti.minne, minne: reitti.mista, pisteet: litista(reitti.r.pisteet.slice().reverse()) }); if (oma) reitti.oma = true; naytaReitti(); return; }
    const paluu = reitti.mista.sijainti ? { nimi: paikkaNimi([p0[0], p0[1]]) || 'Lähtöpaikka', lat: p0[0], lon: p0[1] } : reitti.mista;
    rs.mista = reitti.minne; rs.minne = paluu;
    if (await laskeReitti()) naytaReitti();
  },
  async reittiKotiin() {
    if (!T.koti) { ilmoita('Kotisatamaa ei ole asetettu.'); A.koti(); return; }
    if (!await vaylaverkko()) { reittiIkkuna(); return; }
    rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' }; rs.minne = Object.assign({}, T.koti);
    if (await laskeReitti()) naytaReitti();
  },
  koti() {
    valitsePaikka('Kotisatama', async p => {
      const nimea = async nimi => { T.koti = { nimi, lat: p.lat, lon: p.lon }; if (!lahinPaikka(T.paikat, p.lat, p.lon)) T.paikat.push({ nimi, lat: p.lat, lon: p.lon, sade: 400 }); await talletaT(); ilmoita('Kotisatama: ' + nimi); };
      // koordinaateista valitulle paikalle kysytään nimi
      if (/^\d+°/.test(p.nimi)) lomake('Kotisataman nimi', [{ k: 'nimi', n: 'Nimi', req: 1 }], { nimi: 'Kotisatama' }, o => nimea(o.nimi)); else { await nimea(p.nimi); piirra(); }
    }, { sijainti: true, kiintea: true, eiKotia: true });
  }
});

// ---------- kartan lisätiedot verkosta: tuuli ja sää, AIS-alukset, satamat ----------
// Kaikki kolme kytketään asetuksista ja toimivat vain verkossa (satamat jäävät talteen ensimmäisen haun jälkeen).
// Tuuli: Open-Meteo (säämalli). AIS: Fintrafficin Digitraffic. Satamat: OpenStreetMap (Overpass).
const lisa = { tuuli: null, tuuliHaku: 0, tunti: 0, ais: null, aisAika: 0, aisHaku: 0, aisNimet: null, aisNimetAika: 0, aisNakyma: null, satamat: null, satamaHaku: false, satamaVirhe: '', osumat: [], ajastin: 0 };
const TUNNIT = [0, 3, 6, 12, 24];
// Piirtoalustan kulmat kartalla: toimii myös käännetyssä ja kallistetussa kartassa.
const nakymaRajat = k => { const [W, H, vW, vH] = k.koko(), v = k.v, x = mx(v.lon, v.z), y = my(v.lat, v.z); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [a, b] of [[0, 0], [W, 0], [0, H], [W, H]]) { const q = k.virt(a, b); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } return { lo0: lonX(x + x0 - vW / 2, v.z), lo1: lonX(x + x1 - vW / 2, v.z), la1: latY(y + y0 - vH / 2, v.z), la0: latY(y + y1 - vH / 2, v.z) }; };
// Onko karttaa siirretty tai zoomattu niin paljon, että tiedot pitää hakea uudelleen?
const siirtynyt = n => { if (!n || !kLive) return true; const v = lv, W = kLive.cv.clientWidth, H = kLive.cv.clientHeight; return Math.abs(v.z - n.z) > 0.8 || Math.hypot(mx(v.lon, v.z) - mx(n.lon, v.z), my(v.lat, v.z) - my(n.lat, v.z)) > 0.35 * Math.min(W, H); };
const nakymaNyt = () => ({ lat: lv.lat, lon: lv.lon, z: lv.z });

async function tuuliHae() {
  if (lisa.tuuliHaku || !kLive) return; lisa.tuuliHaku = 1;
  const b = nakymaRajat(kLive), nak = nakymaNyt(), RIV = 3, la = [], lo = [];
  // 5 pistettä limittäin: riveillä 2, 1 ja 2 nuolta (aiemmin 20, sitten 10; käyttäjän toive 2026-11-23: vieläkin puolet vähemmän)
  for (let r = 0; r < RIV; r++) for (let s = 0, SAR = r % 2 ? 1 : 2; s < SAR; s++) { la.push((b.la1 - (r + .5) / RIV * (b.la1 - b.la0)).toFixed(3)); lo.push((b.lo0 + (s + .5) / SAR * (b.lo1 - b.lo0)).toFixed(3)); }
  try {
    const q = 'latitude=' + la.join(',') + '&longitude=' + lo.join(',') + '&forecast_hours=25&timezone=UTC';
    const [r1, r2] = await Promise.all([fetch('https://api.open-meteo.com/v1/forecast?' + q + '&wind_speed_unit=ms&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation'), fetch('https://marine-api.open-meteo.com/v1/marine?' + q + '&hourly=wave_height').catch(() => null)]);
    if (!r1.ok) throw new Error(r1.status); let j = await r1.json(); if (!Array.isArray(j)) j = [j];
    let m = null; if (r2 && r2.ok) { m = await r2.json(); if (!Array.isArray(m)) m = [m]; }
    lisa.tuuli = { nakyma: nak, aika: Date.now(), ajat: j[0].hourly.time.map(s => Date.parse(s + ':00Z')),
      p: j.map((x, i) => ({ lat: +la[i], lon: +lo[i], nop: x.hourly.wind_speed_10m, suu: x.hourly.wind_direction_10m, pus: x.hourly.wind_gusts_10m, lam: x.hourly.temperature_2m, sade: x.hourly.precipitation, aalto: m && m[i] && m[i].hourly ? m[i].hourly.wave_height : null })) };
  } catch (x) { lisa.tuuliVirhe = Date.now(); } finally { lisa.tuuliHaku = 0; }
  laattaSaapui();
}
async function aisHae() {
  if (lisa.aisHaku || !kLive) return; lisa.aisHaku = 1;
  const b = nakymaRajat(kLive), nak = nakymaNyt(), sade = rajaa(Math.round(etaisyys(b.la0, b.lo0, b.la1, b.lo1) / 2000 + 3), 8, 150);
  try {
    if (!lisa.aisNimet || Date.now() - lisa.aisNimetAika > 6 * 3600000) try {       // alusten nimet ja tyypit, haetaan harvoin
      const r = await fetch('https://meri.digitraffic.fi/api/ais/v1/vessels?from=' + (Date.now() - 36 * 3600000));
      if (r.ok) { const m = new Map(); for (const a of await r.json()) m.set(a.mmsi, a); lisa.aisNimet = m; lisa.aisNimetAika = Date.now(); }
    } catch (x) { }
    const r = await fetch('https://meri.digitraffic.fi/api/ais/v1/locations?latitude=' + nak.lat.toFixed(3) + '&longitude=' + nak.lon.toFixed(3) + '&radius=' + sade + '&from=' + (Date.now() - 20 * 60000));
    if (!r.ok) throw new Error(r.status);
    lisa.ais = ((await r.json()).features || []).map(f => ({ mmsi: f.mmsi, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], sog: f.properties.sog, cog: f.properties.cog, hdg: f.properties.heading, aika: f.properties.timestampExternal }));
    lisa.aisAika = Date.now(); lisa.aisNakyma = nak;
  } catch (x) { lisa.aisAika = Date.now() - 30000; } finally { lisa.aisHaku = 0; }
  laattaSaapui();
}
// Satamat: ensin laitteelle tallennetut tiedot, muuten sovelluksen mukana tuleva paketti (tiedot/satamat.js).
// pakko = haetaan uudet tiedot verkosta (OpenStreetMapin Overpass-palvelu on hidas ja hylkää joskus pyyntöjä, siksi vain pyydettäessä).
// Norjan satamat tulevat omana pakettinaan (tiedot/satamat-norja.js) ja liitetään Suomen tietojen perään. Verkkopäivitys koskee vain Suomen alueita.
const norjaLiita = o => typeof SATAMAT_NORJA === 'undefined' || !o ? o : { haettu: o.haettu, paketti: o.paketti, lista: o.lista.concat(SATAMAT_NORJA.lista) };
const satamaPaketti = () => typeof SATAMAT_PAKETTI === 'undefined' ? null : satamaPaketti.o || (satamaPaketti.o = norjaLiita(SATAMAT_PAKETTI));
async function satamatHae(pakko) {
  if (lisa.satamaHaku) return;
  if (!lisa.satamat) {
    try { lisa.satamat = await DB.get('kv', 'satamat') || null; } catch (x) { }
    // sovelluksen mukana tullut paketti voittaa, jos se on laitteelle aiemmin haettuja tietoja uudempi (esim. uusia alueita lisätty)
    if (lisa.satamat && typeof SATAMAT_PAKETTI !== 'undefined' && SATAMAT_PAKETTI.haettu > lisa.satamat.haettu) lisa.satamat = null;
    lisa.satamat = lisa.satamat ? norjaLiita(lisa.satamat) : satamaPaketti();
    laattaSaapui();
  }
  if (!pakko) return;
  if (!navigator.onLine) { ilmoita('Päivitys vaatii verkkoyhteyden.'); return; }
  lisa.satamaHaku = true; lisa.satamaVirhe = ''; ilmoita('Haetaan satamatietoja. Tämä voi kestää noin minuutin.');
  try {
    // kaikki ladattavat merialueet samalla haulla
    const q = '[out:json][timeout:150];(' + ALUEET.map(a => { const B = '(' + [a.b.la0, a.b.lo0, a.b.la1, a.b.lo1].join(',') + ')'; return 'nwr["leisure"="marina"]' + B + ';nwr["seamark:type"="harbour"]' + B + ';nwr["seamark:type"="small_craft_facility"]' + B + ';nwr["waterway"="fuel"]' + B + ';nwr["leisure"="slipway"]' + B + ';'; }).join('') + ');out center tags;';
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const lista = satamatMuunna((await r.json()).elements);
    if (lista.length < 20) throw new Error('vajaa vastaus');
    const omat = { haettu: Date.now(), lista }; await DB.put('kv', omat, 'satamat'); lisa.satamat = norjaLiita(omat);
    ilmoita('Satamatiedot päivitetty: ' + lista.length + ' kohdetta.');
  } catch (x) { lisa.satamaVirhe = String(x && x.message || x); ilmoita('Päivitys ei onnistunut juuri nyt. Käytössä ovat aiemmat tiedot.'); }
  finally { lisa.satamaHaku = false; }
  laattaSaapui(); if (nakyma === 'lisaa') piirra();
}
// Kutsutaan viiveellä aina kun karttaa on piirretty: hakee puuttuvat tai vanhentuneet tiedot.
// Norjan merikartalla satamat ja väylät ovat päällä automaattisesti: satamat näytetään asetuksesta riippumatta ja väylät haetaan itsestään (noin 1 Mt).
const norjaNyt = () => !!kLive && nayttoKartta(lv).id === 'norja';
const norjaAuto = { haku: false, virhe: 0 };
async function norjaVaylatAuto() {
  if (norjaAuto.haku || !navigator.onLine || Date.now() - norjaAuto.virhe < 120000) return;
  norjaAuto.haku = true;
  try { await vaylatMuistiin(); if (!(vayla && vayla.osat.norja)) { await lataaVaylat(null, NORJA_VAYLA); laattaSaapui(); } }
  catch (x) { norjaAuto.virhe = Date.now(); } finally { norjaAuto.haku = false; }
}
function lisatAjasta() { if (!(T.as.tuuli || T.as.tutka || T.as.ais || T.as.satamat || T.as.luiskat || norjaNyt())) return; clearTimeout(lisa.ajastin); lisa.ajastin = setTimeout(lisatPaivita, 1200); }
function lisatPaivita() {
  if (nakyma !== 'kartta' || !kLive || !kLive.cv.isConnected) return;
  const norja = norjaNyt();
  if ((T.as.satamat || T.as.luiskat || norja) && !lisa.satamat) satamatHae();
  if (norja && !norjaLinjat) norjaVaylatAuto();
  if (!navigator.onLine) return;
  if (T.as.tuuli && (!lisa.tuuli || Date.now() - lisa.tuuli.aika > 30 * 60000 || siirtynyt(lisa.tuuli.nakyma)) && !(lisa.tuuliVirhe && Date.now() - lisa.tuuliVirhe < 30000)) tuuliHae();
  if (T.as.tutka && Date.now() - tutka.aika > 150000 && !(tutka.virhe && Date.now() - tutka.virhe < 30000)) tutkaHae();
  if (T.as.ais && (Date.now() - lisa.aisAika > 60000 || (lisa.ais && siirtynyt(lisa.aisNakyma) && Date.now() - lisa.aisAika > 5000))) aisHae();
  else if (T.as.ais && lisa.ais && siirtynyt(lisa.aisNakyma)) { clearTimeout(lisa.ajastin); lisa.ajastin = setTimeout(lisatPaivita, 5200); }
}
// ---------- sadetutka: Ilmatieteen laitoksen avoin karttapalvelu (WMS, CC BY 4.0) ----------
// Koko Suomen tutkakuva haetaan yhtenä läpinäkyvänä kuvana (sama projektio kuin kartassa), joten karttaa voi siirtää ja zoomata ilman uusia hakuja.
// Kuvia tulee 5 minuutin välein; uusimman kuvan aika luetaan palvelun kuvauksesta, koska tulevaa aikaa pyydettäessä palvelu vastaa virheellä.
const TUTKA = { url: 'https://openwms.fmi.fi/geoserver/', taso: 'Radar:suomi_dbz_eureffin', b: { lo0: 17, lo1: 33.5, la0: 57.5, la1: 70.5 }, w: 1024, kuvia: 13, vali: 300000 };
const tutka = { ajat: [], kuvat: new Map(), i: 0, haku: 0, aika: 0, virhe: 0, anim: 0, tauko: 0 };
const mercM = (lon, lat) => [6378137 * lon * RAD, 6378137 * Math.asinh(Math.tan(lat * RAD))];
function tutkaUrl(t) {
  const B = TUTKA.b, a = mercM(B.lo0, B.la0), b = mercM(B.lo1, B.la1), h = Math.round(TUTKA.w * (b[1] - a[1]) / (b[0] - a[0]));
  return TUTKA.url + 'wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=' + TUTKA.taso + '&STYLES=&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&BBOX=' + [a[0], a[1], b[0], b[1]].map(Math.round).join(',') + '&WIDTH=' + TUTKA.w + '&HEIGHT=' + h + '&TIME=' + new Date(t).toISOString();
}
// Yksi tutkakuva muistiin. Palauttaa kuvan tai null, jos kuvaa ei saatu.
function tutkaKuva(t) {
  const v = tutka.kuvat.get(t); if (v) return Promise.resolve(v);
  return new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; const a = setTimeout(() => ok(null), 20000);
    im.onload = () => { clearTimeout(a); if (tutka.ajat.includes(t)) tutka.kuvat.set(t, im); ok(im); }; im.onerror = () => { clearTimeout(a); ok(null); }; im.src = tutkaUrl(t); });
}
async function tutkaHae() {
  if (tutka.haku) return; tutka.haku = 1;
  try {
    const r = await fetch(TUTKA.url + 'Radar/suomi_dbz_eureffin/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
    const loppu = tutkaLoppu(await r.text()); if (!loppu) throw new Error('aika puuttuu');
    const vanha = tutka.ajat[tutka.ajat.length - 1];
    tutka.ajat = Array.from({ length: TUTKA.kuvia }, (_, k) => loppu - (TUTKA.kuvia - 1 - k) * TUTKA.vali);
    for (const t of [...tutka.kuvat.keys()]) if (!tutka.ajat.includes(t)) tutka.kuvat.delete(t);
    if (!await tutkaKuva(loppu)) throw new Error('kuva puuttuu');
    tutka.aika = Date.now(); tutka.virhe = 0;
    if (tutka.anim && vanha !== loppu) { tutka.i = Math.max(0, tutka.i - 1); tutka.ajat.forEach(tutkaKuva); }
  } catch (x) { tutka.virhe = Date.now(); tutka.virheTeksti = String(x && x.message || x); } finally { tutka.haku = 0; }
  laattaSaapui();
}
// Animaatio: viimeisen tunnin kuvat peräkkäin, uusimman kohdalla pieni tauko.
function tutkaKaynnista() {
  if (!tutka.ajat.length) { ilmoita(navigator.onLine ? 'Tutkakuvaa haetaan vielä.' : 'Sadetutka vaatii verkkoyhteyden.'); return; }
  tutka.ajat.forEach(tutkaKuva); tutka.i = 0; tutka.tauko = 0;
  tutka.anim = setInterval(() => {
    if (nakyma !== 'kartta' || !kLive || !kLive.cv.isConnected || !T.as.tutka) { tutkaSeis(); return; }
    const N = tutka.ajat.length;
    if (tutka.i === N - 1 && tutka.tauko++ < 3) return;
    tutka.tauko = 0;
    for (let k = 1; k <= N; k++) { const j = (tutka.i + k) % N; if (tutka.kuvat.has(tutka.ajat[j])) { tutka.i = j; break; } }
    kLive.piirra();
  }, 450);
  if (kLive) kLive.piirra();
}
function tutkaSeis() { clearInterval(tutka.anim); tutka.anim = 0; if (kLive && kLive.cv.isConnected) kLive.piirra(); }
setInterval(() => { if (T.as.tutka && !document.hidden) lisatPaivita(); }, 60000);
// Piirtää tutkakuvan kartan päälle (vain näkyvä osa kuvasta) ja päivittää kartan Sadetutka-napin.
function piirraTutka(c, X, Y, W, H) {
  const nappi = $('#kTutka'), lahde = $('#kTutkaL'), paalla = !!T.as.tutka; let t = 0;
  if (paalla) {
    t = tutka.ajat[tutka.anim ? tutka.i : tutka.ajat.length - 1] || 0; const im = tutka.kuvat.get(t);
    if (im) {
      const r = tutkaRajaus(X(TUTKA.b.lo0), Y(TUTKA.b.la1), X(TUTKA.b.lo1), Y(TUTKA.b.la0), im.width, im.height, W, H);
      if (r) { c.save(); c.globalAlpha = .65; c.drawImage(im, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]); c.restore(); }
    } else t = 0;
  }
  if (kLive && c.canvas === kLive.cv) c.canvas.dataset.tutka = t || '';
  if (lahde) { lahde.hidden = !paalla; lahde.textContent = paalla ? ' Sadetutka: Ilmatieteen laitos, CC BY 4.0.' : ''; }
  if (!nappi) return;
  nappi.hidden = !paalla; if (!paalla) return;
  nappi.classList.toggle('on', !!tutka.anim);
  nappi.querySelector('b').textContent = (tutka.anim ? '■ ' : '▶ ') + 'Sadetutka';
  nappi.querySelector('span').textContent = t ? 'klo ' + klo(t) + (!tutka.anim && Date.now() - t > 25 * 60000 ? ' (vanha kuva)' : '') : !navigator.onLine ? 'ei verkkoa' : tutka.virhe ? 'ei saatavilla juuri nyt' : 'haetaan…';
}
const tuuliVari = v => v < 4 ? '#1f8a4c' : v < 8 ? '#0b7a8f' : v < 11 ? '#c77700' : v < 14 ? '#e8590c' : '#c0392b';
const aisTyyppi = k => k == null ? '' : k === 30 ? 'Kalastusalus' : k === 36 ? 'Purjealus' : k === 37 ? 'Huvialus' : k === 50 ? 'Luotsialus' : k === 51 ? 'Meripelastusalus' : k === 52 ? 'Hinaaja' : k === 55 ? 'Viranomaisalus' : k >= 40 && k < 50 ? 'Pika-alus' : k >= 60 && k < 70 ? 'Matkustaja-alus' : k >= 70 && k < 80 ? 'Rahtialus' : k >= 80 && k < 90 ? 'Säiliöalus' : 'Muu alus';
// Piirtää lisätiedot kartalle ja kirjaa napautettavat kohteet (lisa.osumat).
// 3D-näkymän väylät: väylätietojen keskilinjat piirretään kartan pintaan leveinä, läpikuultavina kaistoina, joiden keskellä kulkee kirkas viiva.
// Väri kulkusyvyyden mukaan (syvä tummansininen, keskisyvä sininen, matala turkoosi); oman veneen syväykselle liian matala väylä punaisena katkoviivana.
function piirraVaylat3d(c, X, Y, W, H, z) {
  if (!vayla || z < 10 || norjaNyt()) { if (c.canvas) c.canvas.dataset.vaylat3d = 0; return; }
  const lo0 = lonX(mx(lv.lon, z) - W / 2, z), lo1 = lonX(mx(lv.lon, z) + W / 2, z), la1 = latY(my(lv.lat, z) - H / 2, z), la0 = latY(my(lv.lat, z) + H / 2, z);
  const syv = T.vene.syvays || 0, polut = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]; let n = 0;
  for (const l of vayla.linjat) {
    let b = l.b; if (!b) { b = l.b = [180, 90, -180, -90]; for (let i = 0; i < l.p.length; i += 2) { if (l.p[i] < b[0]) b[0] = l.p[i]; if (l.p[i] > b[2]) b[2] = l.p[i]; if (l.p[i + 1] < b[1]) b[1] = l.p[i + 1]; if (l.p[i + 1] > b[3]) b[3] = l.p[i + 1]; } }
    if (b[2] < lo0 || b[0] > lo1 || b[3] < la0 || b[1] > la1) continue;
    const p = polut[syv && l.s && l.s < syv ? 3 : !l.s || l.s < 4 ? 2 : l.s < 9 ? 1 : 0]; n++;
    for (let i = 0; i < l.p.length; i += 2) i ? p.lineTo(X(l.p[i]), Y(l.p[i + 1])) : p.moveTo(X(l.p[i]), Y(l.p[i + 1]));
  }
  const lev = rajaa(9 * 2 ** (z - 13), 6, 30), varit = ['#0b3d91', '#1976d2', '#0ea5b7', '#e01b24'];
  c.save(); c.lineJoin = c.lineCap = 'round';
  polut.forEach((p, i) => { c.globalAlpha = i === 3 ? .16 : .24; c.lineWidth = lev; c.strokeStyle = varit[i]; c.stroke(p); });      // kaista
  polut.forEach((p, i) => { c.globalAlpha = .85; c.lineWidth = 4.4; c.strokeStyle = '#fff'; c.stroke(p); c.globalAlpha = 1; c.lineWidth = 2.2; c.strokeStyle = varit[i]; c.setLineDash(i === 3 ? [7, 7] : []); c.stroke(p); c.setLineDash([]); });      // keskiviiva
  c.restore(); c.canvas.dataset.vaylat3d = n;
}
// Kohteiden kuvakkeet (ympyrä ja symboli) kohtaan x, y: samat litteässä kartassa ja 3D-näkymän pystykylteissä.
function satamaIkoni(c, x, y, s) {
  const r = s.l === 'satama' ? 9 : s.l === 'luiska' ? 8 : 7;
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = s.l === 'satama' ? '#0f2a43' : s.l === 'polttoaine' ? '#e8590c' : s.l === 'luiska' ? '#6741d9' : '#6b7780'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
  c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 1.6; c.beginPath();
  if (s.l === 'satama') { c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.moveTo(x - 3, y - 2.5); c.lineTo(x + 3, y - 2.5); c.moveTo(x - 5, y + 1.5); c.quadraticCurveTo(x - 4.5, y + 5.5, x, y + 5.5); c.quadraticCurveTo(x + 4.5, y + 5.5, x + 5, y + 1.5); c.stroke(); }      // ankkuri
  else if (s.l === 'polttoaine') { c.moveTo(x, y - 4.5); c.bezierCurveTo(x + 4.5, y, x + 3.5, y + 4.5, x, y + 4.5); c.bezierCurveTo(x - 3.5, y + 4.5, x - 4.5, y, x, y - 4.5); c.fill(); }      // pisara
  else if (s.l === 'luiska') { c.moveTo(x - 5, y + 3.2); c.lineTo(x + 4.5, y + 3.2); c.lineTo(x + 4.5, y - 3.8); c.closePath(); c.fill(); }      // kalteva luiska
  else { c.arc(x, y, 2, 0, 7); c.fill(); }
}
function kalaIkoni(c, x, y) {
  c.beginPath(); c.arc(x, y, 14, 0, 7); c.fillStyle = '#0b7a8f'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x - 2, y, 7, 4.2, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(x + 3.5, y); c.lineTo(x + 9.5, y - 4.6); c.lineTo(x + 9.5, y + 4.6); c.closePath(); c.fill();
  c.beginPath(); c.arc(x - 5.2, y - 1, 1.1, 0, 7); c.fillStyle = '#0b7a8f'; c.fill();
}
function saunaIkoni(c, x, y) {
  c.beginPath(); c.arc(x, y, 12, 0, 7); c.fillStyle = '#8a4b16'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff'; c.fillRect(x - 5.5, y + 2, 11, 5);
  c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
  for (const dx of [-3.5, 0, 3.5]) { c.moveTo(x + dx, y - 0.5); c.quadraticCurveTo(x + dx - 2, y - 2.5, x + dx, y - 4.5); c.quadraticCurveTo(x + dx + 2, y - 6.5, x + dx, y - 8); }
  c.stroke();
}
function piirraLisat(c, X, Y, W, H, z) {
  lisa.osumat = [];
  const k3 = lisa.kyltit = kLive && kLive.kall && c.canvas === kLive.cv ? [] : null; lisa.alukset3d = k3 ? [] : null;      // 3D-näkymän pystykyltit kerätään tähän
  if (k3) piirraVaylat3d(c, X, Y, W, H, z);
  piirraTutka(c, X, Y, W, H);
  piirraNorjaVaylat(c, X, Y, W, H, z);
  piirraSyvyys(c, X, Y, W, H, z);
  // Muokattava oma reitti: viiva ja pisteet (A = lähtö, B = määränpää, numerot = välipisteet, keltainen = valittu).
  if (omaR && omaR.p.length) {
    const P = omaR.p; c.lineJoin = c.lineCap = 'round';
    if (P.length > 1) for (const [w, v] of [[8, '#fff'], [4.5, '#1565c0']]) { c.lineWidth = w; c.strokeStyle = v; c.beginPath(); P.forEach((q, i) => i ? c.lineTo(X(q.lon), Y(q.lat)) : c.moveTo(X(q.lon), Y(q.lat))); c.stroke(); }
    P.forEach((q, i) => {
      const x = X(q.lon), y = Y(q.lat), loppu = i === P.length - 1 && omaR.vaihe === 'vali', paa = i === 0 || loppu, val = omaR.valittu === i; pysty(c, x, y);
      c.beginPath(); c.arc(x, y, (paa ? 13 : 11) + (val ? 4 : 0), 0, 7); c.fillStyle = val ? '#ffd43b' : i === 0 ? '#1f8a4c' : loppu ? '#c0392b' : '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = val ? '#12222f' : paa ? '#fff' : '#1565c0'; c.stroke();
      c.font = '700 12px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = paa && !val ? '#fff' : '#12222f'; c.fillText(i === 0 ? 'A' : loppu ? 'B' : String(i), x, y + .5); c.restore();
    });
  }
  const sisalla = (x, y) => x > -30 && y > -30 && x < W + 30 && y < H + 30;
  const teksti = (s, x, y, koko, vari) => { c.font = '600 ' + koko + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; c.strokeText(s, x, y); c.fillStyle = vari; c.fillText(s, x, y); };
  // Satamat ja palvelut omalla kytkimellään, veneenlaskuluiskat omallaan (violetti merkki, näkyvät tasolta 10).
  const satamatPaalla = T.as.satamat || norjaNyt();      // Norjan merikartalla satamat näkyvät aina
  if ((satamatPaalla || T.as.luiskat) && lisa.satamat && z >= 8.5) for (const s of lisa.satamat.lista) {
    if (s.l === 'luiska' ? !T.as.luiskat || z < 10 : !satamatPaalla || (s.l !== 'satama' && z < 11)) continue;
    const x = X(s.lo), y = Y(s.la); if (!sisalla(x, y)) continue;
    const r = s.l === 'satama' ? 9 : s.l === 'luiska' ? 8 : 7;
    // 3D-näkymässä kohde piirretään pystykylttinä (merkit3d), muuten litteänä merkkinä kartalle
    if (k3) k3.push({ x, y, f: satamaIkoni, d: s, nimi: z >= 12 && s.n ? s.n : '', vari: '#0f2a43', laji: 'satama', r: r + 12 });
    else { pysty(c, x, y); satamaIkoni(c, x, y, s); if (z >= 12 && s.n) teksti(s.n, x, y + r + 3, 12, '#0f2a43'); c.restore(); }
    lisa.osumat.push({ x, y, r: r + 12, laji: 'satama', d: s });
  }
  // Omat kalapaikat: kalan kuva ympyrässä. Napautus avaa paikan tiedot.
  if (T.as.kalapaikat && z >= 7.5) for (const k of T.kalapaikat) {
    const x = X(k.lon), y = Y(k.lat); if (!sisalla(x, y)) continue;
    if (k3) k3.push({ x, y, f: kalaIkoni, d: k, nimi: z >= 12 && k.nimi ? k.nimi : '', vari: '#075565', laji: 'kala', r: 26 });
    else { pysty(c, x, y); kalaIkoni(c, x, y); if (z >= 12 && k.nimi) teksti(k.nimi, x, y + 16, 12, '#075565'); c.restore(); }
    lisa.osumat.push({ x, y, r: 26, laji: 'kala', d: k });
  }
  // Yleiset saunat saarissa (tiedot/saunat.js): ruskea merkki, jossa kiuas ja löyly. Napautus avaa tiedot.
  if (T.as.saunat && z >= 8.5) for (const k of saunaLista()) {
    const x = X(k.lo), y = Y(k.la); if (!sisalla(x, y)) continue;
    if (k3) k3.push({ x, y, f: saunaIkoni, d: k, nimi: z >= 11.5 ? k.n : '', vari: '#5f3310', laji: 'sauna', r: 24 });
    else { pysty(c, x, y); saunaIkoni(c, x, y); if (z >= 11.5) teksti(k.n, x, y + 14, 12, '#5f3310'); c.restore(); }
    lisa.osumat.push({ x, y, r: 24, laji: 'sauna', d: k });
  }
  const ra = T.as.rajoitus && vayla && vayla.rajoitukset;
  if (ra && z >= 10) {
    const lo0 = lonX(mx(lv.lon, z) - W / 2, z), lo1 = lonX(mx(lv.lon, z) + W / 2, z), la1 = latY(my(lv.lat, z) - H / 2, z), la0 = latY(my(lv.lat, z) + H / 2, z), nyt = Date.now();
    for (const a of ra) {
      if (a.b[2] < lo0 || a.b[0] > lo1 || a.b[3] < la0 || a.b[1] > la1 || (a.e && a.e < nyt)) continue;
      c.beginPath(); for (const mk of a.m) for (const r of mk) { for (let i = 0; i < r.length; i += 2) i ? c.lineTo(X(r[i]), Y(r[i + 1])) : c.moveTo(X(r[i]), Y(r[i + 1])); c.closePath(); }
      c.fillStyle = a.k ? 'rgba(224,27,36,.10)' : 'rgba(232,89,12,.08)'; c.fill('evenodd'); c.setLineDash([6, 5]); c.lineWidth = 1.6; c.strokeStyle = a.k ? 'rgba(200,20,30,.75)' : 'rgba(232,89,12,.7)'; c.stroke(); c.setLineDash([]);
      if (a.k && z >= 11.5) { const x = X((a.b[0] + a.b[2]) / 2), y = Y((a.b[1] + a.b[3]) / 2); if (sisalla(x, y) && pisteAlueessa((a.b[0] + a.b[2]) / 2, (a.b[1] + a.b[3]) / 2, a)) { pysty(c, x, y); c.beginPath(); c.arc(x, y, 11, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#d0121c'; c.stroke(); c.font = '700 11px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#12222f'; c.fillText(a.k, x, y + .5); c.restore(); } }
    }
  }
  let aisNakyvissa = 0;
  if (T.as.ais && lisa.ais) for (const a of lisa.ais) {
    const x = X(a.lon), y = Y(a.lat); if (!sisalla(x, y)) continue;
    const liikkuu = a.sog > 0.5, suunta = a.hdg != null && a.hdg < 360 ? a.hdg : a.cog < 360 ? a.cog : 0;
    if (k3) { const ti = lisa.aisNimet && lisa.aisNimet.get(a.mmsi); lisa.alukset3d.push({ x, y, a, suunta, tieto: ti, nimi: z >= 11 && ti && ti.name ? ti.name.trim() : '' }); aisNakyvissa++; lisa.osumat.push({ x, y, r: 26, laji: 'ais', d: a }); continue; }
    c.save(); c.translate(x, y); c.rotate(suunta * RAD); c.beginPath();
    if (liikkuu) { c.moveTo(0, -15); c.lineTo(8.5, 10); c.lineTo(0, 5.5); c.lineTo(-8.5, 10); c.closePath(); } else c.arc(0, 0, 6.5, 0, 7);
    c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke(); c.fillStyle = liikkuu ? '#a31fd1' : '#455a64'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#2a0a3a'; c.stroke(); c.restore(); aisNakyvissa++;
    const tieto = lisa.aisNimet && lisa.aisNimet.get(a.mmsi);
    if (z >= 11 && tieto && tieto.name) { pysty(c, x, y); teksti(tieto.name.trim(), x, y + 13, 11.5, '#4b1d8f'); c.restore(); }
    lisa.osumat.push({ x, y, r: 22, laji: 'ais', d: a });
  }
  const tuuli = T.as.tuuli && lisa.tuuli, i = TUNNIT[lisa.tunti];
  if (tuuli) for (const p of tuuli.p) {
    const v = p.nop[i], x = X(p.lon), y = Y(p.lat); if (v == null || !sisalla(x, y)) continue;
    const L = 9 + Math.min(v, 20) * 0.8, vari = tuuliVari(v);
    c.save(); c.translate(x, y); c.rotate(((p.suu[i] || 0) + 180) * RAD);      // nuoli osoittaa suuntaan, johon tuuli puhaltaa
    for (const [w, vv] of [[6.5, 'rgba(255,255,255,.92)'], [3, vari]]) { c.lineWidth = w; c.strokeStyle = vv; c.lineCap = c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, L); c.lineTo(0, -L); c.moveTo(-6, -L + 8); c.lineTo(0, -L); c.lineTo(6, -L + 8); c.stroke(); }
    c.restore();
    pysty(c, x, y); teksti(n(v, 0) + (p.aalto && p.aalto[i] != null ? ' · ' + n(p.aalto[i]) + ' m' : ''), x, y + L + 3, 13, vari); c.restore();
  }
  const at = $('#kAis');
  if (at) { at.hidden = !T.as.ais; if (T.as.ais) at.textContent = !navigator.onLine ? 'AIS: ei verkkoa' : !lisa.ais ? 'AIS: haetaan…' : 'AIS: ' + (aisNakyvissa ? aisNakyvissa + (aisNakyvissa === 1 ? ' alus' : ' alusta') + ' näkyvissä' : 'ei aluksia tällä alueella') + ' · klo ' + klo(lisa.aisAika); }
  // tuulen aikavalitsin kartan yläreunassa
  const chip = $('#kTuuli');
  if (chip) {
    chip.hidden = !T.as.tuuli;
    if (T.as.tuuli) {
      let ala = navigator.onLine ? 'Haetaan säätä…' : 'Ei verkkoa';
      if (tuuli) { let pa = null, pd = Infinity; for (const p of tuuli.p) { const d = etaisyys(p.lat, p.lon, lv.lat, lv.lon); if (d < pd && p.nop[i] != null) { pd = d; pa = p; } }
        if (pa) ala = n(pa.nop[i], 0) + ' m/s ' + ilmansuunta(pa.suu[i]) + ' · puuskat ' + n(pa.pus[i], 0) + ' · ' + n(pa.lam[i], 0) + ' °C' + (pa.sade[i] > 0 ? ' · sade ' + n(pa.sade[i]) + ' mm' : ''); }
      chip.querySelector('b').textContent = 'Tuuli ' + (i ? '+' + i + ' h' + (tuuli ? ' · klo ' + klo(tuuli.ajat[i]) : '') : 'nyt');
      chip.querySelector('span').textContent = ala;
    }
  }
}
const KYLLA = v => v === 'yes' ? 'kyllä' : v === 'no' ? 'ei' : v;
function satamaIkkuna(s) {
  const t = s.t || {}, d = $('#dlg'), rivit = [], lisaa = (nimi, arvo) => { if (arvo) rivit.push('<div class="rivi"><div class="v"><span class="pieni">' + nimi + '</span><b>' + e(KYLLA(arvo)) + '</b></div></div>'); };
  const fc = t['seamark:small_craft_facility:category'] || '';
  lisaa('Tyyppi', s.l === 'luiska' ? 'Veneenlaskuluiska' + (t.access === 'private' ? ' (yksityinen)' : t.access === 'customers' ? ' (vain asiakkaille)' : '') : s.l === 'satama' ? 'Venesatama' + (t.access === 'private' ? ' (yksityinen)' : '') : s.l === 'polttoaine' ? 'Polttoaineasema' : /pump/.test(fc) ? 'Septitankin tyhjennys' : /slipway/.test(fc) ? 'Veneluiska' : /hoist/.test(fc) ? 'Venenosturi' : /boatyard/.test(fc) ? 'Telakka' : 'Veneilyn palvelu');
  lisaa('Paikkakunta', t['addr:city']); lisaa('Ylläpitäjä', t.operator); lisaa('Maksullinen', t.fee); lisaa('Venepaikkoja', t.capacity);
  lisaa('Suurin syväys (m)', t.maxdraught || t.maxdraft || t.depth); lisaa('Sähkö', t.power_supply); lisaa('Juomavesi', t.drinking_water); lisaa('Septitankin tyhjennys', t.sanitary_dump_station);
  lisaa('Suihku', t.shower); lisaa('WC', t.toilets); lisaa('Sauna', t.sauna); lisaa('Verkkoyhteys', t.internet_access);
  lisaa('Polttoaine', [t['fuel:diesel'] === 'yes' ? 'diesel' : '', t['fuel:octane_95'] === 'yes' ? '95' : '', t['fuel:octane_98'] === 'yes' ? '98' : ''].filter(Boolean).join(', '));
  lisaa('Pinta', ({ concrete: 'betoni', asphalt: 'asfaltti', gravel: 'sora', fine_gravel: 'sora', compacted: 'tiivistetty sora', sand: 'hiekka', ground: 'maa', dirt: 'maa', wood: 'puu', paved: 'päällystetty', unpaved: 'päällystämätön', 'concrete:plates': 'betonilaatat', 'concrete:lanes': 'betonikaistat', metal: 'metalli' })[t.surface] || t.surface);
  lisaa('Aukioloajat', t.opening_hours); lisaa('Lisätietoja', t.description);
  const puh = t.phone || t['contact:phone'], www = t.website || t['contact:website'];
  d.innerHTML = '<form method="dialog"><h3>' + e(s.n || (s.l === 'luiska' ? 'Veneenlaskuluiska' : 'Nimetön kohde')) + '</h3><div class="plista">' + rivit.join('') + '</div>' +
    (rivit.length < 3 ? '<div class="pieni">Tästä kohteesta ei ole tallennettu palvelutietoja.</div>' : '') +
    (puh ? '<a class="nappi" href="tel:' + e(puh.split(';')[0].replace(/[^+\d]/g, '')) + '">Soita ' + e(puh.split(';')[0]) + '</a>' : '') +
    (www && /^https?:\/\//.test(www) ? '<a class="nappi" href="' + e(www) + '" target="_blank" rel="noopener">Avaa verkkosivu</a>' : '') +
    '<div class="pieni">Tiedot ovat OpenStreetMapista (© OpenStreetMapin tekijät), ja ne voivat olla puutteellisia tai vanhentuneita. ' + (s.l === 'luiska' ? 'Tarkista luiskan kunto, syvyys ja käyttöoikeus paikan päältä.' : 'Tarkista palvelut ja vieraspaikat satamasta.') + '</div>' +
    '<div class="napit"><button type="button" class="nappi" id="sSulje">Sulje</button><button type="button" class="nappi paa" id="sReitti">Reitti tänne</button></div></form>';
  d.querySelector('#sSulje').onclick = () => d.close();
  d.querySelector('#sReitti').onclick = async () => {
    d.close(); rs.minne = { nimi: s.n || (s.l === 'luiska' ? 'Veneluiska ' : '') + koord(s.la, s.lo), lat: s.la, lon: s.lo }; rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' };
    if (!paikkaNyt() || !await vaylaverkko()) { reittiIkkuna(); return; }
    if (await laskeReitti()) naytaReitti();
  };
  d.showModal();
}
const saunaLista = () => typeof SAUNAT_PAKETTI !== 'undefined' ? SAUNAT_PAKETTI.lista : [];
function saunaIkkuna(s) {
  const d = $('#dlg'), rivi = (nimi, arvo) => arvo ? '<div class="rivi"><div class="v"><span class="pieni">' + nimi + '</span><b>' + e(arvo) + '</b></div></div>' : '';
  d.innerHTML = '<form method="dialog"><h3>' + e(s.n) + '</h3><div class="plista">' + rivi('Saari', s.saari + (s.kunta ? ', ' + s.kunta : '')) + rivi('Käyttö', s.kaytto) + rivi('Maksu', s.maksu) + rivi('Kausi ja ajat', s.kausi) + rivi('Omalla veneellä', s.vene) + rivi('Varaus', s.varaus) + rivi('Lisätietoja', s.lisa) + '</div>' +
    (s.www && /^https?:\/\//.test(s.www) ? '<a class="nappi" href="' + e(s.www) + '" target="_blank" rel="noopener">Avaa saunan verkkosivu</a>' : '') +
    '<div class="pieni">Tiedot on koottu ylläpitäjien verkkosivuilta ' + e(SAUNAT_PAKETTI.tarkistettu) + '. Hinnat, vuorot ja aukiolo muuttuvat: varmista ne ennen lähtöä. Merkin paikka kartalla on likimääräinen.</div>' +
    '<div class="napit"><button type="button" class="nappi" id="sSulje">Sulje</button><button type="button" class="nappi paa" id="sReitti">Reitti tänne</button></div></form>';
  d.querySelector('#sSulje').onclick = () => d.close();
  d.querySelector('#sReitti').onclick = async () => {
    d.close(); rs.minne = { nimi: s.n, lat: s.la, lon: s.lo }; rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' };
    if (!paikkaNyt() || !await vaylaverkko()) { reittiIkkuna(); return; }
    if (await laskeReitti()) naytaReitti();
  };
  d.showModal();
}
function aisIkkuna(a) {
  const t = (lisa.aisNimet && lisa.aisNimet.get(a.mmsi)) || {}, d = $('#dlg'), min = Math.max(0, Math.round((Date.now() - a.aika) / 60000));
  const rivi = (nimi, arvo) => arvo === '' || arvo == null ? '' : '<div class="rivi"><div class="v"><span class="pieni">' + nimi + '</span><b>' + e(arvo) + '</b></div></div>';
  d.innerHTML = '<form method="dialog"><h3>' + e((t.name || '').trim() || 'Alus ' + a.mmsi) + '</h3><div class="plista">' + rivi('Tyyppi', aisTyyppi(t.shipType)) + rivi('Nopeus', n(a.sog) + ' kn' + (kmh() ? ' (' + n(a.sog * 1.852) + ' km/h)' : '')) + rivi('Suunta', a.cog < 360 ? Math.round(a.cog) + '° ' + ilmansuunta(a.cog) : '') +
    rivi('Määränpää', (t.destination || '').trim()) + rivi('Syväys (m)', t.draught ? n(t.draught / 10) : '') + rivi('MMSI', a.mmsi) + rivi('Sijainti päivitetty', min < 1 ? 'alle minuutti sitten' : min + ' min sitten') + '</div>' +
    '<div class="pieni">AIS-tiedot: Fintraffic / Digitraffic (CC BY 4.0). Kaikilla veneillä ei ole AIS-lähetintä, ja sijainnit voivat olla minuutteja vanhoja – älä käytä törmäysten välttämiseen.</div>' +
    '<div class="napit"><button type="button" class="nappi paa" id="sSulje">Sulje</button></div></form>';
  d.querySelector('#sSulje').onclick = () => d.close(); d.showModal();
}
// Kartan napautus: avaa lähimmän sataman tai aluksen tiedot.
function karttaNapautus(x, y) {
  let paras = null, pd = Infinity; for (const o of lisa.osumat) { const d = Math.hypot(o.x - x, o.y - y); if (d <= o.r && d < pd) { pd = d; paras = o; } }
  if (paras) (paras.laji === 'ais' ? aisIkkuna : paras.laji === 'kala' ? kalapaikkaIkkuna : paras.laji === 'sauna' ? saunaIkkuna : satamaIkkuna)(paras.d);
}
Object.assign(A, { aisNyt() { if (!navigator.onLine) { ilmoita('Ei verkkoyhteyttä.'); return; } lisa.aisAika = 0; aisHae(); }, satamatPaivita() { satamatHae(true); }, tuuliAika() { lisa.tunti = (lisa.tunti + 1) % TUNNIT.length; if (kLive) kLive.piirra(); }, tutkaAnim() { if (tutka.anim) tutkaSeis(); else tutkaKaynnista(); } });
setInterval(() => { if (typeof T !== 'undefined' && T && nakyma === 'kartta') lisatPaivita(); }, 60000);

// ---------- omat kalapaikat ----------
// T.kalapaikat = [{id, nimi, lajit, huom, lat, lon, luotu}]. Kartalla kalan kuva ympyrässä; napautus avaa ikkunan, jossa nimi, lajit ja tarkempi kuvaus.
// k = olemassa oleva paikka (muokkaus) tai tyhjä (uusi: paikaksi oma sijainti tai kartalta napautettu kohta).
function kalapaikkaIkkuna(k) {
  const d = $('#dlg'), s = paikkaNyt(), on = !!(k && k.id);
  d.innerHTML = '<form method="dialog"><h3>' + (on ? 'Kalapaikka' : 'Uusi kalapaikka') + '</h3>' +
    '<label>Nimi<input id="kpNimi" autocomplete="off" placeholder="esim. Ahvenkari" value="' + e(on ? k.nimi : '') + '"></label>' +
    '<label>Kalalajit<input id="kpLajit" autocomplete="off" placeholder="esim. ahven, kuha" value="' + e(on ? k.lajit : '') + '"></label>' +
    '<label>Tarkempi kuvaus<textarea id="kpHuom" rows="6" placeholder="Syvyys, pohjan laatu, vieheet, vuodenaika ja kellonaika, ankkurointi, saaliit…">' + e(on ? k.huom : '') + '</textarea></label>' +
    (on ? '<div class="pieni">' + koord(k.lat, k.lon) + ' · lisätty ' + pvm(k.luotu) + (s ? ' · ' + n(etaisyys(s[0], s[1], k.lat, k.lon) / MPK) + ' mpk täältä' : '') + '</div>' +
      '<button type="button" class="nappi" id="kpReitti">Reitti tänne</button><button type="button" class="nappi" id="kpSiirra">Siirrä: valitse uusi paikka kartalta</button>' +
      '<div class="napit"><button type="button" class="nappi vaara" id="kpPoista">Poista</button><button type="button" class="nappi" id="kpSulje">Sulje</button><button type="button" class="nappi paa" id="kpTallenna">Tallenna</button></div>'
      : '<div class="pieni">' + (s ? 'Oma sijainti: ' + koord(s[0], s[1]) + (gps.viime && watchId != null ? ' (±' + Math.round(gps.viime.acc || 0) + ' m)' : ' (viimeisin tunnettu)') : 'Omaa sijaintia ei ole – valitse paikka kartalta tai käynnistä GPS.') + '</div>' +
      '<button type="button" class="nappi paa" id="kpTassa"' + (s ? '' : ' disabled') + '>Tallenna omaan sijaintiin</button><button type="button" class="nappi" id="kpKartta">Valitse paikka kartalta</button>' +
      '<div class="napit"><button type="button" class="nappi" id="kpSulje">Peruuta</button></div>') + '</form>';
  const lue = () => ({ nimi: d.querySelector('#kpNimi').value.trim() || 'Kalapaikka ' + (T.kalapaikat.length + (on ? 0 : 1)), lajit: d.querySelector('#kpLajit').value.trim(), huom: d.querySelector('#kpHuom').value.trim() });
  const kartalta = (ohje, cb) => { d.close(); nakyma = 'kartta'; piirra(); ilmoita(ohje); napautusCb = async (la, lo) => { napautusCb = null; await cb(+la.toFixed(6), +lo.toFixed(6)); piirra(); }; };
  d.querySelector('#kpSulje').onclick = () => d.close();
  if (!on) {
    const uusi = async (o, la, lo) => { const x = Object.assign({ id: uusiId(), lat: +la.toFixed(6), lon: +lo.toFixed(6), luotu: Date.now() }, o); T.kalapaikat.push(x); await talletaT(); ilmoita('Kalapaikka tallennettu: ' + x.nimi); };
    d.querySelector('#kpTassa').onclick = async () => { const o = lue(); d.close(); await uusi(o, s[0], s[1]); piirra(); };
    d.querySelector('#kpKartta').onclick = () => { const o = lue(); kartalta('Napauta kalapaikan kohtaa kartalla.', (la, lo) => uusi(o, la, lo)); };
  } else {
    d.querySelector('#kpTallenna').onclick = async () => { Object.assign(k, lue()); d.close(); await talletaT(); ilmoita('Kalapaikka tallennettu.'); piirra(); };
    d.querySelector('#kpPoista').onclick = async () => { if (!confirm('Poistetaanko kalapaikka ' + k.nimi + ' pysyvästi?')) return; T.kalapaikat = T.kalapaikat.filter(x => x !== k); d.close(); await talletaT(); ilmoita('Kalapaikka poistettu.'); piirra(); };
    d.querySelector('#kpSiirra').onclick = () => { Object.assign(k, lue()); kartalta('Napauta kalapaikan uutta kohtaa kartalla.', async (la, lo) => { k.lat = la; k.lon = lo; await talletaT(); ilmoita('Kalapaikka siirretty.'); }); };
    d.querySelector('#kpReitti').onclick = async () => {
      Object.assign(k, lue()); await talletaT(); d.close();
      rs.minne = { nimi: k.nimi, lat: k.lat, lon: k.lon }; rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' };
      if (!paikkaNyt() || !await vaylaverkko()) { reittiIkkuna(); return; }
      if (await laskeReitti()) naytaReitti();
    };
  }
  d.showModal();
}
Object.assign(A, {
  kalapaikka() { kalapaikkaIkkuna(null); },
  kalapaikkaAvaa(id) { const k = T.kalapaikat.find(x => x.id === id); if (k) kalapaikkaIkkuna(k); }
});

// ---------- syvyyskäyrät (Traficomin merikartta-aineisto) ----------
// Käyrät haetaan Traficomin WFS-rajapinnasta alueittain pienissä ruuduissa, yksinkertaistetaan noin 4 metrin tarkkuuteen ja tallennetaan
// laitteelle tiiviinä taulukkoina (kv: 'syvyys-<alue>'): p = kaikkien käyrien pisteet [lon, lat, ...], alku = käyrän ensimmäisen pisteen indeksi,
// s = käyrän syvyys metreinä, bb = käyrän rajat [lon0, lat0, lon1, lat1]. Piirtoa varten käyrät jaetaan muistissa ruudukkoon.
// Lisenssi: Traficomin merikartoitusaineiston lisenssi – ei navigointikäyttöön, lähde mainittava.
const SYV_URL = 'https://julkinen.traficom.fi/inspirepalvelu/rajoitettu/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=rajoitettu:DepthContour_L&outputFormat=application/json&srsName=EPSG:4326';
const SYV_RX = 0.04, SYV_RY = 0.02;      // piirtoruudukon ruudun koko asteina (noin 2,2 km)
const syv = { osat: {}, ladattu: false, kehys: 0 };
const syvVari = d => d <= 3 ? '#e03131' : d <= 6 ? '#e8590c' : d <= 10 ? '#1c7ed6' : '#0b3d91';
function syvRuudukko(osa) {
  const r = new Map();
  for (let k = 0; k < osa.n; k++) {
    const x0 = Math.floor(osa.bb[k * 4] / SYV_RX), y0 = Math.floor(osa.bb[k * 4 + 1] / SYV_RY), x1 = Math.floor(osa.bb[k * 4 + 2] / SYV_RX), y1 = Math.floor(osa.bb[k * 4 + 3] / SYV_RY);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const a = x * 100000 + y; let l = r.get(a); if (!l) r.set(a, l = []); l.push(k); }
  }
  osa.ruudut = r; osa.leima = new Uint32Array(osa.n);
}
async function syvyysMuistiin() {
  if (syv.ladattu) return syv.osat;
  for (const a of ALUEET.concat(syv.lisaAlueet || [])) try { const o = await DB.get('kv', 'syvyys-' + a.id); if (o && o.p && !syv.osat[a.id]) { syvRuudukko(o); syv.osat[a.id] = o; } } catch (x) { }
  syv.ladattu = true; return syv.osat;
}
// Lataa alueen syvyyskäyrät. edistys(valmiit ruudut, kaikki ruudut, käyriä). Palauttaa tallennetun osan tai null, jos keskeytettiin.
async function syvyysLataa(alue, edistys, tila) {
  const b = alue.b, DX = 0.3, DY = 0.15, ruudut = [];
  for (let lo = b.lo0; lo < b.lo1 - 1e-9; lo += DX) for (let la = b.la0; la < b.la1 - 1e-9; la += DY) ruudut.push([+lo.toFixed(5), +la.toFixed(5), +Math.min(lo + DX, b.lo1).toFixed(5), +Math.min(la + DY, b.la1).toFixed(5)]);
  const nahty = new Set(), kayrat = []; let valmiit = 0, pisteita = 0, virheita = 0, i = 0;
  const kasittele = g => {
    for (const f of g.features || []) {
      const id = f.id || (f.properties && f.properties.IDENTIFIER), d = f.properties ? f.properties.VALDCO : null, geo = f.geometry;
      if (nahty.has(id)) continue; nahty.add(id); if (!geo || d == null) continue;      // ruutujen rajan ylittävä käyrä tulee usean ruudun mukana
      for (const l of geo.type === 'MultiLineString' ? geo.coordinates : geo.type === 'LineString' ? [geo.coordinates] : []) { if (l.length < 2) continue; const y = yksinkertaista(l.map(q => [q[1], q[0]]), 4); kayrat.push([d, y]); pisteita += y.length; }
    }
  };
  const hae = async (r, taso) => {
    const res = await fetch(SYV_URL + '&bbox=' + r.join(',') + ',EPSG:4326', AbortSignal.timeout ? { signal: AbortSignal.timeout(90000) } : undefined);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const g = await res.json(), saatu = (g.features || []).length;
    if (typeof g.numberMatched === 'number' && g.numberMatched > saatu && taso < 4) {      // palvelin katkaisi vastauksen: ruutu jaetaan neljään
      const mx_ = (r[0] + r[2]) / 2, my_ = (r[1] + r[3]) / 2;
      for (const q of [[r[0], r[1], mx_, my_], [mx_, r[1], r[2], my_], [r[0], my_, mx_, r[3]], [mx_, my_, r[2], r[3]]]) await hae(q, taso + 1);
      return;
    }
    kasittele(g);
  };
  const tyo = async () => {
    while (i < ruudut.length && !tila.peru) {
      const r = ruudut[i++]; let ok = false;
      for (let y = 0; y < 3 && !ok && !tila.peru; y++) { try { await hae(r, 0); ok = true; } catch (x) { await new Promise(v => setTimeout(v, 800 + 1200 * y)); } }
      if (!ok) virheita++;
      edistys(++valmiit, ruudut.length, kayrat.length);
    }
  };
  await Promise.all([tyo(), tyo()]);
  if (tila.peru) return null;
  if (!kayrat.length) throw new Error(virheita ? 'yhteys ei toiminut' : 'alueelta ei löytynyt syvyyskäyriä');
  const n = kayrat.length, alku = new Uint32Array(n + 1), s = new Float32Array(n), bb = new Float32Array(n * 4), p = new Float32Array(pisteita * 2); let o = 0;
  kayrat.forEach(([d, y], k) => {
    alku[k] = o / 2; s[k] = d; let a0 = 90, a1 = -90, o0 = 180, o1 = -180;
    for (const q of y) { p[o++] = q[1]; p[o++] = q[0]; if (q[0] < a0) a0 = q[0]; if (q[0] > a1) a1 = q[0]; if (q[1] < o0) o0 = q[1]; if (q[1] > o1) o1 = q[1]; }
    bb[k * 4] = o0; bb[k * 4 + 1] = a0; bb[k * 4 + 2] = o1; bb[k * 4 + 3] = a1;
  });
  alku[n] = o / 2;
  const osa = { haettu: Date.now(), n, pisteita, vajaa: virheita, p, alku, s, bb };
  await DB.put('kv', osa, 'syvyys-' + alue.id);
  await syvyysMuistiin(); syvRuudukko(osa); syv.osat[alue.id] = osa;
  return osa;
}
// Piirtää näkyvän alueen syvyyskäyrät. Kaukaa katsottaessa käyriä ei piirretä (niitä olisi liikaa), ja keskietäisyydellä pisteitä harvennetaan.
function piirraSyvyys(c, X, Y, W, H, z) {
  const cv = c.canvas; cv.dataset.syvyys = 0;
  if (!T.as.syvyys || z < 11) return;
  const lo0 = lonX(mx(lv.lon, z) - W / 2, z), lo1 = lonX(mx(lv.lon, z) + W / 2, z), la1 = latY(my(lv.lat, z) - H / 2, z), la0 = latY(my(lv.lat, z) + H / 2, z);
  if (c.canvas !== (kLive && kLive.cv)) return;      // vain päänäkymän kartalla
  const askel = z >= 13.5 ? 1 : z >= 12.3 ? 2 : 4, ryhmat = new Map(), nimet = []; let maara = 0; const kehys = ++syv.kehys;
  for (const osa of Object.values(syv.osat)) {
    if (!osa.ruudut) continue;
    for (let x = Math.floor(lo0 / SYV_RX); x <= Math.floor(lo1 / SYV_RX); x++) for (let y = Math.floor(la0 / SYV_RY); y <= Math.floor(la1 / SYV_RY); y++) {
      const l = osa.ruudut.get(x * 100000 + y); if (!l) continue;
      for (const k of l) {
        if (osa.leima[k] === kehys) continue; osa.leima[k] = kehys;
        if (osa.bb[k * 4] > lo1 || osa.bb[k * 4 + 2] < lo0 || osa.bb[k * 4 + 1] > la1 || osa.bb[k * 4 + 3] < la0) continue;
        const d = osa.s[k]; let polku = ryhmat.get(d); if (!polku) ryhmat.set(d, polku = new Path2D());
        const a = osa.alku[k], b = osa.alku[k + 1] - 1, P = osa.p;
        polku.moveTo(X(P[a * 2]), Y(P[a * 2 + 1]));
        for (let j = a + askel; j < b; j += askel) polku.lineTo(X(P[j * 2]), Y(P[j * 2 + 1]));
        polku.lineTo(X(P[b * 2]), Y(P[b * 2 + 1])); maara++;
        if (z >= 13 && b - a >= 12) { const m = (a + b) >> 1; nimet.push([X(P[m * 2]), Y(P[m * 2 + 1]), d]); }
      }
    }
  }
  c.lineJoin = c.lineCap = 'round';
  for (const [d, polku] of ryhmat) { c.lineWidth = d <= 3 ? 1.9 : 1.4; c.strokeStyle = syvVari(d); c.globalAlpha = 0.9; c.stroke(polku); }
  c.globalAlpha = 1;
  // syvyysluvut käyrien keskikohtiin, harvakseltaan (enintään yksi 90 pisteen ruutua kohti)
  if (nimet.length) {
    const varattu = new Set(); c.font = '700 11px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [x, y, d] of nimet) {
      if (x < 12 || y < 12 || x > W - 12 || y > H - 12) continue; const a = Math.floor(x / 90) + ',' + Math.floor(y / 90); if (varattu.has(a)) continue; varattu.add(a);
      pysty(c, x, y); c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.95)'; c.strokeText(d, x, y); c.fillStyle = syvVari(d); c.fillText(d, x, y); c.restore();
    }
  }
  cv.dataset.syvyys = maara;
}
async function paivitaSyvyysTila() {
  await syvyysMuistiin();
  for (const a of ALUEET) { const el = $('#syvTila-' + a.id), o = syv.osat[a.id]; if (el) el.textContent = o ? 'Ladattu ' + pvm(o.haettu) + ' · ' + o.n + ' käyrää' + (o.vajaa ? ' · ' + o.vajaa + ' ruutua jäi lataamatta, lataa uudelleen' : '') : 'Ei ladattu'; }
}
function syvyysIkkuna(alue) {
  if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
  const d = $('#dlg'), tila = { peru: false }, on = syv.osat[alue.id];
  d.innerHTML = '<form method="dialog"><h3>Syvyyskäyrät: ' + alue.nimi + '</h3><div class="pieni">Ladataan merikartan syvyyskäyrät alueelta ' + alue.kuvaus + '. Aineistoa siirretään kymmeniä megatavuja, ja lataus kestää puolesta minuutista muutamaan minuuttiin yhteyden mukaan. Laitteelle käyrät tallentuvat tiivistettyinä (Suomenlahti noin 7 Mt). Käytä Wi-Fiä ja pidä sovellus auki.' + (on ? ' Alueen käyrät on ladattu ' + pvm(on.haettu) + ' – uusi lataus korvaa ne.' : '') + '</div>' +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  d.querySelector('#lOk').onclick = async () => {
    const ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    d.querySelector('#lOk').disabled = true; d.querySelector('#lPeru').textContent = 'Keskeytä'; ed.hidden = false; naytto(true);
    let viesti;
    try {
      const o = await syvyysLataa(alue, (k, kaikki, kayria) => { ed.value = k / kaikki; tx.textContent = 'Ruutu ' + k + ' / ' + kaikki + ' · ' + kayria + ' käyrää'; }, tila);
      viesti = !o ? 'Keskeytetty. Aiemmin ladatut käyrät ovat ennallaan.' : 'Valmis: ' + o.n + ' syvyyskäyrää tallennettu laitteelle.' + (o.vajaa ? ' ' + o.vajaa + ' ruutua jäi lataamatta yhteysvirheen takia – lataa alue uudelleen.' : '') + (T.as.syvyys ? '' : ' Kytke käyrät näkyviin kartan tasonapista.');
    } catch (x) { viesti = 'Lataus ei onnistunut (' + (x && x.message || x) + '). Yritä hetken kuluttua uudelleen.'; }
    if (watchId == null) naytto(false);
    if (!d.contains(tx)) return;
    tx.textContent = viesti; d.querySelector('#lPeru').textContent = 'Sulje'; d.querySelector('#lOk').disabled = false; tila.peru = false; paivitaSyvyysTila(); karttaUudelleen();
  };
  d.showModal();
}
Object.assign(A, {
  syvyysLataa(id) { const a = ALUEET.find(x => x.id === id); if (a) syvyysIkkuna(a); },
  async syvyysPoista() {
    await syvyysMuistiin(); if (!Object.keys(syv.osat).length) { ilmoita('Syvyyskäyriä ei ole ladattu.'); return; }
    if (!confirm('Poistetaanko kaikki laitteelle ladatut syvyyskäyrät?')) return;
    for (const id of Object.keys(syv.osat)) await DB.del('kv', 'syvyys-' + id);
    syv.osat = {}; ilmoita('Syvyyskäyrät poistettu.'); piirra();
  }
});

// ---------- nopeusrajoitusalueet ----------
// Alueet tulevat väylätietojen mukana (vayla.rajoitukset). Jokaisella paikannuksella katsotaan, ollaanko rajoitusalueella.
const raj = { nyt: [], raja: null, yli: false, aika: 0, lat: 0, lon: 0, aani: 0 };
function rajoitusTarkista(f, pakko) {
  if (!T.as.rajoitus || !vayla || !vayla.rajoitukset) { raj.nyt = []; raj.yli = false; return; }
  if (pakko || Date.now() - raj.aika > 1500 || etaisyys(raj.lat, raj.lon, f.lat, f.lon) > 15) {       // aluehaku korkeintaan 1,5 s välein tai 15 m siirtymän jälkeen
    raj.aika = Date.now(); raj.lat = f.lat; raj.lon = f.lon; raj.nyt = rajoitusKohdassa(vayla.rajoitukset, f.lat, f.lon, Date.now());
    raj.raja = raj.nyt.length && raj.nyt[0].k ? raj.nyt[0].k : null;
  }
  const nopeusKmh = (f.sog || 0) * 3.6, yli = raj.raja != null && nopeusKmh > raj.raja * 1.05 + 0.5;      // pieni vara GPS:n heilunnalle
  if (yli && (!raj.yli || Date.now() - raj.aani > 20000)) { raj.aani = Date.now(); halyta('Nopeusrajoitus ' + raj.raja + ' km/h – ajat ' + n(nopeusKmh, 0) + ' km/h' + (raj.nyt[0].n ? ' (' + raj.nyt[0].n + ')' : '')); }
  raj.yli = yli;
}
let aaniK = null;
function halyta(teksti) {
  ilmoita(teksti);
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (x) { }
  try {      // kaksi lyhyttä piippausta; selain sallii äänen vasta, kun sivua on kosketettu
    aaniK = aaniK || new (window.AudioContext || window.webkitAudioContext)();
    for (const alku of [0, 0.3]) { const o = aaniK.createOscillator(), g = aaniK.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(aaniK.destination); o.start(aaniK.currentTime + alku); o.stop(aaniK.currentTime + alku + 0.2); }
  } catch (x) { }
}
async function paivitaRajTila() {
  await vaylatMuistiin();
  const el = $('#rajTila'); if (!el) return;
  el.textContent = vayla && vayla.rajoitukset ? 'Ladattu ' + vayla.rajoitukset.length + ' rajoitusaluetta, joista ' + vayla.rajoitukset.filter(a => a.k).length + ' nopeusrajoituksia. Tiedot haettu ' + pvm(vayla.haettu) + '.' : 'Rajoitusalueita ei ole vielä ladattu. Ne tulevat väylätietojen mukana – paina alla olevaa nappia.';
}
Object.assign(A, {
  rajoitusTiedot() {
    if (!raj.nyt.length) return; const d = $('#dlg');
    d.innerHTML = '<form method="dialog"><h3>Rajoitukset tässä kohdassa</h3>' + raj.nyt.map(a => '<div class="kortti" style="margin:0"><b>' + e(a.n || 'Nimetön alue') + '</b><div>' + e(a.t) + (a.k ? ': <b>' + a.k + ' km/h</b> (' + n(a.k / 1.852) + ' kn)' : '') + '</div>' +
      (a.l ? '<div class="pieni">' + e(a.l) + '</div>' : '') + (a.e ? '<div class="pieni">Voimassa ' + pvm(a.e - 864e5) + ' asti.</div>' : '') + (a.p ? '<div class="pieni">Poikkeukset: ' + e(a.p) + '</div>' : '') + '</div>').join('') +
      '<div class="pieni">Lähde: Väyläviraston avoin data. Vesillä olevat merkit ja viranomaisen päätökset ratkaisevat.</div><div class="napit"><button type="button" class="nappi paa" id="sSulje">Sulje</button></div></form>';
    d.querySelector('#sSulje').onclick = () => d.close(); d.showModal();
  },
  async rajoitusLataa() {
    if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
    try { await paivitaVaylat(t => ilmoita(t)); ilmoita('Rajoitusalueet ladattu: ' + vayla.rajoitukset.length + ' aluetta.'); } catch (x) { ilmoita('Lataus ei onnistunut. Yritä hetken kuluttua uudelleen.'); }
    piirra();
  }
});

// ---------- kallistusmittari ----------
const kall = { paalla: false, u: null, heel: null, trim: null, aika: 0, piirto: 0 };
function kallKuuntele(ev) {
  if (ev.beta == null || ev.gamma == null) return;
  const u = ylosVektori(ev.beta, ev.gamma); kall.u = u;
  if (!T.as.kallNolla) { T.as.kallNolla = u; talletaT(); }           // ensimmäinen lukema on nollakohta, kunnes käyttäjä nollaa itse
  const k = kallistus(u, T.as.kallNolla, (screen.orientation && screen.orientation.angle) || 0); if (!k) return;
  // tasoitus: tärinä ja aallokko eivät saa heiluttaa lukemaa
  kall.heel = kall.heel == null ? k.kallistus : kall.heel + 0.15 * (k.kallistus - kall.heel);
  kall.trim = kall.trim == null ? k.trimmi : kall.trim + 0.15 * (k.trimmi - kall.trim);
  kall.aika = Date.now();
  if (tal.tila === 'matka' && Math.abs(kall.heel) > (tal.m.kall || 0)) tal.m.kall = Math.abs(kall.heel);
  paivitaKall();
}
// hiljaa = ei ilmoituksia (automaattinen käynnistys sovelluksen avautuessa)
async function kallPaalle(hiljaa) {
  const sano = t => { if (!hiljaa) ilmoita(t); };
  try {
    if (typeof DeviceOrientationEvent === 'undefined') { sano('Tässä laitteessa ei ole asentoanturia.'); return false; }
    if (DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { sano('Lupaa liikeantureihin ei annettu.'); return false; } }
    window.removeEventListener('deviceorientation', kallKuuntele); window.addEventListener('deviceorientation', kallKuuntele); kall.paalla = true; return true;
  } catch (x) { sano('Asentoanturia ei saatu käyttöön.'); return false; }
}
// Kallistusmittari käyntiin sovelluksen avautuessa, kun se on asetuksissa päällä.
// iPhone ja iPad: anturilupa pitää pyytää jokaisella käynnistyskerralla, ja laite hyväksyy pyynnön vain napautuksesta (click tai touchend –
// pelkkä kosketuksen alku ei kelpaa). Siksi lupa pyydetään ensimmäisestä napautuksesta ja yritetään tarvittaessa uudelleen seuraavista.
function kallAutomaatti() {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (!DeviceOrientationEvent.requestPermission) { kallPaalle(true); return; }
  let yrityksia = 0;
  const lopeta = () => { document.removeEventListener('click', yrita, true); document.removeEventListener('touchend', yrita, true); };
  const yrita = async () => {
    if (kall.paalla || !T.as.kallistus) { lopeta(); return; }
    if (kall.pyytaa) return; kall.pyytaa = true;
    const ok = await kallPaalle(true); kall.pyytaa = false;
    if (ok) lopeta();
    else if (++yrityksia >= 4) { lopeta(); ilmoita('Kallistusmittari ei saanut lupaa liikeantureihin. Salli se kysyttäessä tai kytke mittari uudelleen kartan valikosta.'); }
    paivitaKall(true);
  };
  document.addEventListener('click', yrita, true); document.addEventListener('touchend', yrita, true);
}
function kallPois() { window.removeEventListener('deviceorientation', kallKuuntele); kall.paalla = false; kall.heel = kall.trim = null; }
const kallTeksti = () => { const h = Math.round(kall.heel); return [Math.abs(h) + '°', h > 0 ? 'oikealle' : h < 0 ? 'vasemmalle' : 'suorassa']; };
function paivitaKall(pakko) {
  // näyttöä päivitetään enintään 5 kertaa sekunnissa; viimeisin lukema näytetään aina
  if (!pakko && Date.now() - kall.piirto < 200) { if (!kall.ajastin) kall.ajastin = setTimeout(() => { kall.ajastin = 0; paivitaKall(true); }, 220); return; }
  kall.piirto = Date.now();
  const tuore = kall.heel != null && Date.now() - kall.aika < 5000, r = $('#kKalRivi');
  if (r) {
    r.hidden = !T.as.kallistus;
    if (T.as.kallistus) { const t = tuore ? kallTeksti() : ['–', kall.paalla ? 'ei anturitietoa' : 'napauta näyttöä']; $('#kKal').textContent = t[0]; $('#kKalS').textContent = t[1]; $('#kKalViiva').style.transform = 'rotate(' + (tuore ? rajaa(kall.heel, -60, 60) : 0) + 'deg)'; }
  }
  const s = $('#kallNyt');
  if (s) s.textContent = !T.as.kallistus ? '' : tuore ? 'Nyt: kallistus ' + kallTeksti().join(' ') + ', keula ' + (Math.round(kall.trim) > 0 ? '+' : '') + Math.round(kall.trim) + '°' : 'Anturilta ei tule tietoa. Tietokoneessa anturia ei ole; puhelimessa sivun pitää olla https-osoitteessa.';
}
Object.assign(A, {
  kallNolla() {
    if (!T.as.kallistus) { ilmoita('Ota kallistusmittari ensin käyttöön.'); return; }
    if (!kall.u || Date.now() - kall.aika > 5000) { ilmoita('Anturilta ei tule tietoa, nollaus ei onnistu.'); return; }
    T.as.kallNolla = kall.u; kall.heel = kall.trim = 0; talletaT(); paivitaKall(true); ilmoita('Kallistus nollattu.');
  }
});

async function palauta(teksti) {
  let o; try { o = JSON.parse(teksti); } catch (x) { o = null; }
  if (!o || o.lokikirja !== 1 || !o.tila || !Array.isArray(o.matkat)) { ilmoita('Tiedosto ei ole Kippari Pron varmuuskopio.'); return false; }
  if (!confirm('Palautus korvaa kaikki nykyiset tiedot (' + matkat.length + ' matkaa) kopion tiedoilla (' + o.matkat.length + ' matkaa). Jatketaanko?')) return false;
  await DB.tyhjenna('matkat'); await DB.tyhjenna('jaljet');
  for (const m of o.matkat) await DB.put('matkat', m);
  for (const id in o.jaljet || {}) await DB.put('jaljet', o.jaljet[id], id);
  const u = uusiTila(); T = Object.assign(u, o.tila); T.as = Object.assign(uusiTila().as, o.tila.as, { seuranta: watchId != null }); karttaOletus(o.tila.as);
  matkat = o.matkat; await talletaT(); piirra(); ilmoita('Tiedot palautettu.'); return true;
}

// ---------- käynnistys ----------
async function alku() {
  await DB.avaa();
  const u = uusiTila(), s = await DB.get('kv', 'tila') || {};
  T = Object.assign(u, s); T.as = Object.assign(uusiTila().as, s.as); karttaOletus(s.as); T.vene = Object.assign(uusiTila().vene, s.vene);
  matkat = await DB.all('matkat');
  tal = new Tallennin({ auto: T.as.auto, pysMin: T.as.pysMin });
  const k = await DB.get('kv', 'kesken');
  if (k && k.tila === 'matka' && k.m) {          // sovellus suljettiin kesken matkan
    tal.tuo(k);
    const viim = k.viime ? k.viime.t : k.m.alku;
    if (Date.now() - viim > 30 * 60000) await tallennaMatka(tal.lopeta(viim));
  }
  $('#valikko').addEventListener('click', ev => { const b = ev.target.closest('button[data-n]'); if (b) { nakyma = b.dataset.n; valinta = null; piirra(); window.scrollTo(0, 0); } });
  $('#sisalto').addEventListener('click', ev => { const el = ev.target.closest('[data-a]'); if (el && A[el.dataset.a]) A[el.dataset.a](el.dataset.id); });
  $('#sisalto').addEventListener('change', async ev => {
    const el = ev.target, c = el.dataset.c;
    if (c === 'vuosi') { vuosi = el.value; piirra(); }
    else if (c === 'kartta') { T.as.kartta = el.value; await talletaT(); piirra(); }
    else if (c === 'tuuli' || c === 'tutka' || c === 'ais' || c === 'satamat' || c === 'luiskat' || c === 'saunat') { T.as[c] = el.checked; await talletaT(); piirra(); }
    else if (c === 'rajoitus') { T.as.rajoitus = el.checked; if (!el.checked) { raj.nyt = []; raj.yli = false; } await talletaT(); piirra(); }
    else if (c === 'kallistus') { T.as.kallistus = el.checked && await kallPaalle(); if (!T.as.kallistus) kallPois(); await talletaT(); piirra(); }
    else if (c === 'yksikko') { T.as.yksikko = el.value; await talletaT(); piirra(); }
    else if (c === 'auto') { T.as.auto = tal.as.auto = el.checked; await talletaT(); paivitaLive(); }
    else if (c === 'pysMin') { T.as.pysMin = tal.as.pysMin = +el.value; await talletaT(); }
    else if (el.id === 'tuoTiedosto' && el.files[0]) palauta(await el.files[0].text());
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (tal.tila === 'matka') DB.put('kv', tal.vie(), 'kesken'); talletaT(); }
    else if (watchId != null) seurantaPaalle(true);      // paikannus ja näytön lukitus käyntiin uudelleen
  });
  window.addEventListener('online', () => { merkit(); paivitaSaat(); for (const [k, m] of muisti) if (m.ei || m.eiDb) muisti.delete(k); karttaUudelleen(); });
  window.addEventListener('offline', merkit);
  window.addEventListener('resize', () => { document.documentElement.style.setProperty('--ylak', $('#yla').offsetHeight + 'px'); karttaUudelleen(); });
  vaylatMuistiin().then(v => { if (v && kLive) kLive.pyyda(); }).catch(() => { });
  if (T.as.syvyys) syvyysMuistiin().then(() => { if (kLive) kLive.pyyda(); }).catch(() => { });
  if (T.as.seuranta && !/[?&]testi/.test(location.search)) seurantaPaalle(true);
  // Kallistusmittari käyntiin. iPhonessa anturilupa vaatii kosketuksen, joten siellä odotetaan ensimmäistä napautusta.
  if (T.as.kallistus) kallAutomaatti();
  piirra(); paivitaSaat();
  if ('serviceWorker' in navigator && !/[?&]testi/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__valmis = true;
}
alku().catch(x => { $('#sisalto').innerHTML = '<div class="kortti">Sovellus ei käynnistynyt: ' + e(x && x.message || x) + '</div>'; window.__virhe = String(x && x.stack || x); });
