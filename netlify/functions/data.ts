import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export const handler: Handler = async () => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Faltan variables SUPABASE_URL o SUPABASE_SECRET_KEY',
        }),
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single();

    if (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.data),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }
};