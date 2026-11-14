import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import type {
  PredictTeamMatchRequestBody,
  SimulatedIndividualMatch,
  TeamMatchAIPlayerInput,
  TeamMatchFormulaInfo,
  TeamMatchPrediction,
} from '../src/types/fitet';
import { buildSwaythlingSchedule } from '../src/utils/teamMatchPreview';

function formatPlayersForPrompt(players: TeamMatchAIPlayerInput[]): string {
  if (!players || players.length === 0) {
    return '  (Nessun giocatore disponibile nel roster, usa nomi indicativi T1/T2/T3)';
  }
  return players
    .map((p, idx) => {
      const rankStr = p.rankPosizione ? `#${p.rankPosizione}` : 'N.C.';
      const ptsStr = p.rankPunti !== null ? `${p.rankPunti} pt` : 'N/D';
      return (
        `  ${idx + 1}. ${p.nome} | Rank: ${rankStr} (${ptsStr}) | ` +
        `Partite: ${p.partiteVinte}V-${p.partitePerse}P (${p.partiteDisputate} PD, ${p.percentualeVittorie}%) | ` +
        `Set: ${p.setVinti}:${p.setPersi} | Punti: ${p.puntiVinti}-${p.puntiPersi} | Indice valutazione: ${p.evaluationScore}/100`
      );
    })
    .join('\n');
}

function resolvePlayerId(name: string, players: TeamMatchAIPlayerInput[]): string | undefined {
  const norm = name.trim().toUpperCase();
  if (!norm) return undefined;
  const exact = players.find((p) => p.nome.trim().toUpperCase() === norm);
  if (exact?.atletaId) return exact.atletaId;
  const partial = players.find((p) => {
    const pNorm = p.nome.trim().toUpperCase();
    return pNorm.includes(norm) || norm.includes(pNorm);
  });
  return partial?.atletaId || undefined;
}

function sanitizeMatchSets(
  rawSetCasa: unknown,
  rawSetOspite: unknown,
  rawWinner: unknown,
  probCasa: number
): { vincitore: 'casa' | 'ospite'; setCasa: number; setOspite: number } {
  const winnerIsHome =
    rawWinner === 'casa'
      ? true
      : rawWinner === 'ospite'
        ? false
        : Number(rawSetCasa) > Number(rawSetOspite)
          ? true
          : Number(rawSetOspite) > Number(rawSetCasa)
            ? false
            : probCasa >= 50;

  let sc = Math.round(Number(rawSetCasa));
  let so = Math.round(Number(rawSetOspite));

  if (winnerIsHome) {
    sc = 3;
    so = Number.isFinite(so) ? Math.max(0, Math.min(2, so)) : 1;
  } else {
    so = 3;
    sc = Number.isFinite(sc) ? Math.max(0, Math.min(2, sc)) : 1;
  }

  return {
    vincitore: winnerIsHome ? 'casa' : 'ospite',
    setCasa: sc,
    setOspite: so,
  };
}

function sanitizeMatchPoints(
  rawPuntiCasa: unknown,
  rawPuntiOspite: unknown,
  setCasa: number,
  setOspite: number,
  vincitore: 'casa' | 'ospite'
): { puntiCasa: number; puntiOspite: number } {
  let pc = Math.round(Number(rawPuntiCasa));
  let po = Math.round(Number(rawPuntiOspite));

  const minWinnerPts = 33; // 3 sets * 11
  const loserSets = vincitore === 'casa' ? setOspite : setCasa;
  const expectedWinnerPts = minWinnerPts + loserSets * 8;
  const expectedLoserPts = loserSets * 11 + (3 - loserSets) * 6;

  if (!Number.isFinite(pc) || !Number.isFinite(po) || pc < 20 || po < 10) {
    return vincitore === 'casa'
      ? { puntiCasa: expectedWinnerPts, puntiOspite: expectedLoserPts }
      : { puntiCasa: expectedLoserPts, puntiOspite: expectedWinnerPts };
  }

  if (vincitore === 'casa' && pc <= po) {
    pc = Math.max(minWinnerPts, po + (3 - setOspite) * 3);
  } else if (vincitore === 'ospite' && po <= pc) {
    po = Math.max(minWinnerPts, pc + (3 - setCasa) * 3);
  }

  return { puntiCasa: pc, puntiOspite: po };
}

