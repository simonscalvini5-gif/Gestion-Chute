/**
 * Goulottes – gestion des chutes et découpe par machine – TDM by Insidix
 * Hébergé gratuitement par Google Apps Script, stock enregistré dans ce Google Sheets.
 *
 * Les mots de passe ne sont pas dans ce fichier (il est public sur GitHub et redéployé automatiquement) :
 * ils sont lus dans Apps Script → Paramètres du projet → Propriétés du script,
 * clés MOT_DE_PASSE (atelier) et ACHAT_MOT_DE_PASSE (Espace méthode).
 */
const IDENTIFIANT = 'Production';
const ACHAT_IDENTIFIANT = 'Morgan';
const prop = k => PropertiesService.getScriptProperties().getProperty(k) || '';
const MOT_DE_PASSE = prop('MOT_DE_PASSE');
const ACHAT_MOT_DE_PASSE = prop('ACHAT_MOT_DE_PASSE');

// Alerte e-mail quand il ne reste plus que SEUIL_ALERTE bruts (ou moins) d'une section.
const ALERTE_EMAIL = 'simon.scalvini@insidix.com';
// Nom d'expéditeur affiché dans les e-mails (l'adresse reste celle du compte Google propriétaire du script).
const EXPEDITEUR = 'Goulottes by TDM';
const SEUIL_ALERTE = 3;
// Bon de commande planifié : envoyé ce nombre de semaines avant la semaine de fabrication, calculé au moment de l'envoi.
const RAPPEL_SEMAINES = 1;

// Sections de goulotte ; brutes de 2000 mm (réglable dans Paramètres).
const PROFILES = ['Goulotte 40x40', 'Goulotte 40x60', 'Goulotte 40x80', 'Goulotte 60x60', 'Goulotte 60x80'];
const DEFAULT_SETTINGS = { barLength: 2000, kerf: 5, minKeep: 100 };
const HISTORY_SHOWN = 100;
const PDF_FOLDER = 'Plans de découpe goulottes';

const SHEET_STOCK = 'Stock';
const SHEET_HISTORY = 'Historique';
const SHEET_SETTINGS = 'Paramètres';
const SHEET_MACHINES = 'Machines';
const SHEET_BRUTS = 'Bruts';
const SHEET_MOUVEMENTS = 'Mouvements bruts';
const SHEET_ACHATS = 'Achats';
const SHEET_PREVISIONS = 'Prévisions';
const SHEET_LIVRAISONS = 'Livraisons';

// Liste de découpe de chaque machine : [section, longueur, quantité].
// Recopiée une seule fois dans l'onglet « Machines », que l'on modifie ensuite directement dans le tableau.
const MACHINES_INIT = {
  'CP3XLV2': [
    ['Goulotte 40x60', 850, 2], ['Goulotte 40x60', 760, 2], ['Goulotte 40x60', 500, 1], ['Goulotte 40x60', 610, 2],
    ['Goulotte 40x60', 420, 1], ['Goulotte 40x80', 400, 4], ['Goulotte 40x60', 620, 1], ['Goulotte 40x80', 610, 1],
    ['Goulotte 40x80', 1085, 1], ['Goulotte 40x80', 1855, 1], ['Goulotte 40x80', 275, 1], ['Goulotte 40x80', 1220, 4],
    ['Goulotte 40x40', 1140, 2], ['Goulotte 40x60', 1710, 1], ['Goulotte 40x80', 1140, 1], ['Goulotte 40x80', 2000, 2],
    ['Goulotte 40x80', 1050, 2]
  ],
  'CP3V2': [
    ['Goulotte 40x80', 565, 1], ['Goulotte 40x60', 630, 1], ['Goulotte 40x60', 700, 1], ['Goulotte 40x40', 665, 1],
    ['Goulotte 40x60', 665, 1], ['Goulotte 40x40', 800, 1], ['Goulotte 40x60', 610, 1], ['Goulotte 40x60', 1440, 2],
    ['Goulotte 40x60', 590, 1], ['Goulotte 40x80', 630, 1], ['Goulotte 40x80', 1025, 1]
  ],
  'CP3V1': [
    ['Goulotte 40x80', 1200, 1], ['Goulotte 60x80', 405, 1], ['Goulotte 60x80', 720, 1], ['Goulotte 60x60', 685, 1],
    ['Goulotte 40x60', 830, 1], ['Goulotte 40x60', 570, 1], ['Goulotte 60x60', 570, 1], ['Goulotte 60x60', 620, 1],
    ['Goulotte 40x80', 710, 1], ['Goulotte 40x80', 1165, 1], ['Goulotte 60x80', 2000, 1], ['Goulotte 60x80', 450, 1]
  ]
};

/* ---------- Page ---------- */

