import { CONFIG } from './config';
// Dati di gioco (carte, equipaggiamenti). Aggiungere contenuti = aggiungere righe qui.
export interface Link { from: string; dmg?: number; block?: number; draw?: number; energy?: number }
export interface Effect { dmg?: number; block?: number; heal?: number; draw?: number; hits?: number; link?: Link; dur?: number; flee?: boolean; syn?: { k: string; n?: number }; req?: { hpBelow?: number; minTurn?: number }; energy?: number }
export interface Move { id: string; name: string; desc: string; cost: number; source: string; price: number; effect: Effect }
export interface Equipment {
  kind: string;  // natura dell'oggetto (gear, implant, body, style, arcane): determina il racconto di come lo si ottiene
  island: string;  // isola da cui il potenziamento compare nello store
  id: string; name: string; desc: string; price: number;
  moves: [string, string, string];   // 3 mosse sbloccate
  advanced: string[];                // mosse acquistabili nello store se installato
  bonus: { dmg?: number; maxHp?: number };
}
const linkText = (l: Link) => [l.dmg && `+${l.dmg} danni`, l.block && `+${l.block} guardia`, l.draw && `pesca +${l.draw}`, l.energy && `+${l.energy} energia`].filter(Boolean).join(', ');
const power = (e: Effect) => (e.dmg ?? 0) * (e.hits ?? 1) + (e.link?.dmg ?? 0) * 0.5 + (e.link?.block ?? 0) * 0.5 + (e.link?.draw ?? 0) * 1.5 + (e.link?.energy ?? 0) * 2 + (e.block ?? 0) * (e.dur === 0 ? 2.5 : 1 + ((e.dur ?? 1) - 1) * 0.4) + (e.heal ?? 0) * 1.3 + (e.draw ?? 0) * 3 + (e.energy ?? 0) * 4;
/** Costo di energia derivato dalla forza della carta (formula in CONFIG.cost). */
export const costOf = (e: Effect, tier = 0) => { const p = power(e); return p <= 0 ? 0 : Math.min(CONFIG.cost.max, Math.max(1, Math.round(p / (CONFIG.cost.div * (1 + CONFIG.cost.tier * tier))))); };
/** Effetti scritti in forma compatta, una riga ciascuno (mostrati sulla carta). */
const synText = (s: { k: string; n?: number }) => (({ adrenaline: `⚡ +${s.n} danni alle carte offensive del turno`, bypass: '🎯 Gli scudi nemici vengono ignorati (turno)', freeNext: '🆓 La prossima carta costa 0', flow: `🌊 +${s.n} scudi per ogni combo giocata`, shieldAtk: '🛡️ Danni pari agli scudi attivi (si aggiorna finché non attacca)', momentum: `📈 ${s.n} danno per ogni carta giocata nel turno`, scout: '🔍 Vedi 3 carte del mazzo: ne scegli una (costa 1)', dup: '✖️ La prossima carta è schierata due volte', clone: '🧬 Copia in mano l\'ultima carta giocata' } as Record<string, string>)[s.k] ?? s.k);
export const effectLines = (e: Effect): string[] => [e.dmg && `⚔️ Danni ${e.dmg}${e.hits ? '×' + e.hits : ''}`, e.link && `🔗 Dopo ${MOVES[e.link.from]?.name ?? e.link.from}: ${linkText(e.link)}`, e.block && `🛡️ Guardia ${e.block}`, e.block && !e.dmg && `⏳ ${e.dur === 0 ? 'Finché abbattuta' : ((e.dur ?? 1) > 1 ? `${e.dur} turni` : '1 turno')}`, e.heal && `✚ Cura ${e.heal}`, e.draw && `✦ Pesca ${e.draw}`, e.energy && `⚡ +${e.energy} energia`, e.syn && synText(e.syn), e.flee && '🏃 Fuga: lasci il duello senza conseguenze', e.req && `⚠ Richiede: ${[e.req.hpBelow !== undefined && `PV < ${Math.round(e.req.hpBelow * 100)}%`, e.req.minTurn !== undefined && `dal turno ${e.req.minTurn}`].filter(Boolean).join(', ')}`].filter(Boolean) as string[];
export const describe = (e: Effect) => effectLines(e).join(' · ');
import { GAME as J } from './gamedata';
export const MOVES: Record<string, Move> = {};
export const EQUIPMENT: Record<string, Equipment> = {};
/** Costruzione di carte ed equipaggiamenti dal JSON. `cost` è facoltativo: se manca si calcola dalla forza della carta. */
/** `tier` = indice dell'isola dell'equipaggiamento: le carte delle isole avanzate costano meno a parità di potenza (CONFIG.cost.tier). */
const mv = (id: string, name: string, source: string, price: number, effect: Effect, cost?: number, tier = 0) => { MOVES[id] = { id, name, source, price, effect, desc: describe(effect), cost: cost ?? costOf(effect, tier) }; };
for (const m of J.baseMoves) mv(m.id, m.name, 'base', 0, m.effect as Effect);
for (const e of J.equipment) {
  e.moves.forEach(m => mv(m.id, m.name, e.id, 0, m.effect as Effect, (m as { cost?: number }).cost, J.regions.findIndex(g => g.id === e.island)));
  e.advanced.forEach(m => mv(m.id, m.name, e.id, m.price, m.effect as Effect, (m as { cost?: number }).cost, J.regions.findIndex(g => g.id === e.island)));
  EQUIPMENT[e.id] = { id: e.id, name: e.name, desc: e.desc, price: e.price, island: e.island, kind: (e as { kind?: string }).kind ?? 'gear', bonus: e.bonus as Equipment['bonus'], moves: e.moves.map(m => m.id) as [string, string, string], advanced: e.advanced.map(m => m.id) };
}
export interface Style { id: string; name: string; icon: string; desc: string; deck: string[] }
/** Stili di combattimento iniziali: ognuno ha il proprio mazzo base di 10 carte. */
export const STYLES: Style[] = J.styles;
export interface EnemyMove { id: string; name: string; icon: string; dmg?: number; hits?: number; block?: number; heal?: number; dur?: number }
/** Carte nemiche: valori = moltiplicatori della potenza del nemico (CONFIG.enemy.cardMult). */
export const ENEMY_MOVES: EnemyMove[] = J.enemyMoves;
export const moveOf = (uid: string): string => {
  const [k, a, b] = uid.split(':');
  return k === 'base' || k === 'clone' ? a : k === 'eq' ? EQUIPMENT[a].moves[+b] : a;
};

/** Scelte di capitolo (schermata Storia), legate a un'isola (`region`) e a un incontro (`at`, 0–4): 3 opzioni con effetti leggeri e bilanciati. gold è in "unità" (vedi goldUnit nel motore); gli altri effetti valgono solo per il duello successivo. */
export interface ChoiceFx { gold?: number; block?: number; energy?: number; draw?: number; foeHp?: number; hp?: number }
export interface ChoiceOpt { id: string; label: string; text: string; fx: ChoiceFx }
export interface ChoiceEv { id: string; region: string; at: number; title: string; text: string; options: ChoiceOpt[] }
export const CHOICES: ChoiceEv[] = J.choices as ChoiceEv[];
