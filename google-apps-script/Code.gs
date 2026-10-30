/**
 * Gestion des chutes Elcom – TDM by Insidix
 * Version hébergée gratuitement par Google Apps Script, stock enregistré dans ce Google Sheets.
 *
 * À RÉGLER : écrivez le mot de passe entre les guillemets ci-dessous, puis enregistrez.
 */
const IDENTIFIANT = 'Production';
const MOT_DE_PASSE = '';

const PROFILES = ['40X40', '80X40', '80X80'];
const DEFAULT_SETTINGS = { barLength: 2000, kerf: 5, minKeep: 100 };
const HISTORY_SHOWN = 20;

const SHEET_STOCK = 'Stock';
const SHEET_HISTORY = 'Historique';
const SHEET_SETTINGS = 'Paramètres';

/* ---------- Page ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Chutes Elcom – TDM by Insidix')
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

const stockSheet = () => sheet(SHEET_STOCK, ['N°', 'Profilé', 'Longueur (mm)', 'Ajoutée le', 'ID']);
const historySheet = () => sheet(SHEET_HISTORY,
  ['Date', 'Profilé', 'Coupe (mm)', 'Source', 'Longueur source (mm)', 'N° source', 'Reste (mm)', 'Gardée', 'N° gardé']);
const settingsSheet = () => sheet(SHEET_SETTINGS, ['Paramètre', 'Valeur']);

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
    date: iso(r[0]), profile: String(r[1]), cut: Number(r[2]),
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
    history: readHistory()
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
  if (PROFILES.indexOf(p.profile) < 0 || !(len > 0) || len > s.barLength) return { error: 'Profilé ou longueur invalide.' };

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
  historySheet().appendRow([now, p.profile, len, p.source === 'chute' ? 'Chute' : 'Barre neuve',
    sourceLength, sourceNum, remainder, kept ? 'Oui' : 'Non', keptNum]);
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
