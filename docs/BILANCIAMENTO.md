# Bilanciamento di Comboo — rapporto e modifiche

Il bilanciamento è stato fatto con un **simulatore** (`scripts/sim.ts`) che gioca intere run con il motore reale, senza interfaccia. Il bot sa comprare equipaggiamenti, mosse ed energia, curare, scegliere le scelte di storia, potare il mazzo e giocare le carte con combo e difesa. Ne esistono tre livelli: **smart** (giocatore esperto), **casual** (giocatore medio, sbaglia e non pota il mazzo) e **naive** (quasi casuale). Il bot non è un umano: i numeri sono utili soprattutto *in confronto* tra versioni, ma la curva di difficoltà è stata calibrata su di lui.

```
npm run sim -- --runs 200 --style boxing --skill smart          # run complete
npm run sim -- --runs 100 --immortal --style jujitsu            # difficoltà di ogni arena, indipendente dalle precedenti
npm run sim -- --runs 100 --set config.enemy.hpGrowth=1.09 --usage   # prova di una modifica senza toccare il JSON
```
`--set percorso=valore` modifica i dati in memoria; `--data file.json` usa un altro game.json; `--usage` mostra quali carte vengono giocate.

## Problemi trovati (dati originali)

1. **Muro di difficoltà alle arene 8–10.** I nemici crescevano del 13% di PV e del 9,5% di attacco per arena, ma i PV del giocatore restavano quasi fermi (da 41 a ~52 con gli equipaggiamenti). Il bot esperto arrivava in media all'arena ~8 e **non completava mai il gioco**. Alla fine dell'isola 2 un turno nemico toglieva ~20–23 PV a un giocatore con ~52 PV, e il nemico moriva dopo 4–5 turni.
2. **Morti "al primo round".** Il numero di carte giocate dal nemico saliva a scatti (2 → 3 all'arena 9, → 4 alla 17, → 5 alla 25) e i mazzi di mosse nemiche delle isole non sono equivalenti: danno medio per carta ×1,13 pugilato, ×1,30 campo di battaglia, ×1,13 deserto, ×1,48 oceano, **×0,86 foresta**, **×1,74 vulcano**. Risultato: nei test il danno del primo turno passava da ~13 a ~50 PV entrando nell'oceano, mentre la foresta (con rigenerazione e assorbimento) era molto più morbida. Questo spiega "alcuni avversari troppo facili, altri ti uccidono subito". In più solo il boss aveva moltiplicatori: i 4 nemici normali di un'isola avevano tutti le stesse statistiche.
3. **Mano che si svuota.** Mazzo iniziale da 10 carte, 5 in mano e 2 pescate a turno: il mazzo finiva al turno 3–4. Rimescolare costava **3 energia (tutta l'energia iniziale) per una sola carta**. Con molte combo la mano si azzerava, e **comprare energia non serviva**: anche con 5–6 energia il bot giocava solo 2,2–2,8 carte a turno perché non aveva carte. Un giocatore "medio" (bot casual) vinceva solo il 31–38% delle partite dell'arena 1 contro il 99% dell'esperto.
4. **Carte tardive inutilizzabili.** Il costo automatico era potenza ÷ 5 (fino a 8 energia): le carte forti dei livelli avanzati costavano 6–8 energia (con max 10 e un prezzo crescente per ottenerle) a parità di rendimento delle carte economiche. Dopo l'arena ~15 il bot giocava ancora soprattutto carte delle prime isole (Fasce, Lame multicolpo): intere linee (Aura, Reattore, Scatto, Frutto, Fenditura) non venivano mai giocate. Inoltre il bonus danni degli equipaggiamenti si somma a *ogni colpo*, quindi le carte multicolpo a basso costo battevano sempre quelle a colpo singolo.
5. **Stili sbilanciati.** I mazzi iniziali di Taekwondo e Jujitsu (calcio 5, rotazione con combo, parata+pesca, presa+scudo, leva da 6 per 2 turni) erano più forti del Pugilato: a parità di nemici il Pugilato arrivava in media fino all'arena ~10, gli altri stili fino alla ~16.
6. **Equipaggiamenti con una sola mossa avanzata** (Corazza, Titano, Pelle, Rigenerazione, Fenditura, Aura): poche scelte nello store e poca varietà.

## Modifiche (tutte in `data/game.json`, salvo le regole nuove nel motore)

### Regole nuove (motore, attivabili da `config`)
| Chiave | Valore | Effetto |
|---|---|---|
| `handTarget` | 5 | a inizio turno si pesca max(`drawPerTurn`, 5 − carte in mano): la mano si riempie e l'energia comprata serve |
| `hpPerArena` | 3 | +3 PV massimi per ogni arena vinta |
| `enemy.normalize` | 1,1 | ogni isola infligge in media gli stessi danni per carta (le isole restano diverse per tipo di colpi, non per quantità) |
| `enemy.burstCap` | 0,5 | un turno nemico non può togliere più del 50% dei PV massimi: **niente più morti al primo round** (il test lo verifica) |
| `cost.tier` | 0,15 | le carte delle isole avanzate costano meno a parità di potenza (isola n: ÷(1+0,15·n)) |
| `discardDrawCards` | 1 | carte pescate dopo il rimescolo (configurabile) |

### Parametri
| Chiave | Prima | Dopo |
|---|---|---|
| `discardDrawCost` (rimescolo a mazzo finito) | 3 | **2** |
| `cost.div` / `cost.max` | 5 / 8 | **6 / 6** |
| `enemy.hpBase` / `atkBase` | 22 / 5 | **34 / 7,5** |
| `enemy.hpGrowth` / `atkGrowth` | 1,13 / 1,095 | **1,085 / 1,035** |
| `enemy.playsEvery` | 8 | **10** (meno scatti nel numero di carte nemiche) |

Moltiplicatori per capitolo (PV·attacco), calibrati in modo che ogni arena abbia la difficoltà obiettivo (si vedono e si modificano dall'Editor, scheda *Isole e capitoli*):

| Isola | Capitoli 1–5 (boss ultimo) |
|---|---|
| Fighting Arena | 0.82·0.83 / 0.89·0.88 / 0.98·0.91 / 1.10·0.96 / 1.43·1.20 |
| Campo di battaglia | 1.35·1.10 / 1.54·1.17 / 1.45·1.19 / 1.50·1.21 / 1.82·1.35 |
| Deserto | 1.06·1.03 / 0.99·1.00 / 1.23·1.10 / 1.35·1.15 / 1.66·1.29 |
| Oceano | 1.09·1.04 / 1.46·1.20 / 1.49·1.21 / 1.42·1.18 / 1.53·1.24 |
| Foresta | 0.94·0.97 / 0.99·1.00 / 0.94·0.97 / 0.98·0.99 / 1.16·1.09 |
| Vulcano | 0.86·0.93 / 0.84·0.92 / 1.07·1.03 / 0.95·0.98 / 1.03·1.03 |

### Carte e stili
- **Pugilato:** mazzo iniziale da 5/3/2 a **6 Jab / 3 Guardia / 1 Respiro**; Respiro dà 3 di guardia (era 2).
- **Taekwondo:** Calcio frontale 5→4 danni, Calcio circolare: bonus collegamento 2→1, Schivata 3→2 di guardia.
- **Jujitsu:** Leva articolare 6→5 di guardia, Proiezione: bonus collegamento 4→3.
- **9 carte nuove** (acquistabili nello store, mosse avanzate) per dare una seconda scelta alle linee con una sola:
  Rabbia del ferito (Fasce, con PV < 50%: 11×2), Guardia attiva (Postura: guardia 6 + pesca 1), Cambio di ritmo (Gioco di gambe: pesca 2 + 1 energia), Barriera reattiva (Corazza: guardia 10 per 2 turni + pesca), Frantumazione (Titano: 10×3), Pelle di roccia (Pelle: guardia 10 per 2 turni + cura 6), Rigenerazione rapida (Rigenerazione: cura 12 + pesca), Strappo dimensionale (Fenditura: 14 + collegamento +10), Esplosione di ki (Aura: 16×2 + pesca).
- Tutorial e traduzione inglese aggiornati ai nuovi numeri (mano a 5, rimescolo a 2 energia).

## Risultati dopo il bilanciamento

Obiettivo: arene normali ~90–99% di vittorie per l'esperto, boss 80–50% in crescita; completamento dell'intera run ~2–5% per il bot esperto (un giocatore umano forte può fare meglio).

Vittorie per arena (run complete, 150 per stile, bot esperto); i boss sono le arene 5, 10, 15, 20, 25, 30:

| Stile | Arena media raggiunta | Run completate | Boss 5 / 10 / 15 / 20 / 25 / 30 |
|---|---|---|---|
| Pugilato | 12,9 | 2% | 84 / 87 / 78 / 71 / 50 / 50 |
| Taekwondo | 14,9 | 2% | 93 / 81 / 75 / 69 / 72 / 44 |
| Jujitsu | 15,5 | 4% | 94 / 82 / 79 / 81 / 68 / 54 |

(prima: arena media ≈ 8, 0% di run completate). Il bot **casual** raggiunge in media l'arena 5,6: vince il 100% dell'arena 1 e ~84–95% delle arene 2–4, il primo boss è al ~48%. Nelle arene normali l'esperto vince il 90–100%; la durata dei combattimenti scende da ~5,5 turni (arena 1) a ~2,5–3 (fine gioco, con 10 energia).

Controlli fatti: la differenza tra stili (vittorie al primo tentativo, media sulle 30 arene) è 0,89–0,92; con `burstCap` il danno massimo subito nel primo turno è ≤ 50% dei PV massimi; i test automatici (50) coprono le nuove regole.

## Cosa resta da tenere d'occhio
- Il bot non conosce tutte le sinergie (es. Adrenalina/Clone sono usate in modo semplice): un umano potrebbe trovare combo più forti. Se un giocatore esperto completa troppo spesso, alza `hpMul` degli ultimi boss o `atkGrowth`.
- Le fughe/pietà non sono simulate.
- I fine-gioco (arene 28–30) hanno pochi campioni nelle run reali: ricontrolla con `--immortal` dopo ogni modifica.
- Il bonus danni "a ogni colpo" resta il fattore che favorisce le carte multicolpo: se la meta diventa solo multicolpo, riduci `bonus.dmg` degli equipaggiamenti tardivi.
