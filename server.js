// Serveur de gestion des chutes Elcom — aucune dépendance, Node.js 18+.
// Variables d'environnement :
//   PORT          port d'écoute (défaut 3000)
//   APP_USER      identifiant d'accès (défaut Production)
//   APP_PASSWORD  mot de passe d'accès (si absent, un mot de passe est généré et affiché au démarrage)
//   DATA_DIR      dossier où est stocké data.json (défaut ./data)
//   BACKUP_DIR    dossier des sauvegardes quotidiennes (défaut DATA_DIR/sauvegardes) —
//                 idéalement un autre disque, une clé USB ou un dossier réseau
//   BACKUP_DAYS   nombre de jours de sauvegardes gardés (défaut 90)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'sauvegardes');
const BACKUP_DAYS = Number(process.env.BACKUP_DAYS) || 90;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROFILES = ['40X40', '80X40', '80X80'];
const HISTORY_MAX = 2000;

const USER = process.env.APP_USER || 'Production';
let PASSWORD = process.env.APP_PASSWORD;
if (!PASSWORD) {
  PASSWORD = crypto.randomBytes(6).toString('hex');
  console.warn(`APP_PASSWORD non défini : mot de passe temporaire = ${PASSWORD}`);
}

/* ---------- Données ---------- */

const defaultData = () => ({
  settings: { barLength: 2000, kerf: 5, minKeep: 100 },
  chutes: [],   // { id, num, profile, length, date }
  history: [],  // { date, profile, cut, source, sourceLength, sourceNum, remainder, kept, keptNum }
  nextNum: 1
});

