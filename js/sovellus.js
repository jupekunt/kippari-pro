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
  return { vene: { nimi: '', tunnit0: 0, mpk0: 0, syvays: null, nopeus: 10 }, koti: null, reitit: [], paikat: [], tankkaukset: [], kulut: [],
    huollot: HUOLLOT.map((h, i) => ({ id: 'h' + i, nimi: h[0], valiH: h[1], valiKk: h[2], tehtyPvm: null, tehtyH: null })),
    as: { auto: true, pysMin: 15, seuranta: false, kartta: 'meri', yksikko: 'kn', kallistus: false, kallNolla: null, rajoitus: true, reittiSeuranta: true, reittiSivu: 200, suuntaviiva: true, tuuli: false, ais: false, satamat: false }, saajono: [], kopio: null };
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
  return '<div class="kokok' + (reitti || omaR ? ' onreitti' : '') + '"><canvas class="kartta taysi" id="lKartta"></canvas>' +
    '<div class="kyla"><div class="kmittari"><div class="knop"><b id="kNopeus">–</b><span>' + NY() + '</span></div><div class="ksuu"><b id="kSuunta">–</b><span id="kIlmans"></span></div><div class="kraj" id="kRaja" data-a="rajoitusTiedot" hidden><i id="kRajaLuku"></i><span id="kRajaS"></span></div><div class="kkal" id="kKalRivi" hidden><i id="kKalViiva"></i><b id="kKal">–</b><span id="kKalS"></span></div></div><button class="ktuuli" id="kTuuli" data-a="tuuliAika" hidden title="Vaihda ennusteen ajankohtaa"><b></b><span></span></button></div>' +
    '<div class="knapit"><button data-a="keskita" id="lKarttaK" aria-label="Keskitä veneeseen" title="Keskitä veneeseen">' + KESKITA + '</button>' +
    '<button data-a="zoom" data-id="1" aria-label="Lähennä">+</button><button data-a="zoom" data-id="-1" aria-label="Loitonna">−</button>' +
    '<button data-a="reitti" aria-label="Reittisuunnittelu" title="Reittisuunnittelu"><svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5"/></svg></button>' +
    '<button data-a="kartat" aria-label="Karttapohja ja lataus" title="Karttapohja ja lataus"><svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></svg></button></div>' +
    '<button class="kais" id="kAis" data-a="aisNyt" hidden title="Päivitä AIS-tiedot nyt"></button><button class="ktila" id="kTila" data-a="matkaSivu"></button>' + (omaR ? omaPalkki() : reittiPalkki()) + '<div class="ktekija">' + kartta().tekija + '</div></div>';
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
    [["tuuli","Tuuli ja sää","Tuulinuolet, puuskat, lämpötila ja aallonkorkeus kartalla; ennuste 24 tuntia eteenpäin."],["ais","Muut alukset (AIS)","Lähialueen alukset kartalla. Päivittyy noin minuutin välein."],["satamat","Satamat ja polttoaineasemat","Suomenlahden, Saaristomeren ja Selkämeren venesatamat palvelutietoineen. Tiedot tulevat sovelluksen mukana, joten ne näkyvät myös ilman verkkoa."]].map(k => '<label class="kytkin"><span>' + k[1] + '<br><span class="pieni">' + k[2] + '</span></span><input type="checkbox" data-c="' + k[0] + '"' + (T.as[k[0]] ? ' checked' : '') + '></label>').join('') +
    '<div class="pieni">Lähteet: sää Open-Meteo (säämallin ennuste, ei mittaus), AIS Fintraffic / Digitraffic, satamat OpenStreetMap. Haettaessa palvelut näkevät, mitä kartan aluetta katsot.</div>' +
    '<div class="pieni" id="satamaTila">' + (st => st ? 'Satamatiedot: ' + st.lista.length + ' kohdetta, päivätty ' + pvm(st.haettu) + '.' : '')(lisa.satamat || (typeof SATAMAT_PAKETTI !== 'undefined' ? SATAMAT_PAKETTI : null)) + '</div>' +
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
  const f = { kartta: nKartta, matka: nMatka, loki: nLoki, yksi: nYksi, polttoaine: nKulut, huolto: nHuolto, lisaa: nLisaa }[nakyma] || nKartta;
  $('#sisalto').classList.toggle('taysi', nakyma === 'kartta');
  document.documentElement.style.setProperty('--ylak', $('#yla').offsetHeight + 'px');
  $('#sisalto').innerHTML = f();
  document.querySelectorAll('#valikko button').forEach(b => b.classList.toggle('on', b.dataset.n === (nakyma === 'yksi' ? 'loki' : nakyma)));
  merkit();
  lk = null; paivitaLive(); paivitaKall(true);
  if (nakyma === 'yksi' && $('#kartta')) DB.get('jaljet', valittu).then(p => { if (!p || !p.length || !$('#kartta')) return; jalki = p; const uusi = !dv; if (uusi) dv = { lat: 0, lon: 0, z: 10, seuraa: false }; kYksi = new Kartta($('#kartta'), dv); kYksi.pts = p; if (uusi) kYksi.sovita(p); kYksi.piirra(); if ($('#kayra')) piirraKayra($('#kayra'), p); });
  if (nakyma === 'lisaa') { paivitaKarttaTila(); paivitaRajTila(); paivitaGpsTila(); }
}

// ---------- kartta ----------
// Karttapohjat. Merikartta on Traficomin avoin rasterimerikartta (WMTS), maastokartta OpenStreetMap.
// Merikartan palat tallennetaan laitteelle (IndexedDB "laatat"), joten katsottu tai ladattu alue toimii ilman verkkoa.
const KARTAT = {
  meri: { id: 'meri', nimi: 'Merikartta', maxZ: 15, talteen: true, tekija: 'Merikartta © Traficom, CC BY 4.0. Ei navigointiin.',
    url: (z, x, y) => 'https://julkinen.traficom.fi/rasteripalvelu/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=Traficom%3A' + (z < 10 ? 'Yleiskartat%20250k' : 'Merikarttasarjat') + '%20public&style=&tilematrixset=WGS84_Pseudo-Mercator&tilematrix=WGS84_Pseudo-Mercator%3A' + z + '&tilerow=' + y + '&tilecol=' + x + '&format=image%2Fpng' },
  satama: { id: 'satama', minZ: 14, talteen: true, url: (z, x, y) => 'https://julkinen.traficom.fi/rasteripalvelu/wmts?service=WMTS&request=GetTile&version=1.0.0&layer=Traficom%3ASatamakartat&style=&tilematrixset=WGS84_Pseudo-Mercator&tilematrix=WGS84_Pseudo-Mercator%3A' + z + '&tilerow=' + y + '&tilecol=' + x + '&format=image%2Fpng' },
  maa: { id: 'maa', nimi: 'Maastokartta', maxZ: 17, talteen: false, tekija: 'Kartta © OpenStreetMapin tekijät. Näkyy vain verkossa.', url: (z, x, y) => 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png' }
};
KARTAT.meri.paalle = KARTAT.satama;
const kartta = () => T.as.kartta === 'maa' ? KARTAT.maa : KARTAT.meri;
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
    '<div class="ktyo"><select data-c="kartta">' + ['meri', 'maa'].map(k => '<option value="' + k + '"' + (KARTAT[k] === kartta() ? ' selected' : '') + '>' + KARTAT[k].nimi + '</option>').join('') + '</select>' +
    '</div><div class="pieni">' + kartta().tekija + '</div></div>';
}

