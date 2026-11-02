/* ---------- Bons de commande (modèle INSIDIX) ---------- */

const SHEET_BDC = 'Bons de commande';
const BDC_FOLDER = 'Bons de commande goulottes';
const BDC_DEFAULTS = {
  fournisseur: '',
  contact: 'Morgan DEPONTIEU',
  contactEmail: 'morgan.depontieu@insidix.com',
  conditions: '30 jours fin de mois',
  tva: 20,
  refs: {},
  prix: {}
};
const INSIDIX_ADRESSE = ['Insidix - TDM', '62 Rue Louise Drevet', '38360 Noyarey', 'France', '+33(0) 4 38 12 42 80'];

const bdcSheet = () => sheet(SHEET_BDC, ['N°', 'Date', 'Fournisseur', 'Arrivée prévue', 'Lignes', 'Total HT', 'Total TTC', 'Origine', 'Lien']);

// Valeur texte d'une clé de l'onglet Paramètres.
function readKey(k) {
  const rows = settingsSheet().getDataRange().getValues().slice(1);
  const r = rows.find(x => String(x[0]) === k);
  return r ? r[1] : '';
}
function writeKey(k, v) {
  const sh = settingsSheet();
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
  const i = keys.indexOf(k);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(v); else sh.appendRow([k, v]);
}

function readBdcConfig() {
  let c = {};
  try { c = JSON.parse(String(readKey('bdcConfig') || '{}')); } catch (e) { c = {}; }
  return Object.assign({}, BDC_DEFAULTS, c, { refs: Object.assign({}, c.refs || {}), prix: Object.assign({}, c.prix || {}) });
}

function saveBdcConfig(p) {
  const c = p.config || {};
  const out = {
    fournisseur: String(c.fournisseur || '').slice(0, 400),
    contact: String(c.contact || '').slice(0, 80),
    contactEmail: String(c.contactEmail || '').slice(0, 120),
    conditions: String(c.conditions || '').slice(0, 120),
    tva: Math.max(0, Math.min(100, Number(c.tva) || 0)),
    refs: {}, prix: {}
  };
  PROFILES.forEach(pr => {
    out.refs[pr] = String((c.refs || {})[pr] || '').slice(0, 80);
    out.prix[pr] = Math.max(0, Number((c.prix || {})[pr]) || 0);
  });
  writeKey('bdcConfig', JSON.stringify(out));
  return { bdcConfig: out };
}

const euro = n => Utilities.formatString('%.2f', n).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const frDate = d => Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');

// « 40x40 × 2, 40x60 × 1 » → [{ profile, qty }]
function parseBuy(text) {
  return String(text || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(\d+x\d+)\s*×\s*(\d+)$/);
    return m ? { profile: 'Goulotte ' + m[1], qty: Number(m[2]) } : null;
  }).filter(l => l && PROFILES.indexOf(l.profile) >= 0 && l.qty > 0);
}