// Appel depuis le site hébergé sur GitHub Pages : corps JSON { action, payload, login }.
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = api(String(req.action || ''), req.payload || {}, req.login || null);
  } catch (err) {
    out = { error: 'Erreur serveur : ' + err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Goulottes – TDM by Insidix')
    .setFaviconUrl('https://simonscalvini5-gif.github.io/Gestion-Chute/img/favicon-32.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Appel unique depuis la page ---------- */

function api(action, payload, login) {
  if (!MOT_DE_PASSE) return { error: 'Le mot de passe n\'est pas encore réglé (Propriétés du script : MOT_DE_PASSE).' };
  if (!login || login.user !== IDENTIFIANT || login.password !== MOT_DE_PASSE) return { error: 'auth' };

  if (action === 'state') {
    const props = PropertiesService.getScriptProperties();
    // Livraisons arrivées et rappels de commande : vérifiés au plus une fois par heure (et chaque matin par le déclencheur).
    if (Date.now() - Number(props.getProperty('lastCheck') || 0) > 3600000) {
      const l = LockService.getScriptLock();
      if (l.tryLock(5000)) {
        try { props.setProperty('lastCheck', String(Date.now())); processDeliveries(); sendReminders(); sendReceptionAlerts(); archiveYears(); } finally { l.releaseLock(); }
      }
    }
    // Rien n'a changé depuis le dernier appel de ce poste : on ne relit pas le tableau.
    const v = dataVersion();
    if (payload && payload.v && String(payload.v) === v) return { unchanged: true, v: v };
    return { state: readState(), v: v };
  }

  // Une seule modification à la fois, même si plusieurs postes valident en même temps.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { error: 'Le serveur est occupé, réessayez dans un instant.' };
  try {
    processDeliveries();
    let result;
    if (action === 'cut') result = cut(payload);
    else if (action === 'add') result = addChute(payload);
    else if (action === 'miscut') result = miscut(payload);
    else if (action === 'remove') result = removeChute(payload);
    else if (action === 'settings') result = saveSettings(payload);
    else if (action === 'applyPlan') result = applyPlan(payload);
    else if (action === 'pdf') result = makePdf(payload);
    else if (action === 'addBrut') result = addBruts(payload);
    else if (action === 'removeBrut') result = removeBruts(payload);
    else if (action === 'achatLogin') result = achatCheck(payload) || { achats: readAchats(), planning: readPlanning(), bdcConfig: readBdcConfig() };
    else if (action === 'bdcConfig') result = achatCheck(payload) || saveBdcConfig(payload);
    else if (action === 'undoInfo') result = achatCheck(payload) || { undo: lastOperation() && describeOp(lastOperation()) };
    else if (action === 'undoLast') result = achatCheck(payload) || undoLast(payload);
    else if (action === 'bdcTest') result = achatCheck(payload) || bdcTest(payload);
    else if (action === 'planSave') result = achatCheck(payload) || savePlanning(payload);
    else if (action === 'deliveryReceived') result = achatCheck(payload) || receiveDelivery(payload);
    else if (action === 'achatReceive') result = achatCheck(payload) || receiveAchat(payload);
    else if (action === 'achatValidate') result = achatCheck(payload) || validateAchat(payload);
    else return { error: 'Action inconnue.' };
    SpreadsheetApp.flush();
    if (!result.error) { bumpVersion(); result.state = readState(); result.v = dataVersion(); }
    return result;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Feuilles ---------- */

function sheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

const stockSheet = () => sheet(SHEET_STOCK, ['N°', 'Section', 'Longueur (mm)', 'Ajoutée le', 'ID']);
const HISTORY_HEAD = ['Date', 'Section', 'Coupe (mm)', 'Source', 'Longueur source (mm)', 'N° source', 'Reste (mm)', 'Gardée', 'N° gardé', 'Opération', 'Annulée le'];
function historySheet() {
  const sh = sheet(SHEET_HISTORY, HISTORY_HEAD);
  if (sh.getRange(1, 10).getValue() !== 'Opération') sh.getRange(1, 1, 1, HISTORY_HEAD.length).setValues([HISTORY_HEAD]);
  return sh;
}
const settingsSheet = () => sheet(SHEET_SETTINGS, ['Paramètre', 'Valeur']);
const mouvementsSheet = () => sheet(SHEET_MOUVEMENTS, ['Date', 'Section', 'Quantité', 'Motif']);
const ACHATS_HEAD = ['Date', 'Acheteur', 'Référence', 'Section', 'Quantité', 'Statut', 'Reçu le', 'ID', 'BC', 'Relancé le'];
function achatsSheet() {
  const sh = sheet(SHEET_ACHATS, ACHATS_HEAD);
  if (sh.getRange(1, 10).getValue() !== 'Relancé le') sh.getRange(1, 1, 1, ACHATS_HEAD.length).setValues([ACHATS_HEAD]);
  return sh;
}

/* ---------- Goulottes brutes (barres neuves de 2000 mm) ---------- */

function brutsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_BRUTS);
  if (sh) return sh;
  sh = sheet(SHEET_BRUTS, ['Section', 'Quantité en stock']);
  PROFILES.forEach(pr => sh.appendRow([pr, 0]));
  return sh;
}

// { section: quantité }
function readBruts() {
  const sh = brutsSheet();
  const out = {};
  PROFILES.forEach(pr => { out[pr] = 0; });
  const last = sh.getLastRow();
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 2).getValues().forEach(r => {
    if (PROFILES.indexOf(String(r[0])) >= 0) out[String(r[0])] = Math.max(0, Math.round(Number(r[1]) || 0));
  });
  return out;
}

// Ajoute (ou retire si négatif) des bruts ; le stock ne descend jamais sous 0.
// Numéro de version des données : change à chaque modification, permet aux postes de ne relire que si besoin.
function dataVersion() { return PropertiesService.getScriptProperties().getProperty('dataV') || '1'; }
function bumpVersion() { PropertiesService.getScriptProperties().setProperty('dataV', String(Date.now())); }

function changeBruts(deltas, motif) {
  bumpVersion();
  const sh = brutsSheet();
  const now = new Date();
  const alerts = [];
  Object.keys(deltas).forEach(pr => {
    const d = Math.round(deltas[pr]);
    if (!d || PROFILES.indexOf(pr) < 0) return;
    const last = sh.getLastRow();
    const names = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    let i = names.indexOf(pr);
    if (i < 0) { sh.appendRow([pr, 0]); i = names.length; }
    const cell = sh.getRange(i + 2, 2);
    const before = Math.max(0, Math.round(Number(cell.getValue()) || 0));
    const after = Math.max(0, before + d);
    cell.setValue(after);
    mouvementsSheet().appendRow([now, pr, d, motif]);
    // Alerte au passage sous le seuil, puis à la rupture.
    if (after < before && ((before > SEUIL_ALERTE && after <= SEUIL_ALERTE) || (before > 0 && after === 0))) {
      alerts.push({ profile: pr, left: after });
    }
  });
  if (alerts.length) sendAlert(alerts, motif);
}

function sendAlert(alerts, motif) {
  if (!ALERTE_EMAIL) return;
  const lines = alerts.map(a => a.profile + ' : ' + (a.left === 0 ? 'RUPTURE (0 brut)' : 'plus que ' + a.left + ' brut(s)'));
  const rupture = alerts.some(a => a.left === 0);
  const subject = (rupture ? '[Rupture] ' : '[Stock bas] ') + 'Goulottes brutes – ' + alerts.map(a => a.profile.replace('Goulotte ', '')).join(', ');
  const html = '<div style="font-family:Arial,sans-serif;color:#1f2a44">'
    + '<p style="font-size:18px;color:#1f3f84"><b>TDM by INSIDI<span style="color:#f2b705">X</span></b> – stock de goulottes brutes</p>'
    + '<p>' + (rupture ? 'Une ou plusieurs sections sont en <b style="color:#b42318">rupture</b>.' : 'Le stock de goulottes brutes passe sous le seuil de ' + SEUIL_ALERTE + '.') + '</p>'
    + '<ul>' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>'
    + '<p style="color:#7a8291">Dernier mouvement : ' + esc(motif) + '. Pensez à passer commande (Espace méthode).</p></div>';
  try {
    MailApp.sendEmail({ to: ALERTE_EMAIL, name: EXPEDITEUR, subject: subject, body: lines.join('\n'), htmlBody: html });
  } catch (e) {
    mouvementsSheet().appendRow([new Date(), '', 0, 'Alerte e-mail non envoyée : ' + e.message]);
  }
}

function removeBruts(p) {
  const qty = Math.round(Number(p.qty));
  if (PROFILES.indexOf(p.profile) < 0 || !(qty > 0)) return { error: 'Section ou quantité invalide.' };
  const have = readBruts()[p.profile] || 0;
  if (qty > have) return { error: 'Impossible de retirer ' + qty + ' brut(s) : il n\'y en a que ' + have + ' en stock.' };
  const motif = String(p.motif || '').slice(0, 80);
  changeBruts({ [p.profile]: -qty }, 'Retrait manuel' + (motif ? ' – ' + motif : ''));
  return {};
}

function addBruts(p) {
  const qty = Math.round(Number(p.qty));
  if (PROFILES.indexOf(p.profile) < 0 || !(qty > 0) || qty > 1000) return { error: 'Section ou quantité invalide (1 à 1000).' };
  changeBruts({ [p.profile]: qty }, 'Ajout manuel');
  return {};
}

/* ---------- Achat ---------- */

function achatCheck(p) {
  if (!ACHAT_MOT_DE_PASSE) return { error: 'Le mot de passe de l\'Espace méthode n\'est pas encore réglé (Propriétés du script : ACHAT_MOT_DE_PASSE).' };
  const a = (p && p.achat) || {};
  if (a.user !== ACHAT_IDENTIFIANT || a.password !== ACHAT_MOT_DE_PASSE) return { error: 'Identifiant ou mot de passe Achat incorrect.' };
  return null;
}

function readAchats() {
  const sh = achatsSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(30, last - 1);
  return sh.getRange(last - n + 1, 1, n, 9).getValues().reverse()
    .map(r => ({ date: iso(r[0]), user: String(r[1]), ref: String(r[2]), profile: String(r[3]), qty: Number(r[4]),
      // anciennes lignes sans statut : déjà ajoutées au stock à l'époque
      status: String(r[5] || 'Reçu'), received: iso(r[6]), id: String(r[7] || ''), bc: String(r[8] || '') }));
}

// Commande immédiate : bon de commande envoyé tout de suite ; les bruts n'entrent en stock qu'à la réception.
function validateAchat(p) {
  const lines = (p.lines || []).map(l => ({ profile: String(l.profile), qty: Math.round(Number(l.qty)) }))
    .filter(l => l.qty > 0);
  if (!lines.length) return { error: 'Aucune quantité à acheter.' };
  if (lines.some(l => PROFILES.indexOf(l.profile) < 0 || l.qty > 1000)) return { error: 'Commande invalide.' };
  const ref = String(p.ref || '').slice(0, 120);
  const now = new Date();
  const deltas = {};
  lines.forEach(l => { deltas[l.profile] = (deltas[l.profile] || 0) + l.qty; });
  const merged = PROFILES.filter(pr => deltas[pr] > 0).map(pr => ({ profile: pr, qty: deltas[pr] }));
  let bdc = null;
  try {
    bdc = makeBdc(merged, new Date(Date.now() + 7 * 86400000), 'Commande immédiate' + (ref ? ' – ' + ref : ''), false);
    mailBdc(bdc, '[Bon de commande ' + bdc.num + '] Goulottes brutes' + (ref ? ' – ' + ref : ''),
      '<p>Commande validée par ' + esc(ACHAT_IDENTIFIANT) + ' : ' + merged.map(l => esc(l.profile.replace('Goulotte ', '')) + ' × ' + l.qty).join(', ') + '.</p>');
  } catch (e) {
    mouvementsSheet().appendRow([new Date(), '', 0, 'Bon de commande non envoyé : ' + e.message]);
  }
  merged.forEach(l => achatsSheet().appendRow([now, ACHAT_IDENTIFIANT, ref, l.profile, l.qty, 'Commandé', '', Utilities.getUuid(), bdc ? bdc.num : '']));
  return { achats: readAchats(), bdc: bdc ? { num: bdc.num, url: bdc.url } : null };
}

// Réception d'une commande immédiate : une ligne (id) ou tout un bon de commande (bc).
function receiveAchat(p) {
  const sh = achatsSheet();
  const last = sh.getLastRow();
  if (last < 2) return { error: 'Commande introuvable.' };
  const vals = sh.getRange(2, 1, last - 1, 9).getValues();
  const now = new Date();
  const deltas = {};
  let n = 0;
  vals.forEach((r, i) => {
    const hit = (p.id && String(r[7]) === String(p.id)) || (p.bc && String(r[8]) === String(p.bc));
    if (!hit || String(r[5]) !== 'Commandé') return;
    sh.getRange(i + 2, 6, 1, 2).setValues([['Reçu', now]]);
    deltas[String(r[3])] = (deltas[String(r[3])] || 0) + Number(r[4]);
    n++;
  });
  if (!n) return { error: 'Commande introuvable ou déjà reçue.' };
  changeBruts(deltas, 'Réception commande' + (p.bc ? ' BC ' + p.bc : ''));
  return { achats: readAchats(), planning: readPlanning() };
}

function machinesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(SHEET_MACHINES)) return ss.getSheetByName(SHEET_MACHINES);
  const sh = sheet(SHEET_MACHINES, ['Machine', 'Section', 'Longueur (mm)', 'Quantité']);
  Object.keys(MACHINES_INIT).forEach(m => MACHINES_INIT[m].forEach(r => sh.appendRow([m, r[0], r[1], r[2]])));
  return sh;
}