// Karttapalat: muisti -> laitteen tallennus -> verkko. Palauttaa kuvan, null (ei saatavilla) tai undefined (haku kesken).
const muisti = new Map();
function haeLaatta(K, z, x, y, lataa) {
  // lataa: true / undefined = laitteelta tai verkosta, 'db' = vain laitteelle tallennettu (ei verkkohakua), false = vain jo muistissa oleva
  const avain = K.id + '/' + z + '/' + x + '/' + y, vainDb = lataa === 'db'; let m = muisti.get(avain);
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
  const K = KARTAT.meri; let i = 0, ok = 0, ennestaan = 0, puuttuu = 0;
  const tyo = async () => {
    while (i < lista.length && !tila.peru) {
      const [z, x, y] = lista[i++], avain = 'meri/' + z + '/' + x + '/' + y;
      try {
        if (await DB.onko('laatat', avain)) ennestaan++;
        else { const b = await haeKuva(K.url(z, x, y), 4, true); if (b) { await DB.put('laatat', b, avain); ok++; } else puuttuu++; }
        const S = K.paalle, sa = 'satama/' + z + '/' + x + '/' + y;       // tarkimmilla tasoilla myös satamakartta
        if (z >= S.minZ && !(await DB.onko('laatat', sa))) {
          // tasolla 15 satamakartta haetaan vain, jos tason 14 emopalassa on karttaa: satamakarttoja on vain pienillä alueilla
          const emo = z > S.minZ ? await DB.get('laatat', 'satama/' + (z - 1) + '/' + (x >> 1) + '/' + (y >> 1)) : null;
          if (z === S.minZ || (emo && emo.size > TYHJA_PALA) || tila.kaikkiSatamat) { const b = await haeKuva(S.url(z, x, y), 4, true); if (b) await DB.put('laatat', b, sa); }
        }
      } catch (x) { puuttuu++; if (x && x.name === 'QuotaExceededError') { tila.taynna = true; tila.peru = true; } }
      edistys(ok + ennestaan + puuttuu, lista.length);
    }
  };
  await Promise.all([tyo(), tyo(), tyo(), tyo()]);
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
  pyyda() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.piirra(); }); }
  siirra(dx, dy) { const v = this.v; v.lon = lonX(mx(v.lon, v.z) + dx, v.z); v.lat = rajaa(latY(my(v.lat, v.z) + dy, v.z), -80, 84); v.seuraa = false; this.pyyda(); if (this.onMuutos) this.onMuutos(); }
  // kx, ky = kohta, jonka ympäri zoomataan (sormien keskipiste); seuratessa aina veneen ympäri
  zoomaa(dz, kx, ky) {
    const v = this.v, W = this.cv.clientWidth, H = this.cv.clientHeight, z1 = rajaa(v.z + dz, 4, kartta().maxZ + 1.5);
    if (z1 === v.z) return;
    // Zoomataan sormien tai hiiren kohtaan. Venettä seurataan edelleen vain, jos kohta on veneen vieressä.
    if (kx != null && v.seuraa && Math.hypot(kx - W / 2, ky - H / 2) > 70) { v.seuraa = false; if (this.onMuutos) this.onMuutos(); }
    if (kx == null || v.seuraa) v.z = z1;
    else { const lon = lonX(mx(v.lon, v.z) + kx - W / 2, v.z), lat = latY(my(v.lat, v.z) + ky - H / 2, v.z); v.z = z1; v.lon = lonX(mx(lon, z1) - (kx - W / 2), z1); v.lat = latY(my(lat, z1) - (ky - H / 2), z1); }
    this.pyyda();
  }
  _kuuntele() {
    const cv = this.cv, os = new Map(); let veto = false;
    const kohta = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
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
      if (os.size === 1 && !veto && napautusCb && this === kLive) { const k = kohta(e), v = this.v, W = cv.clientWidth, H = cv.clientHeight; napautusCb(latY(my(v.lat, v.z) + k[1] - H / 2, v.z), lonX(mx(v.lon, v.z) + k[0] - W / 2, v.z)); }
      else if (os.size === 1 && !veto && this === kLive) { const k = kohta(e); karttaNapautus(k[0], k[1]); }
      loppu(e);
    });
    cv.addEventListener('pointercancel', loppu);
    cv.addEventListener('wheel', e => { e.preventDefault(); const k = kohta(e); this.zoomaa(-e.deltaY / 300, k[0], k[1]); }, { passive: false });
  }
  piirra() {
    const cv = this.cv, v = this.v, K = kartta(), W = cv.clientWidth, H = cv.clientHeight; if (!W || !cv.isConnected) return;
    const dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    v.z = rajaa(v.z, 4, K.maxZ + 1.5);
    // Tarkempaan tasoon vaihdetaan jo hieman ennen puoliväliä, jotta kuva pysyy terävänä.
    const zi = rajaa(Math.round(v.z + .25), 3, K.maxZ), L = 256 * 2 ** (v.z - zi), ox = mx(v.lon, v.z) - W / 2, oy = my(v.lat, v.z) - H / 2, n = 2 ** zi; let piirretty = 0, tarkkoja = 0;
    for (let tx = Math.floor(ox / L); tx <= Math.floor((ox + W) / L); tx++) for (let ty = Math.floor(oy / L); ty <= Math.floor((oy + H) / L); ty++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      const dx = tx * L - ox, dy = ty * L - oy, im = haeLaatta(K, zi, tx, ty);
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
    cv.dataset.laatat = piirretty; cv.dataset.tarkkoja = tarkkoja;
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
    const b = this.vene;
    if (!b) { if (pts.length) piste(pts[pts.length - 1], '#c0392b'); return; }
    // Suuntaviiva: punainen katkoviiva veneen keulasta kulkusuuntaan ruudun reunaan asti. Näytetään vain, kun sijainti on tuore ja kulkusuunta tiedossa.
    const viiva = !!(this.suuntaviiva && b.suunta != null && !b.himmea); cv.dataset.suuntaviiva = viiva ? '1' : '0';
    if (viiva) {
      const x0 = X(b.lon), y0 = Y(b.lat), pit = Math.hypot(W, H), dx = Math.sin(b.suunta * RAD), dy = -Math.cos(b.suunta * RAD);
      for (const [w, vari, katko] of [[7.5, 'rgba(255,255,255,.9)', []], [3.6, '#e01b24', [13, 9]]]) { c.setLineDash(katko); c.lineCap = 'butt'; c.lineWidth = w; c.strokeStyle = vari; c.beginPath(); c.moveTo(x0 + dx * 20, y0 + dy * 20); c.lineTo(x0 + dx * pit, y0 + dy * pit); c.stroke(); }
      c.setLineDash([]); c.lineCap = 'round';
    }
    // Oma vene ylhäältä päin, keula kulkusuuntaan.
    c.save(); c.translate(X(b.lon), Y(b.lat)); c.rotate((b.suunta || 0) * RAD);
    c.beginPath(); c.moveTo(0, -19); c.bezierCurveTo(10, -9, 10, 5, 8, 15); c.lineTo(-8, 15); c.bezierCurveTo(-10, 5, -10, -9, 0, -19); c.closePath();
    c.fillStyle = b.himmea ? '#7d8a94' : '#0f2a43'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    c.beginPath(); c.moveTo(0, -8); c.lineTo(4.5, 0); c.lineTo(4.5, 9); c.lineTo(-4.5, 9); c.lineTo(-4.5, 0); c.closePath(); c.fillStyle = '#fff'; c.fill();
    c.restore();
  }
}
const seuraaMerkki = () => { const b = $('#lKarttaK'); if (b) b.classList.toggle('on', lv.seuraa); };
function karttaUudelleen() {
  if (nakyma === 'yksi' && kYksi && kYksi.cv.isConnected) kYksi.piirra();
  if (nakyma === 'kartta') { lk = null; liveKartta(); }
}
// Päänäkymän kartta: aina näkyvissä, oma vene ja kuljettu matka punaisena viivana.
// Veneen sijainti päivittyy korkeintaan 2 s välein ja vain kun on liikuttu 10 m.
function liveKartta() {
  const cv = $('#lKartta'); if (!cv) return;
  if (!kLive || kLive.cv !== cv) { kLive = new Kartta(cv, lv); kLive.onMuutos = seuraaMerkki; lk = null; }
  kLive.reitti = reitti && !omaR ? reitti.r.pisteet : null; kLive.lisat = piirraLisat; kLive.suuntaviiva = T.as.suuntaviiva; kLive.reittiKohta = !omaR && seurPaalla() && seur.aktiivinen ? seur.k : null;      // omaa reittiä muokatessa näytetään vain muokattava reitti
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
  if (f.cog != null && !isNaN(f.cog) && f.sog > 0.5) kulku = f.cog;
  else if (ed) kulku = (Math.atan2(Math.sin((f.lon - ed.lon) * RAD) * Math.cos(f.lat * RAD), Math.cos(ed.lat * RAD) * Math.sin(f.lat * RAD) - Math.sin(ed.lat * RAD) * Math.cos(f.lat * RAD) * Math.cos((f.lon - ed.lon) * RAD)) / RAD + 360) % 360;
  lk = { aika: Date.now(), lat: f.lat, lon: f.lon }; T.sij = [f.lat, f.lon];
  if (lv.alussa) { lv.z = 12; lv.alussa = false; }
  if (lv.seuraa) { lv.lat = f.lat; lv.lon = f.lon; }
  kLive.pts = tal.m ? tal.m.pisteet.concat([[f.t, f.lat, f.lon, f.sog]]) : [];
  kLive.vene = { lat: f.lat, lon: f.lon, suunta: kulku };
  kLive.piirra(); seuraaMerkki();
}

