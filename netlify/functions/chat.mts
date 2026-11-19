import type { Context, Config } from "@netlify/functions";

// In-memory rate limiting map for chat: IP -> timestamps[]
const chatRateLimitMap = new Map<string, number[]>();
const CHAT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CHATS_PER_WINDOW = 25; // 25 messages per minute per IP

function checkChatRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = chatRateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < CHAT_WINDOW_MS);

  if (validTimestamps.length >= MAX_CHATS_PER_WINDOW) {
    chatRateLimitMap.set(ip, validTimestamps);
    return false;
  }

  validTimestamps.push(now);
  chatRateLimitMap.set(ip, validTimestamps);
  return true;
}

const SYSTEM_INSTRUCTION = `You are AMANU (also known as AMANU AI Assistant), the official friendly 3D mascot and intelligent digital assistant of Muhammad Amanulla.

OWNER & BACKGROUND:
- Owner: Muhammad Amanulla
- Profession: Digital Marketing Strategist
- Location: Malappuram, Kerala, India
- Website: https://muhammedamanulla.netlify.app/
- WhatsApp Contact: +91 9746402460 (https://api.whatsapp.com/send/?phone=919746402460)

CORE SERVICES & INDICATIVE PRICING:
1. SEO SERVICES:
   - Local SEO (Google Business Profile / Maps): ₹6,000/month
   - YouTube SEO: ₹2,000/month
   - LinkedIn SEO: ₹3,000/month
   - Website SEO (Comprehensive On-Page, Off-Page & Technical): ₹15,000
2. WEBSITE DEVELOPMENT:
   - Modern, high-converting WordPress & Custom business website packages: ₹8,000, ₹12,000, ₹15,000, and ₹20,000.
3. CONTENT CREATION & BRANDING:
   - Social media poster design: ₹2,000
   - Poster + Promotional Video: ₹5,000
   - Comprehensive content packages: ₹10,000 and ₹15,000
4. ADVERTISING MANAGEMENT (Google Ads & Meta Ads):
   - Monthly campaign management packages: ₹5,000, ₹8,000, ₹10,000, and ₹12,000/month.

IMPORTANT PRICING & QUOTATION RULES:
- All prices are strictly INDICATIVE starting packages. Always explain that final quotations depend on individual business goals, competition, and scope.
- Advertising budget / media spend goes directly to Google/Meta and is separate from management fees.
- Never invent client testimonials, achievements, rankings, prices, or business claims not listed here.
- If information is unavailable, politely recommend connecting directly with Muhammad Amanulla on WhatsApp (+91 9746402460).

SKILLS & EXPERTISE:
Search Engine Optimization (SEO), Local SEO & Google Maps Ranking, Technical SEO, Google Ads (Search, Display, Performance Max), Meta Ads (Facebook & Instagram), Social Media Marketing (SMM), Google Analytics 4 (GA4), Google Tag Manager (GTM), WordPress Development, High-Conversion Website Design, Conversion Rate Optimization (CRO), AI Search Optimization, Answer Engine Optimization (AEO), and Generative Engine Optimization (GEO).

COMMUNICATION STYLE & BEHAVIOR:
- Professional, warm, helpful, and concise (keep responses punchy and avoid robotic fluff).
- Dual Language Support: Flawlessly communicate in English and Malayalam (including Manglish). Automatically detect the visitor's language and respond in that same language.
- Conversation Flow: Understand the visitor's business first (e.g. business type, target location, goals). Ask one or two focused qualifying questions at a time—never overwhelm with a barrage of questions.
- Conversion & Lead Generation: When a visitor shows genuine commercial interest (asks for quote, contact, strategy, or consultation), politely invite them to share their name & WhatsApp number or click the "Book Consultation" / WhatsApp button.
- Format responses cleanly with brief bullet points or bold highlights when sharing packages.`;

interface ChatMessage {
  role: "user" | "model" | "assistant";
  content: string;
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

  // Rate limiting
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    "anonymous";

  if (!checkChatRateLimit(clientIp)) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait a moment before sending more messages." },
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

