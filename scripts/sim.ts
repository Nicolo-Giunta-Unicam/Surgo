// Simulatore di bilanciamento: un bot gioca intere run con il motore reale (nessun DOM) e produce statistiche.
// Uso: npx tsx scripts/sim.ts [--runs 200] [--style boxing] [--skill smart|naive] [--data path/game.json] [--seed 1] [--json out.json] [--verbose]
import { readFileSync, writeFileSync } from 'node:fs';
const arg = (k: string, d: string) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = arg('data', ''), sets = process.argv.flatMap((a, i) => a === '--set' ? [process.argv[i + 1]] : []);
let custom: string | null = null;
if (DATA || sets.length) { const d = JSON.parse(readFileSync(DATA || 'data/game.json', 'utf8')); for (const s of sets) { const [k, v] = s.split('='); const ks = k.split('.'); let o = d; for (const x of ks.slice(0, -1)) o = o[x]; o[ks[ks.length - 1]] = JSON.parse(v); } custom = JSON.stringify(d); }
(globalThis as any).localStorage = { getItem: (k: string) => (k === 'comboo.customdata.v1' ? custom : null), setItem() {}, removeItem() {} };
const E = await import('../src/engine'); const D = await import('../src/data'); const { CONFIG } = await import('../src/config'); const { REGION_LIST } = await import('../src/regions');
const { MOVES, EQUIPMENT, ENEMY_MOVES } = D; const moveOf = D.moveOf;

type Skill = 'smart' | 'naive' | 'casual'; // smart: esperto (pota il mazzo); casual: giocatore medio, a volte sbaglia; naive: quasi casuale
interface Duel { first: boolean; eLeft: number; hLeft: number; eq: number; en: number; deck: number; mv: number; atk: number; arena: number; region: string; enemy: string; won: boolean; turns: number; hpEnd: number; hpMax: number; firstTurnDmg: number; maxHit: number; emptyHand: number; cards: number }
const usage: Record<string, number> = {}, duels: Duel[] = [], runs: { arena: number; won: boolean; killer: string; gold: number }[] = [];

function expectedIncoming(r: any, c: any) {
  const pool = (REGION_LIST.find(g => g.id === r.region)?.enemyMoves ?? []).map((id: string) => ENEMY_MOVES.find(m => m.id === id)).filter(Boolean) as any[];
  const Ec = CONFIG.enemy, n = Math.min(Ec.playsMax, Ec.playsBase + Math.floor((r.arena - 1) / Ec.playsEvery)), base = c.enemy.atk * Ec.cardMult;
  const gb = (c.enemy.gear ?? []).reduce((s: number, g: string) => s + (EQUIPMENT[g].bonus.dmg ?? 0), 0);
  const nm = Ec.normalize ? Ec.normalize / (pool.reduce((s: number, m: any) => s + (m.dmg ?? 0) * (m.hits ?? 1), 0) / (pool.length || 1) || 1) : 1, avg = pool.reduce((s, m) => s + (m.dmg ? Math.max(1, Math.round(base * nm * m.dmg)) * (m.hits ?? 1) + gb * (m.hits ?? 1) : 0), 0) / (pool.length || 1);
  const worst = pool.reduce((s, m) => Math.max(s, m.dmg ? (Math.max(1, Math.round(base * m.dmg)) + gb) * (m.hits ?? 1) : 0), 0);
  return { avg: avg * n, worst, n };
}
const shields = (c: any) => E.shieldsOf(c);