// Lit un fichier de stock ; renvoie null s'il est absent ou illisible.
function readStock(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(d.chutes) ? Object.assign(defaultData(), d) : null;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Fichier illisible : ${file} (${e.message})`);
    return null;
  }
}

function backups() {
  try {
    return fs.readdirSync(BACKUP_DIR).filter(f => /^stock-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  } catch (e) { return []; }
}

// Au démarrage : data.json, sinon la sauvegarde la plus récente lisible.
// On ne repart d'un stock vide que s'il n'existe vraiment aucun fichier.
function load() {
  const main = readStock(DATA_FILE);
  if (main) return main;
  for (const f of backups().reverse()) {
    const d = readStock(path.join(BACKUP_DIR, f));
    if (d) {
      console.warn(`data.json absent ou abîmé : stock restauré depuis la sauvegarde ${f}`);
      return d;
    }
  }
  if (fs.existsSync(DATA_FILE)) {
    console.error('data.json est abîmé et aucune sauvegarde n\'est lisible. Arrêt pour ne rien écraser.');
    process.exit(1);
  }
  return defaultData();
}

// Écriture sûre : fichier temporaire vidé sur le disque, puis renommé.
function writeFileSafe(file, content) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
let data = load();
let version = 1;

// Chaque modification est écrite immédiatement dans data.json,
// et recopiée dans la sauvegarde du jour (une par jour, gardées BACKUP_DAYS jours).
function save() {
  const json = JSON.stringify(data, null, 2);
  writeFileSafe(DATA_FILE, json);
  version++;
  try {
    const day = new Date().toISOString().slice(0, 10);
    writeFileSafe(path.join(BACKUP_DIR, `stock-${day}.json`), json);
    const all = backups();
    all.slice(0, Math.max(0, all.length - BACKUP_DAYS)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (e) {
    console.error('Sauvegarde du jour impossible :', e.message);
  }
}

// Reste après la coupe : le trait de scie n'est retiré que s'il reste de la matière.
function remainderAfter(source, cut) {
  if (source === cut) return 0;
  return Math.max(0, source - cut - data.settings.kerf);
}

const isLength = v => Number.isInteger(v) && v > 0 && v <= data.settings.barLength;

/* ---------- HTTP ---------- */

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authorized(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const decoded = Buffer.from(h.slice(6), 'base64').toString();
  const sep = decoded.indexOf(':');
  return sameText(decoded.slice(0, sep), USER) & sameText(decoded.slice(sep + 1), PASSWORD);
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function state() {
  return { version, settings: data.settings, chutes: data.chutes, history: data.history.slice(-20).reverse() };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' };

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/state') return send(res, 200, state());

  if (route === 'POST /api/cut') {
    const b = await readBody(req);
    const cut = Math.round(Number(b.cut));
    if (!PROFILES.includes(b.profile) || !isLength(cut)) return send(res, 400, { error: 'Profilé ou longueur invalide.' });
    let sourceLength = data.settings.barLength;
    let sourceNum = null;
    if (b.source === 'chute') {
      const chute = data.chutes.find(c => c.id === b.chuteId);
      if (!chute) return send(res, 409, { error: 'Cette chute vient d\'être prise par quelqu\'un d\'autre. Relancez la recherche.' });
      if (chute.length < cut || chute.profile !== b.profile) return send(res, 400, { error: 'Cette chute ne convient pas.' });
      sourceLength = chute.length;
      sourceNum = chute.num;
      data.chutes = data.chutes.filter(c => c !== chute);
    }
    const remainder = remainderAfter(sourceLength, cut);
    const kept = remainder > 0 && remainder >= data.settings.minKeep;
    const now = new Date().toISOString();
    let keptNum = null;
    if (kept) {
      keptNum = data.nextNum++;
      data.chutes.push({ id: crypto.randomUUID(), num: keptNum, profile: b.profile, length: remainder, date: now });
    }
    data.history.push({ date: now, profile: b.profile, cut, source: b.source === 'chute' ? 'chute' : 'barre', sourceLength, sourceNum, remainder, kept, keptNum });
    if (data.history.length > HISTORY_MAX) data.history = data.history.slice(-HISTORY_MAX);
    save();
    return send(res, 200, { remainder, kept, keptNum, state: state() });
  }

  if (route === 'POST /api/chutes') {
    const b = await readBody(req);
    const length = Math.round(Number(b.length));
    if (!PROFILES.includes(b.profile) || !isLength(length)) return send(res, 400, { error: `Longueur invalide (1 à ${data.settings.barLength} mm).` });
    const num = data.nextNum++;
    data.chutes.push({ id: crypto.randomUUID(), num, profile: b.profile, length, date: new Date().toISOString() });
    save();
    return send(res, 200, { num, state: state() });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/chutes/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/chutes/'.length));
    data.chutes = data.chutes.filter(c => c.id !== id);
    save();
    return send(res, 200, { state: state() });
  }

  if (route === 'PUT /api/settings') {
    const b = await readBody(req);
    const s = { barLength: Math.round(Number(b.barLength)), kerf: Number(b.kerf), minKeep: Math.round(Number(b.minKeep)) };
    if (!(s.barLength > 0) || !(s.kerf >= 0) || !(s.minKeep >= 0)) return send(res, 400, { error: 'Paramètres invalides.' });
    data.settings = s;
    save();
    return send(res, 200, { state: state() });
  }

  if (route === 'GET /api/export.csv') {
    const rows = [['Numero', 'Profile', 'Longueur_mm', 'Ajoutee_le']];
    [...data.chutes].sort((a, b) => a.profile.localeCompare(b.profile) || a.length - b.length)
      .forEach(c => rows.push([c.num, c.profile, c.length, new Date(c.date).toLocaleString('fr-FR')]));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stock-chutes-elcom-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    return res.end('﻿' + rows.map(r => r.join(';')).join('\r\n'));
  }

  return send(res, 404, { error: 'Introuvable' });
}

function serveStatic(req, res, url) {
  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Interdit', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Introuvable', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

http.createServer(async (req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Chutes Elcom", charset="UTF-8"' });
    return res.end('Accès réservé');
  }
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    // Si l'écriture a échoué, on revient à ce qui est réellement enregistré sur le disque.
    if (req.method !== 'GET') data = readStock(DATA_FILE) || data;
    send(res, 500, { error: 'Enregistrement impossible : la modification n\'a pas été prise en compte. Prévenez le responsable.' });
  }
}).listen(PORT, () => console.log(`Chutes Elcom : http://localhost:${PORT}`));