// { machine: [{ profile, length, qty }] } ; les lignes mal remplies sont ignorées.
function readMachines() {
  const sh = machinesSheet();
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 4).getValues().forEach(r => {
    const name = String(r[0]).trim();
    const profile = String(r[1]).trim();
    const length = Math.round(Number(r[2]));
    const qty = Math.round(Number(r[3]));
    if (!name || PROFILES.indexOf(profile) < 0 || !(length > 0) || !(qty > 0)) return;
    (out[name] = out[name] || []).push({ profile: profile, length: length, qty: qty });
  });
  return out;
}

function readSettings() {
  const rows = settingsSheet().getDataRange().getValues().slice(1);
  const map = {};
  rows.forEach(r => { map[r[0]] = Number(r[1]); });
  return {
    barLength: map.barLength > 0 ? map.barLength : DEFAULT_SETTINGS.barLength,
    kerf: map.kerf >= 0 ? map.kerf : DEFAULT_SETTINGS.kerf,
    minKeep: map.minKeep >= 0 ? map.minKeep : DEFAULT_SETTINGS.minKeep,
    nextNum: map.nextNum > 0 ? map.nextNum : 1,
    minKeepSec: readMinKeepSec(),
    lotSec: readLotSec()
  };
}

// Chute mini gardée par section : la valeur saisie, sinon la plus petite pièce de cette section dans les machines
// (un reste plus court ne pourra jamais servir).
function autoMinKeep() {
  const out = {};
  const m = readMachines();
  Object.keys(m).forEach(n => m[n].forEach(r => { if (!(out[r.profile] <= r.length)) out[r.profile] = r.length; }));
  return out;
}
function readMinKeepSec() {
  let saved = {};
  try { saved = JSON.parse(String(readKey('minKeepSec') || '{}')); } catch (e) { saved = {}; }
  const auto = autoMinKeep();
  const out = {};
  PROFILES.forEach(p => { out[p] = saved[p] >= 0 ? Number(saved[p]) : auto[p] >= 0 ? auto[p] : DEFAULT_SETTINGS.minKeep; });
  return out;
}
// Conditionnement à l'achat : nombre de bruts par lot chez le fournisseur (1 = à l'unité).
function readLotSec() {
  let saved = {};
  try { saved = JSON.parse(String(readKey('lotSec') || '{}')); } catch (e) { saved = {}; }
  const out = {};
  PROFILES.forEach(p => { out[p] = saved[p] >= 1 ? Math.round(Number(saved[p])) : 1; });
  return out;
}
// Quantité à commander arrondie au lot supérieur.
const roundLot = (s, profile, n) => { const l = (s.lotSec && s.lotSec[profile] >= 1) ? s.lotSec[profile] : 1; return n > 0 ? Math.ceil(n / l) * l : 0; };
const minKeepFor = (s, profile) => (s.minKeepSec && s.minKeepSec[profile] >= 0) ? s.minKeepSec[profile] : s.minKeep;

