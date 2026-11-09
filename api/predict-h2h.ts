import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

export interface AthleteAIInput {
  id: string | number;
  name: string;
  rank: number;
  points?: number;
  recentForm?: string;
  h2hWins?: number;
}

export interface PredictH2HRequestBody {
  athleteA: AthleteAIInput;
  athleteB: AthleteAIInput;
}

export interface PredictH2HResponse {
  probA: number;
  probB: number;
  analysis: string;
}

/**
 * Gestore dell'endpoint POST /api/predict-h2h
 */
export async function handlePredictH2H(req: Request | any, res: Response | any) {
  // 1. Validazione Metodo
  if (req.method && req.method.toUpperCase() !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });
  }

  // 2. Validazione Chiave d'Ambiente GEMINI_API_KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY non configurata sul server.',
    });
  }

  // 3. Validazione Payload Body
  const { athleteA, athleteB } = (req.body || {}) as PredictH2HRequestBody;
  if (!athleteA || !athleteB) {
    return res.status(400).json({
      error: 'Dati atleti mancanti nel corpo della richiesta (athleteA e athleteB richiesti).',
    });
  }

  if (
    typeof athleteA.name !== 'string' ||
    !athleteA.name.trim() ||
    typeof athleteB.name !== 'string' ||
    !athleteB.name.trim()
  ) {
    return res.status(400).json({ error: 'Nomi atleti non validi.' });
  }

  if (typeof athleteA.rank !== 'number' || typeof athleteB.rank !== 'number') {
    return res.status(400).json({ error: 'Ranking atleti non valido o mancante (fornire un valore numerico).' });
  }

  try {
    // Forza esplicitamente l'endpoint v1beta se supportato dall'SDK, altrimenti usa l'istanza standard
    const ai = new GoogleGenAI({
      apiKey,
      // Se l'SDK supporta le apiClientOptions:
      // apiClientOptions: { apiVersion: 'v1beta' }
    });

    const nameA = athleteA.name.trim();
    const nameB = athleteB.name.trim();
    const rankA = athleteA.rank > 0 ? `#${athleteA.rank}` : 'Non classificato';
    const rankB = athleteB.rank > 0 ? `#${athleteB.rank}` : 'Non classificato';
    const pointsA = athleteA.points != null ? `${athleteA.points}` : 'N/D';
    const pointsB = athleteB.points != null ? `${athleteB.points}` : 'N/D';
    const formA = athleteA.recentForm?.trim() || 'N/D';
    const formB = athleteB.recentForm?.trim() || 'N/D';
    const h2hWinsA = athleteA.h2hWins ?? 0;
    const h2hWinsB = athleteB.h2hWins ?? 0;

    const prompt = `Sei un analista esperto di tennistavolo/sportivo. Analizza questo matchup testa a testa:
- Atleta A: 
${nameA}, Ranking: ${rankA}, Punti: ${pointsA}, Forma recente: ${formA}.
- Atleta B: 
${nameB}, Ranking: ${rankB}, Punti: ${pointsB}, Forma recente: ${formB}.
- Scontri diretti: 
${h2hWinsA} vittorie A vs ${h2hWinsB} vittorie B.

Restituisci ESCLUSIVAMENTE un JSON valido in questo formato:
{
  "probA": <intero da 1 a 99>,
  "probB": <intero da 1 a 99, con probA + probB = 100>,
  "analysis": "<massimo 2-3 frasi evidenziando il matchup tattico e il fattore decisivo>"
}`;

    // Modello preferito da env o default ad alta velocità e disponibilità
    const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const candidateModels = Array.from(
      new Set([
        preferredModel,
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
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
            temperature: 0.3,
          },
        });
        if (response && response.text && response.text.trim()) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[predict-h2h] Modello ${model} non disponibile o errore:`, err?.message || err);
      }
    }

    if (!response || !response.text || !response.text.trim()) {
      throw lastError || new Error('Nessun modello Gemini ha restituito una risposta valida.');
    }

    const responseText = response.text;

    const cleanedText = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const raw = JSON.parse(cleanedText);

    let probA = Math.round(Number(raw.probA));
    let probB = Math.round(Number(raw.probB));

    if (isNaN(probA) && isNaN(probB)) {
      probA = 50;
      probB = 50;
    } else if (isNaN(probA)) {
      probA = 100 - probB;
    } else if (isNaN(probB)) {
      probB = 100 - probA;
    }

    probA = Math.max(1, Math.min(99, probA));
    probB = 100 - probA;

    const analysis =
      typeof raw.analysis === 'string' && raw.analysis.trim().length > 0
        ? raw.analysis.trim()
        : 'Matchup equilibrato analizzato sulla base dei parametri di ranking e stato di forma recente.';

    return res.status(200).json({
      probA,
      probB,
      analysis,
    });
  } catch (err: any) {
    console.error('[predict-h2h] Errore invocazione Gemini API:', err);
    return res.status(500).json({
      error: `Errore durante l'elaborazione del pronostico con IA: ${err.message || 'Errore interno'}`,
    });
  }
}

/**
 * Default export per compatibilità Serverless Vercel (api/predict-h2h.ts)
 */
export default async function handler(req: any, res: any) {
  return handlePredictH2H(req, res);
}

