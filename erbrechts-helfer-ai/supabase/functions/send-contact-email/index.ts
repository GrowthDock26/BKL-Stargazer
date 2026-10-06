import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactEmailRequest {
  firstName: string;
  lastName: string;
  email: string;
  question?: string;
  trigger?: string;
}

// Security: Input validation and sanitization
const validateAndSanitize = (data: ContactEmailRequest) => {
  if (!data.firstName || !data.lastName || !data.email) {
    throw new Error("Alle Felder sind erforderlich");
  }
  if (data.firstName.length > 100 || data.lastName.length > 100) {
    throw new Error("Name zu lang (max. 100 Zeichen)");
  }
  if (data.email.length > 255) {
    throw new Error("E-Mail zu lang (max. 255 Zeichen)");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    throw new Error("Ungültige E-Mail-Adresse");
  }
  if (data.question && data.question.length > 5000) {
    throw new Error("Frage zu lang (max. 5000 Zeichen)");
  }
  if (data.trigger && data.trigger.length > 200) {
    throw new Error("Trigger zu lang");
  }

  const sanitize = (str: string) => str
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');

  return {
    firstName: sanitize(data.firstName),
    lastName: sanitize(data.lastName),
    email: sanitize(data.email).toLowerCase(),
    question: data.question ? sanitize(data.question) : undefined,
    trigger: data.trigger ? sanitize(data.trigger) : undefined,
  };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawData: ContactEmailRequest = await req.json();
    const { firstName, lastName, email, question, trigger } = validateAndSanitize(rawData);

    console.log(`Processing contact request${trigger ? ` (human-gate: ${trigger})` : ''}`);

    const isHumanGate = !!question;
    const subject = isHumanGate
      ? `🚨 Anwalts-Anfrage (Human-Gate: ${trigger}) – ${firstName} ${lastName}`
      : `Kontaktanfrage von ${firstName} ${lastName}`;

    const html = isHumanGate
      ? `
          <h2>🚨 Anwalts-Anfrage über Human-Gate</h2>
          <p>Ein Nutzer hat eine Frage gestellt, die durch das <strong>Human-Gate</strong> der KI als rechtlich besonders kritisch eingestuft und nicht automatisiert beantwortet wurde.</p>
          <hr>
          <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
          <p><strong>E-Mail:</strong> ${escapeHtml(email)}</p>
          <p><strong>Trigger-Stichwort:</strong> <code>${escapeHtml(trigger || '')}</code></p>
          <p><strong>Ursprüngliche Frage des Nutzers:</strong></p>
          <blockquote style="border-left:4px solid #c00;padding:8px 12px;background:#fafafa;white-space:pre-wrap;">${escapeHtml(question || '')}</blockquote>
          <p>Bitte zeitnah persönlich beantworten – der Nutzer erwartet eine Rückmeldung von einem Anwalt.</p>
          <br>
          <p style="color:#888;font-size:12px;">Automatisch versendet von erbrecht.chat</p>
        `
      : `
          <h2>Neue Kontaktanfrage</h2>
          <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
          <p><strong>E-Mail:</strong> ${escapeHtml(email)}</p>
          <p><strong>Nachricht:</strong> Der Benutzer hat Interesse an einer konkreten Rechtsberatung geäußert.</p>
          <br>
          <p>Diese Anfrage wurde über die Erbrecht-KI-Anwendung gesendet.</p>
        `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Erbrecht Beratung <onboarding@resend.dev>",
        to: ["schmidt-vollmer@bkl-law.de"],
        reply_to: email,
        subject,
        html,
      }),
    });

    const responseData = await emailResponse.json();

    if (!emailResponse.ok) {
      // Security: Log without exposing sensitive details
      console.error("Email sending failed", { status: emailResponse.status });
      throw new Error("Fehler beim E-Mail-Versand");
    }

    console.log("Email sent successfully");

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    // Security: Log error without exposing sensitive information
    console.error("Contact email error:", error.message);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Ein Fehler ist aufgetreten" 
      }),
      {
        status: error.message.includes("erforderlich") || 
                error.message.includes("Ungültige") || 
                error.message.includes("zu lang") ? 400 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