function writeSettings(s) {
  const sh = settingsSheet();
  sh.getRange(2, 1, 4, 2).setValues([
    ['barLength', s.barLength], ['kerf', s.kerf], ['minKeep', s.minKeep], ['nextNum', s.nextNum]
  ]);
}

function iso(v) {
  return v instanceof Date ? v.toISOString() : String(v || '');
}

function readChutes() {
  const sh = stockSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter(r => r[4])
    .map(r => ({ num: Number(r[0]), profile: String(r[1]), length: Number(r[2]), date: iso(r[3]), id: String(r[4]) }));
}

function readHistory() {
  const sh = historySheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(HISTORY_SHOWN, last - 1);
  return sh.getRange(last - n + 1, 1, n, 11).getValues().reverse().map(r => ({
    op: String(r[9] || ''), cancelled: r[10] !== '' && r[10] !== null,
    date: iso(r[0]), profile: String(r[1]), cut: String(r[2]),
    source: r[3] === 'Chute' ? 'chute' : r[3] === 'Erreur de coupe' ? 'erreur' : 'barre', sourceLength: Number(r[4]),
    sourceNum: r[5] === '' ? null : Number(r[5]), remainder: Number(r[6]),
    kept: r[7] === 'Oui', keptNum: r[8] === '' ? null : Number(r[8])
  }));
}

function readState() {
  const s = readSettings();
  return {
    version: Date.now(),
    settings: { barLength: s.barLength, kerf: s.kerf, minKeep: s.minKeep, minKeepSec: s.minKeepSec, minKeepAuto: autoMinKeep(), lotSec: s.lotSec },
    chutes: readChutes(),
    history: readHistory(),
    machines: readMachines(),
    bruts: readBruts(),
    livraisons: readDeliveries().filter(d => d.status === 'Prévu')
  };
}

/* ---------- Actions ---------- */

// Reste après la coupe : le trait de scie n'est retiré que s'il reste de la matière.
function remainderAfter(source, cutLen, kerf) {
  if (source === cutLen) return 0;
  return Math.max(0, source - cutLen - kerf);
}

