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

function normalizeAppState(state: any) {
  if (!state) return state;

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

  if (Array.isArray(state.matches)) {
    for (const match of state.matches) {
      if (match?.id && match?.realResult) {
        state.realResults.matches[match.id] = match.realResult;
      }
    }
  }

  return state;
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

    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single();

    if (error) {
      return jsonResponse(500, {
        error: error.message,
      });
    }

    if (!data) {
      return jsonResponse(404, {
        error: 'No existe app_state con id main',
      });
    }

    const normalizedState = normalizeAppState(data.data);

    return jsonResponse(200, normalizedState);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      error: message,
    });
  }
};