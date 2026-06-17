import { Participant, AppState } from './types';

// Constants for points
export const POINTS = {
  GANADOR_FINAL: 10,
  MAX_GOLEADOR: 8,
  MAX_ASISTENTE: 7,
  MVP: 6,
  FASE_ESPANA: 4,
  EXACT_MATCH: 3,
  CORRECT_OUTCOME: 1,
};

function getOutcome(score: string): 'home' | 'away' | 'draw' | null {
  if (!score || !score.includes('-')) return null;
  const parts = score.split('-');
  if (parts.length !== 2) return null;
  const home = parseInt(parts[0].trim(), 10);
  const away = parseInt(parts[1].trim(), 10);
  
  if (isNaN(home) || isNaN(away)) return null;
  
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

function normalizeString(str: string): string {
  return str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function calculatePointsForParticipant(
  participant: Participant,
  realResults: AppState['realResults']
): Participant['points'] {
  const points: Participant['points'] = {
    total: 0,
    ganadorFinal: 0,
    maxGoleador: 0,
    maxAsistente: 0,
    mvp: 0,
    faseEspana: 0,
    matches: {},
  };

  // Compare Ganador Final
  if (realResults.ganadorFinal && normalizeString(participant.predictions.ganadorFinal) === normalizeString(realResults.ganadorFinal)) {
    points.ganadorFinal = POINTS.GANADOR_FINAL;
  }
  
  // Compare Max Goleador
  if (realResults.maxGoleador && normalizeString(participant.predictions.maxGoleador) === normalizeString(realResults.maxGoleador)) {
    points.maxGoleador = POINTS.MAX_GOLEADOR;
  }

  // Compare Max Asistente
  if (realResults.maxAsistente && normalizeString(participant.predictions.maxAsistente) === normalizeString(realResults.maxAsistente)) {
    points.maxAsistente = POINTS.MAX_ASISTENTE;
  }

  // Compare MVP
  if (realResults.mvp && normalizeString(participant.predictions.mvp) === normalizeString(realResults.mvp)) {
    points.mvp = POINTS.MVP;
  }

  // Compare Fase España
  if (realResults.faseEspana && normalizeString(participant.predictions.faseEspana) === normalizeString(realResults.faseEspana)) {
    points.faseEspana = POINTS.FASE_ESPANA;
  }

  // Matches
  for (const [matchId, predictedScore] of Object.entries(participant.predictions.matches)) {
    const realScore = realResults.matches[matchId];
    points.matches[matchId] = 0; // Default

    if (realScore && predictedScore) {
      // 1. Exact match
      if (predictedScore.trim() === realScore.trim()) {
        points.matches[matchId] = POINTS.EXACT_MATCH;
      } 
      // 2. Correct outcome
      else {
        const predictedOutcome = getOutcome(predictedScore);
        const realOutcome = getOutcome(realScore);
        if (predictedOutcome && realOutcome && predictedOutcome === realOutcome) {
          points.matches[matchId] = POINTS.CORRECT_OUTCOME;
        }
      }
    }
  }

  // Calculate Total
  points.total = 
    points.ganadorFinal +
    points.maxGoleador +
    points.maxAsistente +
    points.mvp +
    points.faseEspana +
    Object.values(points.matches).reduce((acc, curr) => acc + curr, 0);

  return points;
}