function findRow(id) {
  const sh = stockSheet();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const ids = sh.getRange(2, 5, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return null;
}

function cut(p) {
  const s = readSettings();
  const len = Math.round(Number(p.cut));
  if (PROFILES.indexOf(p.profile) < 0 || !(len > 0) || len > s.barLength) return { error: 'Section ou longueur invalide.' };

  const sh = stockSheet();
  let sourceLength = s.barLength;
  let sourceNum = '';
  if (p.source !== 'chute' && (readBruts()[p.profile] || 0) <= 0) {
    return { error: 'Plus de goulotte brute ' + p.profile.replace('Goulotte ', '') + ' en stock : découpe impossible. Ajoutez des bruts ou passez commande (Espace méthode).' };
  }
  if (p.source === 'chute') {
    const row = findRow(String(p.chuteId));
    if (!row) return { error: 'Cette chute vient d\'être prise par quelqu\'un d\'autre. Relancez la recherche.' };
    const r = sh.getRange(row, 1, 1, 3).getValues()[0];
    if (String(r[1]) !== p.profile || Number(r[2]) < len) return { error: 'Cette chute ne convient pas.' };
    sourceNum = Number(r[0]);
    sourceLength = Number(r[2]);
    sh.deleteRow(row);
  }

  const remainder = remainderAfter(sourceLength, len, s.kerf);
  const kept = remainder > 0 && remainder >= minKeepFor(s, p.profile);
  const now = new Date();
  let keptNum = '';
  if (kept) {
    keptNum = s.nextNum++;
    sh.appendRow([keptNum, p.profile, remainder, now, Utilities.getUuid()]);
    writeSettings(s);
  }
  historySheet().appendRow([now, p.profile, len, p.source === 'chute' ? 'Chute' : 'Goulotte neuve',
    sourceLength, sourceNum, remainder, kept ? 'Oui' : 'Non', keptNum, Utilities.getUuid(), '']);
  if (p.source !== 'chute') changeBruts({ [p.profile]: -1 }, 'Découpe ' + len + ' mm');
  return { remainder: remainder, kept: kept, keptNum: kept ? keptNum : null };
}

// Pièce coupée par erreur : en dessous de la chute minimale = rebut, sinon elle entre dans le stock de chutes.
function miscut(p) {
  const s = readSettings();
  const len = Math.round(Number(p.length));
  if (PROFILES.indexOf(p.profile) < 0 || !(len > 0) || len > s.barLength) {
    return { error: 'Longueur invalide (1 à ' + s.barLength + ' mm).' };
  }
  const kept = len >= minKeepFor(s, p.profile);
  const now = new Date();
  let num = '';
  if (kept) {
    num = s.nextNum++;
    stockSheet().appendRow([num, p.profile, len, now, Utilities.getUuid()]);
    writeSettings(s);
  }
  historySheet().appendRow([now, p.profile, len, 'Erreur de coupe', '', '', len, kept ? 'Oui' : 'Non', num, Utilities.getUuid(), '']);
  return { kept: kept, num: kept ? num : null, minKeep: minKeepFor(s, p.profile) };
}

function addChute(p) {
  const s = readSettings();
  const len = Math.round(Number(p.length));
  if (PROFILES.indexOf(p.profile) < 0 || !(len > 0) || len > s.barLength) {
    return { error: 'Longueur invalide (1 à ' + s.barLength + ' mm).' };
  }
  const num = s.nextNum++;
  stockSheet().appendRow([num, p.profile, len, new Date(), Utilities.getUuid()]);
  writeSettings(s);
  return { num: num };
}

function removeChute(p) {
  const row = findRow(String(p.id));
  if (row) stockSheet().deleteRow(row);
  return {};
}

function saveSettings(p) {
  const s = readSettings();
  const n = { barLength: Math.round(Number(p.barLength)), kerf: Number(p.kerf), minKeep: Math.round(Number(p.minKeep)) };
  if (!(n.barLength > 0) || !(n.kerf >= 0) || !(n.minKeep >= 0)) return { error: 'Paramètres invalides.' };
  writeSettings({ barLength: n.barLength, kerf: n.kerf, minKeep: n.minKeep, nextNum: s.nextNum });
  if (p.minKeepSec) {
    const m = {};
    PROFILES.forEach(pr => { const v = p.minKeepSec[pr]; if (v !== '' && v !== null && v !== undefined && Number(v) >= 0) m[pr] = Math.round(Number(v)); });
    writeKey('minKeepSec', JSON.stringify(m));
  }
  if (p.lotSec) {
    const l = {};
    PROFILES.forEach(pr => { const v = Math.round(Number(p.lotSec[pr])); if (v >= 1 && v <= 500) l[pr] = v; });
    writeKey('lotSec', JSON.stringify(l));
  }
  return {};
}

/* ---------- Plan de découpe ---------- */

// Position atteinte dans la barre après une série de coupes (trait de scie compris).
function usedLength(pieces, total, kerf) {
  let pos = 0;
  pieces.forEach(len => { pos += len; if (pos < total) pos = Math.min(total, pos + kerf); });
  return pos;
}

function applyPlan(p) {
  const s = readSettings();
  const bars = (p && p.bars) || [];
  if (!bars.length) return { error: 'Le plan est vide.' };
  const sh = stockSheet();

  // Vérifie tout avant de modifier quoi que ce soit.
  const checked = [];
  const ids = bars.filter(b => b.source === 'chute').map(b => String(b.chuteId));
  if (new Set(ids).size !== ids.length) return { error: 'Plan invalide.' };
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const pieces = (b.pieces || []).map(x => Math.round(Number(x)));
    if (PROFILES.indexOf(b.profile) < 0 || !pieces.length || pieces.some(x => !(x > 0))) return { error: 'Plan invalide.' };
    let total = s.barLength, sourceNum = '', row = null;
    if (b.source === 'chute') {
      row = findRow(String(b.chuteId));
      if (!row) return { error: 'Une chute du plan vient d\'être utilisée par quelqu\'un d\'autre. Recalculez le plan.' };
      const r = sh.getRange(row, 1, 1, 3).getValues()[0];
      if (String(r[1]) !== b.profile) return { error: 'Plan invalide.' };
      sourceNum = Number(r[0]);
      total = Number(r[2]);
    }
    const sum = pieces.reduce((a, x) => a + x, 0) + s.kerf * (pieces.length - 1);
    if (sum > total) return { error: 'Les paramètres ou le stock ont changé. Recalculez le plan.' };
    checked.push({ b: b, pieces: pieces, total: total, sourceNum: sourceNum });
  }

  const need = {};
  checked.forEach(c => { if (c.b.source !== 'chute') need[c.b.profile] = (need[c.b.profile] || 0) + 1; });
  const stock = readBruts();
  const missing = Object.keys(need).filter(pr => need[pr] > (stock[pr] || 0));
  if (missing.length) {
    return { error: 'Bruts insuffisants : ' + missing.map(pr => pr.replace('Goulotte ', '') + ' (' + need[pr] + ' nécessaire(s), ' + (stock[pr] || 0) + ' en stock)').join(', ') + '. Découpe impossible tant que le stock n\'est pas complété.' };
  }

  // Retire les chutes utilisées, ajoute les restes, écrit l'historique.
  const now = new Date();
  const op = Utilities.getUuid();
  const kept = [];
  checked.forEach(c => {
    if (c.b.source === 'chute') sh.deleteRow(findRow(String(c.b.chuteId)));
    const remainder = c.total - usedLength(c.pieces, c.total, s.kerf);
    const keep = remainder > 0 && remainder >= minKeepFor(s, c.b.profile);
    let num = '';
    if (keep) {
      num = s.nextNum++;
      sh.appendRow([num, c.b.profile, remainder, now, Utilities.getUuid()]);
    }
    kept.push(keep ? num : null);
    historySheet().appendRow([now, c.b.profile, c.pieces.join(' + '),
      c.b.source === 'chute' ? 'Chute' : 'Goulotte neuve', c.total, c.sourceNum, remainder, keep ? 'Oui' : 'Non', num, op, '']);
  });
  writeSettings(s);
  const used = {};
  checked.forEach(c => { if (c.b.source !== 'chute') used[c.b.profile] = (used[c.b.profile] || 0) - 1; });
  changeBruts(used, 'Plan de découpe' + (p.ref ? ' – ' + String(p.ref).slice(0, 80) : ''));
  return { keptNums: kept };
}