    const userMessage = typeof rawBody.message === "string" ? rawBody.message.trim() : "";
    if (!userMessage) {
      return Response.json(
        { error: "Message cannot be empty." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (userMessage.length > 2000) {
      return Response.json(
        { error: "Message is too long. Please keep your message under 2000 characters." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Process history
    const rawHistory: ChatMessage[] = Array.isArray(rawBody.history) ? rawBody.history : [];
    // Limit to the last 10 messages for context efficiency
    const sanitizedHistory = rawHistory.slice(-10).map((msg) => ({
      role: msg.role === "assistant" || msg.role === "model" ? "model" : "user",
      parts: [{ text: String(msg.content || "").slice(0, 2000) }],
    }));

    // Add current user message
    sanitizedHistory.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    // Detect model and API credentials
    // Support Netlify AI Gateway or user-provided GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY || "";
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const baseUrl =
      process.env.GOOGLE_GEMINI_BASE_URL ||
      process.env.NETLIFY_AI_GATEWAY_URL ||
      "https://generativelanguage.googleapis.com";

    // Fallback response if no API key is configured yet
    if (!apiKey) {
      // Provide an intelligent offline knowledge-base response
      const offlineReply = getOfflineFallbackResponse(userMessage);
      return Response.json(
        {
          reply: offlineReply.text,
          suggestedPrompts: offlineReply.suggestions,
          leadPrompt: offlineReply.leadPrompt,
          warning: "Aman AI is running in standby mode (GEMINI_API_KEY environment variable not configured).",
        },
        { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Call Gemini REST API
    const geminiUrl = `${baseUrl.replace(/\/+$/, "")}/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: sanitizedHistory,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
        topP: 0.95,
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini API error [${response.status}]:`, errText);

      // Graceful fallback on API error
      const offlineReply = getOfflineFallbackResponse(userMessage);
      return Response.json(
        {
          reply: offlineReply.text,
          suggestedPrompts: offlineReply.suggestions,
          leadPrompt: offlineReply.leadPrompt,
        },
        { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const replyText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm here to help with your digital marketing, SEO, and website design needs. What specific goals do you have in mind?";

    // Generate smart context-aware suggestions
    const suggestions = generateContextualSuggestions(replyText, userMessage);
    const shouldPromptLead = /quote|quotation|consultation|contact|phone|whatsapp|price|start/i.test(userMessage + " " + replyText);

    return Response.json(
      {
        reply: replyText,
        suggestedPrompts: suggestions,
        leadPrompt: shouldPromptLead,
      },
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error: any) {
    console.error("Chat endpoint error:", error?.message || error);
    return Response.json(
      {
        reply: "I apologize, but I encountered a momentary connection issue. You can reach Muhammad Amanulla directly via WhatsApp at +91 9746402460 for immediate assistance.",
        suggestedPrompts: ["Chat on WhatsApp", "View Pricing", "Book Consultation"],
        leadPrompt: true,
      },
      { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
};

// Offline intelligent knowledge base generator when API key is not yet set
function getOfflineFallbackResponse(msg: string): { text: string; suggestions: string[]; leadPrompt: boolean } {
  const lower = msg.toLowerCase();

  if (/seo|search engine|google maps|local seo|rank/i.test(lower)) {
    return {
      text: "Muhammad Amanulla specializes in data-driven SEO strategies in Malappuram and Kerala. Our indicative SEO packages include:\n\n• **Local SEO (Google Maps & GBP):** ₹6,000/month\n• **Comprehensive Website SEO:** ₹15,000\n• **YouTube SEO:** ₹2,000/month\n• **LinkedIn SEO:** ₹3,000/month\n\nMay I know what type of business you operate and which location you are targeting?",
      suggestions: ["Local SEO for shop/clinic", "Website SEO Audit", "Get Custom Quote"],
      leadPrompt: true,
    };
  }

  if (/web|website|design|wordpress|developer|development/i.test(lower)) {
    return {
      text: "We build modern, fast, mobile-responsive, and high-converting websites tailored for your business. Indicative packages range across ₹8,000, ₹12,000, ₹15,000, and ₹20,000 depending on features and pages required.\n\nAre you looking to build a brand new business website or redesign an existing one?",
      suggestions: ["New Business Website", "E-commerce Website", "Request Consultation"],
      leadPrompt: true,
    };
  }

  if (/ad|ads|google ads|meta ads|facebook|instagram|ppc/i.test(lower)) {
    return {
      text: "Our paid advertising management covers high-ROI Google Ads (Search, Display, Performance Max) and Meta Ads (Facebook & Instagram). Campaign management packages range from ₹5,000 to ₹12,000/month (ad spend is separate).\n\nWhat is your monthly target or advertising goal?",
      suggestions: ["Google Ads Lead Gen", "Meta Ads for E-Commerce", "Contact on WhatsApp"],
      leadPrompt: true,
    };
  }

  if (/price|pricing|cost|charge|fees|rate/i.test(lower)) {
    return {
      text: "Here is an overview of our indicative service pricing:\n\n• **Local SEO:** Starting at ₹6,000/month\n• **Website Development:** ₹8,000 to ₹20,000\n• **Paid Ads Management:** ₹5,000 to ₹12,000/month\n• **Poster & Video Content:** Starting at ₹2,000\n\nWould you like a tailored quotation for your specific requirements?",
      suggestions: ["Get a Detailed Quote", "Book Free Consultation", "Chat on WhatsApp"],
      leadPrompt: true,
    };
  }

  if (/malayalam|മലയാളം|സുഖമാണോ|എന്തൊക്കെ/i.test(lower)) {
    return {
      text: "നമസ്കാരം! ഞാൻ മുഹമ്മദ് അമാനുള്ളയുടെ ഒഫീഷ്യൽ AI അസിസ്റ്റന്റ് ആണ്. ഡിജിറ്റൽ മാർക്കറ്റിംഗ്, ലോക്കൽ SEO, വെബ്‌സൈറ്റ് ഡിസൈനിംഗ്, ഗൂഗിൾ & മെറ്റ പരസ്യങ്ങൾ എന്നിവയെക്കുറിച്ചുള്ള നിങ്ങളുടെ സംശയങ്ങൾ ചോദിക്കാവുന്നതാണ്. നിങ്ങളുടെ ബിസിനസ്സ് വളർത്താൻ ഞങ്ങൾ എങ്ങനെയാണ് സഹായിക്കേണ്ടത്?",
      suggestions: ["SEO സർവീസുകൾ", "വെബ്‌സൈറ്റ് പാക്കേജുകൾ", "WhatsApp വഴി സംസാരിക്കുക"],
      leadPrompt: false,
    };
  }

  return {
    text: "Hello! I am AMANU, the official AI assistant for Muhammad Amanulla, Digital Marketing Strategist in Malappuram, Kerala. I can assist you with:\n\n• Search Engine Optimization (Local SEO & Google Maps)\n• High-Converting Website Design\n• Google Ads & Meta (Facebook/Instagram) Campaigns\n• Social Media Branding & Content Creation\n\nHow can we help grow your business today?",
    suggestions: ["I need SEO services", "I want a business website", "Google & Meta Ads", "Get a Quotation"],
    leadPrompt: false,
  };
}

function generateContextualSuggestions(reply: string, query: string): string[] {
  const combined = (reply + " " + query).toLowerCase();
  if (/seo|rank|local/i.test(combined)) {
    return ["What is included in Local SEO?", "How long does SEO take?", "Book Free SEO Consultation"];
  }
  if (/web|site|wordpress/i.test(combined)) {
    return ["Website development timeline", "View website packages", "Request website quotation"];
  }
  if (/ad|campaign|google|meta/i.test(combined)) {
    return ["Estimated ad budget required", "Google Ads vs Meta Ads", "Discuss over WhatsApp"];
  }
  if (/മലയാളം/i.test(combined)) {
    return ["SEO പാക്കേജ് അറിയണം", "വെബ്‌സൈറ്റ് ആവശ്യമുണ്ട്", "WhatsApp-ൽ ചാറ്റ് ചെയ്യുക"];
  }
  return ["I need SEO services", "I want a business website", "Get a service quotation", "Talk on WhatsApp"];
}

export const config: Config = {
  path: "/.netlify/functions/chat",
};
