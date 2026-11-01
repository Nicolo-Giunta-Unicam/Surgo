import { CONFIG } from './config';
import { CHOICES, ENEMY_MOVES, EQUIPMENT, MOVES, STYLES, moveOf, type ChoiceEv, type ChoiceFx, type ChoiceOpt } from './data';
import { REGION_LIST, REGIONS } from './regions';
import { defeatOutcome, movesRetainedAfterRemoval } from './policies';
export type Phase = 'store' | 'combat' | 'over';
export type Err = string | null;
export interface Enemy { name: string; tier: string; hp: number; maxHp: number; block: number; gear: string[]; art?: string; id?: string; atk: number }
export interface Combat { foeDealt?: number; enemy: Enemy; phase: 'player' | 'resolve' | 'enemy'; mercy?: boolean; tier?: number; lastBy?: Rec2<string | null>; mods?: { off: number; bypass: boolean; freeNext: boolean; dupNext: boolean; combos: number }; cardCost?: Record<string, number>; lastUid?: string; pick?: string[] | null; syn?: { n: number; text: string }; runs?: Rec2<number>; chains?: Rec2<number>; seq: number; fresh: number; ev: Ev | null; queue: EnemyCard[]; last: EnemyCard | null; field: Side; foeField: Side; combo: string; played: Record<string, number>; prev: string | null; block: number; draw: string[]; hand: string[]; discard: string[]; energy: number; turn: number; log: string[] }
/** Effetti di una scelta di capitolo che valgono solo per il prossimo duello. */
export interface Boon { block?: number; energy?: number; draw?: number; foeHp?: number; hp?: number }
export interface Run {
  /** Carta misteriosa pagata ma non ancora installata (nessuno slot libero): si risolve con resolvePending. */
  pending?: { id: string; paid: number } | null;
  /** Regione dell'arena corrente (tema e nemici); needsMap: prima di ogni arena si sceglie la regione sulla mappa. */
  region?: string | null; needsMap?: boolean; progress?: Record<string, number>;
  /** Carte vendute singolarmente (uid di carte base o di mosse di equipaggiamento): escluse dalla collezione. */
  god?: boolean; finalEv?: Ev | null; outcome?: string; style?: string; wounded?: boolean; scars?: number;
  sold?: string[]; hero?: { name: string; avatar: string };
  /** Scelte di capitolo: seme dell'ordine degli eventi, scelte già fatte (per capitolo) e bonus/malus per il prossimo duello. */
  cs?: number; chapters?: Record<string, { ev: string; opt: string; gold: number; fx?: ChoiceFx }>; boon?: Boon;
  v: 1; rng: number; arena: number; gold: number; hp: number; slots: number;
  equipped: string[]; bought: string[]; retained: string[]; energyBonus: number; offers: Offers; paid: Record<string, number>;
  deck: string[]; phase: Phase; combat: Combat | null; msg: string;
}
type Rec2<T> = { off: T; def: T };
export interface Placed { uid: string; name: string; icon: string; src: string; dmg: number; hits: number; block: number; ttl: number; sh?: number; id?: number; mv?: string; fx?: string; tag?: string }
export interface Ev { by: 'me' | 'foe'; card: Placed; absorbed: number; dmg: number }
export interface Side { off: Placed[]; def: Placed[] }
/** Slot 0-1: carte visibili; slot 2: carta MISTERIOSA (id nascosto) a prezzo ridotto (eqPrice/mvPrice). */
export interface Offers { eq: (string | null)[]; mv: (string | null)[]; eqPrice: number; mvPrice: number }
export interface Card { uid: string; move: string }
export function rand(r: Run) { r.rng = (r.rng + 0x6D2B79F5) >>> 0; let t = r.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function shuffle<T>(r: Run, a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand(r) * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const styleDeck = (r: Run) => (STYLES.find(x => x.id === (r.style ?? 'boxing')) ?? STYLES[0]).deck;
export function ownedCards(r: Run): Card[] {
  const m = new Map<string, Card>(); const add = (uid: string) => m.set(uid, { uid, move: moveOf(uid) });
  styleDeck(r).forEach((m, i) => add(`base:${m}:${i}`));
  r.equipped.forEach(e => EQUIPMENT[e].moves.forEach((_, i) => add(`eq:${e}:${i}`)));
  r.retained.forEach(add); r.bought.forEach(b => add(`buy:${b}`)); (r.sold ?? []).forEach(u => m.delete(u));
  return [...m.values()];
}
export const maxHp = (r: Run) => CONFIG.startHp + Math.round(CONFIG.hpPerArena * (r.arena - 1)) + r.equipped.reduce((s, e) => s + (EQUIPMENT[e].bonus.maxHp ?? 0), 0);
export const dmgBonus = (r: Run) => r.equipped.reduce((s, e) => s + (EQUIPMENT[e].bonus.dmg ?? 0), 0);
export const maxEnergy = (r: Run) => Math.min(CONFIG.maxEnergy, CONFIG.energyPerTurn + (r.energyBonus ?? 0));
export const energyPrice = (r: Run) => CONFIG.energyPrice(r.energyBonus ?? 0);
/** Estensione energia: +1 energia per turno fino a CONFIG.maxEnergy. DECISIONE APERTA: non rivendibile. */
export function buyEnergy(r: Run): Err {
  if (r.phase !== 'store') return 'Store non disponibile.'; if (maxEnergy(r) >= CONFIG.maxEnergy) return `Energia già al massimo (${CONFIG.maxEnergy}).`;
  const p = energyPrice(r); if (r.gold < p) return 'Oro insufficiente.'; r.gold -= p; r.energyBonus++; return null;
}
/** Valore di vendita di una carta: base = valore fisso; mossa di equipaggiamento = 1/3 del rimborso dell'equipaggiamento; mossa acquistata = rimborso 50%. */
export const cardValue = (r: Run, uid: string) => { const [k, a] = uid.split(':'); return k === 'base' ? CONFIG.cardValueBase : k === 'eq' ? Math.floor(refund(r.paid[a] ?? 0) / 3) : refund(r.paid[a] ?? 0); };
/** Vendita di qualsiasi carta (drag & drop sulla zona vendita), purché nel mazzo restino almeno CONFIG.minDeck carte. */
export function sellCard(r: Run, uid: string): Err {
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!ownedCards(r).some(c => c.uid === uid)) return 'Carta non posseduta.';
  const [k, a] = uid.split(':'); if (k === 'buy') return sellMove(r, a);
  if (r.deck.includes(uid) && r.deck.length <= CONFIG.minDeck) return `Il mazzo deve avere almeno ${CONFIG.minDeck} carte.`;
  r.gold += cardValue(r, uid); r.sold = [...(r.sold ?? []), uid]; sanitize(r); return null;
}
// ---- Offerte dello store: 3 potenziamenti e 3 mosse (delle mosse avanzate degli equipaggiamenti installati), casuali ----
const eligibleMoves = (r: Run) => r.equipped.flatMap(e => EQUIPMENT[e].advanced).filter(m => !r.bought.includes(m));
export function genOffers(r: Run) {
  const n = CONFIG.offers, fit = (a: string[]): (string | null)[] => { const x: (string | null)[] = shuffle(r, a).slice(0, n); while (x.length < n) x.push(null); return x; };
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  r.offers = { eq: fit(Object.values(EQUIPMENT).filter(e => islandIndex(e.island) <= reach(r) && !r.equipped.includes(e.id)).map(e => e.id)), mv: fit(eligibleMoves(r)), eqPrice: Math.round(avg(Object.values(EQUIPMENT).map(e => e.price)) * CONFIG.mystery), mvPrice: Math.round(avg(Object.values(MOVES).filter(m => m.price > 0).map(m => m.price)) * CONFIG.mystery) };
}
/** Acquisto per offerta (la UI lo chiama dopo il drag & drop). Un equipaggiamento nuovo rende offribili le sue mosse avanzate. */
export function buyOfferEq(r: Run, i: number): Err {
  const id = r.offers.eq[i]; if (!id) return 'Offerta non disponibile.'; if (i === 2 && r.equipped.length >= r.slots) { // nessuno slot: paga e poi scegli se sostituire o scartare
    const p = r.offers.eqPrice; if (r.phase !== 'store') return 'Store non disponibile.'; if (r.gold < p) return 'Oro insufficiente.';
    r.gold -= p; r.pending = { id, paid: p }; r.offers.eq[2] = null; return null;
  }
  const err = buyEquipment(r, id, i === 2 ? r.offers.eqPrice : undefined); if (err) return err;
  r.offers.eq[i] = null; const add = shuffle(r, EQUIPMENT[id].advanced.filter(m => !r.bought.includes(m) && !r.offers.mv.includes(m)));
  r.offers.mv = r.offers.mv.map(m => m ?? add.shift() ?? null); return null;
}
/** PV a inizio duello: sempre pieni, salvo se l'ultimo duello è finito sotto la soglia (allora parti all'80% finché non paghi la cura). */
export const startHp = (r: Run) => r.wounded ? Math.ceil(maxHp(r) * CONFIG.woundedStart) : maxHp(r);
export function healRun(r: Run): Err {
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!r.wounded) return 'Sei già in piena salute.'; if (r.gold < CONFIG.healCost) return 'Oro insufficiente.';
  r.gold -= CONFIG.healCost; r.wounded = false; return null;
}
/** Scelta dello stile di combattimento iniziale: imposta il mazzo base. */
export function setStyle(r: Run, id: string): Err { if (!STYLES.some(x => x.id === id)) return 'Stile sconosciuto.'; r.style = id; r.deck = ownedCards(r).map(c => c.uid); return null; }
export function chooseRegion(r: Run, id: string): Err {
  if (r.phase !== 'store' || !r.needsMap) return 'Non puoi scegliere ora.'; const g = REGIONS[id]; if (!g) return 'Regione sconosciuta.'; if (!unlocked(r).includes(id)) return 'Isola bloccata.';
  r.region = id; r.needsMap = false; r.msg = `Arena: ${g.name}.`; return null;
}
// ---- Scelte di capitolo ----
const seeded = (seed: number) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function sshuffle<T>(a: T[], seed: number) { const b = [...a], f = seeded(seed); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
/** Un capitolo = un incontro di un'isola; ripetere lo stesso duello (fuga/pietà) non genera una nuova scelta. */
export const chapterKey = (r: Run) => r.region ? `${r.region}:${wins(r, r.region)}` : '';
/** Valore in oro di 1 "unità" di ricompensa: cresce con l'arena (1/3 della vittoria). */
export const goldUnit = (r: Run) => Math.max(1, Math.round(CONFIG.reward(r.arena) / CONFIG.choice.goldDivisor));
export const choiceGold = (r: Run, fx: ChoiceFx) => Math.round((fx.gold ?? 0) * goldUnit(r));
export interface PendingChoice { key: string; ev: ChoiceEv; options: ChoiceOpt[] }
/** Effetti scalati col livello: scudo e malus ai PV crescono con l'arena (oro e altri effetti no: l'oro usa già goldUnit). */
export function scaledFx(r: Run, fx: ChoiceFx): ChoiceFx {
  const o = { ...fx }, k = (v: number, per: number) => Math.round(v * (1 + per * (r.arena - 1)));
  if (fx.block) o.block = k(fx.block, CONFIG.choice.blockPerArena); if (fx.hp) o.hp = k(fx.hp, CONFIG.choice.hpPerArena); return o;
}
const hashStr = (t: string) => [...t].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
/** Scelta ancora da fare nel capitolo corrente: l'evento appartiene all'isola e all'incontro attuali (se ce n'è più d'uno, ne sceglie uno in base al seme della run, evitando i già visti); opzioni in ordine mescolato. */
export function pendingChoice(r: Run): PendingChoice | null {
  if (r.phase !== 'store' || r.needsMap || !r.region || r.pending || !CHOICES.length) return null;
  const key = chapterKey(r); if (r.chapters?.[key]) return null;
  const at = wins(r, r.region) % CONFIG.matchesPerIsland, cs = (r.cs ?? 1) + hashStr(key);
  let pool = CHOICES.filter(e => e.region === r.region && e.at === at); if (!pool.length) pool = CHOICES.filter(e => e.region === r.region); if (!pool.length) pool = CHOICES;
  const used = new Set(Object.values(r.chapters ?? {}).map(c => c.ev)), order = sshuffle(pool, cs), ev = order.find(e => !used.has(e.id)) ?? order[0];
  return { key, ev, options: sshuffle(ev.options, cs * 31 + 7) };
}
export function makeChoice(r: Run, optId: string): Err {
  const p = pendingChoice(r); if (!p) return 'Nessuna scelta in sospeso.'; const o = p.ev.options.find(x => x.id === optId); if (!o) return 'Scelta non valida.';
  const fx = scaledFx(r, o.fx), g = Math.max(-r.gold, choiceGold(r, fx)); r.gold += g;
  const b: Boon = { ...r.boon }; for (const k of ['block', 'energy', 'draw', 'foeHp', 'hp'] as const) if (fx[k]) b[k] = (b[k] ?? 0) + fx[k]!;
  if (Object.values(b).some(Boolean)) r.boon = b; r.chapters = { ...r.chapters, [p.key]: { ev: p.ev.id, opt: o.id, gold: g, fx } }; r.msg = o.text; return null;
}
export function openMap(r: Run): Err { if (r.phase !== 'store' || r.pending) return 'Non puoi ora.'; r.needsMap = true; return null; }
export function resolvePending(r: Run, action: 'discard' | 'replace', target?: string): Err {
  const p = r.pending; if (!p) return 'Nessuna carta in sospeso.';
  if (action === 'discard') { r.gold += Math.floor(EQUIPMENT[p.id].price * CONFIG.sellRatio); r.pending = null; return null; }
  if (!target || !r.equipped.includes(target)) return 'Scegli un equipaggiamento da sostituire.';
  const err = sellEquipment(r, target); if (err) return err;
  r.equipped.push(p.id); r.paid[p.id] = p.paid; r.pending = null; autoAdd(r, EQUIPMENT[p.id].moves.map((_, i) => `eq:${p.id}:${i}`));
  const add = shuffle(r, EQUIPMENT[p.id].advanced.filter(m => !r.bought.includes(m) && !r.offers.mv.includes(m))); r.offers.mv = r.offers.mv.map(m => m ?? add.shift() ?? null); return null;
}
export function buyOfferMv(r: Run, i: number): Err { const id = r.offers.mv[i]; if (!id) return 'Offerta non disponibile.'; const err = buyMove(r, id, i === 2 ? r.offers.mvPrice : undefined); if (err) return err; r.offers.mv[i] = null; return null; }
export const slotsFor = (arena: number) => Math.min(CONFIG.maxSlots, CONFIG.startSlots + Math.floor((arena - 1) / CONFIG.slotEveryArenas));
export function newRun(seed = Date.now()): Run {
  const r: Run = { v: 1, cs: Math.imul(seed >>> 0, 2654435761) >>> 0, rng: seed >>> 0, arena: 1, gold: CONFIG.startGold, hp: CONFIG.startHp, slots: CONFIG.startSlots, equipped: [], bought: [], retained: [], energyBonus: 0, offers: { eq: [], mv: [], eqPrice: 0, mvPrice: 0 }, paid: {}, deck: [], phase: 'store', combat: null, msg: 'Preparati: compra equipaggiamento prima della prima arena.' };
  r.deck = ownedCards(r).map(c => c.uid); genOffers(r); r.needsMap = true; return r;
}
export interface EnemyCard { id?: string; name: string; icon: string; dmg: number; hits: number; block: number; heal: number; dur: number }
export const islandIndex = (id: string) => REGION_LIST.findIndex(r => r.id === id);
export const wins = (r: Run, id: string) => r.progress?.[id] ?? 0;
/** Isole sbloccate: la prima sempre; ogni altra dopo CONFIG.matchesPerIsland vittorie sull'isola precedente. */
export const unlocked = (r: Run) => r.god ? REGION_LIST.map(g => g.id) : REGION_LIST.filter((_, i) => i === 0 || wins(r, REGION_LIST[i - 1].id) >= CONFIG.matchesPerIsland).map(g => g.id);
export const reach = (r: Run) => unlocked(r).length - 1;
/** Equipaggiamento nemico: pezzi delle isole fino a quella del nemico; cresce con l'arena (1 + 1 ogni gearEvery). */
export const enemyGear = (a: number, region?: string): string[] => {
  const idx = region ? islandIndex(region) : 99, ids = Object.values(EQUIPMENT).filter(e => islandIndex(e.island) <= idx).map(e => e.id), n = Math.min(ids.length, 1 + Math.floor((a - 1) / CONFIG.enemy.gearEvery));
  return Array.from({ length: n }, (_, i) => ids[(a + i) % ids.length]);
};
export function enemyFor(a: number, region?: string, match = 0): Enemy {
  const E = CONFIG.enemy, rg = REGIONS[region ?? ''], en = rg ? rg.enemies[match % rg.enemies.length] : undefined, gear = enemyGear(a, region);
  const hp = Math.round(E.hpBase * E.hpGrowth ** (a - 1) * (en?.hpMul ?? 1)) + gear.reduce((s, g) => s + (EQUIPMENT[g].bonus.maxHp ?? 0), 0);
  return { name: en ? en.name : `Avversario ${a}`, ...(rg ? { art: rg.id } : {}), ...(en?.id ? { id: en.id } : {}), tier: rg ? rg.level : 'Umano', hp, maxHp: hp, block: 0, gear, atk: Math.round(E.atkBase * E.atkGrowth ** (a - 1) * (en?.atkMul ?? 1)) };
}
// ---- Mazzo ----
function sanitize(r: Run) { const own = new Set(ownedCards(r).map(c => c.uid)); r.deck = r.deck.filter(u => own.has(u)).slice(0, CONFIG.maxDeck); }
function autoAdd(r: Run, uids: string[]) { for (const u of uids) if (r.deck.length < CONFIG.maxDeck && !r.deck.includes(u)) r.deck.push(u); }
export function toggleDeck(r: Run, uid: string): Err {
  if (r.phase !== 'store') return 'Puoi modificare il mazzo solo nello store.';
  if (!ownedCards(r).some(c => c.uid === uid)) return 'Carta non posseduta.';
  if (r.deck.includes(uid)) { if (r.deck.length <= CONFIG.minDeck) return `Servono almeno ${CONFIG.minDeck} carte.`; r.deck = r.deck.filter(u => u !== uid); return null; }
  if (r.deck.length >= CONFIG.maxDeck) return `Mazzo pieno (${CONFIG.maxDeck}).`;
  r.deck.push(uid); return null;
}
// ---- Store ed economia ----
const refund = (paid: number) => Math.floor(paid * CONFIG.sellRatio);
export function buyEquipment(r: Run, id: string, price = EQUIPMENT[id]?.price ?? 0): Err {
  const e = EQUIPMENT[id];
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!e) return 'Equipaggiamento sconosciuto.';
  if (r.equipped.includes(id)) return 'Già installato.'; if (r.equipped.length >= r.slots) return 'Nessuno slot libero.';
  if (r.gold < price) return 'Oro insufficiente.';
  r.gold -= price; r.paid[id] = price; r.equipped.push(id);
  autoAdd(r, e.moves.map((_, i) => `eq:${id}:${i}`)); return null;
}
export function sellEquipment(r: Run, id: string): Err {
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!r.equipped.includes(id)) return 'Non posseduto.';
  if (r.deck.filter(u => !u.startsWith(`eq:${id}:`)).length < CONFIG.minDeck) return `Il mazzo deve avere almeno ${CONFIG.minDeck} carte.`;
  r.gold += refund(r.paid[id]); delete r.paid[id]; r.equipped = r.equipped.filter(e => e !== id); r.sold = (r.sold ?? []).filter(u => !u.startsWith(`eq:${id}:`));
  r.retained = [...new Set([...r.retained, ...movesRetainedAfterRemoval(r, id)])]; sanitize(r); return null;
}
export function buyMove(r: Run, id: string, price = MOVES[id]?.price ?? 0): Err {
  const m = MOVES[id];
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!m || m.price <= 0) return 'Mossa non acquistabile.';
  if (!r.equipped.includes(m.source)) return 'Serve l\'equipaggiamento associato.';
  if (r.bought.includes(id)) return 'Già posseduta.'; if (r.gold < price) return 'Oro insufficiente.';
  r.gold -= price; r.paid[id] = price; r.bought.push(id); autoAdd(r, [`buy:${id}`]); return null;
}
export function sellMove(r: Run, id: string): Err {
  if (r.phase !== 'store') return 'Store non disponibile.'; if (!r.bought.includes(id)) return 'Non posseduta.';
  if (r.deck.includes(`buy:${id}`) && r.deck.length <= CONFIG.minDeck) return `Il mazzo deve avere almeno ${CONFIG.minDeck} carte.`;
  r.gold += refund(r.paid[id]); delete r.paid[id]; r.bought = r.bought.filter(b => b !== id); sanitize(r); return null;
}
// ---- Combattimento a campo schierato ----
// Le carte si schierano (non si recuperano): effetti immediati (pesca, energia, cura) al piazzamento,
// danni offensivi risolti a fine turno in ordine di schieramento, difese con durata (turni o finché abbattute).
export function beginArena(r: Run): Err {
  if (r.phase !== 'store') return 'Non sei nello store.'; if (r.pending) return 'Risolvi prima la carta in sospeso.'; sanitize(r);
  if (r.deck.length < CONFIG.minDeck) return `Servono almeno ${CONFIG.minDeck} carte nel mazzo.`;
  r.hp = Math.max(1, startHp(r) + (r.boon?.hp ?? 0)); r.wounded = false;
  r.combat = { enemy: enemyFor(r.arena, r.region ?? undefined, wins(r, r.region ?? '') % CONFIG.matchesPerIsland), block: 0, draw: shuffle(r, r.deck), hand: [], discard: [], energy: 0, turn: 0, field: { off: [], def: [] }, foeField: { off: [], def: [] }, played: {}, prev: null, combo: '', phase: 'player', seq: 0, fresh: 0, ev: null, queue: [], last: null, log: ['Lo scontro ha inizio!'] };
  r.phase = 'combat'; r.msg = ''; startTurn(r); applyBoon(r); return null;
}
/** Applica (e consuma) i bonus/malus di una scelta di capitolo all'inizio del duello. */
function applyBoon(r: Run) {
  const b = r.boon, c = r.combat; delete r.boon; if (!b || !c) return;
  if (b.foeHp) { c.enemy.maxHp = Math.max(1, Math.round(c.enemy.maxHp * (1 + b.foeHp / 100))); c.enemy.hp = c.enemy.maxHp; }
  if (b.block) c.field.def.push({ uid: '', name: 'Slancio', icon: '🛡️', src: 'Scelta', dmg: 0, hits: 0, block: b.block, ttl: -1, id: ++c.seq });
  if (b.energy) c.energy += b.energy; if (b.draw) drawCards(c, r, b.draw);
}
function drawCards(c: Combat, r: Run, n: number) {
  for (; n > 0 && c.hand.length < CONFIG.maxHand; n--) { const u = c.draw.pop(); if (!u) break; c.hand.push(u); } // a mazzo finito si pesca solo spendendo energia (drawDiscard), che rimescola gli scarti
}
/** Scala la durata delle difese; quelle scadute o abbattute vanno agli scarti. ttl<0 = finché abbattuta. */
function decay(c: Combat, sh: Placed[]) { sh.forEach(s => { if (s.ttl > 0) s.ttl--; }); return sh.filter(s => { const keep = s.ttl !== 0 && s.block > 0; if (!keep && s.uid) c.discard.push(s.uid); return keep; }); }
/** Le difese schierate assorbono il danno in ordine; restituisce il danno residuo. */
function absorb(c: Combat, sh: Placed[], d: number) {
  for (const s of sh) { if (d <= 0) break; const a = Math.min(s.block, d); s.block -= a; d -= a; }
  sh.splice(0, sh.length, ...sh.filter(s => { if (s.block > 0) return true; if (s.uid) c.discard.push(s.uid); return false; })); return d;
}
function startTurn(r: Run) { const c = r.combat!; c.turn++; c.field.def = decay(c, c.field.def); c.block = 0; c.combo = ''; c.played = {}; c.prev = null; c.mods = { off: 0, bypass: false, freeNext: false, dupNext: false, combos: 0 }; c.cardCost = {}; delete c.lastUid; c.pick = null; c.lastBy = { off: null, def: null }; c.runs = { off: 0, def: 0 }; c.chains = { off: 0, def: 0 }; c.ev = null; c.energy = maxEnergy(r); c.phase = 'player'; c.foeDealt = 0; drawCards(c, r, c.turn === 1 ? CONFIG.startHand : Math.max(CONFIG.drawPerTurn, CONFIG.handTarget - c.hand.length)); }
/** Scudi attivi del giocatore: guardia delle carte offensive del turno + difese schierate. */
export const shieldsOf = (c: Combat) => c.block + c.field.def.reduce((s, p) => s + p.block, 0);
/** Le carte "Scudo d'assalto" già schierate seguono gli scudi attivi (se ne giochi altri dopo, il loro danno cresce). */
function syncShieldAtk(c: Combat) { const n = shieldsOf(c); c.field.off.forEach(p => { if (p.sh !== undefined) { p.dmg = Math.max(0, p.dmg + n - p.sh); p.sh = n; } }); }
const modsOf = (c: Combat) => c.mods ?? (c.mods = { off: 0, bypass: false, freeNext: false, dupNext: false, combos: 0 });
/** Costo effettivo di una carta in mano: "prossima carta gratis" (Riscaldamento) e sconti del turno (Stratega). */
export const effCost = (c: Combat, uid: string) => c.mods?.freeNext ? 0 : (c.cardCost?.[uid] ?? MOVES[moveOf(uid)].cost);
export function playCard(r: Run, uid: string): Err {
  const c = r.combat; if (r.phase !== 'combat' || !c) return 'Nessun combattimento.'; if (c.phase !== 'player') return 'Non è il tuo turno.';
  if (!c.hand.includes(uid)) return 'Carta non in mano.'; if (c.pick?.length) return 'Scegli prima una carta (Stratega).';
  const m = MOVES[moveOf(uid)], f = m.effect, S = f.syn, mods = modsOf(c), cost = effCost(c, uid), keep = uid.startsWith('clone:') ? '' : uid;
  const off = !!f.dmg || S?.k === 'momentum' || S?.k === 'shieldAtk', instant = !!S && S.k !== 'momentum' && S.k !== 'flow' && S.k !== 'shieldAtk', row = off ? c.field.off : c.field.def;
  if (f.flee) { // carta di fuga: requisiti di partita, poi si lascia il duello senza conseguenze
    const q = f.req ?? {}; if (q.hpBelow !== undefined && r.hp / maxHp(r) >= q.hpBelow) return `Requisito: PV sotto il ${Math.round(q.hpBelow * 100)}%.`; if (q.minTurn !== undefined && c.turn < q.minTurn) return `Requisito: dal turno ${q.minTurn}.`;
    if (c.energy < cost) return 'Energia insufficiente.'; c.hand.splice(c.hand.indexOf(uid), 1); if (keep) c.discard.push(keep); resolveOutcome(r, 'flee'); return null;
  }
  if (c.energy < cost) return 'Energia insufficiente.';
  if (instant) { // carte sinergia: effetto immediato basato sulle altre carte del turno, non occupano il campo
    if (S!.k === 'clone' && !c.lastUid) return 'Nessuna carta giocata da copiare.'; if (S!.k === 'scout' && !c.draw.length) return 'Il mazzo è finito: nessuna carta da guardare.';
    c.energy -= cost; mods.freeNext = false; c.hand.splice(c.hand.indexOf(uid), 1); if (keep) c.discard.push(keep); c.played[m.id] = (c.played[m.id] ?? 0) + 1; let msg = '';
    switch (S!.k) {
      case 'adrenaline': mods.off += S!.n ?? 0; c.field.off.forEach(p => { p.dmg += S!.n ?? 0; }); msg = `+${S!.n} danni a tutte le carte offensive del turno`; break;
      case 'bypass': mods.bypass = true; msg = 'Gli scudi nemici vengono ignorati in questo turno'; break;
      case 'freeNext': mods.freeNext = true; msg = 'La prossima carta costa 0'; break;
      case 'dup': mods.dupNext = true; msg = 'La prossima carta sarà schierata due volte'; break;
      case 'clone': c.hand.push(`clone:${moveOf(c.lastUid!)}:${++c.seq}`); msg = 'Copia dell\'ultima carta aggiunta alla mano'; break;
      case 'scout': c.pick = c.draw.slice(-3).reverse(); msg = 'Scegli una carta tra le prime 3 del mazzo'; break;
    }
    c.lastUid = uid; c.syn = { n: ++c.seq, text: msg }; c.log.push(`${m.name}: ${msg}.`); return null;
  }
  if (row.length >= CONFIG.rowSize) return `Riga ${off ? 'offensiva' : 'difensiva'} piena.`;
  c.energy -= cost; mods.freeNext = false; c.hand.splice(c.hand.indexOf(uid), 1);
  // Combo: valida solo tra carte consecutive DELLO STESSO GENERE (offensive o difensive): una carta dell'altro genere non la interrompe.
  // Comboo = catena di almeno 3 mosse (stessa carta o concatenazione). Le concatenazioni guardano l'ultima carta del genere della carta indicata.
  const g: 'off' | 'def' = off ? 'off' : 'def', L = c.lastBy ?? (c.lastBy = { off: null, def: null }), R = c.runs ?? (c.runs = { off: 0, def: 0 }), C = c.chains ?? (c.chains = { off: 0, def: 0 });
  const same = L[g] === m.id, n = same ? R[g] + 1 : 1, pct = CONFIG.combo.same[Math.min(n, CONFIG.combo.max) - 1] ?? 0, fg: 'off' | 'def' = f.link ? (MOVES[f.link.from]?.effect.dmg ? 'off' : 'def') : g;
  const lk = f.link && L[fg] === f.link.from ? f.link : null, mul = (x: number) => Math.round(x * (1 + pct)), chain = same ? C[g] + 1 : lk ? C[fg] + 1 : 1;
  c.played[m.id] = (c.played[m.id] ?? 0) + 1; R[g] = n; C[g] = chain; L[g] = m.id; c.prev = m.id; c.tier = chain >= 3 ? 2 : chain === 2 ? 1 : 0;
  const total = Object.values(c.played).reduce((a, b) => a + b, 0), dmgBase = S?.k === 'momentum' ? (S.n ?? 1) * total : S?.k === 'shieldAtk' ? shieldsOf(c) : f.dmg ?? 0;
  const p: Placed = { uid: keep, name: m.name, icon: '', src: m.source, dmg: off ? mul(dmgBase + dmgBonus(r) + (lk?.dmg ?? 0) + mods.off) : 0, hits: f.hits ?? 1, block: 0, ttl: 1, id: ++c.seq, mv: m.id, ...(S?.k === 'shieldAtk' ? { sh: shieldsOf(c) } : {}) };
  const blk = mul((f.block ?? 0) + (lk?.block ?? 0) + (S?.k === 'flow' ? (S.n ?? 0) * mods.combos : 0));
  if (chain >= 2) mods.combos++;
  if (off) c.block += blk; else { p.block = blk; p.ttl = f.dur === 0 ? -1 : f.dur ?? 1; } // guardia di una carta offensiva: temporanea
  row.push(p); c.fresh = p.id!; c.log.push(`${m.name} schierata.`);
  const dr = (f.draw ?? 0) + (lk?.draw ?? 0), en = (f.energy ?? 0) + (lk?.energy ?? 0), heal = f.heal ? mul(f.heal) : 0, fx = () => { if (heal) r.hp = Math.min(maxHp(r), r.hp + heal); if (dr) drawCards(c, r, dr); if (en) c.energy += en; };
  fx();
  if (mods.dupNext) { mods.dupNext = false; if (row.length < CONFIG.rowSize) row.push({ ...p, id: ++c.seq, uid: '' }); if (off) c.block += blk; fx(); } // Duplicazione: schierata due volte
  c.lastUid = uid; syncShieldAtk(c);
  const tag = [pct ? `${m.name} ×${n} (+${Math.round(pct * 100)}%)` : '', lk ? `${MOVES[lk.from].name} → ${m.name}` : ''].filter(Boolean).join(' · '); c.combo = tag;
  p.fx = [dr && `✦${dr}`, en && `⚡+${en}`, heal && `✚${heal}`, off && blk && `🛡️${blk}`].filter(Boolean).join(' '); p.tag = [pct ? `🔥+${Math.round(pct * 100)}%` : '', lk ? '🔗' : ''].filter(Boolean).join(' ');
  return null;
}
/** Mazzo esaurito: per CONFIG.discardDrawCost energia gli scarti vengono rimescolati nel mazzo e si pesca 1 carta. */
export function drawDiscard(r: Run): Err {
  const c = r.combat; if (r.phase !== 'combat' || !c) return 'Nessun combattimento.'; if (c.phase !== 'player') return 'Non è il tuo turno.'; if (c.pick?.length) return 'Scegli prima una carta (Stratega).';
  if (c.draw.length) return 'Hai ancora carte da pescare nel mazzo.'; if (!c.discard.length) return 'Nessuna carta negli scarti.'; if (c.hand.length >= CONFIG.maxHand) return `Mano piena (${CONFIG.maxHand}).`; if (c.energy < CONFIG.discardDrawCost) return 'Energia insufficiente.';
  c.energy -= CONFIG.discardDrawCost; c.draw = shuffle(r, c.discard); c.discard = []; drawCards(c, r, CONFIG.discardDrawCards); c.log.push('Mazzo rimescolato: peschi 1 carta.'); return null;
}
/** Stratega: sceglie una delle 3 carte mostrate; entra in mano e, se giocata nel turno, costa 1. */
export function choosePick(r: Run, uid: string): Err {
  const c = r.combat; if (r.phase !== 'combat' || !c || !c.pick?.length) return 'Nessuna scelta in corso.'; if (!c.pick.includes(uid)) return 'Carta non valida.';
  const i = c.draw.lastIndexOf(uid); if (i >= 0) c.draw.splice(i, 1); c.hand.push(uid); (c.cardCost ?? (c.cardCost = {}))[uid] = 1; c.pick = null; return null;
}
/** Fine turno: risolve gli attacchi schierati (in ordine), poi il nemico prepara le sue carte (giocate una a una da enemyStep). */
export function endTurn(r: Run): Err {
  const c = r.combat; if (r.phase !== 'combat' || !c) return 'Nessun combattimento.'; if (c.phase !== 'player') return 'Non è il tuo turno.';
  if (c.pick?.length) return 'Scegli prima una carta (Stratega).';
  syncShieldAtk(c); c.phase = 'resolve'; c.ev = null; c.log.push('Fine turno: attacchi!'); return null;
}
function prepareEnemy(r: Run, c: Combat) {
  c.foeField.def = decay(c, c.foeField.def);
  const pool = (REGIONS[r.region ?? '']?.enemyMoves ?? []).map(id => ENEMY_MOVES.find(m => m.id === id)).filter(Boolean) as typeof ENEMY_MOVES; if (!pool.length) pool.push(...ENEMY_MOVES);
  const E = CONFIG.enemy, n = Math.min(E.playsMax, E.playsBase + Math.floor((r.arena - 1) / E.playsEvery)), base = c.enemy.atk * E.cardMult;
  const avg = pool.reduce((s, m) => s + (m.dmg ?? 0) * (m.hits ?? 1), 0) / pool.length, norm = E.normalize && avg > 0 ? E.normalize / avg : 1; // normalizza: ogni isola infligge in media gli stessi danni per carta, a prescindere dal suo mazzo di mosse
  const k = (x?: number) => x ? Math.max(1, Math.round(base * x)) : 0, kd = (x?: number) => x ? Math.max(1, Math.round(base * norm * x)) : 0, gb = (c.enemy.gear ?? []).reduce((s, g) => s + (EQUIPMENT[g].bonus.dmg ?? 0), 0);
  c.queue = Array.from({ length: n }, () => { const m = pool[Math.floor(rand(r) * pool.length)]; return { id: m.id, name: m.name, icon: m.icon, dmg: m.dmg ? kd(m.dmg) + gb : 0, hits: m.hits ?? 1, block: k(m.block), heal: k(m.heal), dur: m.dur ?? 1 }; });
  c.phase = 'enemy'; c.ev = null; c.last = null; c.log.push('Turno avversario!');
}
/** Un passo del turno nemico: prima schiera UNA carta per volta, poi risolve un attacco per volta; infine inizia il tuo turno. */
export function enemyStep(r: Run): Err {
  const c = r.combat; if (r.phase !== 'combat' || !c || c.phase === 'player') return 'Non è il turno nemico.';
  if (c.phase === 'resolve') { // risoluzione attacchi del giocatore, uno alla volta in ordine di schieramento
    const p = c.field.off.shift(); if (!p) { prepareEnemy(r, c); return null; }
    let abs = 0, dmg = 0; for (let i = 0; i < p.hits; i++) { const left = c.mods?.bypass ? p.dmg : absorb(c, c.foeField.def, p.dmg); abs += p.dmg - left; dmg += left; c.enemy.hp = Math.max(0, c.enemy.hp - left); }
    if (p.uid) c.discard.push(p.uid); c.ev = { by: 'me', card: p, absorbed: abs, dmg }; c.log.push(`${p.name}: ${dmg} danni${abs ? ` (${abs} assorbiti)` : ''}.`);
    if (c.enemy.hp <= 0) { r.finalEv = c.ev; resolveOutcome(r, 'win'); } return null;
  }
  const x = c.queue.shift();
  if (x) {
    c.last = x; c.enemy.hp = Math.min(c.enemy.maxHp, c.enemy.hp + x.heal);
    const p: Placed = { id: ++c.seq, fx: x.heal ? `✚${x.heal}` : '', uid: '', name: x.name, icon: x.icon, src: 'enemy:' + (x.id ?? ''), dmg: x.dmg, hits: x.hits, block: x.block, ttl: x.dur === 0 ? -1 : x.dur };
    if (x.dmg) c.foeField.off.push({ ...p, block: 0, ttl: 1 }); else if (x.block) c.foeField.def.push({ ...p, dmg: 0, hits: 1 });
    c.fresh = p.id!; c.ev = null; c.log.push(`${x.name} schierata dal nemico.`); return null;
  }
  const a = c.foeField.off.shift();
  if (a) {
    let abs = 0, dmg = 0; for (let i = 0; i < a.hits; i++) { const t = Math.min(c.block, a.dmg); c.block -= t; let left = absorb(c, c.field.def, a.dmg - t); if (CONFIG.enemy.burstCap) left = Math.max(0, Math.min(left, Math.round(CONFIG.enemy.burstCap * maxHp(r)) - (c.foeDealt ?? 0))); c.foeDealt = (c.foeDealt ?? 0) + left; abs += a.dmg - left; dmg += left; r.hp = Math.max(0, r.hp - left); }
    c.last = null; c.ev = { by: 'foe', card: a, absorbed: abs, dmg }; c.log.push(`${a.name}: ${dmg} danni${abs ? ` (${abs} assorbiti)` : ''}.`); if (r.hp <= 0) { r.finalEv = c.ev; resolveOutcome(r, 'lose'); } return null;
  }
  startTurn(r); return null;
}
/** Chiedere pietà: con probabilità (base + bonus a PV bassi - malus boss) il nemico ti risparmia; altrimenti il tuo turno finisce e il duello continua. */
export function askMercy(r: Run): { err: Err; spared: boolean } {
  const c = r.combat; if (r.phase !== 'combat' || !c) return { err: 'Nessun combattimento.', spared: false }; if (c.phase !== 'player') return { err: 'Non è il tuo turno.', spared: false };
  if (c.mercy) return { err: 'Hai già chiesto pietà in questo duello.', spared: false }; c.mercy = true;
  const M = CONFIG.mercy, boss = !!r.region && wins(r, r.region) % CONFIG.matchesPerIsland === CONFIG.matchesPerIsland - 1, p = Math.min(0.9, Math.max(0.1, M.base + M.lowHpBonus * (1 - r.hp / maxHp(r)) - (boss ? M.bossPenalty : 0)));
  if (rand(r) < p) { resolveOutcome(r, 'spared'); return { err: null, spared: true }; }
  c.log.push('Nessuna pietà!'); endTurn(r); return { err: null, spared: false };
}
/** Chiudere un duello (vittoria o pietà) sotto la soglia di salute lascia una cicatrice permanente (anche se poi ci si cura), fino a CONFIG.maxScars. */
function scar(r: Run) { if (r.wounded && (r.scars ?? 0) < CONFIG.maxScars) { r.scars = (r.scars ?? 0) + 1; r.msg += ' Ti resterà una cicatrice.'; } }
/** Punto unico di gestione degli esiti: qui si aggiungeranno risparmio/fuga/sopravvivenza. */
export function resolveOutcome(r: Run, res: 'win' | 'lose' | 'flee' | 'spared') {
  if (res === 'win') {
    const g = CONFIG.reward(r.arena); r.gold += g; r.msg = `Vittoria! +${g} oro.`; r.outcome = 'win';
    if (r.region) { r.progress = { ...r.progress, [r.region]: wins(r, r.region) + 1 }; const nx = REGION_LIST[islandIndex(r.region) + 1]; if (wins(r, r.region) === CONFIG.matchesPerIsland && nx) r.msg += ` Isola completata: si sblocca ${nx.name}!`; }
    r.wounded = r.hp / maxHp(r) < CONFIG.woundedBelow; r.arena++; r.slots = slotsFor(r.arena); scar(r); r.phase = 'store'; genOffers(r); r.needsMap = !r.region || wins(r, r.region) >= CONFIG.matchesPerIsland;
  } else if (res === 'flee' || res === 'spared') { // fuga (nessuna conseguenza) o pietà accettata (soldi dimezzati): si torna alla storia e il duello si ripete
    r.outcome = res; if (res === 'spared') r.gold = Math.floor(r.gold / 2); r.wounded = r.hp / maxHp(r) < CONFIG.woundedBelow; r.phase = 'store'; r.needsMap = false;
    r.msg = res === 'flee' ? 'Sei fuggito dal duello: nessuna conseguenza.' : 'Vieni risparmiato… ma ti portano via metà dei soldi.'; if (res === 'spared') scar(r);
  } else if (defeatOutcome(r) === 'end-run') { r.phase = 'over'; r.msg = 'Sei stato sconfitto.'; }
  r.combat = null;
}
