import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, display_name } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const name = display_name || email.split("@")[0];
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // ── Option A: Use Resend API if key is configured ──────────────────────
    if (RESEND_API_KEY) {
      const htmlBody = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to HandyFix</title>
    <style>
      body { margin: 0; padding: 0; background: #0f0f0f; font-family: 'Segoe UI', Arial, sans-serif; }
      .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
      .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; overflow: hidden; }
      .header { background: linear-gradient(135deg, #d4a017, #f5c842); padding: 40px 32px; text-align: center; }
      .header h1 { margin: 0; color: #0f0f0f; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
      .header p { margin: 8px 0 0; color: #0f0f0f; opacity: 0.7; font-size: 14px; }
      .body { padding: 36px 32px; }
      .greeting { color: #f5f5f5; font-size: 20px; font-weight: 700; margin: 0 0 12px; }
      .text { color: #a0a0a0; font-size: 15px; line-height: 1.7; margin: 0 0 24px; }
      .info-box { background: #222; border: 1px solid #333; border-radius: 10px; padding: 16px 20px; margin: 0 0 28px; }
      .info-box p { margin: 4px 0; color: #ccc; font-size: 14px; }
      .info-box span { color: #f5c842; font-weight: 600; }
      .btn { display: inline-block; background: linear-gradient(135deg, #d4a017, #f5c842); color: #0f0f0f !important; font-weight: 800; font-size: 16px; padding: 14px 36px; border-radius: 10px; text-decoration: none; letter-spacing: 0.3px; }
      .btn-wrap { text-align: center; margin: 0 0 32px; }
      .features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 32px; }
      .feature { background: #222; border-radius: 10px; padding: 16px; border: 1px solid #2a2a2a; }
      .feature .icon { font-size: 22px; margin-bottom: 6px; }
      .feature .label { color: #f5f5f5; font-size: 13px; font-weight: 600; margin: 0; }
      .feature .sub { color: #707070; font-size: 12px; margin: 4px 0 0; }
      .footer { border-top: 1px solid #222; padding: 24px 32px; text-align: center; }
      .footer p { margin: 4px 0; color: #555; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">

        <!-- Header -->
        <div class="header">
          <h1>🏠 HandyFix</h1>
          <p>Your Trusted Home Services Marketplace</p>
        </div>

        <!-- Body -->
        <div class="body">
          <p class="greeting">Welcome aboard, ${name}! 🎉</p>
          <p class="text">
            Your HandyFix account has been successfully created. You're now part of India's most trusted home services marketplace — connecting you with verified, skilled professionals in your area.
          </p>

          <!-- Account info -->
          <div class="info-box">
            <p>📧 Email: <span>${email}</span></p>
            <p>🔐 Status: <span>✅ Active</span></p>
            <p>📍 Platform: <span>HandyFix</span></p>
          </div>

          <!-- CTA -->
          <div class="btn-wrap">
            <a href="https://handyfix.in/services" class="btn">Book a Service Now →</a>
          </div>

          <!-- Features -->
          <div class="features">
            <div class="feature">
              <div class="icon">🔧</div>
              <p class="label">10+ Services</p>
              <p class="sub">Plumbing to AC repair</p>
            </div>
            <div class="feature">
              <div class="icon">✅</div>
              <p class="label">Verified Pros</p>
              <p class="sub">Background checked</p>
            </div>
            <div class="feature">
              <div class="icon">📅</div>
              <p class="label">Track Bookings</p>
              <p class="sub">Real-time updates</p>
            </div>
            <div class="feature">
              <div class="icon">⭐</div>
              <p class="label">Rate & Review</p>
              <p class="sub">After every service</p>
            </div>
          </div>

          <p class="text" style="margin: 0;">
            Need help? Just reply to this email or visit our <a href="https://handyfix.in/contact" style="color: #f5c842;">Help Center</a>.
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>© 2026 HandyFix. All rights reserved.</p>
          <p>Made with ❤️ in India</p>
          <p style="margin-top: 10px;">
            <a href="https://handyfix.in/contact" style="color: #555; text-decoration: none;">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
      `.trim();

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HandyFix <onboarding@resend.dev>",
          to: [email],
          subject: `Welcome to HandyFix, ${name}! 🏠`,
          html: htmlBody,
        }),
      });

      const resendData = await resendRes.json();

      if (!resendRes.ok) {
        console.error("Resend error:", resendData);
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: resendData }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, id: resendData.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Option B: No Resend key — log and return success (Supabase SMTP handles it) ──
    console.log(`[send-welcome-email] No RESEND_API_KEY set. Skipping for: ${email}`);
    return new Response(
      JSON.stringify({ success: true, message: "No email provider configured — skipped." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[send-welcome-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
