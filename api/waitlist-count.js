import { createClient } from '@supabase/supabase-js';

// Intentional public display offset (+100) added only when reading for display
const DISPLAY_OFFSET = 100;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query exact row count from Supabase waitlist table
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error querying waitlist count:', error);
      return res.status(500).json({ error: 'Failed to fetch waitlist count.' });
    }

    // Set cache control for performance
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');

    // Add DISPLAY_OFFSET only at display read time without modifying Supabase rows
    const displayTotal = (count || 0) + DISPLAY_OFFSET;
    return res.status(200).json({ total: displayTotal });
  } catch (err) {
    console.error('Unhandled waitlist count error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}
