# Dati di gioco (`game.json`)
Tutto il contenuto è qui; dopo ogni modifica esegui `npm run build` (e `npm test`).
- `config`: parametri di bilanciamento (vita, oro, slot, energia, combo, difficoltà nemici, `matchesPerIsland`...).
- `baseDeck` / `baseMoves`: le 10 carte iniziali e le loro definizioni.
- `equipment[]`: `island` (da quale isola compare nello store), `moves` (3 mosse) e `advanced` (mossa acquistabile). `cost` è facoltativo su ogni mossa: se manca è calcolato dalla forza.
- Effetti (`effect`): `dmg`, `hits`, `block`, `dur` (turni; 0 = finché abbattuta), `heal`, `draw`, `energy`, `link: {from, dmg|block|draw|energy}` (bonus se la carta precedente è `from`).
- `enemyMoves[]`: carte nemiche (valori = moltiplicatori della potenza del nemico).
- `regions[]`: isole in ordine di sblocco; 5 `enemies` ciascuna (l'ultimo è il boss, con `hpMul`/`atkMul`), `enemyMoves` ammesse, tema (`theme`), posizione sulla mappa (`x`,`y`).
- `equipment[].kind`: natura dell'oggetto, usata per il racconto di come è stato ottenuto: `gear` (oggetto: trovato, ricevuto o costruito), `implant` (cyberware: installato o assemblato), `body` (potenziamento del corpo: risvegliato o allenato), `style` (stile di combattimento: insegnato o appreso), `arcane` (artefatto/potere: trovato o concesso). Le mosse sono sempre tecniche apprese.
- `regions[].enemies[].story`: breve racconto che introduce il duello (`{nome}` = nome del protagonista). `lore` è una nota sul nemico; `concept`/`story`/`hero` della regione sono appunti di design.
- Fuga: un effetto `{"flee": true, "req": {"hpBelow": 0.5, "minTurn": 3}}` fa lasciare il duello senza conseguenze se i requisiti sono soddisfatti (`hpBelow` = PV sotto quella frazione, `minTurn` = dal turno N). Ricordati di indicare `cost`. `config.mercy` regola la probabilità di essere risparmiati chiedendo pietà (base, bonus a PV bassi, malus contro i boss).
- `styles[]`: stili di combattimento iniziali (assegnati da una slot machine a inizio run): 10 carte ciascuno, che usano gli id di `baseMoves`.
- Vita: `woundedBelow` (se un duello finisce sotto questa frazione di PV, il successivo parte a `woundedStart`), `healCost` (prezzo della cura nello store). Altrimenti si parte sempre a PV pieni.
- Carte sinergia: effetto `{"syn": {"k": "adrenaline|bypass|freeNext|flow|momentum|scout|dup|clone|shieldAtk|shieldAtk", "n": 2}}` (di solito mosse avanzate con `cost` esplicito). Agiscono in base alle altre carte giocate nel turno.
- `choices[]`: scelte di capitolo (schermata Storia). Ogni evento è legato a un'isola (`region`) e a un incontro (`at`: 0–4, come l'ordine dei nemici dell'isola), così racconto e scelta sono coerenti col livello; per ogni capitolo ce ne sono almeno 2 e la run ne pesca uno (evitando i già visti). Campi: `title`, `text` (`{nome}` = protagonista) e **3** `options` con `label`, `text` (esito) e `fx`. `fx` supporta: `gold` (in *unità*: 1 unità = 1/3 della ricompensa di vittoria dell'arena, `config.choice.goldDivisor`) e, validi solo per il **prossimo duello**: `block` (scudo iniziale), `energy` (energia extra al 1° turno), `draw` (carte extra al 1° turno), `foeHp` (% PV del nemico, negativo = più debole) e `hp` (PV iniziali, di solito negativo). Con il livello crescono `gold` (via unità), `block` (+8% per arena, `blockPerArena`) e il malus `hp` (+5% per arena, `hpPerArena`). Bilanciamento: pesi gold=1, block=1/6, energy=1.5, draw=1, foeHp=−0.15/%, hp=0.2/PV; ogni opzione vale ~2 punti (il test impone 1.6–2.5 e max 0.6 di scarto fra le 3 opzioni).

## Regole di bilanciamento (config)
- `hpPerArena`: PV massimi guadagnati per ogni arena vinta (oltre agli equipaggiamenti).
- `handTarget`: a inizio turno si pescano `drawPerTurn` carte **oppure** quante ne servono per arrivare a `handTarget` in mano (0 = disattivato). Evita di restare senza carte con molte combo.
- `discardDrawCost` / `discardDrawCards`: energia da spendere a mazzo finito per rimescolare gli scarti e quante carte si pescano subito.
- `cost.div`, `cost.max`: formula del costo automatico delle carte (potenza ÷ div, tra 1 e max). `cost.tier`: sconto per isola: le carte di un'isola n-esima (0 = prima) costano potenza ÷ (div × (1 + tier × n)), così le carte avanzate sono più efficienti.
- `enemy.hpBase/atkBase/hpGrowth/atkGrowth`: statistiche base dei nemici e crescita per arena. `enemy.playsBase/playsEvery/playsMax`: carte giocate dal nemico per turno.
- `enemy.normalize`: se > 0, ogni isola infligge in media gli stessi danni per carta (valore = danno medio per carta, in unità dell'attacco), a prescindere dal suo mazzo di mosse nemiche: spiega perché i nemici dell'oceano non devono essere più duri di quelli della foresta.
- `enemy.burstCap`: tetto ai PV persi in un solo turno nemico, come frazione dei PV massimi (0 = nessun tetto). Evita le morti al primo round.
- Per ogni nemico, `hpMul` / `atkMul` regolano la difficoltà del singolo capitolo (si modificano anche dall'Editor).
- Simulatore: `npm run sim -- --runs 200 --style boxing --skill smart` (vedi `docs/BILANCIAMENTO.md`).