function esc(v) {
  return String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Crée le PDF du plan dans Google Drive et renvoie son lien.
function makePdf(p) {
  const s = readSettings();
  const bars = p.bars || [];
  const title = 'Plan de découpe' + (p.ref ? ' – ' + p.ref : '');
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  const colors = ['#1f3f84', '#2f6db5', '#3d84c6', '#5a9bd5'];

  let html = '<html><body style="font-family:Arial,sans-serif;font-size:10pt;color:#1f2a44">'
    + '<table style="width:100%;border-bottom:3px solid #1f3f84;margin-bottom:10px"><tr>'
    + '<td><span style="font-size:22pt;color:#1f3f84;font-weight:bold">TDM</span> '
    + '<span style="font-size:9pt;color:#1f3f84">by <b>INSIDI<span style="color:#f2b705">X</span></b></span></td>'
    + '<td style="text-align:right"><b style="font-size:14pt">' + esc(title) + '</b><br>' + esc(date)
    + '<br>Trait de scie ' + s.kerf + ' mm · goulotte brute ' + s.barLength + ' mm</td></tr></table>';

  html += '<p><b>Résumé :</b> ' + esc(p.summary || '') + '</p>';
  // Vue 3D du plan, envoyée par la page (image JPEG ou PNG uniquement).
  if (typeof p.image === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(p.image) && p.image.length < 3000000) {
    html += '<img src="' + p.image + '" style="width:100%;border-radius:6px;margin:4px 0 10px">';
  }

  const profiles = PROFILES.filter(pr => bars.some(b => b.profile === pr));
  profiles.forEach(pr => {
    const list = bars.filter(b => b.profile === pr);
    html += '<h2 style="font-size:13pt;color:#1f3f84;margin:16px 0 6px;border-bottom:1px solid #dde3ee">'
      + pr
      + ' – ' + list.length + ' barre(s)</h2>';
    list.forEach((b, i) => {
      const total = Number(b.length);
      const remainder = total - usedLength(b.pieces, total, s.kerf);
      const keep = remainder > 0 && remainder >= minKeepFor(s, pr);
      const source = b.source === 'chute' ? 'Chute n° ' + b.num + ' (' + total + ' mm)' : 'Goulotte neuve (' + total + ' mm)';
      let cells = '';
      b.pieces.forEach((len, k) => {
        cells += '<td style="width:' + (len / total * 100).toFixed(2) + '%;background:' + colors[k % colors.length]
          + ';color:#ffffff;text-align:center;font-size:8pt;padding:4px 0">' + len + '</td>';
        if (k < b.pieces.length - 1 || remainder > 0) {
          cells += '<td style="width:' + (Math.max(0.4, s.kerf / total * 100)).toFixed(2) + '%;background:#1f2a44"></td>';
        }
      });
      if (remainder > 0) {
        cells += '<td style="width:' + (remainder / total * 100).toFixed(2) + '%;background:' + (keep ? '#2e9b52' : '#a7b0bd')
          + ';color:#ffffff;text-align:center;font-size:8pt">' + remainder + '</td>';
      }
      const restText = remainder <= 0 ? 'aucun reste'
        : keep ? 'reste ' + remainder + ' mm → stock' + (b.keptNum ? ' (marquer n° ' + b.keptNum + ')' : '')
        : 'reste ' + remainder + ' mm → déchet';
      html += '<table style="width:100%;margin-top:8px"><tr><td style="width:70%"><b>' + (i + 1) + '. ' + esc(source) + '</b></td>'
        + '<td style="text-align:right;color:#595e5c">' + esc(restText) + '</td></tr></table>'
        + '<table style="width:100%;border:1px solid #1f2a44;border-collapse:collapse;height:18px"><tr>' + cells + '</tr></table>'
        + '<p style="margin:2px 0 0;font-size:9pt">Coupes : ' + b.pieces.map(x => x + ' mm').join(' · ') + '</p>';
    });
  });

  html += '<p style="margin-top:18px;font-size:8pt;color:#595e5c">Bleu : pièces · noir : trait de scie · vert : reste remis en stock · gris : déchet.</p>'
    + '</body></html>';

  const name = title.replace(/[\\/:*?"<>|]/g, '-') + ' ' + date.replace(/[\/:]/g, '-') + '.pdf';
  const pdf = Utilities.newBlob(html, 'text/html', 'plan.html').getAs('application/pdf').setName(name);
  const folders = DriveApp.getFoldersByName(PDF_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PDF_FOLDER);
  const file = folder.createFile(pdf);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) {
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) { /* partage refusé par le domaine */ }
  }
  return { url: file.getUrl() };
}

/* ---------- Planning annuel (prévisions de machines, livraisons de bruts) ---------- */

function previsionsSheet() {
  const sh = sheet(SHEET_PREVISIONS, ['Semaine', 'Machine', 'Quantité', 'Bruts à acheter', 'Rappel envoyé le']);
  if (sh.getRange(1, 4).getValue() !== 'Bruts à acheter') sh.getRange(1, 1, 1, 5).setValues([['Semaine', 'Machine', 'Quantité', 'Bruts à acheter', 'Rappel envoyé le']]);
  return sh;
}
const LIV_HEAD = ['ID', 'Semaine', 'Section', 'Quantité', 'Statut', 'Reçue le', 'BC', 'Commandé le', 'Relancé le'];
function livraisonsSheet() {
  const sh = sheet(SHEET_LIVRAISONS, LIV_HEAD);
  if (sh.getRange(1, 9).getValue() !== 'Relancé le') sh.getRange(1, 1, 1, LIV_HEAD.length).setValues([LIV_HEAD]);
  return sh;
}

// Semaine ISO « AAAA-Snn » (lundi au dimanche), format triable.
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return y + '-W' + (w < 10 ? '0' : '') + w;
}
const validWeek = w => /^\d{4}-W\d{2}$/.test(String(w));

function readPlanParams() {
  const rows = settingsSheet().getDataRange().getValues().slice(1);
  const map = {};
  rows.forEach(r => { map[r[0]] = Number(r[1]); });
  return {
    lead: map.planLead >= 0 ? map.planLead : 2,
    safety: map.planSafety >= 0 ? map.planSafety : SEUIL_ALERTE,
    lot: map.planLot >= 1 ? map.planLot : 1
  };
}

function writePlanParams(p) {
  const sh = settingsSheet();
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
  [['planLead', p.lead], ['planSafety', p.safety], ['planLot', p.lot]].forEach(([k, v]) => {
    const i = keys.indexOf(k);
    if (i >= 0) sh.getRange(i + 2, 2).setValue(v);
    else { sh.appendRow([k, v]); keys.push(k); }
  });
}

function readForecasts() {
  const sh = previsionsSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .map((r, i) => ({ row: i + 2, week: String(r[0]), machine: String(r[1]), qty: Math.round(Number(r[2]) || 0), buy: String(r[3] || ''), sent: iso(r[4]) }))
    .filter(f => validWeek(f.week) && f.machine && f.qty > 0);
}

function readDeliveries() {
  const sh = livraisonsSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 7).getValues()
    .map((r, i) => ({ row: i + 2, id: String(r[0]), week: String(r[1]), profile: String(r[2]), qty: Math.round(Number(r[3]) || 0), status: String(r[4]), received: iso(r[5]), bc: String(r[6] || '') }))
    .filter(d => d.id && validWeek(d.week) && PROFILES.indexOf(d.profile) >= 0);
}

function readPlanning() {
  return { forecasts: readForecasts().map(f => { delete f.row; return f; }), deliveries: readDeliveries().map(d => { delete d.row; return d; }), params: readPlanParams(), today: isoWeek(new Date()) };
}

// Livraisons prévues dont la semaine est atteinte : ajout au stock de bruts.
// Les livraisons n'entrent plus seules en stock : Morgan valide la réception (receiveDelivery).
function processDeliveries() {}

// Réception anticipée d'une livraison prévue (bouton « Reçue » dans Achat).
// Réception d'une commande planifiée : une livraison (id) ou tout un bon de commande (bc).
function receiveDelivery(p) {
  const list = readDeliveries().filter(x => x.status === 'Prévu' && ((p.id && x.id === String(p.id)) || (p.bc && x.bc === String(p.bc))));
  if (!list.length) return { error: 'Livraison introuvable ou déjà reçue.' };
  const sh = livraisonsSheet(), now = new Date(), deltas = {};
  list.forEach(d => { sh.getRange(d.row, 5, 1, 2).setValues([['Reçu', now]]); deltas[d.profile] = (deltas[d.profile] || 0) + d.qty; });
  changeBruts(deltas, 'Réception commande planifiée' + (p.bc ? ' BC ' + p.bc : ''));
  return { planning: readPlanning(), achats: readAchats() };
}

