import { createClient } from '@supabase/supabase-js';

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

    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error querying waitlist count:', error);
      return res.status(500).json({ error: 'Failed to fetch waitlist count.' });
    }

    // Set cache control for performance
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
    return res.status(200).json({ total: count || 0 });
  } catch (err) {
    console.error('Unhandled waitlist count error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}
