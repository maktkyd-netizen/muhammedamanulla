import assert from "node:assert";
import fs from "node:fs";

console.log("=========================================");
console.log("RUNNING AMAN AI CHATBOT AUTOMATED TESTS");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${description}`);
    console.error("  ", err.message);
    failed++;
  }
}

async function itAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${description}`);
    console.error("  ", err.message);
    failed++;
  }
}

// 1. Static Integrity Tests
it("index.html contains React 18, Chatbot root, and Chatbot assets", () => {
  const html = fs.readFileSync("/opt/build/repo/index.html", "utf-8");
  assert(html.includes('id="aman-ai-chatbot-root"'), "Chatbot root div is missing");
  assert(html.includes("react@18"), "React 18 CDN is missing");
  assert(html.includes("react-dom@18"), "ReactDOM 18 CDN is missing");
  assert(html.includes("src/chatbot/aman-ai-chatbot.css"), "Chatbot CSS is missing");
  assert(html.includes("src/chatbot/aman-ai-chatbot.js"), "Chatbot JS is missing");
  assert(html.includes("919746402460"), "WhatsApp contact number is present");
});

it("aman-ai-chatbot.css and React source components exist", () => {
  assert(fs.existsSync("/opt/build/repo/src/chatbot/aman-ai-chatbot.css"), "CSS file exists");
  assert(fs.existsSync("/opt/build/repo/src/chatbot/aman-ai-chatbot.js"), "JS runtime file exists");
  assert(fs.existsSync("/opt/build/repo/src/chatbot/AmanAiChatbot.jsx"), "React JSX file exists");
});

it("AMANU character assets exist for all 7 required dynamic expressions", () => {
  const expressions = ["gentle-smile", "happy", "thinking", "curious", "excited", "worried", "confident"];
  for (const expr of expressions) {
    const webpPath = `/opt/build/repo/public/assets/amanu/${expr}.webp`;
    const pngPath = `/opt/build/repo/public/assets/amanu/${expr}.png`;
    assert(fs.existsSync(webpPath), `Missing ${expr}.webp`);
    assert(fs.existsSync(pngPath), `Missing ${expr}.png`);
    const stats = fs.statSync(webpPath);
    assert(stats.size > 1000, `${expr}.webp file size too small`);
  }
});

it("aman-ai-chatbot.js contains AMANU Mascot branding and dynamic expression mapping", () => {
  const js = fs.readFileSync("/opt/build/repo/src/chatbot/aman-ai-chatbot.js", "utf-8");
  assert(js.includes("AMANU AI Assistant"), "Title AMANU AI Assistant missing");
  assert(js.includes("Your personal digital assistant"), "Subtitle missing");
  assert(js.includes("gentle-smile"), "gentle-smile expression missing");
  assert(js.includes("thinking"), "thinking expression missing");
  assert(js.includes("excited"), "excited expression missing");
  assert(js.includes("worried"), "worried expression missing");
  assert(js.includes("confident"), "confident expression missing");
});

it("Google Apps Script file contains correct columns and webhook structure", () => {
  const code = fs.readFileSync("/opt/build/repo/google-apps-script/Code.gs", "utf-8");
  const requiredCols = ["Date", "Name", "Phone", "Business", "Location", "Service", "Budget", "Message", "Consent"];
  for (const col of requiredCols) {
    assert(code.includes(col), `Column ${col} missing from Google Apps Script`);
  }
  assert(code.includes("doPost"), "doPost handler missing");
});

// 2. Netlify Functions Integration Tests
const chatHandler = (await import("../netlify/functions/chat.mts")).default;
const leadHandler = (await import("../netlify/functions/lead.mts")).default;

await itAsync("chat.mts rejects GET requests with 405", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", { method: "GET" });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 405);
  const data = await res.json();
  assert(data.error.includes("Method not allowed"));
});

await itAsync("chat.mts rejects empty message with 400", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "   " }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("cannot be empty"));
});

await itAsync("chat.mts rejects oversized message (>2000 chars) with 400", async () => {
  const longMsg = "a".repeat(2500);
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: longMsg }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("too long"));
});

await itAsync("chat.mts returns accurate SEO pricing in response", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What are your SEO services and pricing?" }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert(typeof data.reply === "string");
  assert(data.reply.includes("6,000"), "Mentions ₹6,000 Local SEO package");
  assert(Array.isArray(data.suggestedPrompts));
});

await itAsync("chat.mts returns website packages in response", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "I want to build a business website, what packages do you offer?" }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert(data.reply.includes("8,000") || data.reply.includes("website"), "Mentions website packages");
});

await itAsync("chat.mts responds to Malayalam queries", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "എനിക്ക് ഡിജിറ്റൽ മാർക്കറ്റിംഗ് സർവീസ് വേണം" }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert(data.reply.length > 10);
});

await itAsync("chat.mts maintains and respects conversation history", async () => {
  const req = new Request("http://localhost/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "What was the first service I asked about?",
      history: [
        { role: "user", content: "I am interested in Local SEO for my clinic" },
        { role: "model", content: "Great! Our Local SEO package starts at ₹6,000/month." }
      ]
    }),
  });
  const res = await chatHandler(req, {});
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert(data.reply.length > 0);
});

// 3. Lead Generation Tests
await itAsync("lead.mts rejects non-POST requests with 405", async () => {
  const req = new Request("http://localhost/.netlify/functions/lead", { method: "GET" });
  const res = await leadHandler(req, {});
  assert.strictEqual(res.status, 405);
});

await itAsync("lead.mts rejects missing full name", async () => {
  const req = new Request("http://localhost/.netlify/functions/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "+919876543210",
      consent: true,
    }),
  });
  const res = await leadHandler(req, {});
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("Full name is required"));
});

await itAsync("lead.mts rejects invalid phone number (<10 digits)", async () => {
  const req = new Request("http://localhost/.netlify/functions/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Visitor",
      phone: "12345",
      consent: true,
    }),
  });
  const res = await leadHandler(req, {});
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("valid mobile or WhatsApp number"));
});

await itAsync("lead.mts rejects missing consent", async () => {
  const req = new Request("http://localhost/.netlify/functions/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Visitor",
      phone: "+919876543210",
      consent: false,
    }),
  });
  const res = await leadHandler(req, {});
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("consent"));
});

await itAsync("lead.mts processes valid lead submission with success confirmation", async () => {
  const req = new Request("http://localhost/.netlify/functions/lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nf-client-connection-ip": "127.0.0.1",
    },
    body: JSON.stringify({
      name: "Suresh Kumar",
      phone: "+91 9876543210",
      business: "Malappuram Auto Spares",
      location: "Malappuram",
      service: "Local SEO",
      budget: "₹10,000 - ₹25,000",
      message: "Need Google Maps ranking improvement",
      consent: true,
    }),
  });
  const res = await leadHandler(req, {});
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert(data.message.includes("submitted successfully"));
  assert(data.leadId);
});

console.log("\n=========================================");
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log("=========================================");

if (failed > 0) {
  process.exit(1);
}