// Remplace tout le planning futur (semaine en cours comprise) : prévisions de machines et livraisons de bruts.
// Les semaines passées et les livraisons déjà reçues sont conservées.
function savePlanning(p) {
  const now = isoWeek(new Date());
  const machines = readMachines();
  const forecasts = (p.forecasts || []).map(f => ({ week: String(f.week), machine: String(f.machine), qty: Math.round(Number(f.qty)), buy: String(f.buy || '').slice(0, 300) }))
    .filter(f => f.qty > 0);
  if (forecasts.some(f => !validWeek(f.week) || f.week < now || !machines[f.machine] || f.qty > 100)) return { error: 'Planning invalide.' };
  const old = readForecasts();
  forecasts.forEach(f => {
    const o = old.find(x => x.week === f.week && x.machine === f.machine && x.qty === f.qty);
    f.sent = o ? o.sent : '';
  });

  const fs = previsionsSheet();
  const rows = old.filter(f => f.week < now).concat(forecasts)
    .sort((a, b) => a.week < b.week ? -1 : a.week > b.week ? 1 : 0)
    .map(f => [f.week, f.machine, f.qty, f.buy, f.sent ? new Date(f.sent) : '']);
  if (fs.getLastRow() > 1) fs.deleteRows(2, fs.getLastRow() - 1);
  if (rows.length) fs.getRange(2, 1, rows.length, 5).setValues(rows);

  // Les livraisons sont créées au moment où le bon de commande part (sendReminders).
  processDeliveries();
  sendReminders();
  installDailyTrigger();
  return { planning: readPlanning() };
}

/* ---------- Rappels de commande par e-mail ---------- */

function weekMonday(wk) {
  const y = Number(wk.slice(0, 4)), w = Number(wk.slice(6));
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const m = new Date(jan4);
  m.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  return m;
}
function addWeeks(wk, n) {
  const m = weekMonday(wk);
  m.setUTCDate(m.getUTCDate() + n * 7 + 3);
  return isoWeek(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()));
}
const weekLabel = wk => 'S' + Number(wk.slice(6)) + ' ' + wk.slice(0, 4);

// Pour chaque machine planifiée : à partir de RAPPEL_SEMAINES semaines avant la fabrication, un seul e-mail « à commander ».
function sendReminders() {
  if (!ALERTE_EMAIL) return;
  const now = isoWeek(new Date());
  const sh = previsionsSheet();
  const due = readForecasts().filter(f => !f.sent && f.week >= now && addWeeks(f.week, -RAPPEL_SEMAINES) <= now);
  if (!due.length) return;
  const needs = planNeedsNow();  // recalculé maintenant : chutes et bruts du jour
  due.forEach(f => {
    const n = needs[f.row];
    const lines = PROFILES.filter(p => n && n.buy[p] > 0).map(p => ({ profile: p, qty: n.buy[p] }));
    const text = lines.map(l => l.profile.replace('Goulotte ', '') + ' × ' + l.qty).join(', ');
    if (!lines.length) { sh.getRange(f.row, 4, 1, 2).setValues([['Rien à commander (stock suffisant)', new Date()]]); return; }
    const arrival = weekMonday(f.week);
    const monday = Utilities.formatDate(arrival, 'UTC', 'dd/MM/yyyy');
    const subject = '[Bon de commande] Bruts goulottes – ' + f.qty + ' × ' + f.machine + ' (fabrication ' + weekLabel(f.week) + ')';
    const html = '<div style="font-family:Arial,sans-serif;color:#1f2a44">'
      + '<p style="font-size:18px;color:#1f3f84"><b>TDM by INSIDI<span style="color:#f2b705">X</span></b> – commande planifiée</p>'
      + '<p>Fabrication prévue : <b>' + f.qty + ' × ' + esc(f.machine) + '</b> semaine <b>' + weekLabel(f.week) + '</b> (lundi ' + monday + ').</p>'
      + '<p>Goulottes brutes à commander, calculées <b>aujourd\'hui</b> d\'après les chutes et les bruts en stock :</p><ul>'
      + lines.map(l => '<li><b>' + esc(l.profile.replace('Goulotte ', '')) + ' × ' + l.qty + '</b></li>').join('') + '</ul></div>';
    try {
      const bdc = makeBdc(lines, arrival, 'Planning – ' + f.qty + ' × ' + f.machine + ' ' + weekLabel(f.week), false);
      MailApp.sendEmail({ to: ALERTE_EMAIL, name: EXPEDITEUR, subject: subject + ' – BC ' + bdc.num, body: 'À commander pour ' + f.qty + ' × ' + f.machine + ' (' + weekLabel(f.week) + ') : ' + text,
        htmlBody: html + '<p style="font-family:Arial,sans-serif">Bon de commande <b>' + bdc.num + '</b> en pièce jointe.</p>', attachments: [bdc.blob] });
      // Livraison attendue la semaine de fabrication ; entrée en stock quand Morgan valide la réception.
      lines.forEach(l => livraisonsSheet().appendRow([Utilities.getUuid(), f.week, l.profile, l.qty, 'Prévu', '', bdc.num, new Date(), '']));
      sh.getRange(f.row, 4, 1, 2).setValues([[text + ' – BC ' + bdc.num, new Date()]]);
      bumpVersion();
    } catch (e) {
      mouvementsSheet().appendRow([new Date(), '', 0, 'Bon de commande planifié non envoyé : ' + e.message]);
    }
  });
}

// Vérification quotidienne (livraisons prévues + rappels), même si personne n'ouvre le site.
function rappelsQuotidiens() {
  const l = LockService.getScriptLock();
  if (!l.tryLock(30000)) return;
  try { processDeliveries(); sendReminders(); sendReceptionAlerts(); archiveYears(); } finally { l.releaseLock(); }
}

function installDailyTrigger() {
  try {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'rappelsQuotidiens')) return;
    ScriptApp.newTrigger('rappelsQuotidiens').timeBased().everyDays(1).atHour(7).create();
  } catch (e) {
    // Sans autorisation pour les déclencheurs, les rappels partent à la première ouverture du site de la semaine.
  }
}

/* ---------- Annulation de la dernière découpe ---------- */

// Dernière opération (découpe, plan validé ou erreur de coupe) non annulée : { op, rows: [{ row, ... }] }.
function lastOperation() {
  const sh = historySheet();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const n = Math.min(500, last - 1);
  const vals = sh.getRange(last - n + 1, 1, n, 11).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    const op = String(vals[i][9] || '');
    if (!op) return null;              // ligne ancienne, sans identifiant : rien d'annulable avant elle
    if (vals[i][10] !== '') continue;  // déjà annulée
    const rows = [];
    vals.forEach((r, k) => { if (String(r[9]) === op && r[10] === '') rows.push({ row: last - n + 1 + k, r: r }); });
    return { op: op, rows: rows };
  }
  return null;
}

function describeOp(o) {
  const r0 = o.rows[0].r;
  return {
    op: o.op,
    date: iso(r0[0]),
    lines: o.rows.map(x => ({
      profile: String(x.r[1]), cut: String(x.r[2]), source: String(x.r[3]), sourceLength: Number(x.r[4]) || 0,
      sourceNum: x.r[5] === '' ? null : Number(x.r[5]), keptNum: x.r[8] === '' ? null : Number(x.r[8])
    }))
  };
}

