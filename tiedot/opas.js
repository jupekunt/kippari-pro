// Opas-välilehti: merimerkit (viitoitusjärjestelmä A), valotunnukset ja vesiliikennemerkit selityksineen.
// Lähteet: Liikenneviraston määräys yleisten kulkuväylien merkitsemisestä (28.5.2015, LIVI/2584/06.04.01/2015),
// Liikenneviraston määräys vesiliikennemerkeistä ja valo-opasteista (12.4.2017, LIVI/2393/00.03.03/2017) ja Traficomin juliste "Vesiliikennemerkit".
// Kuvat ovat tätä sovellusta varten piirrettyjä yksinkertaistuksia, eivät virallisia merkkikuvia.
const OPAS_HTML = (() => {
  const PUN = '#d0121c', VIH = '#1f8a4c', KEL = '#f5c400', MUS = '#151515', SIN = '#1565c0', VAL = '#ffffff';
  // --- viitta: runko väriraidoilla ylhäältä alas ja huippumerkki ---
  const HUIPUT = {
    lierio: '<rect x="20.5" y="6" width="11" height="9" fill="' + PUN + '" stroke="#333" stroke-width=".6"/>',
    kartio: '<path d="M26 4l6 11H20z" fill="' + VIH + '" stroke="#333" stroke-width=".6"/>',
    P: '<path d="M26 0l5 7.5H21zM26 8.5l5 7.5H21z" fill="' + MUS + '"/>',
    E: '<path d="M21 0h10l-5 7.5zM21 8.5h10l-5 7.5z" fill="' + MUS + '"/>',
    I: '<path d="M26 0l5 7.5H21zM21 8.5h10l-5 7.5z" fill="' + MUS + '"/>',
    L: '<path d="M21 0h10l-5 7.5zM26 8.5l5 7.5H21z" fill="' + MUS + '"/>',
    kari: '<circle cx="26" cy="4.2" r="3.7" fill="' + MUS + '"/><circle cx="26" cy="12.3" r="3.7" fill="' + MUS + '"/>',
    turva: '<circle cx="26" cy="10.5" r="4.6" fill="' + PUN + '" stroke="#333" stroke-width=".6"/>',
    erikois: '<path d="M21 5l10 10M31 5L21 15" stroke="' + KEL + '" stroke-width="3.4" stroke-linecap="round"/><path d="M21 5l10 10M31 5L21 15" stroke="#7a6200" stroke-width=".5" fill="none"/>'
  };
  function viitta(raidat, huippu, pysty) {
    const y0 = 18, y1 = 55, h = (y1 - y0) / raidat.length; let s = '';
    if (pysty) raidat.forEach((v, i) => { s += '<rect x="' + (21 + i * 10 / raidat.length) + '" y="' + y0 + '" width="' + 10 / raidat.length + '" height="' + (y1 - y0) + '" fill="' + v + '"/>'; });
    else raidat.forEach((v, i) => { s += '<rect x="21" y="' + (y0 + i * h) + '" width="10" height="' + h + '" fill="' + v + '"/>'; });
    return '<svg viewBox="0 0 52 64" aria-hidden="true">' + (HUIPUT[huippu] || '') + '<path d="M26 16v2" stroke="#333" stroke-width="1"/>' + s +
      '<rect x="21" y="' + y0 + '" width="10" height="' + (y1 - y0) + '" fill="none" stroke="#333" stroke-width=".8"/><path d="M6 57q5-4 10 0t10 0 10 0 10 0" fill="none" stroke="#2f7fb5" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  // --- vesiliikennemerkki: neliö, jossa kuvio ---
  const viiva = (d, w) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2.6) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const teksti = (t, y, koko) => '<text x="26" y="' + (y || 33) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="' + (koko || 20) + '" fill="currentColor">' + t + '</text>';
  const AALLOT = viiva('M11 36q3.75-4 7.5 0t7.5 0 7.5 0 7.5 0', 2.2);
  const KUVIOT = {
    ankkuri: '<circle cx="26" cy="13.5" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/>' + viiva('M26 16v22M20 21h12M15 30q2 9 11 9t11-9'),
    P: teksti('P', 35, 26),
    pollari: viiva('M21 38V25h8v13M19 25h12M17 38h16') + viiva('M29 30q9 3 12-7', 2),
    ohitus: viiva('M19 38V16M14 22l5-6 5 6M33 38V16M28 22l5-6 5 6'),
    kohtaus: viiva('M19 38V16M14 22l5-6 5 6M33 14v22M28 30l5 6 5-6'),
    aallot: viiva('M11 22q3.75-5 7.5 0t7.5 0 7.5 0 7.5 0M11 31q3.75-5 7.5 0t7.5 0 7.5 0 7.5 0'),
    hiihto: '<circle cx="28" cy="14" r="2.8" fill="currentColor"/>' + viiva('M28 17l-3 10 4 6M25 27l-5 5M29 21l12-4M15 35h18', 2.2),
    lauta: viiva('M14 37h22M25 37l2-25', 2.2) + '<path d="M27 12l11 16-12 3z" fill="currentColor"/>',
    potkuri: '<circle cx="26" cy="26" r="2.6" fill="currentColor"/><g fill="currentColor"><ellipse cx="26" cy="17" rx="3.6" ry="7"/><ellipse cx="26" cy="17" rx="3.6" ry="7" transform="rotate(120 26 26)"/><ellipse cx="26" cy="17" rx="3.6" ry="7" transform="rotate(240 26 26)"/></g>',
    skootteri: '<path d="M11 31h27l4-6H32l-4-6h-5l2 6H13z" fill="currentColor"/><circle cx="26" cy="15" r="2.4" fill="currentColor"/>' + AALLOT,
    uimari: '<circle cx="21" cy="24" r="3.6" fill="currentColor"/>' + viiva('M26 28l10-5', 2.6) + AALLOT,
    vaaka: viiva('M13 26h26', 5), pysty: viiva('M26 13v26', 5), ympyra: '<circle cx="26" cy="26" r="7" fill="currentColor"/>',
    korkeus: '<path d="M18 9h16l-8 8z" fill="currentColor"/>' + teksti('4,5', 37, 15),
    syvyys: '<path d="M18 43h16l-8-8z" fill="currentColor"/>' + teksti('2,4', 29, 15),
    leveys: '<path d="M9 18v16l7-8zM43 18v16l-7-8z" fill="currentColor"/>' + teksti('12', 31, 15),
    virtaus: viiva('M11 20q4-5 8 0t8 0 8 0M36 15l3 5-6 1M11 31q4-5 8 0t8 0 8 0M36 26l3 5-6 1', 2.2),
    reuna: '<path d="M10 37l16-24 16 24z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' + teksti('40', 35, 11),
    radio: teksti('VHF', 24, 12) + teksti('11', 39, 14),
    salama: '<path d="M30 9l-10 17h7l-4 17 12-21h-7z" fill="currentColor"/>',
    puhelin: viiva('M15 20q11-9 22 0v4h-6v-3q-5-2-10 0v3h-6zM19 28h14l3 11H16z', 2.2),
    lautta: '<path d="M11 28h30l-4 8H15z" fill="currentColor"/><path d="M19 28v-7h14v7" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    hana: viiva('M14 22h16q6 0 6 6v4M22 22v-6M17 16h10', 3) + '<path d="M36 35q-3 4 0 6 3-2 0-6z" fill="currentColor"/>',
    paattyy: viiva('M12 40L40 12', 5)
  };
  function merkki(laji, kuvio, lisa) {
    const k = '<g color="' + (laji === 'tieto' ? VAL : MUS) + '">' + (KUVIOT[kuvio] || kuvio || '') + (lisa || '') + '</g>';
    return '<svg viewBox="0 0 52 52" aria-hidden="true">' + (laji === 'tieto' ? '<rect x="2" y="2" width="48" height="48" rx="2" fill="' + SIN + '"/>' + k
      : '<rect x="4.5" y="4.5" width="43" height="43" rx="1.5" fill="' + VAL + '" stroke="' + PUN + '" stroke-width="5"/>' + k + (laji === 'kielto' ? '<path d="M8 8l36 36" stroke="' + PUN + '" stroke-width="4"/>' : '')) + '</svg>';
  }
  const valot = pisteet => '<svg viewBox="0 0 52 52" aria-hidden="true"><rect x="5" y="14" width="42" height="24" rx="3" fill="#151515"/>' +
    pisteet.map((p, i) => '<circle cx="' + (pisteet.length === 1 ? 26 : 18 + i * 16) + '" cy="26" r="6.5" fill="' + p[0] + '"/>' + (p[1] ? '<circle cx="' + (pisteet.length === 1 ? 26 : 18 + i * 16) + '" cy="26" r="10" fill="none" stroke="' + p[0] + '" stroke-width="1.4" stroke-dasharray="3 3"/>' : '')).join('') + '</svg>';
  const rivi = (kuva, nimi, selitys, tunnus) => '<div class="omerkki">' + kuva + '<div><b>' + nimi + '</b><span>' + selitys + '</span>' + (tunnus ? '<span class="pieni">' + tunnus + '</span>' : '') + '</div></div>';
  const kortti = (id, otsikko, johdanto, rivit) => '<div class="kortti opas" id="opas-' + id + '"><h2>' + otsikko + '</h2>' + (johdanto ? '<div class="pieni">' + johdanto + '</div>' : '') + rivit.join('') + '</div>';

  // --- solmut: köysi piirretään ohjauspisteiden kautta; z kertoo, kulkeeko köysi risteyksessä päältä (1) vai alta (0) ---
  const TAUSTA = '#dcebf3', KOYSI = '#a8621c';
  function koysi(pts) {
    const naytteet = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 12; k++) { const t = k / 12, t2 = t * t, t3 = t2 * t, c = j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3); naytteet.push([c(0), c(1), t < 0.5 ? p1[2] : p2[2]]); }
    }
    naytteet.push(pts[pts.length - 1]);
    const osat = []; let osa = null;
    naytteet.forEach((q, i) => { if (!osa || osa.z !== q[2]) { osa = { z: q[2], p: i ? [naytteet[i - 1]] : [] }; osat.push(osa); } osa.p.push(q); });
    return osat.slice().sort((a, b) => a.z - b.z).map(o => { const d = 'M' + o.p.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'); return '<path d="' + d + '" fill="none" stroke="' + TAUSTA + '" stroke-width="9.5"/><path d="' + d + '" fill="none" stroke="' + KOYSI + '" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>'; }).join('');
  }
  const suora = (x1, y1, x2, y2, kuori) => (kuori ? '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" stroke="' + kuori + '" stroke-width="9.5"/>' : '') + '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" stroke="' + KOYSI + '" stroke-width="5.2" stroke-linecap="butt"/>';
  const nimio = (t, x, y) => '<text x="' + x + '" y="' + y + '" font-family="system-ui,sans-serif" font-size="8.5" fill="#33434f">' + t + '</text>';
  const solmukuva = sis => '<svg class="osolmu" viewBox="0 0 120 92" aria-hidden="true">' + sis + '</svg>';
  const KUVA_KAHDEKSIKKO = solmukuva(koysi([[58, 2, 1], [58, 26, 1], [58, 38, 0], [58, 58, 0], [62, 70, 1], [68, 73, 1], [80, 66, 1], [84, 55, 0], [76, 44, 0], [68, 39, 1], [58, 38, 1], [46, 36, 1], [38, 29, 1], [44, 21, 0], [58, 26, 0], [68, 33, 1], [76, 44, 1], [74, 58, 1], [68, 73, 0], [65, 89, 0]]) + nimio('pitkä osa', 64, 10) + nimio('pää', 72, 88));
  const KUVA_SIANSORKKA = solmukuva('<rect x="46" y="0" width="28" height="92" fill="#8b6b4a"/><rect x="46" y="0" width="6" height="92" fill="#a58562"/>' + suora(4, 56, 74, 62) + suora(46, 40, 116, 46) + suora(46, 68, 74, 30, '#8b6b4a') + nimio('pitkä osa', 2, 50) + nimio('pää', 100, 40));
  // knaapi ylhäältä: kahdeksikon kaksi vinoa osaa, niiden päällä lukitsevan lenkin vino osa, ja pää sen alla toisen vinon suuntaisesti
  const KUVA_KNAAPI = solmukuva(suora(2, 90, 32, 58) + suora(82, 32, 88, 58) + suora(38, 32, 40, 60) + suora(90, 34, 96, 56) +
    '<rect x="14" y="39" width="92" height="12" rx="6" fill="#5d6b76"/><rect x="52" y="36" width="16" height="18" rx="3" fill="#4b5760"/>' +
    suora(32, 58, 82, 32, TAUSTA) + suora(88, 58, 38, 32, TAUSTA) + suora(96, 56, 24, 20, TAUSTA) + suora(40, 60, 90, 34, TAUSTA) + nimio('pitkä osa', 12, 88) + nimio('pää', 6, 16));
  const solmu = (kuva, nimi, kaytto, vaiheet, huom) => '<div class="omerkki osolmurivi">' + (kuva || '') + '<div><b>' + nimi + '</b><span>' + kaytto + '</span><ol>' + vaiheet.map(v => '<li>' + v + '</li>').join('') + '</ol>' + (huom ? '<span class="pieni">' + huom + '</span>' : '') + '</div></div>';

  const sisallys = [['lateraali', 'Väylän reunat'], ['kardinaali', 'Ilmansuuntamerkit'], ['muut', 'Kari, turvavesi ja erikoismerkki'], ['linja', 'Linjamerkit ja sektoriloisto'], ['valot', 'Valotunnukset'], ['kartta', 'Kartan tekstit'], ['kielto', 'Kieltomerkit'], ['rajoitus', 'Määräys, rajoitus ja varoitus'], ['tieto', 'Tiedotusmerkit'], ['kaapeli', 'Kaapelit ja apumerkit'], ['opasteet', 'Valo-opasteet'], ['solmut', 'Solmut']];

  return '<div class="kortti opas"><h2>Opas: merimerkit ja vesiliikennemerkit</h2>' +
    '<div class="pieni">Suomessa käytetään viitoitusjärjestelmää A, jossa on lateraalimerkit, kardinaalimerkit, karimerkit, turvavesimerkit ja erikoismerkit. Jokaisella merkillä on väritunnus; lisäksi siinä voi olla huippumerkki, heijastimet ja valo.</div>' +
    '<div class="ohyppy">' + sisallys.map(s => '<a href="#opas-' + s[0] + '" data-opas="' + s[0] + '">' + s[1] + '</a>').join('') + '</div></div>' +

    kortti('lateraali', 'Väylän reunat: lateraalimerkit', 'Lateraalimerkit osoittavat väylän vasemman ja oikean reunan <b>nimelliskulkusuuntaan</b> katsottuna. Vastakkaiseen suuntaan ajettaessa puolet vaihtuvat.', [
      rivi(viitta([PUN], 'lierio'), 'Vasen (punainen)', 'Väylän vasen reuna. Nimelliskulkusuuntaan ajettaessa merkki jää vasemmalle.', 'Huippumerkki punainen lieriö · heijastin punainen raita · valo punainen, V 3 s tai V(2) 6 s'),
      rivi(viitta([VIH], 'kartio'), 'Oikea (vihreä)', 'Väylän oikea reuna. Nimelliskulkusuuntaan ajettaessa merkki jää oikealle.', 'Huippumerkki vihreä kartio kärki ylöspäin · heijastin vihreä raita · valo vihreä, V 3 s tai V(2) 6 s'),
      '<div class="olaatikko"><b>Nimelliskulkusuunta</b><span>Se on merkitty karttaan ja purjehdusohjeisiin. Suunta on kohti satamaa (satamien tuloväylät) tai kohti latvavesiä. Rannikon suuntaisilla väylillä se on Suomenlahdella lännestä itään sekä Saaristomerellä ja Pohjanlahdella etelästä pohjoiseen.</span></div>'
    ]) +

    kortti('kardinaali', 'Ilmansuuntamerkit: kardinaalimerkit', 'Kardinaalimerkki nimetään ilmansuunnan mukaan, ja <b>kulkuvesi on merkin nimen mukaisella puolella</b>: pohjoismerkki ohitetaan pohjoispuolelta, etelämerkki eteläpuolelta. Merkki voi myös osoittaa väylien yhtymäkohtaa, haaraa tai matalan päätä. Valo on aina valkoinen.', [
      rivi(viitta([MUS, KEL], 'P'), 'Pohjoismerkki', 'Kulkuvesi on merkin pohjoispuolella.', 'Musta yläosa, keltainen alaosa · kaksi mustaa kartiota kärjet ylöspäin · valo NPv tai Pv (jatkuva pikavilkku)'),
      rivi(viitta([MUS, KEL, MUS], 'I'), 'Itämerkki', 'Kulkuvesi on merkin itäpuolella.', 'Ylä- ja alaosa mustat, keskiosa keltainen · kaksi mustaa kartiota kannat vastakkain · valo NPv(3) 5 s tai Pv(3) 10 s'),
      rivi(viitta([KEL, MUS], 'E'), 'Etelämerkki', 'Kulkuvesi on merkin eteläpuolella.', 'Keltainen yläosa, musta alaosa · kaksi mustaa kartiota kärjet alaspäin · valo NPv(6) + V 10 s tai Pv(6) + V 15 s (kuusi välähdystä ja yksi pitkä)'),
      rivi(viitta([KEL, MUS, KEL], 'L'), 'Länsimerkki', 'Kulkuvesi on merkin länsipuolella.', 'Ylä- ja alaosa keltaiset, keskiosa musta · kaksi mustaa kartiota kärjet vastakkain · valo NPv(9) 10 s tai Pv(9) 15 s'),
      '<div class="olaatikko"><b>Muistisääntö välähdyksistä</b><span>Välähdysten määrä seuraa kellotaulua: itä 3, etelä 6, länsi 9. Pohjoismerkki vilkkuu jatkuvasti.</span></div>'
    ]) +

    kortti('muut', 'Kari, turvavesi ja erikoismerkki', '', [
      rivi(viitta([MUS, PUN, MUS], 'kari'), 'Karimerkki', 'Asetetaan erillisen, pieniulotteisen vaarakohteen päälle. Merkin ympärillä on kaikkialla kulkukelpoista vettä, mutta itse merkin kohdalla ei.', 'Musta, punaiset leveät vaakavyöt · kaksi mustaa palloa päällekkäin · valo valkoinen, V(2), jakso 5 s tai 10 s'),
      rivi(viitta([PUN, VAL, PUN, VAL], 'turva', true), 'Turvavesimerkki', 'Kaikkialla merkin ympärillä ja myös sen alla on kulkukelpoista vettä. Osoittaa esimerkiksi väylän keskilinjaa syvillä selkävesillä.', 'Punaiset ja valkoiset pystyraidat · yksi punainen pallo · valo valkoinen: KV 10 s, T, Ka tai morse A'),
      rivi(viitta([KEL], 'erikois'), 'Erikoismerkki', 'Ei varsinaisesti ohjaa kulkua, vaan osoittaa kartassa mainitun kohteen tai alueen: esimerkiksi kaapelin tai putkijohdon, ruoppaus- tai läjitysalueen, sotilaallisen harjoitusalueen, tutkimuslaitteen, ulkoilualueen tai purjehduskilpailualueen.', 'Keltainen · ristikkäin asetetut keltaiset levyt · valo keltainen, tunnus vapaa'),
      '<div class="olaatikko"><b>Uusi vaarakohde</b><span>Vasta havaittu vaara, esimerkiksi hylky tai kari, merkitään tilanteeseen sopivalla järjestelmän merkillä. Vakavassa tapauksessa merkkejä on kaksi samanlaista rinnakkain.</span></div>'
    ]) +

    kortti('linja', 'Linjamerkit ja sektoriloisto', '', [
      rivi('<svg viewBox="0 0 52 64" aria-hidden="true"><path d="M17 62V40M35 62V16" stroke="#555" stroke-width="2"/><g stroke="#333" stroke-width=".7"><rect x="9" y="26" width="16" height="16" fill="' + KEL + '"/><rect x="14.3" y="26" width="5.4" height="16" fill="' + PUN + '"/><rect x="27" y="3" width="16" height="16" fill="' + KEL + '"/><rect x="32.3" y="3" width="5.4" height="16" fill="' + PUN + '"/></g></svg>',
        'Linjamerkit', 'Kaksi merkkiä osoittaa yhdessä väylälinjan: olet linjalla, kun alempi ja ylempi merkki näkyvät päällekkäin. Alempi on väylältä katsottuna lähempänä ja matalammalla.', 'Linjataulu on suorakaide tai kolmio, jossa on kolme pystyraitaa: keltainen–punainen–keltainen, punainen–keltainen–punainen, valkoinen–punainen–valkoinen tai punainen–valkoinen–punainen. Valaistu linjamerkki on linjaloisto.'),
      rivi('<svg viewBox="0 0 52 64" aria-hidden="true"><path d="M26 12L4 58h13z" fill="' + PUN + '" opacity=".85"/><path d="M26 12L17 58h18z" fill="#fff" stroke="#999" stroke-width=".5"/><path d="M26 12l9 46h13z" fill="' + VIH + '" opacity=".85"/><circle cx="26" cy="11" r="5" fill="#ffd43b" stroke="#333" stroke-width=".8"/></svg>',
        'Sektoriloisto', 'Loisto, jossa on erivärisiä sektoreita. Yleensä valkoinen valo näkyy väylän suuntaan. Loistoa kohti ajettaessa valkoista sektoria rajoittaa vasemmalla punainen ja oikealla vihreä sektori.', 'Jos näet punaista tai vihreää, olet valkoisen sektorin sivussa. Sektoriloistolla ei ole päivämerkkiä.'),
      '<div class="olaatikko"><b>Muut turvalaitteet</b><span>Merkintäjärjestelmään kuuluvat lisäksi majakat, tutkamerkit, reunamerkit, apuloistot ja kummelit.</span></div>'
    ]) +

    kortti('valot', 'Valotunnukset', 'Valotunnus kertoo, miten merkin valo vilkkuu. Suomenkieliset lyhenteet ovat määräyksestä; S-57-kartalla näkyvät kansainväliset lyhenteet. Tunnuksen perässä on väri (R punainen, G vihreä, W valkoinen, Y keltainen), jakso sekunteina ja kantama meripeninkulmina, esimerkiksi <b>Fl(1)G 3s 2M</b>.', [
      '<table class="otaulu"><tr><th>Suomi</th><th>Kartalla</th><th>Selitys</th></tr>' + [
        ['Ki', 'F', 'Kiinteä valo: jatkuva, vakaa valo'], ['Ka', 'Oc', 'Katkovalo: valo on selvästi pidempi kuin pimeä jakso'], ['T', 'Iso', 'Tasarytmivalo: valo ja pimeä yhtä pitkät'],
        ['V', 'Fl', 'Vilkku: lyhyt välähdys, pimeä pidempi'], ['KV', 'LFl', 'Kestovilkku: välähdys yli 2 s'], ['V(2)', 'Fl(2)', 'Ryhmävilkku: välähdykset ryhmissä, tässä kaksi'],
        ['Pv', 'Q', 'Pikavilkku: 50–80 välähdystä minuutissa'], ['NPv', 'VQ', 'Nopea pikavilkku: 80–160 välähdystä minuutissa'], ['ENPv', 'UQ', 'Erittäin nopea pikavilkku: yli 160 välähdystä minuutissa'], ['Mo(A)', 'Mo(A)', 'Morsevalo, esimerkiksi kirjain A']
      ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') + '</table>'
    ]) +

    kortti('kartta', 'S-57-kartan tekstit', 'Merikartta S-57 näyttää merkkien nimet ja valot kansainvälisin lyhentein. Tekstit saa pois kartan valikosta (Merimerkkien nimet ja loistojen tunnukset).', [
      '<table class="otaulu"><tr><th>Teksti</th><th>Merkitys</th></tr>' + [
        ['by Tero', 'Viitta tai poiju nimeltä Tero (by = buoy)'], ['bn Harakka', 'Kiinteä merkki nimeltä Harakka (bn = beacon)'], ['Fl(1)G 3s 2M', 'Vihreä valo, yksi välähdys kolmen sekunnin välein, kantama 2 meripeninkulmaa'],
        ['VQ(6)+LFl(1)W 10s', 'Etelämerkin valo: kuusi nopeaa välähdystä ja yksi pitkä, valkoinen, jakso 10 s'], ['072 deg', 'Linjan tai suosituksen suunta asteina'], ['13<sub>4</sub>', 'Syvyys 13,4 metriä']
      ].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>',
      '<div class="pieni">Tämän taulukon selitykset ovat sovelluksen tekijän tulkinta kartan esitystavasta, eivät Traficomin ohjeesta.</div>'
    ]) +

    kortti('kielto', 'Vesiliikennemerkit: kieltomerkit', 'Neliö, jossa on punaiset reunat, valkoinen keskusta, musta kuvio ja punainen vinoviiva. Merkki osoittaa vaikutusalueensa alkamiskohdan, ellei apumerkki tarkenna sitä.', [
      rivi(merkki('kielto', 'ankkuri'), 'Ankkurin käyttökielto', 'Ankkurointi sekä ankkurien, vaijereiden ja ketjujen laahaaminen on kielletty 100 metriä ennen merkkiä ja 100 metriä sen jälkeen. Syynä on vedenalainen kaapeli tai rakenne.'),
      rivi(merkki('kielto', 'P'), 'Pysäköimiskielto', 'Ankkurointi ja rantaan tai laituriin kiinnittyminen on kielletty apumerkillä ilmoitetulla alueella.'),
      rivi(merkki('kielto', 'pollari'), 'Kiinnittymiskielto', 'Rantaan tai laituriin kiinnittyminen on kielletty 50 metriä merkin molemmin puolin, ellei apumerkki ilmoita muuta.'),
      rivi(merkki('kielto', 'ohitus'), 'Ohittamiskielto', 'Toisen aluksen ohittaminen on kielletty.'),
      rivi(merkki('kielto', 'kohtaus'), 'Kohtaamiskielto', 'Vastaantulevan aluksen kohtaaminen ja toisen ohittaminen on kielletty merkittyjen kohtien välillä. Pienaluksen tai alle 20 metrin puutavaralautan saa kohdata, jos kulku on esteetön.'),
      rivi(merkki('kielto', 'aallot'), 'Aallokon aiheuttamisen kielto', 'Nopeus on sovitettava niin, ettei aallokosta tai imusta aiheudu vahinkoa muille aluksille, rakenteille tai ympäristölle. Turvallisen ohjailun vaatimaa nopeutta saa käyttää.'),
      rivi(merkki('kielto', 'hiihto'), 'Vesihiihtokielto', 'Vesihiihto on kielletty.'),
      rivi(merkki('kielto', 'lauta'), 'Purjelautailukielto', 'Purjelautailu on kielletty.'),
      rivi(merkki('kielto', 'potkuri'), 'Aluksen kulku moottorivoimaa käyttäen kielletty', 'Moottorilla kulkeminen on kielletty. Rajoitukset ja alue tarkennetaan tarvittaessa apumerkillä.'),
      rivi(merkki('kielto', 'skootteri'), 'Vesiskootterilla ajo kielletty', 'Vesiskootterilla tai vastaavalla vesikulkuneuvolla ajaminen on kielletty.'),
      rivi(merkki('kielto', 'uimari'), 'Uiminen kielletty', 'Uiminen on kielletty.', 'Merkki on Traficomin merkkijulisteessa; vuoden 2017 määräyksen tekstissä sitä ei ole.')
    ]) +

    kortti('rajoitus', 'Määräys-, rajoitus- ja varoitusmerkit', 'Neliö, jossa on punaiset reunat, valkoinen keskusta ja musta kuvio, mutta ei vinoviivaa.', [
      rivi(merkki('rajoitus', teksti('10', 34, 22)), 'Nopeusrajoitus', 'Suurin sallittu nopeus <b>kilometreinä tunnissa (km/h)</b>. Rajoitus solmuina ilmoitetaan tarvittaessa apumerkillä.', '10 km/h on noin 5,4 solmua.'),
      rivi(merkki('rajoitus', 'vaaka'), 'Pysähtymismerkki', 'Käytetään valo-opasteiden yhteydessä. Osoittaa kohdan, johon aluksen etuosan on viimeistään pysähdyttävä, kun valot kieltävät kulun.'),
      rivi(merkki('rajoitus', 'pysty'), 'Yleinen varoitusmerkki', 'Merkin läheisyydessä on noudatettava erityistä varovaisuutta. Syy kerrotaan tarvittaessa apumerkillä.'),
      rivi(merkki('rajoitus', 'ympyra'), 'Annettava äänimerkki', 'Merkin kohdalla on annettava äänimerkki, jonka tunnus on apumerkissä.'),
      rivi(merkki('rajoitus', 'korkeus'), 'Rajoitettu alikulkukorkeus', 'Numerot kertovat suurimman alikulkukorkeuden metreinä, esimerkiksi sillan tai ilmajohdon kohdalla. Merkin yläreunassa on alaspäin osoittava kolmio.'),
      rivi(merkki('rajoitus', 'syvyys'), 'Rajoitettu kulkusyvyys', 'Numerot kertovat sallitun kulkusyvyyden metreinä. Merkin alareunassa on ylöspäin osoittava kolmio.'),
      rivi(merkki('rajoitus', 'leveys'), 'Rajoitettu kulkuleveys', 'Numerot kertovat aluksen suurimman sallitun leveyden metreinä. Merkin sivuilla on kolmiot.'),
      rivi(merkki('rajoitus', 'virtaus'), 'Voimakas virtaus', 'Merkin jälkeen väylällä on kulkua häiritsevä virtaus. Virtauksen suunta kerrotaan tarvittaessa apumerkillä.'),
      rivi(merkki('rajoitus', 'reuna'), 'Väylän reuna', 'Kolmio osoittaa suunnan väylän reunaan, ja numerot kertovat reunan etäisyyden merkistä metreinä.'),
      rivi(merkki('rajoitus', 'uimari'), 'Varoitus uimapaikasta', 'Yleisen uimapaikan läheisyydessä on noudatettava erityistä varovaisuutta.'),
      rivi(merkki('rajoitus', 'radio'), 'Otettava yhteys radiopuhelimella', 'Merkin kohdalla on otettava yhteys radiopuhelimella merkissä olevalla kanavalla.')
    ]) +

    kortti('tieto', 'Tiedotusmerkit', 'Neliö, jossa on sinisellä pohjalla valkoinen kuvio.', [
      rivi(merkki('tieto', 'P'), 'Pysäköiminen sallittu', 'Pysähtymistä varten varattu laituri tai paikka. Kiinnittyminen tai ankkurointi on sallittu sillä puolella väylää, jolla merkki on.'),
      rivi(merkki('tieto', 'pollari'), 'Kiinnittyminen sallittu', 'Rantaan tai laituriin saa kiinnittyä merkin kohdalla ja 50 metriä sen molemmin puolin, ellei apumerkki ilmoita muuta.'),
      rivi(merkki('tieto', 'salama'), 'Ilmajohto', 'Johtolinja risteää väylän. Käytetään yhdessä Rajoitettu alikulkukorkeus -merkin kanssa.'),
      rivi(merkki('tieto', 'puhelin'), 'Puhelin', 'Puhelin; sijainti tai etäisyys voi olla apukilvessä.'),
      rivi(merkki('tieto', 'lautta', viiva('M6 40h40', 1.8)), 'Lauttaväylän risteäminen (vaijerilautta)', 'Vesialuetta risteää lossi, joka kulkee vaijerin varassa. Merkissä on vaijeria esittävä viiva; apukilvessä voi lukea "Varo vaijeria".'),
      rivi(merkki('tieto', 'lautta'), 'Lauttaväylän risteäminen (vapaasti kulkeva)', 'Vesialuetta risteää vapaasti kulkeva lautta.'),
      rivi(merkki('tieto', 'radio'), 'Mahdollisuus radiopuhelinyhteyteen', 'Väylältä voi ottaa radiopuhelinyhteyden merkissä olevalla kanavalla.'),
      rivi(merkki('tieto', 'hana'), 'Juomavesipiste', 'Juomavettä saatavilla; sijainti voi olla apumerkissä.'),
      rivi(merkki('tieto', 'paattyy'), 'Kiellon, määräyksen tai rajoituksen päättyminen', 'Kielto, määräys tai rajoitus päättyy. Merkissä on vinoviiva.')
    ]) +

    kortti('kaapeli', 'Kaapelit, johdot ja apumerkit', '', [
      rivi('<svg viewBox="0 0 52 52" aria-hidden="true"><rect x="2" y="16" width="48" height="20" fill="' + KEL + '" stroke="#333" stroke-width=".8"/><text x="26" y="30" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="9.5" fill="#151515">KAAPELI</text></svg>',
        'Kaapeli- ja johtotaulu', 'Vesialueelle on laskettu kaapeli tai vesi-, viemäri- tai muu johto. Keltainen taulu, jossa on mustin kirjaimin KAAPELI (KABEL, CABLE) tai johdon laatu. Taulut ovat kummallakin rannalla, ja niitä yhdistävä suora osoittaa kaapelin paikan.', 'Älä ankkuroi taulujen väliselle linjalle.'),
      rivi('<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="15" cy="34" r="10" fill="' + PUN + '" stroke="#fff" stroke-width="3"/><circle cx="15" cy="34" r="11.6" fill="none" stroke="#999" stroke-width=".5"/><circle cx="38" cy="14" r="9" fill="' + PUN + '" stroke="#fff" stroke-width="2.6"/><circle cx="38" cy="14" r="10.4" fill="none" stroke="#999" stroke-width=".5"/><path d="M38 26l10 10-10 10-10-10z" fill="#fff" stroke="' + PUN + '" stroke-width="2.6"/></svg>',
        'Kaapelin ja johdon suuntamerkit', 'Alemman ja ylemmän suuntamerkin kautta kulkeva suora osoittaa kaapelin tai johdon paikan väylän kohdalla. Alempi on punainen ympyrä valkoisella reunalla; ylemmässä on sama ympyrä ja sen alla kärjellään oleva valkoinen neliö punaisella reunalla.'),
      rivi('<svg viewBox="0 0 52 52" aria-hidden="true"><rect x="6" y="14" width="24" height="24" fill="#fff" stroke="' + PUN + '" stroke-width="3"/><path d="M33 13v26l14-13z" fill="#fff" stroke="#333" stroke-width="1"/></svg>',
        'Apumerkit ja apukilvet', 'Valkoisia lisäkilpiä päämerkin yhteydessä. Kolmion muotoinen apumerkki osoittaa suunnan, johon päämerkki vaikuttaa. Suorakaiteen muotoinen apukilpi kertoo etäisyyden, vaikutusalueen tai muun tarkennuksen.')
    ]) +

    kortti('opasteet', 'Valo-opasteet', 'Valo-opasteilla ohjataan liikennettä kanavilla, suluilla, avattavilla silloilla, kapeikoissa ja satama-alueilla.', [
      rivi(valot([[PUN], [PUN]]), 'Kaksi kiinteää punaista valoa vierekkäin', 'Kulku kielletty.'),
      rivi(valot([[PUN]]), 'Yksi kiinteä punainen valo', 'Kulku kielletty.'),
      rivi(valot([['#27b35a'], ['#27b35a']]), 'Kaksi kiinteää vihreää valoa vierekkäin', 'Kulku sallittu.'),
      rivi(valot([['#27b35a']]), 'Yksi kiinteä vihreä valo', 'Kulku sallittu. Mahdolliset rajoitukset ilmoitetaan omalla opasteellaan.'),
      rivi(valot([['#b04ad6', 1]]), 'Yksi vilkkuva sinipunainen valo', 'Alikulkukorkeus on rajoitettu, koska avattava silta tai portti on kiinni. Silta avataan, kun alus pyytää sitä pitkällä äänimerkillä tai radiopuhelimella.'),
      rivi(valot([['#fff']]), 'Yksi kiinteä valkoinen valo', 'Saapuva alus on havaittu, mutta sen on odotettava kulkuohjeita.'),
      rivi(valot([['#fff', 1]]), 'Yksi vilkkuva valkoinen valo', 'Saapuva alus on havaittu. Sulku tai väylä on vapautumassa, ja alus voi valmistautua jatkamaan.'),
      rivi(valot([[KEL, 1]]), 'Yksi vilkkuva keltainen valo', 'Sulku, avattava silta tai erityinen väylänkohta on miehittämätön tai toimii itsepalveluna. Kulku on sallittu omalla vastuulla varovaisuutta noudattaen.')
    ]) +

    kortti('solmut', 'Veneilyn yleisimmät solmut', 'Seitsemän solmua, joilla pärjää useimmissa tilanteissa. <b>Pää</b> on köyden vapaa pää, jolla solmu tehdään, ja <b>pitkä osa</b> on kuormaan menevä osa. Harjoittele maissa ennen kuin tarvitset solmua laiturissa.', [
      solmu('', 'Paalusolmu', 'Kiinteä lenkki köyden päähän: kiinnitys renkaaseen tai paaluun, lenkki tolpan ympäri. Ei kiristy eikä luista, ja aukeaa helposti kuormituksen jälkeen.', [
        'Tee pitkään osaan pieni silmukka niin, että pään puoleinen osa jää silmukassa päällimmäiseksi.',
        'Vie pää silmukan läpi alhaalta ylös.',
        'Kierrä pää pitkän osan takaa.',
        'Vie pää takaisin samaan silmukkaan ylhäältä alas.',
        'Kiristä: pidä kiinni päästä ja lenkin reunasta ja vedä pitkästä osasta.'
      ], 'Muistisääntö: jänis tulee kolosta, kiertää puun ja palaa koloon. Jätä pää vähintään kämmenen mittaiseksi.'),
      solmu(KUVA_SIANSORKKA, 'Siansorkka', 'Nopea kiinnitys paaluun, kaiteeseen tai renkaaseen, esimerkiksi lepuuttajan ripustus. Voi löystyä, jos veto vaihtelee: varmista tarvittaessa puolisorkalla pitkän osan ympäri.', [
        'Vie pää kerran paalun ympäri.',
        'Vie pää ristiin pitkän osan yli.',
        'Kierrä toinen kierros paalun ympäri samaan suuntaan.',
        'Pujota pää juuri tekemäsi ristin alle.',
        'Kiristä vetämällä päästä ja pitkästä osasta.'
      ], 'Valmiissa solmussa on kaksi rinnakkaista kierrosta ja niiden yli yksi vino osa, jonka alta molemmat päät tulevat ulos.'),
      solmu('', 'Kierros ja kaksi puolisorkkaa', 'Varma kiinnitys renkaaseen tai paaluun. Pitää myös nykivässä kuormassa ja aukeaa, vaikka köydessä olisi vetoa.', [
        'Vie pää kaksi kertaa renkaan tai paalun ympäri. Kierros kantaa kuorman, joten voit pitää köyttä yhdellä kädellä.',
        'Vie pää pitkän osan yli, kierrä sen ympäri ja pujota syntyneen silmukan läpi. Tämä on ensimmäinen puolisorkka.',
        'Tee toinen puolisorkka samalla tavalla ja samaan suuntaan.',
        'Kiristä sorkat kierrosta vasten.'
      ], 'Kaksi samaan suuntaan tehtyä puolisorkkaa muodostavat siansorkan pitkän osan ympärille.'),
      solmu(KUVA_KNAAPI, 'Knaapikiinnitys', 'Köyden kiinnitys veneen tai laiturin knaapiin.', [
        'Vie köysi ensin knaapin kauempaan päähän ja tee yksi täysi kierros knaapin jalan ympäri sarvien alta.',
        'Vie köysi vinosti knaapin yli ja vastakkaisen sarven alta.',
        'Vie köysi vinosti takaisin yli ja toisen sarven alta, jolloin knaapin päälle syntyy kahdeksikko.',
        'Lukitse: tee viimeiseen kierrokseen lenkki, käännä se niin, että pää jää alle, ja pujota lenkki sarven päälle.',
        'Kiristä. Pää jää edellisen vinon kierroksen viereen samansuuntaisesti.'
      ], 'Yksi kahdeksikko ja lukitus riittää. Monta päällekkäistä kierrosta ei lisää pitoa, mutta hidastaa irrotusta.'),
      solmu(KUVA_KAHDEKSIKKO, 'Kahdeksikko', 'Pysäytyssolmu köyden päähän: estää esimerkiksi skuutin karkaamisen plokista tai lukosta.', [
        'Tee silmukka viemällä pää pitkän osan yli.',
        'Kierrä pää pitkän osan takaa.',
        'Pujota pää silmukan läpi edestä.',
        'Kiristä. Solmu näyttää numerolta 8.'
      ], ''),
      solmu('', 'Merimiessolmu', 'Kahden yhtä paksun köyden pään sitominen yhteen, kun veto on kevyt: purjeen reivaus, nyytit, paketit. Ei kuormaa kantaviin jatkoksiin, koska solmu voi aueta tai luistaa.', [
        'Vie vasen pää oikean yli ja ali.',
        'Vie sitten sama pää, joka on nyt oikealla, vasemman yli ja ali.',
        'Kiristä vetämällä molemmista köysistä.'
      ], 'Tarkista: kummankin köyden pää ja pitkä osa tulevat ulos samalta puolelta toisen köyden lenkkiä, ja solmu on litteä. Jos päät tulevat ulos eri puolilta, kyseessä on ämmänsolmu, joka luistaa.'),
      solmu('', 'Jalussolmu', 'Kahden köyden liittäminen, myös eripaksuisten.', [
        'Taita paksumman köyden pää lenkiksi.',
        'Vie ohuemman köyden pää lenkin läpi alhaalta ylös.',
        'Kierrä pää lenkin molempien osien takaa.',
        'Pujota pää oman pitkän osansa alle, lenkin päältä.',
        'Kiristä pitämällä lenkistä ja vetämällä ohuemman köyden pitkästä osasta.'
      ], 'Valmiissa solmussa molempien köysien vapaat päät jäävät samalle puolelle. Jos paksuusero on suuri tai köysi liukas, kierrä pää lenkin takaa kahdesti ennen pujotusta.'),
      '<div class="pieni">Solmuohjeet ovat yleistä veneilytietoa, eivät viranomaislähteestä. Kuva on vain kolmesta solmusta; kokeile jokainen solmu köydellä ja varmista, että se pitää, ennen kuin luotat siihen.</div>'
    ]) +

    '<div class="kortti opas"><h2>Lähteet</h2><div class="pieni">Liikenneviraston määräys yleisten kulkuväylien merkitsemisestä, 28.5.2015 (LIVI/2584/06.04.01/2015). Liikenneviraston määräys vesiliikennemerkeistä ja valo-opasteista, 12.4.2017 (LIVI/2393/00.03.03/2017). Traficomin juliste Vesiliikennemerkit. Tiedot on poimittu näistä 23.11.2026.</div>' +
    '<div class="pieni"><b>Kuvat ovat yksinkertaistettuja piirroksia, eivät virallisia merkkikuvia.</b> Määräykset voivat olla muuttuneet: tarkista ajantasaiset tiedot Traficomilta ja Väylävirastolta. Opas ei korvaa merikarttaa eikä vesiliikenteen sääntöjä.</div></div>';
})();
function nOpas() { return OPAS_HTML; }
