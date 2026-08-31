import { Resend } from 'resend';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
      }
    }

    const rawName = body?.name;
    const rawEmail = body?.email;
    const rawMessage = body?.message;

    // Validate Name
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    const name = rawName.trim();
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must not exceed 100 characters.' });
    }

    // Validate Email
    if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.trim()) {
      return res.status(400).json({ error: 'Please enter your email address.' });
    }
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email address must not exceed 254 characters.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Validate Message
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return res.status(400).json({ error: 'Please enter your message.' });
    }
    const message = rawMessage.trim();
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message must not exceed 5000 characters.' });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY in environment.');
      return res.status(500).json({ error: 'Server configuration error. Please try again later.' });
    }

    const resend = new Resend(resendApiKey);

    // Escape HTML in user input before embedding into notification email
    const sanitizeHtml = (str) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const safeName = sanitizeHtml(name);
    const safeEmail = sanitizeHtml(email);
    const safeMessage = sanitizeHtml(message).replace(/\n/g, '<br>');

    // Send contact notification to team
    await resend.emails.send({
      from: 'Momentum Labs Contact <hello@momentumlabs.co.in>',
      to: ['founder@momentumlabs.co.in', 'hello@momentumlabs.co.in'],
      reply_to: email,
      subject: `New Message from ${name} (momentumlabs.co.in)`,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Contact Message</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf7f2; color: #1c1917;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid rgba(0,0,0,0.08); padding: 32px;">
    <tr>
      <td>
        <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #78716c;">MOMENTUM LABS CONTACT FORM</span>
        <h2 style="font-size: 22px; font-weight: 600; margin: 8px 0 20px 0; color: #1c1917;">New message from ${safeName}</h2>
        <div style="background: #f7f5f2; border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 14px;">
          <p style="margin: 0 0 8px 0;"><strong>Sender Name:</strong> ${safeName}</p>
          <p style="margin: 0;"><strong>Sender Email:</strong> <a href="mailto:${safeEmail}" style="color: #1c1917;">${safeEmail}</a></p>
        </div>
        <div style="font-size: 15px; line-height: 1.6; color: #292524; padding: 16px 0; border-top: 1px solid rgba(0,0,0,0.06); border-bottom: 1px solid rgba(0,0,0,0.06);">
          <strong style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #78716c; margin-bottom: 8px;">Message:</strong>
          ${safeMessage}
        </div>
        <p style="font-size: 12px; color: #a8a29e; margin-top: 24px;">Sent from momentumlabs.co.in contact form &bull; Reply directly to this email to respond to ${safeName}.</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
      text: `New message from ${name} (${email}):\n\n${message}\n\n— Sent from momentumlabs.co.in`
    });

    return res.status(200).json({
      success: true,
      message: "Thank you for reaching out. We've received your message and will be in touch shortly."
    });
  } catch (err) {
    console.error('Unhandled contact submission error:', err);
    return res.status(500).json({ error: 'Failed to send your message. Please try again or email us directly at hello@momentumlabs.co.in.' });
  }
}
