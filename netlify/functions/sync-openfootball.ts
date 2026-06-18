import type { HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function jsonResponse(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/\./g, '')
    .trim();
}

function getCodeFromOpenFootballName(name: string): string {
  const n = normalizeName(name);

  const map: Record<string, string> = {
    mexico: 'MEX',
    'south africa': 'RSA',
    'korea republic': 'KOR',
    'south korea': 'KOR',
    czechia: 'CZE',
    'czech republic': 'CZE',

    canada: 'CAN',
    'bosnia and herzegovina': 'BIH',
    bosnia: 'BIH',
    qatar: 'QAT',
    switzerland: 'SUI',

    brazil: 'BRA',
    morocco: 'MAR',
    haiti: 'HAI',
    scotland: 'SCO',

    'united states': 'USA',
    usa: 'USA',
    paraguay: 'PAR',
    australia: 'AUS',
    turkey: 'TUR',
    turkiye: 'TUR',

    germany: 'GER',
    curacao: 'CUW',
    'cote divoire': 'CIV',
    'ivory coast': 'CIV',
    ecuador: 'ECU',

    netherlands: 'NED',
    japan: 'JPN',
    sweden: 'SWE',
    tunisia: 'TUN',

    belgium: 'BEL',
    egypt: 'EGY',
    iran: 'IRN',
    'new zealand': 'NZL',

    spain: 'ESP',
    'cape verde': 'CPV',
    'saudi arabia': 'KSA',
    uruguay: 'URU',

    france: 'FRA',
    senegal: 'SEN',
    iraq: 'IRQ',
    norway: 'NOR',

    argentina: 'ARG',
    algeria: 'ALG',
    austria: 'AUT',
    jordan: 'JOR',

    portugal: 'POR',
    'dr congo': 'CGO',
    'congo dr': 'CGO',
    'democratic republic of congo': 'CGO',
    'congo': 'CGO',
    uzbekistan: 'UZB',
    colombia: 'COL',

    england: 'ENG',
    croatia: 'CRO',
    ghana: 'GHA',
    panama: 'PAN',
  };

  return map[n] || '';
}

function ensureRealResults(state: any) {
  if (!state.realResults) {
    state.realResults = {
      ganadorFinal: '',
      maxGoleador: '',
      maxAsistente: '',
      mvp: '',
      faseEspana: '',
      matches: {},
    };
  }

  if (!state.realResults.matches) {
    state.realResults.matches = {};
  }
}

function applyResultToState(state: any, code1: string, code2: string, result: string): boolean {
  if (!Array.isArray(state.matches)) return false;

  const match = state.matches.find((m: any) => {
    const direct = m.team1 === code1 && m.team2 === code2;
    const inverse = m.team1 === code2 && m.team2 === code1;
    return direct || inverse;
  });

  if (!match) return false;

  const finalResult =
    match.team1 === code1 && match.team2 === code2
      ? result
      : result.split('-').reverse().join('-');

  match.realResult = finalResult;
  state.realResults.matches[match.id] = finalResult;

  return true;
}

export const handler = async (): Promise<HandlerResponse> => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return jsonResponse(500, {
        error: 'Faltan variables SUPABASE_URL o SUPABASE_SECRET_KEY',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      realtime: {
        transport: ws as any,
      },
    });

    const { data: appRow, error: appError } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single();

    if (appError) {
      return jsonResponse(500, {
        error: appError.message,
      });
    }

    if (!appRow?.data) {
      return jsonResponse(404, {
        error: 'No existe app_state con id main',
      });
    }

    const state = appRow.data;
    ensureRealResults(state);

    const response = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      {
        headers: {
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!response.ok) {
      return jsonResponse(500, {
        error: `No se pudo consultar OpenFootball. HTTP ${response.status}`,
      });
    }

    const openFootballData = await response.json();

    if (!openFootballData || !Array.isArray(openFootballData.matches)) {
      return jsonResponse(500, {
        error: 'OpenFootball no devolvió un formato válido',
      });
    }

    let updatedCount = 0;
    const updatedMatches: Array<{
      id?: string;
      team1: string;
      team2: string;
      result: string;
    }> = [];

    for (const match of openFootballData.matches) {
      const code1 = getCodeFromOpenFootballName(match.team1);
      const code2 = getCodeFromOpenFootballName(match.team2);

      if (!code1 || !code2) continue;

      const ft = match.score?.ft;

      if (!Array.isArray(ft) || ft.length !== 2) continue;

      const result = `${ft[0]}-${ft[1]}`;

      const applied = applyResultToState(state, code1, code2, result);

      if (applied) {
        updatedCount += 1;
        updatedMatches.push({
          team1: code1,
          team2: code2,
          result,
        });
      }
    }

    const { error: saveError } = await supabase
      .from('app_state')
      .upsert({
        id: 'main',
        data: state,
        updated_at: new Date().toISOString(),
      });

    if (saveError) {
      return jsonResponse(500, {
        error: saveError.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      updatedCount,
      updatedMatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      error: message,
    });
  }
};