import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, Quote } from 'lucide-react';

export interface AthleteAIProp {
  id: string | number;
  name: string;
  rank: number;
  points?: number;
  recentForm?: string;
  h2hWins?: number;
}

export interface HeadToHeadAIPredictorProps {
  athleteA: AthleteAIProp;
  athleteB: AthleteAIProp;
  className?: string;
}

interface PredictionData {
  probA: number;
  probB: number;
  analysis: string;
}

interface StoredPrediction {
  baseAthleteAId: string | number;
  probA: number;
  probB: number;
  analysis: string;
  timestamp: number;
}

const shortenName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  // Se il primo pezzo sembra il cognome in maiuscolo (es. ROSSI Mario)
  if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
    const lastName = parts[0];
    const firstInitial = parts[1]?.[0] ? `${parts[1][0]}.` : '';
    return `${firstInitial} ${lastName}`.trim();
  }
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

export const HeadToHeadAIPredictor: React.FC<HeadToHeadAIPredictorProps> = ({
  athleteA,
  athleteB,
  className = '',
}) => {
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Calcolo della chiave canonica simmetrica basata su ID
  const cacheKey = useMemo(() => {
    const numA = Number(athleteA.id);
    const numB = Number(athleteB.id);
    const isNumeric = !Number.isNaN(numA) && !Number.isNaN(numB);

    if (isNumeric) {
      return `h2h_pred_${Math.min(numA, numB)}_${Math.max(numA, numB)}`;
    }
    const [minStr, maxStr] = [String(athleteA.id), String(athleteB.id)].sort();
    return `h2h_pred_${minStr}_${maxStr}`;
  }, [athleteA.id, athleteB.id]);

  // 2. Controllo cache locale all'atterraggio o al cambio di atleti
  useEffect(() => {
    setError(null);
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const stored: StoredPrediction = JSON.parse(cachedRaw);
        if (
          typeof stored.probA === 'number' &&
          typeof stored.probB === 'number' &&
          typeof stored.analysis === 'string'
        ) {
          // Verifica se l'ordine attuale degli atleti corrisponde all'ordine originale di salvataggio
          const isDirect = String(stored.baseAthleteAId) === String(athleteA.id);
          setPrediction({
            probA: isDirect ? stored.probA : stored.probB,
            probB: isDirect ? stored.probB : stored.probA,
            analysis: stored.analysis,
          });
          return;
        }
      }
    } catch (e) {
      console.warn('[HeadToHeadAIPredictor] Errore lettura cache localStorage:', e);
    }
    setPrediction(null);
  }, [cacheKey, athleteA.id, athleteB.id]);

  // 3. Esecuzione chiamata API serverless
  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/predict-h2h', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          athleteA: {
            id: athleteA.id,
            name: athleteA.name,
            rank: athleteA.rank,
            points: athleteA.points,
            recentForm: athleteA.recentForm,
            h2hWins: athleteA.h2hWins,
          },
          athleteB: {
            id: athleteB.id,
            name: athleteB.name,
            rank: athleteB.rank,
            points: athleteB.points,
            recentForm: athleteB.recentForm,
            h2hWins: athleteB.h2hWins,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Errore del server (${response.status})`);
      }

      if (typeof data.probA !== 'number' || typeof data.probB !== 'number') {
        throw new Error('Dati di probabilità non validi nella risposta.');
      }

      const newPrediction: PredictionData = {
        probA: data.probA,
        probB: data.probB,
        analysis: data.analysis || 'Analisi del matchup completata con successo.',
      };

      setPrediction(newPrediction);

      // Salva in localStorage con chiave simmetrica e riferimento all'atletaA attuale
      try {
        const toStore: StoredPrediction = {
          baseAthleteAId: athleteA.id,
          probA: data.probA,
          probB: data.probB,
          analysis: data.analysis,
          timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(toStore));
      } catch (cacheErr) {
        console.warn('[HeadToHeadAIPredictor] Errore salvataggio cache localStorage:', cacheErr);
      }
    } catch (err: any) {
      console.error('[HeadToHeadAIPredictor] Errore richiesta pronostico:', err);
      setError(err.message || 'Impossibile generare il pronostico con IA al momento.');
    } finally {
      setLoading(false);
    }
  }, [athleteA, athleteB, cacheKey]);

  // 4. Invalidazione cache e ricalcolo
  const handleRecalculate = () => {
    try {
      localStorage.removeItem(cacheKey);
    } catch (e) {
      console.warn('[HeadToHeadAIPredictor] Errore cancellazione cache:', e);
    }
    fetchPrediction();
  };

  const probA = prediction?.probA ?? 50;
  const probB = prediction?.probB ?? 50;
  const isEven = Math.abs(probA - probB) < 6;
  const isLeaderA = probA > probB;
  const leaderName = isLeaderA ? athleteA.name : athleteB.name;
  const leaderProb = Math.max(probA, probB);

  return (
    <div
      className={`${className}`}
    >
      {/* Intestazione Sezione */}
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <span
            className="d-inline-flex align-items-center justify-content-center rounded"
            style={{ width: '1.5rem', height: '1.5rem' }}
          >
            <Sparkles style={{ width: '0.875rem', height: '0.875rem' }} />
          </span>
          <span className="small fw-bold text-uppercase" style={{ letterSpacing: '0.05em' }}>
          </span>
          {prediction && !loading && (
            <span
              className={`badge rounded-pill fw-bold border ${isEven
                ? 'bg-secondary-subtle text-secondary-emphasis border-secondary-subtle'
                : isLeaderA
                  ? 'bg-success-subtle text-success-emphasis border-success-subtle'
                  : 'bg-warning-subtle text-warning-emphasis border-warning-subtle'
                }`}
              style={{ fontSize: '0.7rem' }}
            >
              {isEven ? 'Equilibrio' : `Favorito: ${shortenName(leaderName)} (${leaderProb}%)`}
            </span>
          )}
        </div>


      </div>

      {/* Stato: Loading */}
      {loading && (
        <div className="d-flex flex-col flex-column align-items-center justify-content-center py-4 text-center">
          <div
            className="position-relative d-flex align-items-center justify-content-center mb-3"
            style={{ width: '2.5rem', height: '2.5rem' }}
          >
            <div
              className="spinner-grow position-absolute   opacity-25"
              style={{ width: '2.5rem', height: '2.5rem' }}
              role="status"
            />
            <RefreshCw className="spinner-border spinner-border-sm  " style={{ width: '1.5rem', height: '1.5rem', borderWidth: 0 }} />
          </div>
          <p className="fw-semibold mb-0 small">
            Analisi matchup e metriche in corso...
          </p>
          <p className="mb-3" style={{ fontSize: '0.75rem' }}>
            Elaborazione tattica qualitativa e stima probabilistica con IA
          </p>
          <div
            className="progress w-50"
            style={{ height: '6px' }}
            role="progressbar"
          >
            <div
              className="progress-bar progress-bar-striped progress-bar-animated bg-primary w-100"
            />
          </div>
        </div>
      )}

      {/* Stato: Errore */}
      {!loading && error && (
        <div className="alert alert-danger d-flex align-items-start gap-2 mb-0 p-3" role="alert">
          <AlertCircle className="flex-shrink-0 mt-1 text-danger" style={{ width: '1rem', height: '1rem' }} />
          <div className="flex-grow-1 small">
            <p className="fw-semibold mb-1">{error}</p>
            <button
              type="button"
              onClick={fetchPrediction}
              className="btn btn-danger btn-sm d-inline-flex align-items-center gap-1 py-1 px-2"
              style={{ fontSize: '0.75rem' }}
            >
              <RefreshCw style={{ width: '0.75rem', height: '0.75rem' }} />
              <span>Riprova</span>
            </button>
          </div>
        </div>
      )}

      {/* Stato: Iniziale / CTA */}
      {!loading && !error && !prediction && (
        <div className="d-flex flex-column align-items-center justify-content-center rounded border-dashed py-4 px-3 text-center">
          <p className="small mb-2">
            Valuta il confronto tecnico e stima le quote di vittoria tra{' '}
            <strong>{shortenName(athleteA.name)}</strong> e{' '}
            <strong>{shortenName(athleteB.name)}</strong>.
          </p>
          <button
            type="button"
            onClick={fetchPrediction}
            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 fw-semibold"
            style={{ fontSize: '0.8rem' }}
          >
            <Sparkles style={{ width: '0.875rem', height: '0.875rem' }} />
            <span>Genera Pronostico con IA</span>
          </button>
        </div>
      )}

      {/* Stato: Risultato */}
      {!loading && !error && prediction && (
        <div className="d-flex flex-column gap-3">
          {/* Header con Quote e Percentuali */}
          <div className="d-flex align-items-center justify-content-between small fw-bold">
            <div className="d-flex align-items-center gap-2 text-success">
              <span
                className="rounded-circle bg-success d-inline-block"
                style={{ width: '8px', height: '8px' }}
              />
              <span
                className="text-truncate d-inline-block"
                style={{ maxWidth: '140px' }}
                title={athleteA.name}
              >
                {shortenName(athleteA.name)}
              </span>
              <span className="fs-6 fw-bolder">{probA}%</span>
            </div>

            <span
              className="text-uppercase fw-semibold"
              style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}
            >
              vs
            </span>

            <div className="d-flex align-items-center gap-2 text-warning-emphasis">
              <span className="fs-6 fw-bolder">{probB}%</span>
              <span
                className="text-truncate text-end d-inline-block"
                style={{ maxWidth: '140px' }}
                title={athleteB.name}
              >
                {shortenName(athleteB.name)}
              </span>
              <span
                className="rounded-circle bg-warning d-inline-block"
                style={{ width: '8px', height: '8px' }}
              />
            </div>
          </div>

          {/* Barra di Probabilità Bicolore */}
          <div
            className="progress-stacked rounded-pill mb-3"
            style={{ height: '12px' }}
            aria-label={`Probabilità di vittoria: ${athleteA.name} ${probA}%, ${athleteB.name} ${probB}%`}
          >
            <div
              className="progress"
              role="progressbar"
              style={{ width: `${probA}%` }}
              aria-valuenow={probA}
              aria-valuemin={1}
              aria-valuemax={99}
            >
              <div className="progress-bar bg-success" />
            </div>
            <div
              className="progress"
              role="progressbar"
              style={{ width: `${probB}%` }}
              aria-valuenow={probB}
              aria-valuemin={1}
              aria-valuemax={99}
            >
              <div className="progress-bar bg-warning" />
            </div>
          </div>

          {/* Callout Sintesi Tattica AI */}
          <div className='mb-3'>
            <div className="d-flex align-items-start gap-2">
              <Quote
                className="flex-shrink-0 mt-1"
                style={{ width: '0.875rem', height: '0.875rem' }}
              />
              <p className="fst-italic mb-0 small lh-base">
                {prediction.analysis}
              </p>
            </div>
          </div>
        </div>
      )}
      <hr />
    </div>
  );
};

export default HeadToHeadAIPredictor;