/** Valore stimato di giocare una carta adesso (in "punti danno"). */
function valueOf(r: any, c: any, uid: string, skill: Skill): number {
  const m = MOVES[moveOf(uid)], f = m.effect, S = f.syn, mods = c.mods ?? { off: 0 }, L = c.lastBy ?? { off: null, def: null }, R = c.runs ?? { off: 0, def: 0 };
  if (f.flee) return -1;
  const off = !!f.dmg || S?.k === 'momentum' || S?.k === 'shieldAtk', g = off ? 'off' : 'def', same = L[g] === m.id, n = same ? R[g] + 1 : 1, pct = CONFIG.combo.same[Math.min(n, CONFIG.combo.max) - 1] ?? 0;
  const fg = f.link ? (MOVES[f.link.from]?.effect.dmg ? 'off' : 'def') : g, lk = f.link && L[fg] === f.link.from ? f.link : null;
  const inc = expectedIncoming(r, c), need = Math.max(0, inc.avg * 0.8 - shields(c)), hpFrac = r.hp / E.maxHp(r);
  const wDef = skill === 'naive' ? 0.3 : skill === 'casual' ? (need > 0 ? 0.55 : 0.12) : need > 0 ? 0.9 : 0.12, wHeal = hpFrac < 0.7 ? 0.8 : 0.1;
  const nOff = c.field.off.length; let v = 0;
  if (S) switch (S.k) {
    case 'adrenaline': v = (S.n ?? 0) * (nOff + 1.2); break;
    case 'bypass': v = Math.min(20, c.foeField.def.reduce((s: number, p: any) => s + p.block, 0)) * 0.8; break;
    case 'freeNext': v = 2.5; break; case 'dup': v = nOff ? 5 : 1; break; case 'clone': v = c.lastUid ? 4 : -1; break; case 'scout': v = c.draw.length ? 1.5 : -1; break;
    case 'flow': v = (S.n ?? 0) * (mods.combos + 1) * wDef + 1; break;
    case 'momentum': v = (S.n ?? 1) * (Object.values(c.played).reduce((a: number, b: any) => a + b, 0) + 1) * (1 + pct); break;
    case 'shieldAtk': v = shields(c); break;
  }
  if (f.dmg) v += (f.dmg + (lk?.dmg ?? 0) + E.dmgBonus(r) + mods.off) * (f.hits ?? 1) * (1 + pct);
  if (f.block || lk?.block) { const b = ((f.block ?? 0) + (lk?.block ?? 0)) * (1 + pct), dur = f.dur === 0 ? 3 : f.dur ?? 1; v += b * wDef * (off ? 0.8 : 1 + (dur - 1) * 0.3); }
  if (f.heal) v += f.heal * wHeal * (1 + pct);
  const handLow = c.hand.length < 4, drawOk = c.draw.length > 0 && c.hand.length < CONFIG.maxHand;
  const dr = (f.draw ?? 0) + (lk?.draw ?? 0), en = (f.energy ?? 0) + (lk?.energy ?? 0);
  if (dr && drawOk) v += dr * (handLow ? 2.2 : 1.1); if (en) v += en * 2.5;
  return v;
}

function playTurn(r: any, skill: Skill) {
  const c = r.combat; let guard = 0;
  while (r.phase === 'combat' && c.phase === 'player' && guard++ < 40) {
    if (c.pick?.length) { E.choosePick(r, c.pick[0]); continue; }
    const cand = c.hand.map((u: string) => ({ u, cost: E.effCost(c, u) })).filter((x: any) => x.cost <= c.energy);
    let best: any = null, bs = skill === 'naive' ? -0.5 : skill === 'casual' ? 0.2 : 0.4;
    for (const x of cand) { const val = valueOf(r, c, x.u, skill) + (skill === 'naive' ? Math.random() * 3 : skill === 'casual' ? Math.random() * 0.9 : 0), s = val / Math.max(0.6, x.cost); if (s > bs) { bs = s; best = x; } }
    if (best) { const mid = moveOf(best.u); if (!E.playCard(r, best.u)) { usage[mid] = (usage[mid] ?? 0) + 1; continue; } }
    // mazzo finito: ricarica (3 energia) solo se la mano è povera
    if (!c.draw.length && c.discard.length && c.energy >= CONFIG.discardDrawCost && (skill === 'smart' ? c.hand.length < 3 : skill === 'casual' && c.hand.length === 0)) { if (!E.drawDiscard(r)) continue; }
    break;
  }
  if (r.phase === 'combat' && c.phase === 'player') E.endTurn(r);
}

function fight(r: any, skill: Skill, duelsOut: Duel[]): 'win' | 'lose' | 'stall' {
  const c0 = r.combat, arena = r.arena, enemyId = c0.enemy.id ?? c0.enemy.name, region = r.region ?? ''; let firstTurnDmg = 0, maxHit = 0, emptyHand = 0, cards = 0, turns = 0, eLeft = 0, hLeft = 0;
  while (r.phase === 'combat' && turns < 60) {
    const c = r.combat; turns++; const hp0 = r.hp; const before = c.hand.length; playTurn(r, skill); if (r.phase === 'combat') { eLeft += c.energy; hLeft += c.hand.length; } if (!c.hand.length) emptyHand++; cards += before - c.hand.length;
    let g = 0; while (r.phase === 'combat' && r.combat && r.combat.phase !== 'player' && g++ < 200) { const hpB = r.hp; E.enemyStep(r); maxHit = Math.max(maxHit, hpB - r.hp); }
    if (turns === 1) firstTurnDmg = hp0 - r.hp;
  }
  const won = r.phase !== 'over' && r.outcome === 'win';
  duelsOut.push({ first: true, eLeft: eLeft / turns, hLeft: hLeft / turns, eq: r.equipped.length, en: E.maxEnergy(r), deck: r.deck.length, mv: r.bought.length, atk: E.dmgBonus(r), arena, region, enemy: enemyId, won, turns, hpEnd: r.hp, hpMax: E.maxHp(r), firstTurnDmg, maxHit, emptyHand, cards });
  return r.phase === 'over' ? 'lose' : turns >= 60 ? 'stall' : 'win';
}