function undoLast(p) {
  const o = lastOperation();
  if (!o) return { error: 'Aucune découpe à annuler.' };
  if (p.op && p.op !== o.op) return { error: 'L\'historique a changé entre-temps : rechargez la page et recommencez.' };
  const sh = stockSheet();
  // Les restes créés par cette découpe doivent encore être en stock.
  const nums = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => Number(r[0])) : [];
  const missing = o.rows.filter(x => x.r[8] !== '' && nums.indexOf(Number(x.r[8])) < 0).map(x => '#' + x.r[8]);
  if (missing.length) return { error: 'Impossible d\'annuler : la chute ' + missing.join(', ') + ' issue de cette découpe a déjà été utilisée ou retirée.' };
  const now = new Date();
  const bruts = {};
  o.rows.forEach(x => {
    const r = x.r;
    if (r[8] !== '') {
      const i = nums.indexOf(Number(r[8]));
      sh.deleteRow(i + 2);
      nums.splice(i, 1);
    }
    if (r[3] === 'Chute') sh.appendRow([Number(r[5]), String(r[1]), Number(r[4]), now, Utilities.getUuid()]);
    if (r[3] === 'Goulotte neuve') bruts[String(r[1])] = (bruts[String(r[1])] || 0) + 1;
  });
  changeBruts(bruts, 'Annulation de découpe');
  const hs = historySheet();
  o.rows.forEach(x => hs.getRange(x.row, 11).setValue(now));
  return { undone: describeOp(o) };
}

/* ---------- Archivage annuel ---------- */

// Une fois par an : les lignes des années passées de « Historique » et « Mouvements bruts »
// sont déplacées dans des onglets « Historique AAAA » / « Mouvements bruts AAAA ».
function archiveYears() {
  const props = PropertiesService.getScriptProperties();
  const year = new Date().getFullYear();
  if (props.getProperty('archivedYear') === String(year)) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[historySheet(), SHEET_HISTORY], [mouvementsSheet(), SHEET_MOUVEMENTS]].forEach(([sh, name]) => {
    const last = sh.getLastRow();
    if (last < 2) return;
    const width = sh.getLastColumn();
    const head = sh.getRange(1, 1, 1, width).getValues()[0];
    const rows = sh.getRange(2, 1, last - 1, width).getValues();
    const keep = [], old = {};
    rows.forEach(r => {
      const y = r[0] instanceof Date ? r[0].getFullYear() : year;
      if (y < year) (old[y] = old[y] || []).push(r); else keep.push(r);
    });
    if (!Object.keys(old).length) return;
    Object.keys(old).forEach(y => {
      const arch = ss.getSheetByName(name + ' ' + y) || ss.insertSheet(name + ' ' + y);
      if (arch.getLastRow() === 0) arch.appendRow(head);
      arch.getRange(arch.getLastRow() + 1, 1, old[y].length, width).setValues(old[y]);
    });
    sh.deleteRows(2, last - 1);
    if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
  });
  props.setProperty('archivedYear', String(year));
}

/* ---------- Relance des réceptions non validées ---------- */

const RELANCE_JOURS = 7;

// Commandes (immédiates ou planifiées) dont la réception n'est pas validée 7 jours après la commande :
// un e-mail d'alerte, renouvelé tous les 7 jours tant que « Réception reçue » n'est pas cliqué.
function sendReceptionAlerts() {
  if (!ALERTE_EMAIL) return;
  const now = new Date(), limit = RELANCE_JOURS * 86400000;
  const late = (orderedAt, remindedAt) => orderedAt instanceof Date && now - orderedAt >= limit
    && !(remindedAt instanceof Date && now - remindedAt < limit);
  const items = [];   // { bc, ref, profile, qty, date, mark }
  const as = achatsSheet();
  if (as.getLastRow() > 1) {
    as.getRange(2, 1, as.getLastRow() - 1, 10).getValues().forEach((r, i) => {
      if (String(r[5]) === 'Commandé' && late(r[0], r[9])) items.push({ bc: String(r[8] || '—'), ref: String(r[2] || 'Commande immédiate'), profile: String(r[3]), qty: Number(r[4]), date: r[0], mark: () => as.getRange(i + 2, 10).setValue(now) });
    });
  }
  const ls = livraisonsSheet();
  if (ls.getLastRow() > 1) {
    ls.getRange(2, 1, ls.getLastRow() - 1, 9).getValues().forEach((r, i) => {
      if (String(r[4]) === 'Prévu' && late(r[7], r[8])) items.push({ bc: String(r[6] || '—'), ref: 'Planning ' + weekLabel(String(r[1])), profile: String(r[2]), qty: Number(r[3]), date: r[7], mark: () => ls.getRange(i + 2, 9).setValue(now) });
    });
  }
  if (!items.length) return;
  const byBc = {};
  items.forEach(it => { (byBc[it.bc] = byBc[it.bc] || []).push(it); });
  const days = d => Math.floor((now - d) / 86400000);
  const html = '<div style="font-family:Arial,sans-serif;color:#1f2a44">'
    + '<p style="font-size:18px;color:#1f3f84"><b>TDM by INSIDI<span style="color:#f2b705">X</span></b> – réception non validée</p>'
    + '<p>Ces commandes de goulottes brutes ne sont pas marquées comme reçues depuis plus de ' + RELANCE_JOURS + ' jours :</p>'
    + Object.keys(byBc).map(bc => {
      const l = byBc[bc];
      return '<p style="margin:12px 0 4px"><b>Bon de commande ' + esc(bc) + '</b> – ' + esc(l[0].ref) + ' – commandé il y a ' + days(l[0].date) + ' jours</p><ul style="margin:0">'
        + l.map(it => '<li>' + esc(it.profile.replace('Goulotte ', '')) + ' × ' + it.qty + '</li>').join('') + '</ul>';
    }).join('')
    + '<p style="color:#7a8291">Si la livraison est arrivée, validez-la dans Espace méthode (bouton « Réception reçue »). Sinon, relancez le fournisseur.</p></div>';
  const subject = '[Relance] Réception non validée – BC ' + Object.keys(byBc).join(', ');
  try {
    MailApp.sendEmail({ to: ALERTE_EMAIL, name: EXPEDITEUR, subject: subject, htmlBody: html,
      body: Object.keys(byBc).map(bc => 'BC ' + bc + ' : ' + byBc[bc].map(it => it.profile.replace('Goulotte ', '') + ' × ' + it.qty).join(', ')).join('\n') });
    items.forEach(it => it.mark());
  } catch (e) {
    mouvementsSheet().appendRow([new Date(), '', 0, 'Relance de réception non envoyée : ' + e.message]);
  }
}
