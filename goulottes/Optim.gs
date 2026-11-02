/* ---------- Optimisation des découpes côté serveur ----------
 * Même méthode que la page : placement rapide (plus longues pièces d'abord, chutes puis goulottes neuves),
 * puis recherche exacte limitée en temps pour réduire le nombre de goulottes neuves.
 * pieces : [{ profile, length }] ; stock : [{ id, num, profile, length }] ; renvoie [{ profile, source, chuteId, num, length, pieces }]. */

function serverUsed(pieces, total, kerf) {
  let pos = 0;
  pieces.forEach(len => { pos += len; if (pos < total) pos = Math.min(total, pos + kerf); });
  return pos;
}

function optimiseServer(pieces, stock, s) {
  const bars = [];
  PROFILES.forEach(pr => {
    const list = pieces.filter(p => p.profile === pr).map(p => p.length).sort((a, b) => b - a);
    if (!list.length) return;
    const pool = stock.filter(c => c.profile === pr).sort((a, b) => a.length - b.length);
    const free = pool.slice();
    const open = [];
    list.forEach(len => {
      let best = null, bestRest = Infinity;
      open.forEach(b => {
        if (serverUsed(b.pieces, b.length, s.kerf) + len > b.length) return;
        const rest = b.length - serverUsed(b.pieces.concat(len), b.length, s.kerf);
        if (rest < bestRest) { best = b; bestRest = rest; }
      });
      if (!best) {
        const i = free.findIndex(c => c.length >= len);
        if (i >= 0) {
          const c = free.splice(i, 1)[0];
          best = { profile: pr, source: 'chute', chuteId: c.id, num: c.num, length: c.length, pieces: [] };
        } else {
          best = { profile: pr, source: 'barre', length: s.barLength, pieces: [] };
        }
        open.push(best);
      }
      best.pieces.push(len);
    });
    const exact = exactPackServer(pr, list, pool, open, s);
    bars.push.apply(bars, exact || open);
  });
  return bars;
}

function exactPackServer(pr, lengths, stock, greedy, s) {
  const k = s.kerf, L = s.barLength;
  let bestNew = greedy.filter(b => b.source === 'barre').length;
  let bestCh = greedy.filter(b => b.source === 'chute').reduce((a, b) => a + b.length, 0);
  const items = lengths.slice().sort((a, b) => b - a);
  const size = items.map(x => x + k);
  const suffix = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + size[i];
  const ch = stock.map(c => ({ c: c, rem: c.length + k, used: false, items: [] }));
  const nb = [];
  let newCnt = 0, chUsed = 0, best = null, nodes = 0;
  const t0 = Date.now();
  const freeCap = () => ch.reduce((a, b) => a + b.rem, 0) + nb.reduce((a, b) => a + b.rem, 0);
  function dfs(i) {
    if (++nodes > 400000 || (nodes % 5000 === 0 && Date.now() - t0 > 1500)) return;
    if (i === items.length) {
      if (newCnt < bestNew || (newCnt === bestNew && chUsed < bestCh)) {
        bestNew = newCnt; bestCh = chUsed;
        best = ch.filter(b => b.used).map(b => ({ profile: pr, source: 'chute', chuteId: b.c.id, num: b.c.num, length: b.c.length, pieces: b.items.slice() }))
          .concat(nb.map(b => ({ profile: pr, source: 'barre', length: L, pieces: b.items.slice() })));
      }
      return;
    }
    const lb = newCnt + Math.max(0, Math.ceil((suffix[i] - freeCap()) / (L + k)));
    if (lb > bestNew || (lb === bestNew && chUsed >= bestCh)) return;
    const sz = size[i], seen = {};
    const opened = ch.filter(b => b.used).concat(nb).filter(b => b.rem >= sz).sort((a, b) => a.rem - b.rem);
    for (const b of opened) {
      if (seen['o' + b.rem]) continue;
      seen['o' + b.rem] = 1;
      b.rem -= sz; b.items.push(items[i]); dfs(i + 1); b.rem += sz; b.items.pop();
    }
    for (const b of ch) {
      if (b.used || b.rem < sz || seen['c' + b.c.length]) continue;
      seen['c' + b.c.length] = 1;
      b.used = true; b.rem -= sz; b.items.push(items[i]); chUsed += b.c.length;
      dfs(i + 1);
      b.used = false; b.rem += sz; b.items.pop(); chUsed -= b.c.length;
    }
    if (sz <= L + k && newCnt + 1 <= bestNew) {
      nb.push({ rem: L + k - sz, items: [items[i]] }); newCnt++;
      dfs(i + 1);
      nb.pop(); newCnt--;
    }
  }
  dfs(0);
  return best;
}

// Pièces d'une ligne de planning.
function forecastPieces(f, machines) {
  const pieces = [];
  (machines[f.machine] || []).forEach(x => { for (let i = 0; i < x.qty * f.qty; i++) pieces.push({ profile: x.profile, length: x.length }); });
  return pieces;
}

// Bruts à acheter pour chaque ligne future du planning, d'après le stock du moment :
// chutes et bruts (y compris livraisons déjà commandées) servent d'abord les fabrications les plus proches.
function planNeedsNow() {
  const s = readSettings();
  const now = isoWeek(new Date());
  const machines = readMachines();
  let pool = readChutes();
  const bruts = readBruts();
  readDeliveries().filter(d => d.status === 'Prévu').forEach(d => { bruts[d.profile] = (bruts[d.profile] || 0) + d.qty; });
  const out = {};
  readForecasts().filter(f => f.week >= now).forEach(f => {
    const bars = optimiseServer(forecastPieces(f, machines), pool, s);
    const used = {};
    bars.filter(b => b.source === 'chute').forEach(b => { used[b.chuteId] = 1; });
    pool = pool.filter(c => !used[c.id]);
    const need = {}, buy = {};
    bars.filter(b => b.source === 'barre').forEach(b => { need[b.profile] = (need[b.profile] || 0) + 1; });
    Object.keys(need).forEach(p => {
      const take = Math.min(bruts[p] || 0, need[p]);
      bruts[p] = (bruts[p] || 0) - take;
      const miss = need[p] - take;
      // Achat arrondi au conditionnement : le surplus reste en stock pour les fabrications suivantes.
      if (miss > 0) { buy[p] = roundLot(s, p, miss); bruts[p] += buy[p] - miss; }
    });
    out[f.row] = { f: f, need: need, buy: buy };
  });
  return out;
}