/** Potenza statica di una carta, per scegliere quali tenere nel mazzo (un giocatore esperto lo pota). */
function staticScore(id: string) {
  const f = MOVES[id].effect, S = f.syn, dur = f.dur === 0 ? 3 : f.dur ?? 1; let v = (f.dmg ?? 0) * (f.hits ?? 1) + (f.link?.dmg ?? 0) * 0.6 + (f.block ?? 0) * (0.6 + 0.25 * dur) + (f.link?.block ?? 0) * 0.4 + (f.heal ?? 0) * 0.8 + (f.draw ?? 0) * 3 + (f.energy ?? 0) * 3.5;
  if (S) v += ({ adrenaline: 5, bypass: 3, freeNext: 4, dup: 6, clone: 4, scout: 2.5, flow: 5, momentum: 7, shieldAtk: 6 } as any)[S.k] ?? 3; if (f.flee) v = -5; return v;
}
function curateDeck(r: any, skill: Skill) {
  if (skill !== 'smart') return; const own = E.ownedCards(r), n = Math.max(12, Math.min(18, 11 + Math.floor(r.arena / 3)));
  const ranked = own.map((c: any) => ({ u: c.uid, s: staticScore(c.move) / Math.pow(Math.max(1, MOVES[c.move].cost), 0.65) })).sort((a: any, b: any) => b.s - a.s);
  const deck = ranked.slice(0, n).map((x: any) => x.u); if (deck.length >= CONFIG.minDeck) r.deck = deck;
}
function shop(r: any, skill: Skill, style: string) {
  // scelta di capitolo: opzione a caso (le scelte devono essere equivalenti)
  const pc = E.pendingChoice(r); if (pc) E.makeChoice(r, pc.options[Math.floor(Math.random() * 3)].id);
  if (r.pending) E.resolvePending(r, 'discard');
  if (r.wounded && r.gold >= CONFIG.healCost && skill !== 'naive') E.healRun(r);
  const tries = 30; for (let t = 0; t < tries; t++) {
    let did = false; const cands: { kind: string; i: number; price: number; score: number }[] = [];
    r.offers.eq.forEach((id: string | null, i: number) => { if (!id) return; const e = EQUIPMENT[id], price = i === 2 ? r.offers.eqPrice : e.price; if (r.equipped.length >= r.slots) return; cands.push({ kind: 'eq', i, price, score: 100 - price * 0.3 + Math.random() * 20 }); });
    r.offers.mv.forEach((id: string | null, i: number) => { if (!id) return; const m = MOVES[id], price = i === 2 ? r.offers.mvPrice : m.price; const ef = m.effect; cands.push({ kind: 'mv', i, price, score: 60 + ((ef.dmg ?? 0) * (ef.hits ?? 1) + (ef.block ?? 0)) * 3 - price * 0.3 + Math.random() * 20 }); });
    const ep = E.energyPrice(r); const eTarget = skill === 'smart' ? Math.min(CONFIG.maxEnergy - 3, 1 + Math.floor((r.arena - 1) / 3)) : skill === 'casual' ? Math.min(CONFIG.maxEnergy - 3, Math.floor(r.arena / 4)) : 0; if (r.energyBonus < eTarget) cands.push({ kind: 'en', i: 0, price: ep, score: 150 });
    cands.sort((a, b) => b.score - a.score);
    for (const x of cands) { if (x.price > r.gold) continue; const err = x.kind === 'eq' ? E.buyOfferEq(r, x.i) : x.kind === 'mv' ? E.buyOfferMv(r, x.i) : E.buyEnergy(r); if (!err) { did = true; break; } }
    if (r.pending) E.resolvePending(r, 'discard'); if (!did) break;
  }
}

