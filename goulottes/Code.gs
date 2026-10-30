/**
 * Goulottes – gestion des chutes et découpe par machine – TDM by Insidix
 * Hébergé gratuitement par Google Apps Script, stock enregistré dans ce Google Sheets.
 *
 * À RÉGLER : écrivez le mot de passe entre les guillemets ci-dessous, puis enregistrez.
 */
const IDENTIFIANT = 'Production';
const MOT_DE_PASSE = '';

// Rubrique Achat : identifiants séparés. Écrivez aussi ce mot de passe entre les guillemets.
const ACHAT_IDENTIFIANT = 'Morgan';
const ACHAT_MOT_DE_PASSE = '';

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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Goulottes – TDM by Insidix')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Appel unique depuis la page ---------- */

function api(action, payload, login) {
  if (!MOT_DE_PASSE) return { error: 'Le mot de passe n\'est pas encore réglé dans Code.gs.' };
  if (!login || login.user !== IDENTIFIANT || login.password !== MOT_DE_PASSE) return { error: 'auth' };

  if (action === 'state') return { state: readState() };

  // Une seule modification à la fois, même si plusieurs postes valident en même temps.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { error: 'Le serveur est occupé, réessayez dans un instant.' };
  try {
    let result;
    if (action === 'cut') result = cut(payload);
    else if (action === 'add') result = addChute(payload);
    else if (action === 'remove') result = removeChute(payload);
    else if (action === 'settings') result = saveSettings(payload);
    else if (action === 'applyPlan') result = applyPlan(payload);
    else if (action === 'pdf') result = makePdf(payload);
    else if (action === 'addBrut') result = addBruts(payload);
    else if (action === 'achatLogin') result = achatCheck(payload) || { achats: readAchats() };
    else if (action === 'achatValidate') result = achatCheck(payload) || validateAchat(payload);
    else return { error: 'Action inconnue.' };
    SpreadsheetApp.flush();
    if (!result.error) result.state = readState();
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
const historySheet = () => sheet(SHEET_HISTORY,
  ['Date', 'Section', 'Coupe (mm)', 'Source', 'Longueur source (mm)', 'N° source', 'Reste (mm)', 'Gardée', 'N° gardé']);
const settingsSheet = () => sheet(SHEET_SETTINGS, ['Paramètre', 'Valeur']);
const mouvementsSheet = () => sheet(SHEET_MOUVEMENTS, ['Date', 'Section', 'Quantité', 'Motif']);
const achatsSheet = () => sheet(SHEET_ACHATS, ['Date', 'Acheteur', 'Référence', 'Section', 'Quantité']);

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
function changeBruts(deltas, motif) {
  const sh = brutsSheet();
  const now = new Date();
  Object.keys(deltas).forEach(pr => {
    const d = Math.round(deltas[pr]);
    if (!d || PROFILES.indexOf(pr) < 0) return;
    const last = sh.getLastRow();
    const names = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    let i = names.indexOf(pr);
    if (i < 0) { sh.appendRow([pr, 0]); i = names.length; }
    const cell = sh.getRange(i + 2, 2);
    cell.setValue(Math.max(0, Math.round(Number(cell.getValue()) || 0) + d));
    mouvementsSheet().appendRow([now, pr, d, motif]);
  });
}

function addBruts(p) {
  const qty = Math.round(Number(p.qty));
  if (PROFILES.indexOf(p.profile) < 0 || !(qty > 0) || qty > 1000) return { error: 'Section ou quantité invalide (1 à 1000).' };
  changeBruts({ [p.profile]: qty }, 'Ajout manuel');
  return {};
}

/* ---------- Achat ---------- */

function achatCheck(p) {
  if (!ACHAT_MOT_DE_PASSE) return { error: 'Le mot de passe Achat n\'est pas encore réglé dans Code.gs.' };
  const a = (p && p.achat) || {};
  if (a.user !== ACHAT_IDENTIFIANT || a.password !== ACHAT_MOT_DE_PASSE) return { error: 'Identifiant ou mot de passe Achat incorrect.' };
  return null;
}

function readAchats() {
  const sh = achatsSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(30, last - 1);
  return sh.getRange(last - n + 1, 1, n, 5).getValues().reverse()
    .map(r => ({ date: iso(r[0]), user: String(r[1]), ref: String(r[2]), profile: String(r[3]), qty: Number(r[4]) }));
}

function validateAchat(p) {
  const lines = (p.lines || []).map(l => ({ profile: String(l.profile), qty: Math.round(Number(l.qty)) }))
    .filter(l => l.qty > 0);
  if (!lines.length) return { error: 'Aucune quantité à acheter.' };
  if (lines.some(l => PROFILES.indexOf(l.profile) < 0 || l.qty > 1000)) return { error: 'Commande invalide.' };
  const ref = String(p.ref || '').slice(0, 120);
  const now = new Date();
  const deltas = {};
  lines.forEach(l => {
    deltas[l.profile] = (deltas[l.profile] || 0) + l.qty;
    achatsSheet().appendRow([now, ACHAT_IDENTIFIANT, ref, l.profile, l.qty]);
  });
  changeBruts(deltas, 'Achat' + (ref ? ' – ' + ref : ''));
  return { achats: readAchats() };
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
    nextNum: map.nextNum > 0 ? map.nextNum : 1
  };
}

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
  return sh.getRange(last - n + 1, 1, n, 9).getValues().reverse().map(r => ({
    date: iso(r[0]), profile: String(r[1]), cut: String(r[2]),
    source: r[3] === 'Chute' ? 'chute' : 'barre', sourceLength: Number(r[4]),
    sourceNum: r[5] === '' ? null : Number(r[5]), remainder: Number(r[6]),
    kept: r[7] === 'Oui', keptNum: r[8] === '' ? null : Number(r[8])
  }));
}