/**
 * Gestore dell'endpoint POST /api/predict-team-match
 */
export async function handlePredictTeamMatch(req: Request | any, res: Response | any) {
  if (req.method && req.method.toUpperCase() !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY non configurata sul server.',
    });
  }

  const body = (req.body || {}) as PredictTeamMatchRequestBody;
  const { homeTeam, awayTeam, formulaInfo, championshipName, giornata, fase, matchDate, reverseFixture } = body;

  if (!homeTeam?.nome || !awayTeam?.nome) {
    return res.status(400).json({
      error: 'Dati delle squadre mancanti (homeTeam e awayTeam richiesti).',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const homeForma = homeTeam.forma?.length ? homeTeam.forma.join('-') : 'N/D';
    const awayForma = awayTeam.forma?.length ? awayTeam.forma.join('-') : 'N/D';
    const reverseNote = reverseFixture
      ? `Precedente nello stesso campionato (${reverseFixture.fase} Giornata ${reverseFixture.giornata}, ${reverseFixture.data}): ${reverseFixture.casaNome} vs ${reverseFixture.ospiteNome} finita ${reverseFixture.risultato}.`
      : 'Nessun precedente già disputato in questo campionato.';

    const effectiveFormula: TeamMatchFormulaInfo = {
      formulaId: formulaInfo?.formulaId,
      label: 'Mini-Swaythling con Doppio (7 incontri completi: 6 singolari + 1 doppio)',
      expectedTotalMatches: 7,
      winningThreshold: 4,
      drawsPossible: false,
      hasDoubles: true,
      sampleScores: formulaInfo?.sampleScores || [],
    };

    const resolveSingles = (
      team: PredictTeamMatchRequestBody['homeTeam'],
      fallbackPrefix: string
    ): [string, string, string] => {
      const s = team.lineup?.singles;
      const p0 = (s?.[0] || team.players[0]?.nome || `${fallbackPrefix} A`).trim();
      const p1 = (s?.[1] || team.players[1]?.nome || p0).trim();
      const p2 = (s?.[2] || team.players[2]?.nome || p1).trim();
      return [p0, p1, p2];
    };

    const resolveDoubles = (
      team: PredictTeamMatchRequestBody['homeTeam'],
      singles: [string, string, string]
    ): [string, string] => {
      const d = team.lineup?.doubles;
      const d0 = (d?.[0] || singles[0]).trim();
      const d1 = (d?.[1] || singles[1]).trim();
      return [d0, d1];
    };

    const homeSingles = resolveSingles(homeTeam, homeTeam.nome);
    const awaySingles = resolveSingles(awayTeam, awayTeam.nome);
    const homeDoubles = resolveDoubles(homeTeam, homeSingles);
    const awayDoubles = resolveDoubles(awayTeam, awaySingles);

    const schedule = buildSwaythlingSchedule(
      effectiveFormula,
      homeSingles,
      awaySingles,
      homeDoubles,
      awayDoubles
    );

    const scheduleText = schedule
      .map(
        (slot) =>
          `  ${slot.numero}. [${slot.slotLabel}] ${slot.atletaCasa} vs ${slot.atletaOspite}`
      )
      .join('\n');

    const formulaDesc = `${effectiveFormula.label} (incontri massimi: ${effectiveFormula.expectedTotalMatches}, ` +
      `doppio previsto: ${effectiveFormula.hasDoubles ? 'SÌ' : 'NO'}, ` +
      `pareggio possibile: ${effectiveFormula.drawsPossible ? 'SÌ' : 'NO'}, ` +
      `soglia vittoria: ${effectiveFormula.winningThreshold ?? 'maggioranza'}, ` +
      `punteggi osservati nel girone: ${effectiveFormula.sampleScores.length ? effectiveFormula.sampleScores.join(', ') : 'N/D'})`;

    const prompt = `Sei un analista esperto di tennistavolo italiano (FITeT). Devi produrre il pronostico tecnico completo per un incontro di campionato a squadre futuro.

CONTESTO INCONTRO:
- Campionato: ${championshipName || 'Campionato FITeT'}
- Giornata: ${giornata ?? 'Prossima'} (${fase === 'ritorno' ? 'Ritorno' : 'Andata'}) — Data: ${matchDate || 'Da definire'}
- Formula campionato: ${formulaDesc}
- ${reverseNote}

SQUADRA CASA: ${homeTeam.nome}
- Classifica: ${homeTeam.posizione ? `#${homeTeam.posizione}` : 'N/D'} | Punti: ${homeTeam.puntiClassifica ?? 'N/D'} | Bilancio: ${homeTeam.incontriVinti ?? 0}V-${homeTeam.incontriPareggiati ?? 0}N-${homeTeam.incontriPersi ?? 0}P
- Partite singole: ${homeTeam.partiteVinte ?? 0}V-${homeTeam.partitePerse ?? 0}P | Set: ${homeTeam.setVinti ?? 0}:${homeTeam.setPersi ?? 0} | Punti: ${homeTeam.puntiVinti ?? 0}-${homeTeam.puntiPersi ?? 0} | Forma recente: ${homeForma}
- Formazione schierata: A=${homeSingles[0]}, B=${homeSingles[1]}, C=${homeSingles[2]}${effectiveFormula.hasDoubles ? `, Doppio=${homeDoubles[0]} / ${homeDoubles[1]}` : ''}
- Giocatori selezionati (valutati):
${formatPlayersForPrompt(homeTeam.players)}

SQUADRA OSPITE: ${awayTeam.nome}
- Classifica: ${awayTeam.posizione ? `#${awayTeam.posizione}` : 'N/D'} | Punti: ${awayTeam.puntiClassifica ?? 'N/D'} | Bilancio: ${awayTeam.incontriVinti ?? 0}V-${awayTeam.incontriPareggiati ?? 0}N-${awayTeam.incontriPersi ?? 0}P
- Partite singole: ${awayTeam.partiteVinte ?? 0}V-${awayTeam.partitePerse ?? 0}P | Set: ${awayTeam.setVinti ?? 0}:${awayTeam.setPersi ?? 0} | Punti: ${awayTeam.puntiVinti ?? 0}-${awayTeam.puntiPersi ?? 0} | Forma recente: ${awayForma}
- Formazione schierata: X=${awaySingles[0]}, Y=${awaySingles[1]}, Z=${awaySingles[2]}${effectiveFormula.hasDoubles ? `, Doppio=${awayDoubles[0]} / ${awayDoubles[1]}` : ''}
- Giocatori selezionati (valutati):
${formatPlayersForPrompt(awayTeam.players)}

ISTRUZIONI:
1. ORDINE UFFICIALE DEGLI INCONTRI (${effectiveFormula.label}):
${scheduleText}
   - Simula TUTTI E ${schedule.length} gli incontri ESATTAMENTE in questo ordine e con questi esatti abbinamenti/nomi di giocatori, SENZA fermarti al 4° punto.
   - Si disputano sempre tutti i 7 incontri (6 singolari + 1 doppio): il risultato finale della squadra deve avere SEMPRE somma uguale a 7 (es. 7-0, 6-1, 5-2, 4-3, 3-4, 2-5, 1-6 o 0-7). Non è previsto il pareggio.
2. Per ogni incontro individuale fornisci:
   - setCasa e setOspite (al meglio dei 5 set: chi vince fa 3, chi perde 0, 1 o 2)
   - puntiCasa e puntiOspite realistici (somma dei punti di tutti i set, es. in un 3-1 circa 40-31)
   - probCasa (intero 5-95) e una nota tattica brevissima (max 10 parole).
3. Calcola le probabilità globali dell'incontro: probCasa, probPareggio (${effectiveFormula.drawsPossible ? 'intero 0-95 se il pareggio è possibile' : 'SEMPRE 0 perché la formula non ammette pareggio'}), probOspite (somma esatta = 100).
4. Fornisci "keyFactor" (1 frase incisiva sul fattore decisivo) e "analysis" (2-4 frasi tecniche in italiano che citino il doppio se presente, i giocatori chiave ABC/XYZ, gli incroci favorevoli e il fattore campo).

Restituisci ESCLUSIVAMENTE un JSON valido con questo schema esatto:
{
  "probCasa": <intero>,
  "probPareggio": <intero>,
  "probOspite": <intero>,
  "keyFactor": "<stringa breve>",
  "analysis": "<stringa 2-4 frasi>",
  "incontriSimulati": [
    {
      "numero": 1,
      "atletaCasa": "<nome esatto giocatore casa>",
      "atletaOspite": "<nome esatto giocatore ospite>",
      "vincitore": "casa" | "ospite",
      "probCasa": <intero 1..99>,
      "setCasa": <0..3>,
      "setOspite": <0..3>,
      "puntiCasa": <intero>,
      "puntiOspite": <intero>,
      "nota": "<nota tattica breve>"
    }
  ]
}`;

    const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const candidateModels = Array.from(
      new Set([
        preferredModel,
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.8-flash',
      ])
    );

    let response: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.35,
          },
        });
        if (response && response.text && response.text.trim()) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[predict-team-match] Modello ${model} non disponibile o errore:`, err?.message || err);
      }
    }

    if (!response || !response.text || !response.text.trim()) {
      throw lastError || new Error('Nessun modello Gemini ha restituito una risposta valida.');
    }

    const cleanedText = response.text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const raw = JSON.parse(cleanedText);

    const rawMatches: any[] = Array.isArray(raw.incontriSimulati) ? raw.incontriSimulati : [];
    const incontriSimulati: SimulatedIndividualMatch[] = [];
    let homeWins = 0;
    let awayWins = 0;

    for (let idx = 0; idx < schedule.length; idx++) {
      const m = rawMatches[idx] || {};
      const slot = schedule[idx];
      const atletaCasa = slot.atletaCasa;
      const atletaOspite = slot.atletaOspite;

      const rawProbCasa = Math.round(Number(m?.probCasa));
      const probCasa = Number.isFinite(rawProbCasa) ? Math.max(1, Math.min(99, rawProbCasa)) : 50;

      const { vincitore, setCasa, setOspite } = sanitizeMatchSets(m?.setCasa, m?.setOspite, m?.vincitore, probCasa);
      const { puntiCasa, puntiOspite } = sanitizeMatchPoints(
        m?.puntiCasa,
        m?.puntiOspite,
        setCasa,
        setOspite,
        vincitore
      );

      if (vincitore === 'casa') homeWins++;
      else awayWins++;

      incontriSimulati.push({
        numero: slot.numero,
        slotLabel: slot.slotLabel,
        isDoppio: slot.isDoppio,
        atletaCasa,
        atletaCasaId: slot.isDoppio ? undefined : resolvePlayerId(atletaCasa, homeTeam.players),
        atletaOspite,
        atletaOspiteId: slot.isDoppio ? undefined : resolvePlayerId(atletaOspite, awayTeam.players),
        vincitore,
        probCasa,
        setCasa,
        setOspite,
        puntiCasa,
        puntiOspite,
        nota: typeof m?.nota === 'string' ? m.nota.trim() : '',
      });
    }

    // Normalize probabilities so probCasa + probPareggio + probOspite === 100
    let probCasa = Math.round(Number(raw.probCasa));
    let probPareggio = effectiveFormula.drawsPossible ? Math.round(Number(raw.probPareggio)) : 0;
    let probOspite = Math.round(Number(raw.probOspite));

    if (!Number.isFinite(probCasa)) probCasa = 50;
    if (!Number.isFinite(probPareggio) || !formulaInfo?.drawsPossible) probPareggio = 0;
    if (!Number.isFinite(probOspite)) probOspite = Math.max(1, 100 - probCasa - probPareggio);

    probCasa = Math.max(1, Math.min(98, probCasa));
    probPareggio = formulaInfo?.drawsPossible ? Math.max(0, Math.min(45, probPareggio)) : 0;
    probOspite = Math.max(1, 100 - probCasa - probPareggio);

    const sumProb = probCasa + probPareggio + probOspite;
    if (sumProb !== 100) {
      const diff = 100 - sumProb;
      if (probCasa >= probOspite) probCasa = Math.max(1, probCasa + diff);
      else probOspite = Math.max(1, probOspite + diff);
    }

    // Recompute totals strictly from incontriSimulati for 100% consistency
    const puntiIncontroCasa =
      incontriSimulati.length > 0
        ? incontriSimulati.filter((m) => m.vincitore === 'casa').length
        : Math.max(0, Math.round(Number(raw.puntiIncontroCasa) || 0));
    const puntiIncontroOspite =
      incontriSimulati.length > 0
        ? incontriSimulati.filter((m) => m.vincitore === 'ospite').length
        : Math.max(0, Math.round(Number(raw.puntiIncontroOspite) || 0));
    const setStimatiCasa =
      incontriSimulati.length > 0
        ? incontriSimulati.reduce((acc, m) => acc + m.setCasa, 0)
        : Math.max(0, Math.round(Number(raw.setStimatiCasa) || 0));
    const setStimatiOspite =
      incontriSimulati.length > 0
        ? incontriSimulati.reduce((acc, m) => acc + m.setOspite, 0)
        : Math.max(0, Math.round(Number(raw.setStimatiOspite) || 0));
    const puntiStimatiCasa =
      incontriSimulati.length > 0
        ? incontriSimulati.reduce((acc, m) => acc + m.puntiCasa, 0)
        : Math.max(0, Math.round(Number(raw.puntiStimatiCasa) || 0));
    const puntiStimatiOspite =
      incontriSimulati.length > 0
        ? incontriSimulati.reduce((acc, m) => acc + m.puntiOspite, 0)
        : Math.max(0, Math.round(Number(raw.puntiStimatiOspite) || 0));

    const payload: TeamMatchPrediction = {
      probCasa,
      probPareggio,
      probOspite,
      puntiIncontroCasa,
      puntiIncontroOspite,
      setStimatiCasa,
      setStimatiOspite,
      puntiStimatiCasa,
      puntiStimatiOspite,
      keyFactor:
        typeof raw.keyFactor === 'string' && raw.keyFactor.trim()
          ? raw.keyFactor.trim()
          : 'Equilibrio tra i titolari e rendimento nei set decisivi.',
      analysis:
        typeof raw.analysis === 'string' && raw.analysis.trim()
          ? raw.analysis.trim()
          : 'Pronostico calcolato sulla base di classifica, punti FITeT, rendimento individuale e stato di forma delle due squadre.',
      incontriSimulati,
    };

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('[predict-team-match] Errore invocazione Gemini API:', err);
    return res.status(500).json({
      error: `Errore durante l'elaborazione del pronostico incontro con IA: ${err.message || 'Errore interno'}`,
    });
  }
}

export default async function handler(req: any, res: any) {
  return handlePredictTeamMatch(req, res);
}

