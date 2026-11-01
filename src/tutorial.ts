// Tutorial guidato: overlay con spotlight, passi con condizioni di avanzamento e blocco di ogni azione non prevista.
import { maxEnergy, maxHp, type EnemyCard, type Run } from './engine';
export interface TCtx { choicePop(): boolean; run(): Run | null; tab(): string; mapSel(): string | null; busy(): boolean; render(): void; exit(): void }
/** sel: elemento evidenziato; to: zone dove va trascinato (restano ben visibili, non oscurate); nodim: nessun oscuramento (per osservare). */
interface Step { t: string; x: string; sel?: string; to?: string; nodim?: boolean; allow?: string; until?: () => boolean; pre?: () => void }
let ctx: TCtx | null = null, i = 0, entered = -1, root: HTMLElement | null = null, patched: unknown = null, eTurn = 0, dragTimer = 0;
const R = () => ctx!.run()!, C = () => R().combat, offN = () => C()?.field.off.length ?? 0, drag = (u: string) => `[data-drag="${u}"]`;
export const tutActive = () => !!ctx;
const STEPS: Step[] = [
  { t: '👋 Benvenuto in Comboo', x: `Un RPG di carte a turni: combatti, potenzia il tuo personaggio e scala le isole fino al livello divino. Ti guido passo passo: <b>tocca solo ciò che viene evidenziato</b>, il resto è bloccato per non farti perdere.` },
  { t: '🗺 La mappa', sel: '.mapbox', x: `Sei su un oceano con <b>6 isole</b>. Su ognuna affronti <b>5 duelli</b> (l'ultimo è un boss): vincili tutti per sbloccare l'isola successiva. Quelle con il lucchetto sono ancora chiuse.` },
  { t: `📍 Scegli un'isola`, sel: 'g.isl[data-id="boxing"]', allow: 'g.isl[data-id="boxing"]', until: () => ctx!.mapSel() === 'boxing', x: `Tocca la <b>Fighting Arena</b>. Passando il cursore sulle isole il contorno lampeggia.` },
  { t: '⛵ Salpa', sel: '[data-a="sail"]', allow: '[data-a="sail"]', until: () => !R().needsMap, x: `Premi il pulsante per partire. Con un'altra isola il protagonista ci andrebbe in barca; qui sei già arrivato.` },
  { t: '📖 La storia', sel: '.sbook', x: `Prima di ogni duello leggi un breve capitolo che ti presenta l'avversario e ti collega alla vicenda.` },
  { t: '🧍 Il tuo personaggio', sel: '.hfig', x: `A sinistra vedi <b>il tuo combattente</b>: ogni equipaggiamento che installi compare sul suo corpo, così lo vedi evolversi isola dopo isola.` },
  { t: '✦ Le scelte della storia', sel: '.chbox', x: `Ogni capitolo ti mette davanti a <b>una scelta con 3 opzioni</b>, legata alla storia dell'isola. <b>Non ci sono scelte giuste o sbagliate</b>: ognuna dà ricompense diverse (monete subito; scudo, energia, carte o un nemico più debole per il prossimo duello) e magari un piccolo prezzo. Finché non scegli non puoi proseguire. Si può disattivare dalle impostazioni ⚙.` },
  { t: '👉 Fai la tua scelta', sel: '.chlist', allow: '.chopt', until: () => Object.keys(R().chapters ?? {}).length > 0, x: `Leggi le opzioni (gli effetti sono scritti a destra) e <b>tocca quella che preferisci</b>. Nel tutorial gli effetti sul duello non si applicano, per non cambiare la lezione.` },
  { t: '🎁 Esito e ricompense', sel: '.chpop', allow: '[data-a="closeChoice"]', until: () => !ctx!.choicePop(), x: `Ecco cosa è successo e cosa hai ottenuto: le monete arrivano subito, gli altri bonus valgono per il prossimo duello. Chiudi il riquadro con <b>Continua</b>.` },
  { t: '⚔ Il tuo avversario', sel: '.sbox.foe', x: `Qui vedi il nemico: <b>livello</b>, <b>punti vita</b> e le <b>mosse</b> che può usare. Studiale prima di combattere!` },
  { t: '➡ Avanti', sel: '.actbar .go', allow: '[data-a="next"]', until: () => ctx!.tab() === 'st', x: `Il pulsante in basso ti guida: <b>Storia → Store → Mazzo</b>, e dal Mazzo si inizia il duello. Puoi anche usare le tab in alto. Premilo ora.` },
  { t: '🛒 Lo store', sel: '.og6', x: `A sinistra i <b>potenziamenti</b> (equipaggiamento), a destra le <b>mosse</b>. Le prime due carte sono visibili; la terza è <b>misteriosa</b>: costa meno ma non sai cosa ottieni (lo scopri con una slot machine).` },
  { t: '🔧 Slot e vendita', sel: '.eqline', x: `Ogni equipaggiamento occupa <b>1 slot</b> (all'inizio 4, fino a 15), dà bonus e sblocca <b>3 mosse</b>. Sotto la barra c'è la <b>zona vendita</b>: trascinaci un equipaggiamento per rivenderlo al 50%.` },
  { t: '🛍 Compra un potenziamento', sel: '.offers .card[data-drag="offer:eq:0"]', allow: '.offers .card[data-drag="offer:eq:0"]', to: '[data-zone="eqbar"]', until: () => R().equipped.includes('wraps'), x: `<b>Trascina</b> le Fasce da combattimento sulla barra degli equipaggiamenti (si illumina d'oro). Si compra solo trascinando.` },
  { t: '✨ Compra una mossa', sel: '.offers .card[data-drag="offer:mv:0"]', allow: '.offers .card[data-drag="offer:mv:0"]', pre: () => { R().offers.mv = ['wraps_a1', 'wraps_a0', null]; }, to: '[data-zone="deck"]', until: () => R().bought.includes('wraps_a1'), x: `Ora che hai le Fasce compaiono le loro mosse avanzate. Trascina <b>Adrenalina</b> (una carta <b>sinergia</b>, in viola) sul dorso del mazzo.` },
  { t: `⚡ L'energia`, sel: '.energyrow', x: `Ogni carta costa <b>energia</b> (il numero nel cerchio giallo). Ne hai 3 per turno, fino a un massimo di 10.` },
  { t: '⚡ Più energia', sel: '.ebtn', allow: '[data-a="buyEn"]', until: () => maxEnergy(R()) >= 4, x: `Compra <b>+1 energia</b>: ti servirà tra poco.` },
  { t: '➡ Al mazzo', sel: '.actbar .go', allow: '[data-a="next"]', until: () => ctx!.tab() === 'me', x: `Premi Avanti per passare al <b>Mazzo</b>.` },
  { t: '🎴 Il mazzo', sel: '.zone[data-zone="in"]', x: `Il <b>mazzo attivo</b>: da <b>10 a 30 carte</b>. Le carte fuori dal mazzo restano nella collezione; trascinale tra le due aree per sceglierle.` },
  { t: '💰 Vendere carte', sel: '.sellz', x: `Per <b>vendere</b> una carta (anche base) trascinala qui: ricevi il 50% del valore. Nel mazzo devono restarne almeno 10.` },
  { t: '🩹 Vita e mappa', sel: '.actbar', x: `Se finisci un duello con meno del <b>30% di vita</b>, il successivo parte all'80% (nello store puoi curarti per 15 monete) e il tuo personaggio si porta addosso una <b>cicatrice</b> permanente. <b>🗺 Mappa</b> ti permette di cambiare isola.` },
  { t: '⚔ Si combatte!', sel: '.actbar .go', allow: '[data-a="go"]', until: () => R().phase === 'combat', x: `Premi <b>Affronta arena</b>: è l'unico punto da cui parte un duello.` },
  { t: '🧍 Tu', sel: '.side.me', x: `Il tuo personaggio: la barra verticale è la <b>vita</b>, sotto vedi <b>scudi</b> e nome. In alto a sinistra la colonna con il tuo <b>equipaggiamento</b>.` },
  { t: '👹 Il nemico', sel: '.side.foe', x: `A destra il nemico, con la sua vita e il suo equipaggiamento. Vince chi porta a zero la vita dell'altro.` },
  { t: '🖐 La mano', sel: '.handrow .hand', x: `Parti con <b>5 carte</b>. A inizio turno peschi <b>2</b> carte, o quante ne servono per tornare a <b>5</b> in mano. In mano al massimo <b>10 carte</b>.` },
  { t: '🂠 Il mazzo finisce', sel: '.pile.draw', x: `Le carte <b>non sono infinite</b>: il numero grande è quante ne restano nel mazzo (toccalo per vederle). Quando finisce puoi spendere <b>2 energia</b> per <b>rimescolare gli scarti (🗑, in basso a sinistra) nel mazzo</b> e pescare 1 carta.` },
  { t: '⚡ Energia del turno', sel: '.pips', x: `Qui vedi l'energia che ti resta. Si ricarica a ogni turno. Ogni carta ne consuma tanta quanto indicato dal suo costo.` },
  { t: '🧭 Il campo', sel: '.board', x: `Quattro righe: in alto <b>difesa</b> e <b>attacco</b> del nemico, poi <b>il tuo attacco</b> (al centro) e <b>la tua difesa</b> (vicino a te). I danni partono <b>a fine turno</b>, in ordine di schieramento.` },
  { t: '👊 Prima carta', sel: drag('base:jab:0'), allow: drag('base:jab:0'), to: '[data-zone="field"]', until: () => offN() >= 1, x: `<b>Trascina</b> il Jab sul campo. Le carte offensive vanno nella riga di attacco e, una volta schierate, <b>non si riprendono</b>.` },
  { t: '🔥 Combo!', sel: drag('base:jab:1'), allow: drag('base:jab:1'), to: '[data-zone="field"]', until: () => offN() >= 2, x: `Un altro Jab: <b>due carte uguali consecutive</b> formano una combo, con +20% di effetto.` },
  { t: '♾ COMBOO!', sel: drag('base:jab:2'), allow: drag('base:jab:2'), to: '[data-zone="field"]', until: () => offN() >= 3, x: `Un terzo Jab: una catena di <b>3 o più mosse collegate</b> è un <b>COMBOO</b> (+30%). Anche carte diverse con una <b>concatenazione</b> (🔗) contano.` },
  { t: '🛡 Difesa', sel: drag('base:guard:5'), allow: drag('base:guard:5'), to: '[data-zone="field"]', until: () => (C()?.field.def.length ?? 0) >= 1, x: `Le carte difensive vanno nella riga vicino a te: danno <b>scudi</b> che durano un certo numero di turni. E <b>non interrompono</b> la combo offensiva: ti serve un'altra carta offensiva per romperla.` },
  { t: '⏭ Fine turno', sel: '[data-a="end"]', allow: '[data-a="end"]', until: () => C()?.phase !== 'player', x: `Premi <b>Fine turno</b>: i tuoi attacchi partono uno alla volta. (Con il timer attivo, a tempo scaduto il turno finisce da solo.)` },
  { t: '👹 Turno nemico', nodim: true, until: () => C()?.phase === 'player' && C()?.turn === 2, x: `Il nemico schiera le sue carte e attacca: <b>i tuoi scudi assorbono i colpi</b>. Osserva…` },
  { t: '🔄 Nuovo turno', sel: '.handrow .hand', x: `Hai pescato 2 carte e l'energia è tornata. Ora il nemico è ferito: finiamolo!` },
  { t: '👊 Jab', sel: drag('base:jab:3'), allow: drag('base:jab:3'), to: '[data-zone="field"]', until: () => offN() >= 1, x: `Gioca un Jab.` },
  { t: '👊 Jab, di nuovo', sel: drag('base:jab:4'), allow: drag('base:jab:4'), to: '[data-zone="field"]', until: () => offN() >= 2, x: `Ancora un Jab: combo!` },
  { t: '✨ Carta sinergia', sel: drag('buy:wraps_a1'), allow: drag('buy:wraps_a1'), to: '[data-zone="field"]', until: () => (C()?.mods?.off ?? 0) >= 2, x: `Le carte <b>sinergia</b> (viola) agiscono in base alle altre carte del turno. <b>Adrenalina</b> dà +2 danni a tutte le carte offensive, anche a quelle già schierate. Ce ne sono altre: scudi bypassati, copie di carte, duplicazioni…` },
  { t: '🙏 Pietà e fuga', sel: '[data-a="mercy"]', x: `Se va male puoi <b>chiedere pietà</b> (una volta per duello): una slot machine decide se vieni risparmiato; in tal caso perdi metà delle monete e rifai il duello. Esistono anche <b>carte di fuga</b> con requisiti (es. pochi PV) per scappare senza conseguenze.` },
  { t: '⏭ Il colpo decisivo', sel: '[data-a="end"]', allow: '[data-a="end"]', until: () => !C(), x: `Chiudi il turno: gli attacchi calano sul nemico.` },
  { t: '🏆 Vittoria!', sel: '.sbook', x: `Hai vinto! Ricevi monete e un punto di avanzamento sull'isola (qui 1/5). All'ultimo duello affronterai il <b>boss</b> e, vinto quello, si sblocca l'isola dopo.` },
  { t: '📊 Riepilogo', sel: '.top', x: `In alto: isola e vittorie, monete, vita di partenza, carte nel mazzo, energia e slot. Il simbolo ⚙ apre le impostazioni (volumi, timer, animazioni).` },
  { t: '🎓 Tutorial completato', x: `Ricorda: <b>combo</b> di carte uguali o concatenate, <b>sinergie</b>, equilibrio tra attacco e difesa e <b>mazzo finito</b>. Ora tocca a te: buona fortuna, e ricorda che l'obiettivo è arrivare più lontano possibile!` },
];
/** Prepara il primo combattimento in modo deterministico (mano, mazzo e nemico fissati). */
export function tutPatchCombat() {
  const r = R(), c = r.combat; if (!c || patched === c) return; patched = c;
  c.hand = ['base:jab:0', 'base:jab:1', 'base:jab:2', 'base:guard:5', 'buy:wraps_a1']; c.draw = ['eq:wraps:0', 'eq:wraps:1', 'base:focus:9', 'base:guard:7', 'base:jab:4', 'base:jab:3']; c.discard = [];
  c.enemy.hp = c.enemy.maxHp = 22; c.energy = maxEnergy(r); c.field.def = []; r.hp = maxHp(r); // i bonus delle scelte non alterano la lezione
}
/** Turno nemico guidato: due attacchi (nessuna difesa o cura casuale). */
export function tutPatchEnemy() {
  const c = C(); if (!c || c.phase !== 'enemy' || eTurn === c.turn) return; eTurn = c.turn;
  const card = (name: string, dmg: number, icon: string): EnemyCard => ({ id: 'direct', name, icon, dmg, hits: 1, block: 0, heal: 0, dur: 1 });
  c.queue = [card('Diretto', 5, '👊'), card('Colpo pesante', 7, '💢')];
}
/** Rettangolo arrotondato come sottotracciato SVG (per i "buchi" nell'oscuramento). */
const rr = (x: number, y: number, w: number, h: number, r = 14) => `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
function place() {
  if (!root) return; const s = STEPS[i], card = root.querySelector('.tcard') as HTMLElement, dim = root.querySelector('.tdim') as HTMLElement, spots = root.querySelector('.tspots') as HTMLElement, h = card.offsetHeight, w = card.offsetWidth;
  const main = s.sel ? document.querySelector(s.sel) as HTMLElement | null : null, mq = main?.getBoundingClientRect();
  const tg = s.to ? Array.from(document.querySelectorAll<HTMLElement>(s.to)).map(e => e.getBoundingClientRect()).filter(q => q.width > 0) : [], rects = [...(mq && mq.width > 0 ? [mq] : []), ...tg];
  spots.innerHTML = rects.map((q, k) => `<div class="tspot ${mq && mq.width > 0 && k === 0 ? '' : 'tgt'}" style="left:${q.left - 5}px;top:${q.top - 5}px;width:${q.width + 10}px;height:${q.height + 10}px"></div>`).join('');
  // oscuramento con "buchi": l'elemento da usare e le zone di destinazione restano visibili (e non oscurate), il resto è scuro
  dim.style.display = s.nodim ? 'none' : 'block'; dim.style.clipPath = rects.length ? `path(evenodd,"M0 0H${innerWidth}V${innerHeight}H0Z ${rects.map(q => rr(q.left - 5, q.top - 5, q.width + 10, q.height + 10)).join(' ')}")` : 'none';
  // posizione del riquadro-guida: fra tutte le posizioni candidate sceglie quella che copre meno (l'elemento da usare pesa molto più delle zone di destinazione)
  const hasMain = !!(mq && mq.width > 0), cx = hasMain ? mq!.left + mq!.width / 2 - w / 2 : (innerWidth - w) / 2, xs = [cx, 8, innerWidth - w - 8].map(x => Math.min(innerWidth - w - 8, Math.max(8, x)));
  const ys = [...(hasMain ? [mq!.bottom + 14, mq!.top - 14 - h] : []), 12, innerHeight - h - 8]; if (s.nodim) ys.unshift(innerHeight - h - 8);
  const ov = (q: DOMRect, x: number, y: number) => Math.max(0, Math.min(x + w, q.right) - Math.max(x, q.left)) * Math.max(0, Math.min(y + h, q.bottom) - Math.max(y, q.top));
  const over = (x: number, y: number) => (hasMain ? 40 * ov(mq!, x, y) : 0) + tg.reduce((t, q) => t + ov(q, x, y), 0) + (y < 8 || y + h > innerHeight - 8 ? 1e12 : 0);
  let left = xs[0], best = ys[0], bo = Infinity; for (const y of ys) for (const x of xs) { const o = over(x, y); if (o < bo) { bo = o; best = y; left = x; } }
  card.style.left = left + 'px'; card.style.top = best + 'px';
}
function show() {
  if (!ctx) return;
  if (!root) { root = document.createElement('div'); root.id = 'tut'; document.body.appendChild(root); root.addEventListener('click', ev => { const b = (ev.target as HTMLElement).closest('[data-tut]') as HTMLElement | null; if (b?.dataset.tut === 'next') { go(i + 1); ctx?.render(); } else if (b?.dataset.tut === 'exit') stop(); }); }
  const s = STEPS[i], last = i === STEPS.length - 1;
  root.innerHTML = `<div class="tdim"></div><div class="tspots"></div><button class="tx" data-tut="exit">✕ Esci dal tutorial</button><div class="tcard"><div class="tbar"><i style="width:${(i + 1) / STEPS.length * 100}%"></i></div><h3>${s.t}</h3><p>${s.x}</p><div class="trow">${s.until ? `<span class="thint">${s.allow ? '👉 Fai l\'azione evidenziata' : '⏳ Osserva…'}</span>` : `<span class="thint">${i + 1}/${STEPS.length}</span><button class="pri" data-tut="next">${last ? 'Fine ✓' : 'Avanti ➜'}</button>`}</div></div>`;
  requestAnimationFrame(place); setTimeout(place, 700); // la seconda misura attende le animazioni dei riquadri
}
function go(n: number) { i = n; if (i >= STEPS.length) { stop(); return; } if (STEPS[i].pre) { STEPS[i].pre!(); setTimeout(() => ctx?.render(), 0); } }
export function tutSync() {
  if (!ctx) return; if (ctx.busy()) { root?.classList.add('hide'); return; } root?.classList.remove('hide');
  for (let n = 0; n < 6 && ctx && STEPS[i]?.until?.(); n++) go(i + 1);
  if (ctx) { if (entered !== i) { entered = i; show(); } else requestAnimationFrame(place); }
}
export function tutStart(c: TCtx) { clearInterval(dragTimer); dragTimer = window.setInterval(() => root?.classList.toggle('dragging', !!document.querySelector('.card.drag')), 80); ctx = c; i = 0; entered = -1; patched = null; eTurn = 0; go(0); }
function stop() { clearInterval(dragTimer); const c = ctx; ctx = null; root?.remove(); root = null; entered = -1; c?.exit(); }
/** Blocca ogni interazione che non sia quella prevista dal passo corrente (fase di cattura: prima dei gestori del gioco). */
const guard = (ev: Event) => { if (!ctx) return; const t = ev.target as Element | null; if (!t?.closest || t.closest('#tut')) return; const a = STEPS[i]?.allow; if (a && t.closest(a)) return; ev.stopPropagation(); ev.preventDefault(); };
['pointerdown', 'pointerup', 'click', 'dblclick', 'keydown', 'contextmenu'].forEach(e => window.addEventListener(e, guard, true));
addEventListener('resize', () => requestAnimationFrame(place));