function readState() {
  const s = readSettings();
  return {
    version: Date.now(),
    settings: { barLength: s.barLength, kerf: s.kerf, minKeep: s.minKeep },
    chutes: readChutes(),
    history: readHistory(),
    machines: readMachines(),
    bruts: readBruts()
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
  const kept = remainder > 0 && remainder >= s.minKeep;
  const now = new Date();
  let keptNum = '';
  if (kept) {
    keptNum = s.nextNum++;
    sh.appendRow([keptNum, p.profile, remainder, now, Utilities.getUuid()]);
    writeSettings(s);
  }
  historySheet().appendRow([now, p.profile, len, p.source === 'chute' ? 'Chute' : 'Goulotte neuve',
    sourceLength, sourceNum, remainder, kept ? 'Oui' : 'Non', keptNum]);
  if (p.source !== 'chute') changeBruts({ [p.profile]: -1 }, 'Découpe ' + len + ' mm');
  return { remainder: remainder, kept: kept, keptNum: kept ? keptNum : null };
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

  // Retire les chutes utilisées, ajoute les restes, écrit l'historique.
  const now = new Date();
  const kept = [];
  checked.forEach(c => {
    if (c.b.source === 'chute') sh.deleteRow(findRow(String(c.b.chuteId)));
    const remainder = c.total - usedLength(c.pieces, c.total, s.kerf);
    const keep = remainder > 0 && remainder >= s.minKeep;
    let num = '';
    if (keep) {
      num = s.nextNum++;
      sh.appendRow([num, c.b.profile, remainder, now, Utilities.getUuid()]);
    }
    kept.push(keep ? num : null);
    historySheet().appendRow([now, c.b.profile, c.pieces.join(' + '),
      c.b.source === 'chute' ? 'Chute' : 'Goulotte neuve', c.total, c.sourceNum, remainder, keep ? 'Oui' : 'Non', num]);
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
      const keep = remainder > 0 && remainder >= s.minKeep;
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