function bdcHtml(num, lines, arrival, conf) {
  const s = readSettings();
  const navy = '#1b2d4f', yellow = '#f2b705', grey = '#f2f4f7', line = '#d9dee6';
  const lab = t => '<div style="font-size:7pt;font-weight:bold;letter-spacing:1.5px;color:' + navy + '">' + t + '</div>'
    + '<div style="width:46px;height:2px;background:' + yellow + ';margin:3px 0 6px"></div>';
  const box = 'border:1px solid ' + line + ';padding:8px 10px;vertical-align:top';
  let ht = 0;
  const rows = lines.map(l => {
    const pu = conf.prix[l.profile] || 0;
    const mt = pu * l.qty;
    ht += mt;
    const ref = conf.refs[l.profile] ? '[' + esc(conf.refs[l.profile]) + '] ' : '';
    return '<tr>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + '">' + ref + 'Goulotte ' + esc(l.profile.replace('Goulotte ', '')) + ' – brute ' + s.barLength + ' mm</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:center">' + frDate(arrival) + '</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:center">' + Utilities.formatString('%.3f', l.qty).replace('.', ',') + '<br>Unité(s)</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:right">' + euro(pu) + '</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:center">—</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:center">TVA ' + conf.tva + '%</td>'
      + '<td style="padding:10px 8px;border-bottom:1px solid ' + line + ';text-align:right"><b>' + euro(mt) + '</b></td></tr>';
  }).join('');
  const tva = ht * conf.tva / 100;
  const th = 'padding:8px;color:#ffffff;font-size:7pt;letter-spacing:1px;font-weight:bold';
  const addr = INSIDIX_ADRESSE.map(esc).join('<br>');
  const fourn = esc(conf.fournisseur || '—').replace(/\n/g, '<br>');
  return ('<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#333;margin:0">'
    + '<img src="' + BDC_BANNER + '" style="width:100%;display:block">'
    + '<div style="height:18px"></div>'
    + '<table style="width:100%;border-collapse:collapse;background:' + navy + '"><tr>'
    + '<td style="border-left:5px solid ' + yellow + ';padding:9px 14px;color:#fff;font-size:11pt;font-weight:bold;letter-spacing:2px">BON DE COMMANDE</td>'
    + '<td style="padding:9px 14px;text-align:right;color:' + yellow + ';font-size:11pt;font-weight:bold">' + esc(num) + '</td></tr></table>'
    + '<table style="width:100%;border-collapse:collapse;background:' + grey + ';margin-top:8px"><tr>'
    + '<td style="' + box + ';width:28%">' + lab('DATE') + frDate(new Date()) + '</td>'
    + '<td style="' + box + ';width:44%">' + lab('CONTACT INSIDIX') + esc(conf.contact) + '</td>'
    + '<td style="' + box + '">' + lab('ARRIVÉE PRÉVUE') + frDate(arrival) + '</td></tr></table>'
    + '<table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:8px"><tr>'
    + '<td style="' + box + ';width:52%">' + lab('FOURNISSEUR') + fourn + '</td>'
    + '<td style="width:2%"></td>'
    + '<td style="' + box + '">' + lab('ADRESSE DE FACTURATION') + addr + '<br><br>' + lab('ADRESSE DE LIVRAISON') + addr + '</td></tr></table>'
    + '<div style="margin-top:10px;background:' + grey + ';border-left:3px solid ' + yellow + ';padding:7px 10px;font-size:7.5pt">'
    + 'Merci de rappeler notre n° de commande <b>' + esc(num) + '</b> sur toutes vos factures et bons de livraison. Factures à adresser à : <b>insidix@insidix.com</b></div>'
    + '<table style="width:100%;border-collapse:collapse;margin-top:12px">'
    + '<tr style="background:' + navy + '"><td style="' + th + '">DESCRIPTION</td><td style="' + th + ';text-align:center">DATE<br>PRÉVUE</td>'
    + '<td style="' + th + ';text-align:center">QTÉ</td><td style="' + th + ';text-align:right">PU HT</td><td style="' + th + ';text-align:center">REM.</td>'
    + '<td style="' + th + ';text-align:center">TVA</td><td style="' + th + ';text-align:right">MONTANT HT</td></tr>'
    + rows + '</table>'
    + '<table style="width:100%;border-collapse:collapse;margin-top:6px"><tr><td style="width:46%"></td><td>'
    + '<table style="width:100%;border-collapse:collapse;border:1px solid ' + line + '">'
    + '<tr><td style="padding:8px;color:#777;font-size:7.5pt;letter-spacing:1px">TOTAL HT</td><td style="padding:8px;text-align:right"><b>' + euro(ht) + '</b></td></tr>'
    + '<tr><td style="padding:8px;color:#777;font-size:7.5pt;letter-spacing:1px;border-top:1px solid ' + line + '">TVA</td><td style="padding:8px;text-align:right;border-top:1px solid ' + line + '">' + euro(tva) + '</td></tr>'
    + '<tr style="background:' + navy + '"><td style="padding:9px 8px;color:#fff;font-weight:bold;letter-spacing:1px">TOTAL TTC</td><td style="padding:9px 8px;text-align:right;color:#fff;font-weight:bold">' + euro(ht + tva) + '</td></tr>'
    + '</table></td></tr></table>'
    + '<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:7.5pt"><tr>'
    + '<td style="' + box + ';width:33%">' + lab('CONDITIONS DE PAIEMENT') + esc(conf.conditions) + '</td>'
    + '<td style="' + box + ';width:34%">' + lab('LIVRAISON') + '• Attendue le : ' + frDate(arrival) + '<br>• Bon de livraison obligatoire avec rappel du n° de commande</td>'
    + '<td style="' + box + '">' + lab('CONTACT') + '• ' + esc(conf.contact) + '<br>• ' + esc(conf.contactEmail) + '</td></tr></table>'
    + '<div style="height:40px"></div>'
    + '<div style="border-top:1px solid ' + yellow + ';padding-top:10px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:7.5pt;color:#333"><tr>'
    + '<td style="width:33%;vertical-align:top"><b style="color:' + navy + ';font-size:9pt">CONTACT</b><br>+33 (0)4 38 12 42 80<br>insidix@insidix.com<br>www.insidix.com</td>'
    + '<td style="width:30%;vertical-align:top;border-left:2px solid ' + yellow + ';padding-left:10px"><b style="color:' + navy + ';font-size:9pt">INSIDIX</b><br>62 rue Louise Drevet 38360<br>NOYAREY - FRANCE</td>'
    + '<td style="vertical-align:top;border-left:2px solid ' + yellow + ';padding-left:10px"><b style="color:' + navy + ';font-size:9pt">INFORMATIONS LÉGALES</b><br>SIRET : 409 210 465 00061<br>TVA Intracommunautaire : FR 86 409 210 465 RCS<br>et RM : 409 210 465 R.C.S. Grenoble</td>'
    + '</tr></table></div>'
    + '</body></html>').replace(/<td style="/g, '<td style="font-size:8.5pt;').replace(/<td>/g, '<td style="font-size:8.5pt">');
}

// Crée le bon de commande (PDF dans Drive + ligne dans l'onglet « Bons de commande »).
function makeBdc(lines, arrival, origine, test) {
  const conf = readBdcConfig();
  let num = 'TEST';
  if (!test) {
    const n = (Number(readKey('bdcNum')) || 0) + 1;
    writeKey('bdcNum', n);
    num = 'G' + ('0000' + n).slice(-5);
  }
  const html = bdcHtml(num, lines, arrival, conf);
  const blob = Utilities.newBlob(html, 'text/html', 'bdc.html').getAs('application/pdf').setName('Bon de commande - ' + num + '.pdf');
  const folders = DriveApp.getFoldersByName(BDC_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BDC_FOLDER);
  const file = folder.createFile(blob);
  const ht = lines.reduce((a, l) => a + (conf.prix[l.profile] || 0) * l.qty, 0);
  if (!test) {
    bdcSheet().appendRow([num, new Date(), conf.fournisseur.split('\n')[0], arrival,
      lines.map(l => l.profile.replace('Goulotte ', '') + ' × ' + l.qty).join(', '), Math.round(ht * 100) / 100, Math.round(ht * (100 + conf.tva)) / 100, origine, file.getUrl()]);
  }
  return { num: num, url: file.getUrl(), blob: blob, conf: conf };
}

function mailBdc(bdc, subject, intro) {
  const html = '<div style="font-family:Arial,sans-serif;color:#1f2a44">'
    + '<p style="font-size:18px;color:#1f3f84"><b>TDM by INSIDI<span style="color:#f2b705">X</span></b></p>'
    + intro + '<p>Bon de commande <b>' + esc(bdc.num) + '</b> en pièce jointe.</p></div>';
  MailApp.sendEmail({ to: ALERTE_EMAIL, subject: subject, htmlBody: html, body: subject, attachments: [bdc.blob] });
}

function bdcTest(p) {
  const pr = PROFILES[0];
  const bdc = makeBdc([{ profile: pr, qty: 1 }], new Date(Date.now() + 7 * 86400000), 'Test', true);
  mailBdc(bdc, '[Test] Bon de commande goulottes', '<p>E-mail de test : si vous le recevez, les envois automatiques fonctionnent.</p>');
  return { url: bdc.url, to: ALERTE_EMAIL };
}