// Kartta-alueen lataus talteen: päänäkymässä näkyvä alue valitulla tarkkuudella.
const LAATTARAJA = 4000, LAATTAKOKO = 0.09;      // Mt / pala, arvio koelatauksista
function lataaAlueIkkuna() {
  if (kartta() !== KARTAT.meri) { ilmoita('Vain merikartan voi ladata talteen. Vaihda karttapohjaksi Merikartta.'); return; }
  if (!kLive) return;
  if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
  const W = kLive.cv.clientWidth, H = kLive.cv.clientHeight, v = lv, xk = mx(v.lon, v.z), yk = my(v.lat, v.z);
  const b = { lo0: lonX(xk - W / 2, v.z), lo1: lonX(xk + W / 2, v.z), la1: latY(yk - H / 2, v.z), la0: latY(yk + H / 2, v.z) };
  const tasot = [[11, 'Yleiskuva', 'reittien suunnitteluun'], [13, 'Tarkka', 'väylät ja merimerkit erottuvat'], [15, 'Tarkin', 'satamat ja kapeikot']].map(t => t.concat(laattaLista(b, 8, t[0]).length));
  const d = $('#dlg'), tila = { peru: false };
  d.innerHTML = '<form method="dialog"><h3>Lataa kartta talteen</h3><div class="pieni">Talteen ladataan kartalla nyt näkyvä alue, ja se näkyy sen jälkeen ilman verkkoa. Loitonna tai siirrä karttaa ensin, jos haluat eri alueen. Koot ovat arvioita.</div>' +
    tasot.map((t, i) => '<label class="cb"><input type="radio" name="taso" value="' + t[0] + '"' + (t[3] > LAATTARAJA ? ' disabled' : '') + '><span><b>' + t[1] + '</b> – ' + t[2] + '<br><span class="pieni">' + (t[3] > LAATTARAJA ? 'liian suuri alue (' + t[3] + ' palaa) – lähennä karttaa' : t[3] + ' palaa, noin ' + Math.max(1, Math.round(t[3] * LAATTAKOKO)) + ' Mt') + '</span></span></label>').join('') +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  const eka = [...d.querySelectorAll('input[name=taso]')].filter(x => !x.disabled); if (eka.length) eka[Math.min(1, eka.length - 1)].checked = true; else d.querySelector('#lOk').disabled = true;
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  d.querySelector('#lOk').onclick = async () => {
    const valinta = d.querySelector('input[name=taso]:checked'); if (!valinta) return;
    const lista = laattaLista(b, 8, +valinta.value), ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    d.querySelector('#lOk').disabled = true; d.querySelectorAll('input[name=taso]').forEach(x => x.disabled = true); d.querySelector('#lPeru').textContent = 'Keskeytä'; ed.hidden = false;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
    const r = await lataaLaatat(lista, (n, kaikki) => { ed.value = n / kaikki; tx.textContent = n + ' / ' + kaikki + ' palaa'; }, tila);
    tx.textContent = (tila.peru ? 'Keskeytetty. ' : 'Valmis. ') + 'Ladattu ' + r.ok + ', ennestään tallessa ' + r.ennestaan + (r.puuttuu ? ', ei saatavilla ' + r.puuttuu + ' (alueelta ei ole karttaa tai yhteys katkesi)' : '') + '.';
    d.querySelector('#lPeru').textContent = 'Sulje'; karttaUudelleen();
  };
  d.showModal();
}
// Kokonaiset merialueet kerralla talteen: merikartta ja alueen väylätiedot. Jo ladatut palat ohitetaan, joten keskeytynyt lataus jatkuu samasta napista.
// b = alueen rajat, avain = väylätietojen tallennusavain (kv), vaylaMt = väylätietojen kokoarvio.
const ALUEET = [
  { id: 'suomenlahti', nimi: 'Suomenlahti', kuvaus: 'Hangosta Virolahdelle', avain: 'vaylat', vaylaMt: 15, b: { lo0: 22.4, lo1: 28.0, la0: 59.55, la1: 60.70 } },
  { id: 'saaristomeri', nimi: 'Saaristomeri', kuvaus: 'Hangon länsipuolelta Kustaviin ja Kökariin (Turku, Parainen, Nauvo, Korppoo, Utö)', avain: 'vaylat-saaristomeri', vaylaMt: 10, b: { lo0: 20.6, lo1: 22.4, la0: 59.65, la1: 60.70 } },
  { id: 'selkameri', nimi: 'Selkämeri', kuvaus: 'Uudestakaupungista Kaskisiin', avain: 'vaylat-selkameri', vaylaMt: 5, b: { lo0: 20.6, lo1: 21.85, la0: 60.70, la1: 62.60 } }
];
const SUOMENLAHTI = ALUEET[0].b;
const alueNapit = luokka => ALUEET.map(a => '<button' + (luokka === 'dlg' ? ' type="button" class="nappi"' : ' class="nappi' + (a === ALUEET[0] ? ' paa' : '') + '" data-a="lataaKokoAlue" data-id="' + a.id + '"') + ' data-alue="' + a.id + '">Lataa ' + a.nimi + ': kartta ja väylätiedot</button>').join('');
// Tarkat tasot (14 ja 15) koko alueelta vain sieltä, missä kartassa on sisältöä: noin kaksi kolmasosaa paloista on tyhjää avomerta tai maata,
// ja tyhjän palan tunnistaa tiedoston koosta. Taso kerrallaan: ladataan niiden palojen neljä alipalaa, joissa on karttaa.
const TYHJA_PALA = 1500;      // tavua: tätä pienempi kuva on tyhjä (tyhjä pala on noin 800 tavua)
async function lataaTarkat(b, maxZ, edistys, tila) {
  let emot = laattaLista(b, 13, 13); const yht = { ok: 0, ennestaan: 0, puuttuu: 0 };
  for (let z = 14; z <= maxZ && !tila.peru; z++) {
    const lista = [];
    for (let i = 0; i < emot.length && !tila.peru; i += 24) {
      const koot = await Promise.all(emot.slice(i, i + 24).map(t => DB.get('laatat', 'meri/' + t[0] + '/' + t[1] + '/' + t[2]).then(k => k ? k.size : 0, () => 0)));
      koot.forEach((koko, j) => { if (koko > TYHJA_PALA) { const t = emot[i + j]; for (const dx of [0, 1]) for (const dy of [0, 1]) lista.push([z, t[1] * 2 + dx, t[2] * 2 + dy]); } });
    }
    if (!lista.length) break;
    const r = await lataaLaatat(lista, (k, kaikki) => edistys(z, k, kaikki), tila);
    yht.ok += r.ok; yht.ennestaan += r.ennestaan; yht.puuttuu += r.puuttuu; emot = lista;
  }
  return yht;
}
async function lataaAlueKokoIkkuna(alue) {
  if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
  const lista = laattaLista(alue.b, 8, 13), mt = Math.round(lista.length * LAATTAKOKO / 10) * 10, d = $('#dlg'), tila = { peru: false };
  const min = k => Math.max(5, Math.round(lista.length / 9348 * k / 5) * 5);
  // arvio tarkkojen tasojen määrästä: Suomenlahden otannassa noin kolmasosassa tason 13 paloista oli karttasisältöä
  const n13 = laattaLista(alue.b, 13, 13).length, e14 = Math.round(n13 * 0.33 * 4 / 100) * 100, e15 = Math.round(e14 * 4 * 0.85 / 100) * 100, sata = x => Math.max(10, Math.round(x / 10) * 10);
  const tarkkuudet = [[13, 'Perus', 'väylät, syvyydet ja merimerkit erottuvat', ''],
    [14, 'Tarkka', 'lisäksi tarkempi taso rannikolta, saaristosta ja väyliltä', 'noin ' + e14 + ' palaa lisää, arviolta ' + sata(e14 * 0.018) + ' Mt'],
    [15, 'Tarkin', 'kartan tarkin taso ja satamakartat rannikolta, saaristosta ja väyliltä', 'noin ' + (e14 + e15) + ' palaa lisää, arviolta ' + sata(e14 * 0.018 + e15 * 0.009) + ' Mt ja ' + (e14 + e15 < 22000 ? 'alle tunti' : '1–2 tuntia')]];
  let tilaa = '';
  try { const s = await navigator.storage.estimate(); if (s && s.quota) { const vapaa = (s.quota - (s.usage || 0)) / 1048576; tilaa = ' Selain antaa sovellukselle tilaa vielä noin ' + (vapaa > 2000 ? n(vapaa / 1024, 1) + ' Gt' : Math.round(vapaa) + ' Mt') + '.' + (vapaa < mt ? ' <b>Se ei ehkä riitä koko lataukseen.</b>' : ''); } } catch (x) { }
  d.innerHTML = '<form method="dialog"><h3>Lataa kartta ja väylätiedot: ' + alue.nimi + '</h3><div class="pieni">Merikartta ' + alue.kuvaus + ' tarkkuudella, jolla väylät, syvyydet ja merimerkit erottuvat. ' + lista.length + ' karttapalaa, arviolta ' + mt + ' Mt ja ' + min(15) + '–' + min(40) + ' minuuttia.' + tilaa + '</div>' +
    '<h4>Kartan tarkkuus</h4>' + tarkkuudet.map(t => '<label class="cb"><input type="radio" name="tark" value="' + t[0] + '"' + (t[0] === 13 ? ' checked' : '') + '><span><b>' + t[1] + '</b> – ' + t[2] + (t[3] ? '<br><span class="pieni">' + t[3] + '</span>' : '') + '</span></label>').join('') +
    '<div class="pieni">Perustarkkuudella kartta ei tarkennu ilman verkkoa, kun zoomaat lähelle. Tarkat tasot ladataan vain sieltä, missä kartassa on sisältöä; avomeri jää perustarkkuuteen. Tarkemman tason voi ladata myöhemmin samasta napista – jo ladatut palat ohitetaan.</div>' +
    '<div class="pieni">Samalla ladataan alueen väylät, merimerkit ja nopeusrajoitusalueet (noin ' + alue.vaylaMt + ' Mt), jolloin myös reittisuunnittelu, reitin seuranta ja rajoitusvaroitukset toimivat ilman verkkoa.</div>' +
    '<div class="pieni">Käytä Wi-Fiä ja pidä sovellus auki latauksen ajan. Jos lataus keskeytyy, paina samaa nappia uudelleen – jo ladatut palat ohitetaan.</div>' +
    '<progress id="lEd" value="0" max="1" hidden></progress><div class="pieni" id="lTeksti"></div>' +
    '<div class="napit"><button type="button" class="nappi" id="lPeru">Sulje</button><button type="button" class="nappi paa" id="lOk">Lataa</button></div></form>';
  d.querySelector('#lPeru').onclick = () => { tila.peru = true; d.close(); };
  d.querySelector('#lOk').onclick = async () => {
    const ed = d.querySelector('#lEd'), tx = d.querySelector('#lTeksti');
    const maxZ = +((d.querySelector('input[name=tark]:checked') || {}).value || 13);
    d.querySelector('#lOk').disabled = true; d.querySelectorAll('input[name=tark]').forEach(x => x.disabled = true); d.querySelector('#lPeru').textContent = 'Keskeytä'; ed.hidden = false;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (x) { }
    naytto(true);
    // 1) väylätiedot: haetaan, jos niitä ei ole tai ne ovat yli vuorokauden vanhat (keskeytyneen latauksen jatko ei hae niitä turhaan uudelleen)
    let vt = '';
    await vaylatMuistiin(); const osa = () => vayla && vayla.osat[alue.id];
    if (osa() && Date.now() - osa().haettu < 864e5) vt = 'Väylätiedot ovat ajan tasalla (haettu ' + pvm(osa().haettu) + '). ';
    else try { await lataaVaylat(t => { tx.textContent = t; }, alue); vt = 'Väylätiedot ladattu: ' + osa().linjat + ' väyläosuutta, ' + osa().merkit + ' merimerkkiä ja ' + osa().rajoitukset + ' rajoitusaluetta. '; }
    catch (x) { vt = osa() ? 'Väylätietojen päivitys ei onnistunut, käytössä ovat aiemmat (' + pvm(osa().haettu) + '). ' : 'Väylätietojen lataus ei onnistunut – paina nappia uudelleen. '; }
    window.__vt = vt;
    // 2) karttapalat
    const r = tila.peru ? { ok: 0, ennestaan: 0, puuttuu: 0 } : await lataaLaatat(lista, (k, kaikki) => { ed.value = k / kaikki; tx.textContent = k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)'; }, tila);
    // 3) tarkat tasot sieltä, missä kartassa on sisältöä
    const rt = !tila.peru && maxZ > 13 ? await lataaTarkat(alue.b, maxZ, (z, k, kaikki) => { ed.value = k / kaikki; tx.textContent = 'Tarkka taso ' + (z - 13) + ' / ' + (maxZ - 13) + ': ' + k + ' / ' + kaikki + ' palaa (' + Math.round(k / kaikki * 100) + ' %)'; }, tila) : null;
    if (watchId == null) naytto(false);
    if (!d.contains(tx)) { karttaUudelleen(); return; }      // ikkuna on jo korvattu toisella
    if (rt) { r.ok += rt.ok; r.ennestaan += rt.ennestaan; r.puuttuu += rt.puuttuu; }
    tx.textContent = vt + 'Kartta: ' + (tila.taynna ? 'Puhelimen tallennustila loppui kesken. ' : tila.peru ? 'Keskeytetty – jatka painamalla nappia uudelleen. ' : 'Valmis. ') + 'Ladattu ' + r.ok + ', ennestään tallessa ' + r.ennestaan + (r.puuttuu ? ', ei saatavilla ' + r.puuttuu + ' (ei karttaa alueelta tai yhteys katkesi)' : '') + '.';
    d.querySelector('#lPeru').textContent = 'Sulje'; d.querySelector('#lOk').disabled = false; d.querySelectorAll('input[name=tark]').forEach(x => x.disabled = false); tila.peru = false; karttaUudelleen(); paivitaKarttaTila();
  };
  d.showModal();
}
async function paivitaKarttaTila() {
  const el = $('#karttaTila'); if (!el) return;
  let teksti = 'Tallessa ' + await DB.maara('laatat') + ' karttapalaa';
  try { const s = await navigator.storage.estimate(); if (s && s.usage) teksti += ' · sovelluksen tiedot yhteensä noin ' + Math.max(1, Math.round(s.usage / 1048576)) + ' Mt'; } catch (x) { }
  await vaylatMuistiin();
  teksti += vayla ? '. Väylätiedot tallessa: ' + ALUEET.filter(a => vayla.osat[a.id]).map(a => a.nimi + ' (haettu ' + pvm(vayla.osat[a.id].haettu) + ')').join(', ') : '. Väylätietoja ei ole vielä ladattu';
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
  matkaSivu() { nakyma = 'matka'; piirra(); },
  // Kartan asetukset: karttapohjan vaihto ja karttojen lataus talteen.
  kartat() {
    const d = $('#dlg');
    d.innerHTML = '<form method="dialog"><h3>Kartta</h3><label>Karttapohja<select id="kPohja">' + ['meri', 'maa'].map(k => '<option value="' + k + '"' + (KARTAT[k] === kartta() ? ' selected' : '') + '>' + KARTAT[k].nimi + '</option>').join('') + '</select></label>' +
      [["tuuli","Tuuli ja sää","Tuulinuolet, puuskat, lämpötila ja aallonkorkeus kartalla; ennuste 24 tuntia eteenpäin."],["ais","Muut alukset (AIS)","Lähialueen alukset kartalla. Päivittyy noin minuutin välein."],["satamat","Satamat ja polttoaineasemat","Venesatamat palvelutietoineen. Haetaan kerran ja jää talteen."]].map(k => '<label class="cb"><input type="checkbox" data-lisa="' + k[0] + '"' + (T.as[k[0]] ? ' checked' : '') + '>' + k[1] + '</label>').join('') +
      '<label class="cb"><input type="checkbox" id="kKall"' + (T.as.kallistus ? ' checked' : '') + '>Näytä kallistusmittari kartalla</label>' +
      '<label class="cb"><input type="checkbox" id="kSuuntaviiva"' + (T.as.suuntaviiva ? ' checked' : '') + '>Veneen suuntaviiva (punainen katkoviiva kulkusuuntaan)</label>' +
      '<label class="cb"><input type="checkbox" id="kSeur"' + (T.as.reittiSeuranta ? ' checked' : '') + '>Seuraa reittiä ajon aikana</label>' +
      '<label>Varoita, kun vene on sivussa reitistä<select id="kSivu">' + [[100, 'yli 100 m'], [200, 'yli 200 m'], [500, 'yli 500 m'], [0, 'ei varoitusta']].map(x => '<option value="' + x[0] + '"' + (x[0] === T.as.reittiSivu ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
      '<div class="pieni">Seuranta näyttää kartalla olevasta reitistä jäljellä olevan matkan, arvioidun tuloajan ja seuraavan käännöksen. Se tarvitsee sijainnin, eli seurannan pitää olla päällä Matka-välilehdellä.</div>' +
      '<div class="pieni">Merikartan saa talteen puhelimeen, jolloin se näkyy ilman verkkoa. "Näkyvä alue" tarkoittaa kartalla juuri nyt näkyvää aluetta.</div>' +
      '<button type="button" class="nappi" id="kAlue">Lataa näkyvä alue talteen</button>' + alueNapit('dlg') +
      '<div class="napit"><button type="button" class="nappi paa" id="kSulje">Sulje</button></div></form>';
    d.querySelector('#kPohja').onchange = async ev => { T.as.kartta = ev.target.value; await talletaT(); piirra(); };
    d.querySelectorAll('[data-lisa]').forEach(el => el.onchange = async () => { T.as[el.dataset.lisa] = el.checked; await talletaT(); if (kLive) kLive.piirra(); lisatPaivita(); });
    d.querySelector('#kKall').onchange = async ev => { T.as.kallistus = ev.target.checked && await kallPaalle(); if (!T.as.kallistus) kallPois(); ev.target.checked = T.as.kallistus; await talletaT(); paivitaKall(true); };
    d.querySelector('#kSuuntaviiva').onchange = async ev => { T.as.suuntaviiva = ev.target.checked; await talletaT(); karttaUudelleen(); };
    d.querySelector('#kSeur').onchange = async ev => {
      T.as.reittiSeuranta = ev.target.checked; await talletaT(); seurNollaa();
      if (T.as.reittiSeuranta && reitti && !paikkaTuore()) ilmoita('Reitin seuranta tarvitsee sijainnin. Käynnistä seuranta Matka-välilehdeltä.');
      if (T.as.reittiSeuranta && paikkaTuore()) reittiSeuraa(gps.viime);
      karttaUudelleen(); paivitaReittiPalkki();
    };
    d.querySelector('#kSivu').onchange = async ev => { T.as.reittiSivu = +ev.target.value; seur.sivussa = false; seur.halytyksia = 0; await talletaT(); if (paikkaTuore()) reittiSeuraa(gps.viime); paivitaReittiPalkki(); };
    d.querySelector('#kAlue').onclick = () => { d.close(); lataaAlueIkkuna(); };
    d.querySelectorAll('[data-alue]').forEach(el => el.onclick = () => { d.close(); A.lataaKokoAlue(el.dataset.alue); });
    d.querySelector('#kSulje').onclick = () => d.close();
    d.showModal();
  },
  lataaSuomenlahti() { lataaAlueKokoIkkuna(ALUEET[0]); },
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
let vayla = null, verkko = null, reitti = null, napautusCb = null;      // reitti = {mista, minne, r, merkit}
const rs = { mista: { sijainti: true, nimi: 'Nykyinen sijainti' }, minne: null };
const VAYLA_URL = (t, b) => 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&bbox=' + [b.lo0, b.la0, b.lo1, b.la1].join(',') + ',EPSG:4326&typeNames=vesivaylatiedot:' + t;
// Väylätiedot tallennetaan alueittain (kv: alue.avain) ja yhdistetään muistissa yhdeksi aineistoksi (vayla).
async function vaylatMuistiin() {
  if (vayla) return vayla;
  const osat = []; for (const a of ALUEET) try { const o = await DB.get('kv', a.avain); if (o && o.linjat) { o.alue = a.id; osat.push(o); } } catch (x) { }
  if (!vayla && osat.length) { vayla = yhdistaVaylat(osat); verkko = null; }
  return vayla;
}
// Päivittää jo ladatut alueet; jos mitään ei ole ladattu, ladataan Suomenlahti.
async function paivitaVaylat(edistys) {
  await vaylatMuistiin(); const lista = ALUEET.filter(a => vayla && vayla.osat[a.id]);
  for (const a of lista.length ? lista : [ALUEET[0]]) await lataaVaylat(t => edistys && edistys(a.nimi + ': ' + t), a);
  return vayla;
}
async function lataaVaylat(edistys, alue) {
  alue = alue || ALUEET[0];
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
const satamatNimetyt = () => ((lisa.satamat || (typeof SATAMAT_PAKETTI !== 'undefined' ? SATAMAT_PAKETTI : null) || { lista: [] }).lista).filter(x => x.n);
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
  const oletus = () => { lista = []; return (o.sijainti ? rivi({ sijainti: true, nimi: 'Nykyinen sijainti' }, paikkaNyt() ? koord(...paikkaNyt()) : 'sijaintia ei vielä ole') : '') + (T.koti && !o.eiKotia ? rivi(T.koti, 'Kotisatama') : '') + T.paikat.filter(p => !T.koti || p.nimi !== T.koti.nimi).map(p => rivi({ nimi: p.nimi, lat: p.lat, lon: p.lon }, 'Oma paikka')).join('') + lahiSatamat(); };
  // Satamat sovelluksen mukana tulevasta tai laitteelle päivitetystä satamaluettelosta: löytyvät nimellä myös ilman verkkoa.
  const satamaLista = () => ((lisa.satamat || (typeof SATAMAT_PAKETTI !== 'undefined' ? SATAMAT_PAKETTI : null) || { lista: [] }).lista).filter(s => s.n);
  const satamaLaji = s => (s.l === 'satama' ? 'Satama' : s.l === 'polttoaine' ? 'Polttoaineasema' : 'Veneilyn palvelu') + (s.t && s.t['addr:city'] ? ', ' + s.t['addr:city'] : '');
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
    // satamat: nimen alusta osuvat ensin, sitten lähimmät
    const tama = paikkaNyt(), osuvat = satamaLista().filter(x => x.n.toLowerCase().includes(pieni) || (x.t && (x.t['addr:city'] || '').toLowerCase().includes(pieni)));
    h += osuvat.map(x => [(x.n.toLowerCase().startsWith(pieni) ? 0 : 1e7) + (x.l === 'satama' ? 0 : 5e6) + (tama ? etaisyys(tama[0], tama[1], x.la, x.lo) : 0), x]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, x]) => rivi({ nimi: x.n, lat: x.la, lon: x.lo }, satamaLaji(x) + (tama ? ' · ' + n(etaisyys(tama[0], tama[1], x.la, x.lo) / MPK) + ' mpk täältä' : ''))).join('');
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
        '<div class="pieni">Reitti kulkee Väyläviraston väyliä pitkin' + (T.vene.syvays ? ' ja käyttää vain väyliä, joiden syväys on vähintään ' + n(T.vene.syvays) + ' m' : '') + '. Väylätiedot: ' + ALUEET.filter(a => vayla.osat[a.id]).map(a => a.nimi).join(' ja ') + ', haettu ' + pvm(vayla.haettu) + ' (' + vayla.linjat.length + ' väyläosuutta, ' + vayla.merkit.length + ' merimerkkiä' + (vayla.rajoitukset ? ', ' + vayla.rajoitukset.length + ' rajoitusaluetta' : '') + '). <b>Reitti on suunnittelun apu – tarkista se merikartalta, älä navigoi sen varassa.</b></div>' +
        '<div class="napit"><button type="button" class="nappi" id="rSulje">Sulje</button><button type="button" class="nappi paa" id="rLaske">Suunnittele reitti</button></div>' +
        '<button type="button" class="nappi pien" id="rPaivita">Päivitä väylätiedot</button>'
        : '<div class="pieni">Reittisuunnittelu tarvitsee alueen väylät ja merimerkit sekä nopeusrajoitusalueet (Väyläviraston avoin data, 5–15 Mt alueelta). Ne ladataan kerran laitteelle, ja sen jälkeen reitit lasketaan ilman verkkoa. Valitse alue; toisen alueen voi ladata myöhemmin kartan tasonapista.</div><div class="pieni" id="rTila"></div>' +
        ALUEET.map(a => '<button type="button" class="nappi paa rLataa" data-alue="' + a.id + '">Lataa väylätiedot: ' + a.nimi + '</button>').join('') +
        '<div class="pieni">Oman reitin voit piirtää ilman väylätietojakin: napautat reitin pisteet itse kartalle.</div><button type="button" class="nappi" id="rOma">Piirrä oma reitti kartalle</button>' +
        '<div class="napit"><button type="button" class="nappi" id="rSulje">Sulje</button></div>') + '</form>';
    d.querySelector('#rSulje').onclick = () => d.close();
    const lataa = async nappi => {
      if (!navigator.onLine) { ilmoita('Lataus vaatii verkkoyhteyden.'); return; }
      nappi.disabled = true; const tila = d.querySelector('#rTila');
      try { const paivita = t => { if (tila) tila.textContent = t; else nappi.textContent = t; }, a = ALUEET.find(x => x.id === nappi.dataset.alue); if (a) await lataaVaylat(paivita, a); else await paivitaVaylat(paivita); ilmoita('Väylätiedot ladattu.'); }
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
const nakymaRajat = k => { const W = k.cv.clientWidth, H = k.cv.clientHeight, v = k.v, x = mx(v.lon, v.z), y = my(v.lat, v.z); return { lo0: lonX(x - W / 2, v.z), lo1: lonX(x + W / 2, v.z), la1: latY(y - H / 2, v.z), la0: latY(y + H / 2, v.z) }; };
// Onko karttaa siirretty tai zoomattu niin paljon, että tiedot pitää hakea uudelleen?
const siirtynyt = n => { if (!n || !kLive) return true; const v = lv, W = kLive.cv.clientWidth, H = kLive.cv.clientHeight; return Math.abs(v.z - n.z) > 0.8 || Math.hypot(mx(v.lon, v.z) - mx(n.lon, v.z), my(v.lat, v.z) - my(n.lat, v.z)) > 0.35 * Math.min(W, H); };
const nakymaNyt = () => ({ lat: lv.lat, lon: lv.lon, z: lv.z });

async function tuuliHae() {
  if (lisa.tuuliHaku || !kLive) return; lisa.tuuliHaku = 1;
  const b = nakymaRajat(kLive), nak = nakymaNyt(), SAR = 4, RIV = 5, la = [], lo = [];
  for (let r = 0; r < RIV; r++) for (let s = 0; s < SAR; s++) { la.push((b.la1 - (r + .5) / RIV * (b.la1 - b.la0)).toFixed(3)); lo.push((b.lo0 + (s + .5) / SAR * (b.lo1 - b.lo0)).toFixed(3)); }
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
async function satamatHae(pakko) {
  if (lisa.satamaHaku) return;
  if (!lisa.satamat) {
    try { lisa.satamat = await DB.get('kv', 'satamat') || null; } catch (x) { }
    // sovelluksen mukana tullut paketti voittaa, jos se on laitteelle aiemmin haettuja tietoja uudempi (esim. uusia alueita lisätty)
    if (lisa.satamat && typeof SATAMAT_PAKETTI !== 'undefined' && SATAMAT_PAKETTI.haettu > lisa.satamat.haettu) lisa.satamat = null;
    if (!lisa.satamat && typeof SATAMAT_PAKETTI !== 'undefined') lisa.satamat = SATAMAT_PAKETTI;
    laattaSaapui();
  }
  if (!pakko) return;
  if (!navigator.onLine) { ilmoita('Päivitys vaatii verkkoyhteyden.'); return; }
  lisa.satamaHaku = true; lisa.satamaVirhe = ''; ilmoita('Haetaan satamatietoja. Tämä voi kestää noin minuutin.');
  try {
    // kaikki ladattavat merialueet samalla haulla
    const q = '[out:json][timeout:150];(' + ALUEET.map(a => { const B = '(' + [a.b.la0, a.b.lo0, a.b.la1, a.b.lo1].join(',') + ')'; return 'nwr["leisure"="marina"]' + B + ';nwr["seamark:type"="harbour"]' + B + ';nwr["seamark:type"="small_craft_facility"]' + B + ';nwr["waterway"="fuel"]' + B + ';'; }).join('') + ');out center tags;';
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const lista = satamatMuunna((await r.json()).elements);
    if (lista.length < 20) throw new Error('vajaa vastaus');
    lisa.satamat = { haettu: Date.now(), lista }; await DB.put('kv', lisa.satamat, 'satamat');
    ilmoita('Satamatiedot päivitetty: ' + lista.length + ' kohdetta.');
  } catch (x) { lisa.satamaVirhe = String(x && x.message || x); ilmoita('Päivitys ei onnistunut juuri nyt. Käytössä ovat aiemmat tiedot.'); }
  finally { lisa.satamaHaku = false; }
  laattaSaapui(); if (nakyma === 'lisaa') piirra();
}
// Kutsutaan viiveellä aina kun karttaa on piirretty: hakee puuttuvat tai vanhentuneet tiedot.
function lisatAjasta() { if (!(T.as.tuuli || T.as.ais || T.as.satamat)) return; clearTimeout(lisa.ajastin); lisa.ajastin = setTimeout(lisatPaivita, 1200); }
function lisatPaivita() {
  if (nakyma !== 'kartta' || !kLive || !kLive.cv.isConnected) return;
  if (T.as.satamat && !lisa.satamat) satamatHae();
  if (!navigator.onLine) return;
  if (T.as.tuuli && (!lisa.tuuli || Date.now() - lisa.tuuli.aika > 30 * 60000 || siirtynyt(lisa.tuuli.nakyma)) && !(lisa.tuuliVirhe && Date.now() - lisa.tuuliVirhe < 30000)) tuuliHae();
  if (T.as.ais && (Date.now() - lisa.aisAika > 60000 || (lisa.ais && siirtynyt(lisa.aisNakyma) && Date.now() - lisa.aisAika > 5000))) aisHae();
  else if (T.as.ais && lisa.ais && siirtynyt(lisa.aisNakyma)) { clearTimeout(lisa.ajastin); lisa.ajastin = setTimeout(lisatPaivita, 5200); }
}
const tuuliVari = v => v < 4 ? '#1f8a4c' : v < 8 ? '#0b7a8f' : v < 11 ? '#c77700' : v < 14 ? '#e8590c' : '#c0392b';
const aisTyyppi = k => k == null ? '' : k === 30 ? 'Kalastusalus' : k === 36 ? 'Purjealus' : k === 37 ? 'Huvialus' : k === 50 ? 'Luotsialus' : k === 51 ? 'Meripelastusalus' : k === 52 ? 'Hinaaja' : k === 55 ? 'Viranomaisalus' : k >= 40 && k < 50 ? 'Pika-alus' : k >= 60 && k < 70 ? 'Matkustaja-alus' : k >= 70 && k < 80 ? 'Rahtialus' : k >= 80 && k < 90 ? 'Säiliöalus' : 'Muu alus';
// Piirtää lisätiedot kartalle ja kirjaa napautettavat kohteet (lisa.osumat).
function piirraLisat(c, X, Y, W, H, z) {
  lisa.osumat = [];
  // Muokattava oma reitti: viiva ja pisteet (A = lähtö, B = määränpää, numerot = välipisteet, keltainen = valittu).
  if (omaR && omaR.p.length) {
    const P = omaR.p; c.lineJoin = c.lineCap = 'round';
    if (P.length > 1) for (const [w, v] of [[8, '#fff'], [4.5, '#1565c0']]) { c.lineWidth = w; c.strokeStyle = v; c.beginPath(); P.forEach((q, i) => i ? c.lineTo(X(q.lon), Y(q.lat)) : c.moveTo(X(q.lon), Y(q.lat))); c.stroke(); }
    P.forEach((q, i) => {
      const x = X(q.lon), y = Y(q.lat), loppu = i === P.length - 1 && omaR.vaihe === 'vali', paa = i === 0 || loppu, val = omaR.valittu === i;
      c.beginPath(); c.arc(x, y, (paa ? 13 : 11) + (val ? 4 : 0), 0, 7); c.fillStyle = val ? '#ffd43b' : i === 0 ? '#1f8a4c' : loppu ? '#c0392b' : '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = val ? '#12222f' : paa ? '#fff' : '#1565c0'; c.stroke();
      c.font = '700 12px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = paa && !val ? '#fff' : '#12222f'; c.fillText(i === 0 ? 'A' : loppu ? 'B' : String(i), x, y + .5);
    });
  }
  const sisalla = (x, y) => x > -30 && y > -30 && x < W + 30 && y < H + 30;
  const teksti = (s, x, y, koko, vari) => { c.font = '600 ' + koko + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.92)'; c.strokeText(s, x, y); c.fillStyle = vari; c.fillText(s, x, y); };
  if (T.as.satamat && lisa.satamat && z >= 8.5) for (const s of lisa.satamat.lista) {
    const x = X(s.lo), y = Y(s.la); if (!sisalla(x, y)) continue; if (s.l !== 'satama' && z < 11) continue;
    const r = s.l === 'satama' ? 9 : 7;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = s.l === 'satama' ? '#0f2a43' : s.l === 'polttoaine' ? '#e8590c' : '#6b7780'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
    c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 1.6; c.beginPath();
    if (s.l === 'satama') { c.moveTo(x, y - 5); c.lineTo(x, y + 5); c.moveTo(x - 3, y - 2.5); c.lineTo(x + 3, y - 2.5); c.moveTo(x - 5, y + 1.5); c.quadraticCurveTo(x - 4.5, y + 5.5, x, y + 5.5); c.quadraticCurveTo(x + 4.5, y + 5.5, x + 5, y + 1.5); c.stroke(); }      // ankkuri
    else if (s.l === 'polttoaine') { c.moveTo(x, y - 4.5); c.bezierCurveTo(x + 4.5, y, x + 3.5, y + 4.5, x, y + 4.5); c.bezierCurveTo(x - 3.5, y + 4.5, x - 4.5, y, x, y - 4.5); c.fill(); }      // pisara
    else { c.arc(x, y, 2, 0, 7); c.fill(); }
    if (z >= 12 && s.n) teksti(s.n, x, y + r + 3, 12, '#0f2a43');
    lisa.osumat.push({ x, y, r: r + 12, laji: 'satama', d: s });
  }
  const ra = T.as.rajoitus && vayla && vayla.rajoitukset;
  if (ra && z >= 10) {
    const lo0 = lonX(mx(lv.lon, z) - W / 2, z), lo1 = lonX(mx(lv.lon, z) + W / 2, z), la1 = latY(my(lv.lat, z) - H / 2, z), la0 = latY(my(lv.lat, z) + H / 2, z), nyt = Date.now();
    for (const a of ra) {
      if (a.b[2] < lo0 || a.b[0] > lo1 || a.b[3] < la0 || a.b[1] > la1 || (a.e && a.e < nyt)) continue;
      c.beginPath(); for (const mk of a.m) for (const r of mk) { for (let i = 0; i < r.length; i += 2) i ? c.lineTo(X(r[i]), Y(r[i + 1])) : c.moveTo(X(r[i]), Y(r[i + 1])); c.closePath(); }
      c.fillStyle = a.k ? 'rgba(224,27,36,.10)' : 'rgba(232,89,12,.08)'; c.fill('evenodd'); c.setLineDash([6, 5]); c.lineWidth = 1.6; c.strokeStyle = a.k ? 'rgba(200,20,30,.75)' : 'rgba(232,89,12,.7)'; c.stroke(); c.setLineDash([]);
      if (a.k && z >= 11.5) { const x = X((a.b[0] + a.b[2]) / 2), y = Y((a.b[1] + a.b[3]) / 2); if (sisalla(x, y) && pisteAlueessa((a.b[0] + a.b[2]) / 2, (a.b[1] + a.b[3]) / 2, a)) { c.beginPath(); c.arc(x, y, 11, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#d0121c'; c.stroke(); c.font = '700 11px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#12222f'; c.fillText(a.k, x, y + .5); } }
    }
  }
  let aisNakyvissa = 0;
  if (T.as.ais && lisa.ais) for (const a of lisa.ais) {
    const x = X(a.lon), y = Y(a.lat); if (!sisalla(x, y)) continue;
    const liikkuu = a.sog > 0.5, suunta = a.hdg != null && a.hdg < 360 ? a.hdg : a.cog < 360 ? a.cog : 0;
    c.save(); c.translate(x, y); c.rotate(suunta * RAD); c.beginPath();
    if (liikkuu) { c.moveTo(0, -15); c.lineTo(8.5, 10); c.lineTo(0, 5.5); c.lineTo(-8.5, 10); c.closePath(); } else c.arc(0, 0, 6.5, 0, 7);
    c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke(); c.fillStyle = liikkuu ? '#a31fd1' : '#455a64'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#2a0a3a'; c.stroke(); c.restore(); aisNakyvissa++;
    const tieto = lisa.aisNimet && lisa.aisNimet.get(a.mmsi);
    if (z >= 11 && tieto && tieto.name) teksti(tieto.name.trim(), x, y + 13, 11.5, '#4b1d8f');
    lisa.osumat.push({ x, y, r: 22, laji: 'ais', d: a });
  }
  const tuuli = T.as.tuuli && lisa.tuuli, i = TUNNIT[lisa.tunti];
  if (tuuli) for (const p of tuuli.p) {
    const v = p.nop[i], x = X(p.lon), y = Y(p.lat); if (v == null || !sisalla(x, y)) continue;
    const L = 9 + Math.min(v, 20) * 0.8, vari = tuuliVari(v);
    c.save(); c.translate(x, y); c.rotate(((p.suu[i] || 0) + 180) * RAD);      // nuoli osoittaa suuntaan, johon tuuli puhaltaa
    for (const [w, vv] of [[6.5, 'rgba(255,255,255,.92)'], [3, vari]]) { c.lineWidth = w; c.strokeStyle = vv; c.lineCap = c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, L); c.lineTo(0, -L); c.moveTo(-6, -L + 8); c.lineTo(0, -L); c.lineTo(6, -L + 8); c.stroke(); }
    c.restore();
    teksti(n(v, 0) + (p.aalto && p.aalto[i] != null ? ' · ' + n(p.aalto[i]) + ' m' : ''), x, y + L + 3, 13, vari);
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
  lisaa('Tyyppi', s.l === 'satama' ? 'Venesatama' + (t.access === 'private' ? ' (yksityinen)' : '') : s.l === 'polttoaine' ? 'Polttoaineasema' : /pump/.test(fc) ? 'Septitankin tyhjennys' : /slipway/.test(fc) ? 'Veneluiska' : /hoist/.test(fc) ? 'Venenosturi' : /boatyard/.test(fc) ? 'Telakka' : 'Veneilyn palvelu');
  lisaa('Paikkakunta', t['addr:city']); lisaa('Ylläpitäjä', t.operator); lisaa('Maksullinen', t.fee); lisaa('Venepaikkoja', t.capacity);
  lisaa('Suurin syväys (m)', t.maxdraught || t.maxdraft || t.depth); lisaa('Sähkö', t.power_supply); lisaa('Juomavesi', t.drinking_water); lisaa('Septitankin tyhjennys', t.sanitary_dump_station);
  lisaa('Suihku', t.shower); lisaa('WC', t.toilets); lisaa('Sauna', t.sauna); lisaa('Verkkoyhteys', t.internet_access);
  lisaa('Polttoaine', [t['fuel:diesel'] === 'yes' ? 'diesel' : '', t['fuel:octane_95'] === 'yes' ? '95' : '', t['fuel:octane_98'] === 'yes' ? '98' : ''].filter(Boolean).join(', '));
  lisaa('Aukioloajat', t.opening_hours); lisaa('Lisätietoja', t.description);
  const puh = t.phone || t['contact:phone'], www = t.website || t['contact:website'];
  d.innerHTML = '<form method="dialog"><h3>' + e(s.n || 'Nimetön kohde') + '</h3><div class="plista">' + rivit.join('') + '</div>' +
    (rivit.length < 3 ? '<div class="pieni">Tästä kohteesta ei ole tallennettu palvelutietoja.</div>' : '') +
    (puh ? '<a class="nappi" href="tel:' + e(puh.split(';')[0].replace(/[^+\d]/g, '')) + '">Soita ' + e(puh.split(';')[0]) + '</a>' : '') +
    (www && /^https?:\/\//.test(www) ? '<a class="nappi" href="' + e(www) + '" target="_blank" rel="noopener">Avaa verkkosivu</a>' : '') +
    '<div class="pieni">Tiedot ovat OpenStreetMapista (© OpenStreetMapin tekijät), ja ne voivat olla puutteellisia tai vanhentuneita. Tarkista palvelut ja vieraspaikat satamasta.</div>' +
    '<div class="napit"><button type="button" class="nappi" id="sSulje">Sulje</button><button type="button" class="nappi paa" id="sReitti">Reitti tänne</button></div></form>';
  d.querySelector('#sSulje').onclick = () => d.close();
  d.querySelector('#sReitti').onclick = async () => {
    d.close(); rs.minne = { nimi: s.n || koord(s.la, s.lo), lat: s.la, lon: s.lo }; rs.mista = { sijainti: true, nimi: 'Nykyinen sijainti' };
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
  if (paras) (paras.laji === 'ais' ? aisIkkuna : satamaIkkuna)(paras.d);
}
Object.assign(A, { aisNyt() { if (!navigator.onLine) { ilmoita('Ei verkkoyhteyttä.'); return; } lisa.aisAika = 0; aisHae(); }, satamatPaivita() { satamatHae(true); }, tuuliAika() { lisa.tunti = (lisa.tunti + 1) % TUNNIT.length; if (kLive) kLive.piirra(); } });
setInterval(() => { if (typeof T !== 'undefined' && T && nakyma === 'kartta') lisatPaivita(); }, 60000);

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
async function kallPaalle() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') { ilmoita('Tässä laitteessa ei ole asentoanturia.'); return false; }
    if (DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { ilmoita('Lupaa liikeantureihin ei annettu.'); return false; } }
    window.removeEventListener('deviceorientation', kallKuuntele); window.addEventListener('deviceorientation', kallKuuntele); kall.paalla = true; return true;
  } catch (x) { ilmoita('Asentoanturia ei saatu käyttöön.'); return false; }
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
    if (T.as.kallistus) { const t = tuore ? kallTeksti() : ['–', 'ei anturitietoa']; $('#kKal').textContent = t[0]; $('#kKalS').textContent = t[1]; $('#kKalViiva').style.transform = 'rotate(' + (tuore ? rajaa(kall.heel, -60, 60) : 0) + 'deg)'; }
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
  const u = uusiTila(); T = Object.assign(u, o.tila); T.as = Object.assign(uusiTila().as, o.tila.as, { seuranta: watchId != null });
  matkat = o.matkat; await talletaT(); piirra(); ilmoita('Tiedot palautettu.'); return true;
}

// ---------- käynnistys ----------
async function alku() {
  await DB.avaa();
  const u = uusiTila(), s = await DB.get('kv', 'tila') || {};
  T = Object.assign(u, s); T.as = Object.assign(uusiTila().as, s.as); T.vene = Object.assign(uusiTila().vene, s.vene);
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
    else if (c === 'tuuli' || c === 'ais' || c === 'satamat') { T.as[c] = el.checked; await talletaT(); piirra(); }
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
  if (T.as.seuranta && !/[?&]testi/.test(location.search)) seurantaPaalle(true);
  // Kallistusmittari käyntiin. iPhonessa anturilupa vaatii kosketuksen, joten siellä odotetaan ensimmäistä napautusta.
  if (T.as.kallistus) { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) document.addEventListener('pointerdown', () => kallPaalle(), { once: true }); else kallPaalle(); }
  piirra(); paivitaSaat();
  if ('serviceWorker' in navigator && !/[?&]testi/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__valmis = true;
}
alku().catch(x => { $('#sisalto').innerHTML = '<div class="kortti">Sovellus ei käynnistynyt: ' + e(x && x.message || x) + '</div>'; window.__virhe = String(x && x.stack || x); });
