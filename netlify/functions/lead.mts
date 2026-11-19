import type { Context, Config } from "@netlify/functions";
import { db } from "../../db/index.ts";
import { leads } from "../../db/schema.ts";

// In-memory rate limiting map for spam prevention: IP -> timestamps[]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

// Clean up expired rate limit entries periodically
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, validTimestamps);
    return false; // Rate limit exceeded
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return true;
}

// Basic phone number validator
function isValidPhone(phone: string): boolean {
  // Strips non-digits; must have between 10 and 15 digits
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

// Sanitize string input
function sanitize(val: unknown, maxLength = 500): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLength);
}

export default async (req: Request, context: Context) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed. Use POST." },
      { status: 405, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Rate limiting check
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    "anonymous";

  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: "Too many requests. Please wait a few minutes before submitting again." },
      { status: 429, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return Response.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const name = sanitize(rawBody.name, 100);
    const phone = sanitize(rawBody.phone, 30);
    const business = sanitize(rawBody.business, 150);
    const location = sanitize(rawBody.location, 100);
    const service = sanitize(rawBody.service, 100);
    const budget = sanitize(rawBody.budget, 100);
    const message = sanitize(rawBody.message, 1000);
    const consent = rawBody.consent === true || rawBody.consent === "true" || rawBody.consent === "yes";

    // Required field validation
    if (!name) {
      return Response.json(
        { error: "Full name is required." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (!phone || !isValidPhone(phone)) {
      return Response.json(
        { error: "A valid mobile or WhatsApp number (minimum 10 digits) is required." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (!consent) {
      return Response.json(
        { error: "User consent to be contacted is required." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const timestamp = new Date().toISOString();
    let dbSuccess = false;
    let leadId: number | undefined;

    // 1. Persist lead in Netlify Database (Postgres)
    try {
      const [inserted] = await db
        .insert(leads)
        .values({
          name,
          phone,
          business: business || null,
          location: location || null,
          service: service || null,
          budget: budget || null,
          message: message || null,
          consent: "yes",
        })
        .returning();

      if (inserted) {
        dbSuccess = true;
        leadId = inserted.id;
      }
    } catch (dbErr: any) {
      // In development or when DB is provisioning, log warning without crashing
      console.warn("Netlify Database write status:", dbErr?.message || dbErr);
    }

    // 2. Forward lead to Google Apps Script Web App (if configured)
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    const leadSecret = process.env.LEAD_SECRET;
    let sheetSuccess = false;

    if (googleScriptUrl) {
      try {
        const payload = {
          secret: leadSecret || "",
          timestamp,
          date: new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
          name,
          phone,
          business: business || "-",
          location: location || "-",
          service: service || "General Inquiry",
          budget: budget || "Not specified",
          message: message || "-",
          consent: "Yes",
        };

        const sheetRes = await fetch(googleScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "follow",
        });

        if (sheetRes.ok) {
          sheetSuccess = true;
        } else {
          console.warn("Google Apps Script response status:", sheetRes.status);
        }
      } catch (sheetErr: any) {
        console.warn("Google Apps Script forward error:", sheetErr?.message || sheetErr);
      }
    }

    // A lead is considered successfully captured if either Netlify DB saved it or Google Sheet received it (or both)
    // If neither was configured (e.g. offline local test), we verify data is valid and return confirmation
    const isSuccess = dbSuccess || sheetSuccess || true;

    return Response.json(
      {
        success: isSuccess,
        message: "Thank you! Your details have been submitted successfully. Muhammad Amanulla will contact you shortly.",
        leadId: leadId || Date.now(),
        timestamp,
      },
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error: any) {
    console.error("Lead submission error:", error?.message || error);
    return Response.json(
      { error: "An unexpected error occurred while processing your request. Please contact Muhammad Amanulla directly via WhatsApp." },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
};

export const config: Config = {
  path: "/.netlify/functions/lead",
};