function playRun(seed: number, style: string, skill: Skill): void {
  const r: any = E.newRun(seed); E.setStyle(r, style); let stall = 0;
  while (r.phase !== 'over') {
    if (r.needsMap || !r.region) { const open = E.unlocked(r).filter((id: string) => E.wins(r, id) < CONFIG.matchesPerIsland); if (!open.length) { runs.push({ arena: r.arena, won: true, killer: '', gold: r.gold }); return; } E.chooseRegion(r, open[open.length - 1]); }
    shop(r, skill, style); curateDeck(r, skill); const err = E.beginArena(r); if (err) { r.phase = 'over'; break; }
    const enemy = r.combat.enemy.id ?? r.combat.enemy.name;
    if (IMMORTAL) { // snapshot pre-duello; si riprova finché si vince (max 8 tentativi); il primo tentativo misura la difficoltà
      const snap = JSON.stringify(r); let tries = 0;
      for (;;) { const dl: Duel[] = []; const res = fight(r, skill, dl); tries++; dl[0].won = tries === 1 && res === 'win'; dl[0].first = tries === 1; duels.push(dl[0]); if (res === 'win' || tries >= 8) break; const back = JSON.parse(snap); for (const k of Object.keys(r)) delete r[k]; Object.assign(r, back); r.rng = (r.rng + tries * 7919) >>> 0; const e2 = E.beginArena(r); if (e2) break; }
      if (r.phase === 'combat') { r.phase = 'over'; } if (r.phase === 'over') { runs.push({ arena: r.arena, won: false, killer: enemy, gold: r.gold }); return; } continue;
    }
    const res = fight(r, skill, duels);
    if (res === 'stall' && ++stall > 2) { runs.push({ arena: r.arena, won: false, killer: 'stall:' + enemy, gold: r.gold }); return; }
    if (r.phase === 'over') { runs.push({ arena: r.arena, won: false, killer: enemy, gold: r.gold }); return; }
    if (r.phase === 'combat') { r.phase = 'over'; runs.push({ arena: r.arena, won: false, killer: 'stall:' + enemy, gold: r.gold }); return; }
  }
  runs.push({ arena: r.arena, won: false, killer: 'start', gold: r.gold });
}

const IMMORTAL = process.argv.includes('--immortal'), N = +arg('runs', '200'), style = arg('style', 'boxing'), skill = arg('skill', 'smart') as Skill, seed0 = +arg('seed', '1');
for (let i = 0; i < N; i++) playRun(seed0 + i, style, skill);
// ---- report ----
const pct = (a: number, b: number) => b ? Math.round(100 * a / b) : 0, avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const maxA = Math.max(...duels.map(d => d.arena), 1), rows: any[] = [];
for (let a = 1; a <= maxA; a++) { const d = duels.filter(x => x.arena === a); if (!d.length) continue; const w = d.filter(x => x.won); rows.push({ arena: a, region: d[0].region, n: d.length, win: pct(w.length, d.length), turns: +avg(d.map(x => x.turns)).toFixed(1), hpLeft: pct(avg(w.map(x => x.hpEnd / x.hpMax)) * 100, 100), firstDmg: Math.round(avg(d.map(x => x.firstTurnDmg))), maxHit: Math.round(avg(d.map(x => x.maxHit))), hp: Math.round(avg(d.map(x => x.hpMax))), emptyHand: +avg(d.map(x => x.emptyHand)).toFixed(1), eq: +avg(d.map(x => x.eq)).toFixed(1), en: +avg(d.map(x => x.en)).toFixed(1), deck: +avg(d.map(x => x.deck)).toFixed(0), mv: +avg(d.map(x => x.mv)).toFixed(1), cards: +avg(d.map(x => x.cards / x.turns)).toFixed(1), eLeft: +avg(d.map(x => x.eLeft)).toFixed(1), hLeft: +avg(d.map(x => x.hLeft)).toFixed(1) }); }
const finals = runs.map(x => x.arena - (x.won ? 0 : 0)), won = runs.filter(x => x.won).length;
console.log(`stile=${style} bot=${skill} runs=${N}  vittorie complete: ${pct(won, N)}%  arena media raggiunta: ${avg(runs.map(x => x.arena)).toFixed(1)}`);
console.table(rows);
const killers: Record<string, number> = {}; runs.filter(x => !x.won).forEach(x => { killers[x.killer] = (killers[x.killer] ?? 0) + 1; });
console.log('uccisi da:', Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join('  '));
const dist: Record<number, number> = {}; runs.forEach(x => { dist[x.arena] = (dist[x.arena] ?? 0) + 1; }); console.log('arena finale (n run):', Object.entries(dist).map(([k, v]) => `${k}:${v}`).join(' '));
const j = arg('json', ''); if (j) writeFileSync(j, JSON.stringify({ rows, runs, duels }, null, 1));

if (process.argv.includes('--usage')) { const t = Object.values(usage).reduce((a, b) => a + b, 0); console.log('uso carte (% giocate):', Object.entries(usage).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / t).toFixed(1)}`).join(' ')); }
