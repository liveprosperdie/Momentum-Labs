import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// IP-based Rate Limiter (Max 3 submissions per IP per hour)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const MAX_REQUESTS_PER_WINDOW = 3;
const ipRequestHistory = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = ipRequestHistory.get(ip) || [];

  // Filter out timestamps older than the 1-hour window
  const activeTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (activeTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRequestHistory.set(ip, activeTimestamps);
    return true;
  }

  activeTimestamps.push(now);
  ipRequestHistory.set(ip, activeTimestamps);

  // Periodic memory cleanup: delete IPs with no active timestamps
  if (ipRequestHistory.size > 5000) {
    for (const [key, tsList] of ipRequestHistory.entries()) {
      if (tsList.every(ts => now - ts >= RATE_LIMIT_WINDOW_MS)) {
        ipRequestHistory.delete(key);
      }
    }
  }

  return false;
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    // Vercel / reverse proxy header: first IP is client IP
    return forwardedFor.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. IP Rate Limiting Enforcement
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests, please try again later.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const rawEmail = body?.email;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'Please enter an email address.' });
    }

    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email address must not exceed 254 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration in environment.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Check for existing signup (Duplicate Prevention -> 409 Conflict)
    const { data: existingUser, error: checkError } = await supabase
      .from('waitlist')
      .select('id, created_at')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing waitlist record:', checkError);
      return res.status(500).json({ error: 'Failed to verify waitlist status.' });
    }

    if (existingUser) {
      return res.status(409).json({ error: "You're already on the waitlist." });
    }

    // 3. Insert new row into Supabase waitlist (Raw accurate record)
    const { data: newEntry, error: insertError } = await supabase
      .from('waitlist')
      .insert([{ email }])
      .select()
      .single();

    if (insertError || !newEntry) {
      console.error('Error inserting waitlist record:', insertError);
      return res.status(500).json({ error: 'Unable to join waitlist. Please try again.' });
    }

    // 4. Send generic confirmation email via Resend (No position number shown to user)
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: 'Momentum Labs <hello@momentumlabs.co.in>',
          to: [email],
          subject: "You're on the Akira waitlist",
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akira Waitlist</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf7f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1c1917;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf7f2; padding: 48px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 20px; border: 1px solid rgba(180, 140, 120, 0.18); padding: 40px 36px; box-shadow: 0 4px 24px rgba(80, 50, 30, 0.04);">
          <tr>
            <td style="padding-bottom: 24px;">
              <span style="font-size: 11.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #786c62;">MOMENTUM LABS</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 8px;">
              <h1 style="font-size: 28px; font-weight: 500; letter-spacing: -0.02em; color: #1c1917; margin: 0; line-height: 1.2;">You're on the waitlist.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 28px;">
              <p style="font-size: 15px; color: #57534e; line-height: 1.6; margin: 0;">Thank you for your interest in Akira. We're rolling out private access in small weekly batches and will email you directly with your download credentials when your spot opens.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 20px; border-top: 1px solid rgba(180, 140, 120, 0.14);">
              <p style="font-size: 13px; color: #a8a29e; margin: 0;">Momentum Labs &bull; Personal AI Runtime</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
          text: `You're on the Akira waitlist.\n\nThank you for your interest in Akira. We're rolling out private access in small weekly batches and will email you directly with your credentials when your spot opens.\n\n— Momentum Labs`
        });
      } catch (emailErr) {
        console.error('Resend email error (non-fatal):', emailErr);
      }
    }

    // Return generic confirmation message without exposing position number
    return res.status(200).json({
      success: true,
      message: "You're on the list — we'll email you when it's your turn."
    });
  } catch (err) {
    console.error('Unhandled waitlist signup error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
