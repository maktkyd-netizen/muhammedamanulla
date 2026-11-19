import React, { useState, useEffect, useRef } from "react";

// Google Analytics 4 event helper (Never sends personal info)
function trackGA4(eventName, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    } else if (typeof window !== "undefined" && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...params });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("aman_ai_analytics", { detail: { event: eventName, ...params } })
      );
    }
  } catch (e) {}
}

const AMANU_EXPRESSIONS = {
  idle: "gentle-smile",
  welcome: "happy",
  processing: "thinking",
  question: "curious",
  success: "excited",
  error: "worried",
  leadCaptured: "confident",
};

function getAmanuImgSrc(expressionName) {
  const name = expressionName || "gentle-smile";
  return `assets/amanu/${name}.webp`;
}

const INITIAL_PROMPTS = [
  "I need SEO services",
  "I want a business website",
  "I need Google Ads",
  "I need Meta Ads",
  "Get a service quotation",
  "മലയാളത്തിൽ സംസാരിക്കാമോ?",
];

const INITIAL_GREETING = {
  id: "welcome-1",
  role: "model",
  expression: "happy",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  content:
    "Hello! 👋 I am **AMANU**, the official AI assistant for **Muhammad Amanulla**, Digital Marketing Strategist based in Malappuram, Kerala.\n\nI can help you with:\n• **Local SEO & Google Maps Ranking** (Packages from ₹6,000/mo)\n• **High-Converting Websites** (Packages ₹8,000 - ₹20,000)\n• **Google & Meta Ads Management** (From ₹5,000/mo)\n• **Social Media Branding & Content**\n\nHow can we help scale your business today?",
};

export default function AmanAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_GREETING]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentExpression, setCurrentExpression] = useState(AMANU_EXPRESSIONS.idle);
  const [suggestedPrompts, setSuggestedPrompts] = useState(INITIAL_PROMPTS);
  const [showTeaser, setShowTeaser] = useState(true);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  // Lead Form State
  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    business: "",
    location: "",
    service: "Local SEO",
    budget: "₹5,000 - ₹10,000",
    message: "",
    consent: true,
  });
  const [leadStatus, setLeadStatus] = useState("idle");
  const [leadError, setLeadError] = useState("");

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const idleTimerRef = useRef(null);

  const resetToIdleAfterDelay = (delayMs = 7000) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setCurrentExpression(AMANU_EXPRESSIONS.idle);
    }, delayMs);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [messages, isOpen, isLoading]);

  // Handle Open/Close Chat
  const toggleChat = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      setShowTeaser(false);
      setCurrentExpression(AMANU_EXPRESSIONS.welcome);
      resetToIdleAfterDelay(6000);
      trackGA4("chatbot_open");
      if (messages.length === 1) {
        trackGA4("chatbot_conversation_started");
      }
    } else {
      setCurrentExpression(AMANU_EXPRESSIONS.idle);
    }
  };

  // Clear Chat History
  const clearChat = () => {
    setMessages([
      {
        ...INITIAL_GREETING,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setSuggestedPrompts(INITIAL_PROMPTS);
    setCurrentExpression(AMANU_EXPRESSIONS.welcome);
    resetToIdleAfterDelay(4000);
  };

  // Send User Message
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMessage = {
      id: "user-" + Date.now(),
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setCurrentExpression(AMANU_EXPRESSIONS.processing);
    trackGA4("chatbot_message_sent");

    const historyPayload = messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      const data = await response.json();

      // Determine dynamic AMANU expression based on reply content & question context
      let nextExpression = AMANU_EXPRESSIONS.idle;
      const combined = (text + " " + (data.reply || "")).toLowerCase();

      if (data.reply && data.reply.trim().endsWith("?")) {
        nextExpression = AMANU_EXPRESSIONS.question;
      } else if (/quote|pricing|package|budget|deal|offer|great|excited/i.test(combined)) {
        nextExpression = AMANU_EXPRESSIONS.success;
      } else if (/how|what|why|who|where|when|can you|details|tell me/i.test(text.toLowerCase())) {
        nextExpression = AMANU_EXPRESSIONS.question;
      } else {
        nextExpression = AMANU_EXPRESSIONS.welcome;
      }

      setCurrentExpression(nextExpression);
      resetToIdleAfterDelay(7000);

      const aiMessage = {
        id: "ai-" + Date.now(),
        role: "model",
        expression: nextExpression,
        content:
          data.reply ||
          "I'm here to help you grow your business. Feel free to ask about our SEO packages, website design, or advertising management!",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        leadPrompt: data.leadPrompt || false,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (Array.isArray(data.suggestedPrompts) && data.suggestedPrompts.length > 0) {
        setSuggestedPrompts(data.suggestedPrompts);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setCurrentExpression(AMANU_EXPRESSIONS.error);
      resetToIdleAfterDelay(8000);

      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "model",
          expression: AMANU_EXPRESSIONS.error,
          content:
            "I apologize, but I'm having trouble connecting right now. You can chat directly with Muhammad Amanulla on WhatsApp at +91 9746402460.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          leadPrompt: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Open Lead Form
  const openLeadModal = () => {
    setIsLeadModalOpen(true);
    setLeadStatus("idle");
    setLeadError("");
    setCurrentExpression(AMANU_EXPRESSIONS.question);
    trackGA4("chatbot_lead_form_opened");
  };

  // Submit Lead Form
  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    setLeadError("");

    if (!leadForm.name.trim()) {
      setLeadError("Please enter your full name.");
      setCurrentExpression(AMANU_EXPRESSIONS.error);
      return;
    }

    const cleanPhone = leadForm.phone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      setLeadError("Please enter a valid 10-digit mobile or WhatsApp number.");
      setCurrentExpression(AMANU_EXPRESSIONS.error);
      return;
    }

    if (!leadForm.consent) {
      setLeadError("Please consent to be contacted regarding your inquiry.");
      setCurrentExpression(AMANU_EXPRESSIONS.error);
      return;
    }

    setLeadStatus("submitting");
    setCurrentExpression(AMANU_EXPRESSIONS.processing);

    try {
      const res = await fetch("/.netlify/functions/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadForm),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Submission failed");
      }

      setLeadStatus("success");
      setCurrentExpression(AMANU_EXPRESSIONS.leadCaptured);
      trackGA4("chatbot_lead_submitted");

      setMessages((prev) => [
        ...prev,
        {
          id: "lead-conf-" + Date.now(),
          role: "model",
          expression: AMANU_EXPRESSIONS.leadCaptured,
          content: `🎉 **Thank you, ${leadForm.name}!**\n\nYour consultation request for **${leadForm.service}** has been received. Muhammad Amanulla will personally reach out to you via WhatsApp (${leadForm.phone}) shortly.\n\nNeed immediate answers? Click below to chat now:`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          leadPrompt: false,
        },
      ]);
    } catch (err) {
      console.error("Lead submission error:", err);
      setCurrentExpression(AMANU_EXPRESSIONS.error);
      setLeadError(
        err.message || "Failed to submit. Please reach Muhammad Amanulla directly on WhatsApp."
      );
      setLeadStatus("error");
    }
  };

  const renderFormattedText = (raw) => {
    if (!raw) return null;
    const lines = raw.split("\n");
    return lines.map((line, idx) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formatted = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      return (
        <p key={idx} style={{ minHeight: line.trim() === "" ? "8px" : "auto" }}>
          {formatted}
        </p>
      );
    });
  };

  const whatsappUrl = `https://api.whatsapp.com/send/?phone=919746402460&text=${encodeURIComponent(
    "Hi Muhammad Amanulla! I was chatting with AMANU AI on your website and would like to discuss digital marketing services."
  )}`;

  return (
    <div id="aman-ai-chatbot-root">
      {/* Floating Launcher Container */}
      <div className="aman-launcher-container">
        {showTeaser && !isOpen && (
          <div className="aman-launcher-teaser" onClick={toggleChat}>
            <span className="wave">👋</span> Need digital marketing or SEO? Chat with AMANU!
            <button
              className="aman-teaser-close"
              onClick={(e) => {
                e.stopPropagation();
                setShowTeaser(false);
              }}
              aria-label="Close teaser"
            >
              ✕
            </button>
          </div>
        )}

        {/* Floating Button with AMANU Mascot (Gentle Smile) */}
        <button
          className="aman-launcher-btn"
          onClick={toggleChat}
          aria-label={isOpen ? "Close AMANU AI Chat" : "Open AMANU AI Chat"}
          aria-expanded={isOpen}
          title="Chat with AMANU AI Assistant"
        >
          {isOpen ? (
            <span className="aman-launcher-close-icon">
              <i className="fa-solid fa-xmark"></i>
            </span>
          ) : (
            <>
              <img
                src={getAmanuImgSrc("gentle-smile")}
                alt="AMANU AI Mascot"
                className="aman-launcher-character-img"
              />
              <span className="aman-launcher-badge" title="AMANU Online"></span>
            </>
          )}
        </button>
      </div>

      {/* Main Chat Window */}
      {isOpen && (
        <div className="aman-chat-window" role="dialog" aria-label="AMANU AI Assistant">
          {/* Header */}
          <div className="aman-chat-header">
            <div className="aman-header-profile">
              <div className="aman-header-avatar">
                <img
                  src={getAmanuImgSrc(currentExpression)}
                  alt={`AMANU ${currentExpression}`}
                  className="aman-character-avatar-img"
                />
                <span className="aman-avatar-dot" title="AMANU Online"></span>
              </div>
              <div className="aman-header-text">
                <h3>
                  AMANU AI Assistant <span className="aman-header-badge">AI 2.5</span>
                </h3>
                <p>
                  <i className="fa-solid fa-circle" style={{ color: "#10B981", fontSize: "7px" }}></i>
                  Your personal digital assistant
                </p>
              </div>
            </div>

            <div className="aman-header-actions">
              <button
                className="aman-header-btn"
                onClick={clearChat}
                title="Restart conversation"
                aria-label="Restart conversation"
              >
                <i className="fa-solid fa-rotate-right"></i>
              </button>
              <button
                className="aman-header-btn"
                onClick={toggleChat}
                title="Close chat"
                aria-label="Close chat"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* WhatsApp Direct Banner */}
          <div className="aman-whatsapp-banner">
            <span>Direct Strategist Line</span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackGA4("chatbot_whatsapp_clicked")}
            >
              <i className="fa-brands fa-whatsapp"></i> Chat on WhatsApp
            </a>
          </div>

          {/* Messages Area */}
          <div className="aman-chat-messages" role="log" aria-live="polite">
            {messages.map((msg) => (
              <div key={msg.id} className={`aman-message-row ${msg.role}`}>
                {msg.role === "model" && (
                  <div className="aman-msg-avatar">
                    <img
                      src={getAmanuImgSrc(msg.expression || currentExpression)}
                      alt="AMANU"
                    />
                  </div>
                )}
                <div>
                  <div className="aman-msg-bubble">
                    {renderFormattedText(msg.content)}

                    {msg.leadPrompt && (
                      <div className="aman-msg-cta-box">
                        <button className="aman-msg-cta-btn" onClick={openLeadModal}>
                          <i className="fa-solid fa-calendar-check"></i> Book Free Consultation / Quote
                        </button>
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aman-msg-cta-btn whatsapp"
                          onClick={() => trackGA4("chatbot_whatsapp_clicked")}
                        >
                          <i className="fa-brands fa-whatsapp"></i> Chat Directly on WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="aman-msg-time">{msg.time}</div>
                </div>
              </div>
            ))}

            {/* Typing Indicator with Thinking AMANU */}
            {isLoading && (
              <div className="aman-message-row model">
                <div className="aman-msg-avatar">
                  <img src={getAmanuImgSrc("thinking")} alt="AMANU Thinking" />
                </div>
                <div className="aman-typing-indicator" aria-label="AMANU is thinking">
                  <span className="aman-typing-dot"></span>
                  <span className="aman-typing-dot"></span>
                  <span className="aman-typing-dot"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts / Quick Replies */}
          {suggestedPrompts.length > 0 && !isLoading && (
            <div className="aman-suggested-prompts" aria-label="Suggested prompts">
              {suggestedPrompts.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  className="aman-prompt-chip"
                  onClick={() => handleSendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="aman-chat-input-area">
            <button
              className="aman-lead-trigger-btn"
              onClick={openLeadModal}
              title="Request a Quote / Consultation"
              aria-label="Request a Quote"
            >
              <i className="fa-solid fa-file-invoice-dollar"></i>
            </button>

            <div className="aman-chat-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="aman-chat-input"
                placeholder="Ask AMANU about SEO, Websites, or Ads..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                aria-label="Message AMANU"
              />
            </div>

            <button
              className="aman-send-btn"
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputText.trim()}
              aria-label="Send message"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>

          {/* Footer Note */}
          <div className="aman-chat-footer">
            Powered by AMANU AI • Malappuram, Kerala • Privacy Guaranteed
          </div>

          {/* Lead Capture Modal / Drawer */}
          {isLeadModalOpen && (
            <div className="aman-lead-modal-overlay" onClick={() => setIsLeadModalOpen(false)}>
              <div
                className="aman-lead-modal-card"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Request Consultation"
              >
                {leadStatus === "success" ? (
                  <div className="aman-lead-success-card">
                    <div className="aman-success-character">
                      <img src={getAmanuImgSrc("confident")} alt="AMANU Confident" />
                    </div>
                    <h4>Request Received!</h4>
                    <p>
                      Thank you for submitting your requirements. Muhammad Amanulla will personally
                      review your project and contact you via WhatsApp shortly.
                    </p>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aman-continue-wa-btn"
                      onClick={() => {
                        setIsLeadModalOpen(false);
                        trackGA4("chatbot_whatsapp_clicked");
                      }}
                    >
                      <i className="fa-brands fa-whatsapp"></i> Chat on WhatsApp Now
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="aman-lead-header">
                      <div>
                        <h4>Request Free Strategy Consultation</h4>
                        <p>Receive tailored package recommendations & pricing</p>
                      </div>
                      <button
                        className="aman-lead-close-btn"
                        onClick={() => {
                          setIsLeadModalOpen(false);
                          setCurrentExpression(AMANU_EXPRESSIONS.idle);
                        }}
                        aria-label="Close consultation modal"
                      >
                        ✕
                      </button>
                    </div>

                    <form className="aman-lead-form" onSubmit={handleLeadSubmit}>
                      <div className="aman-form-group">
                        <label>
                          Full Name <span className="req">*</span>
                        </label>
                        <input
                          type="text"
                          className="aman-form-input"
                          placeholder="Your Name"
                          value={leadForm.name}
                          onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="aman-form-group">
                        <label>
                          WhatsApp / Mobile Number <span className="req">*</span>
                        </label>
                        <input
                          type="tel"
                          className="aman-form-input"
                          placeholder="+91 9876543210"
                          value={leadForm.phone}
                          onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                          required
                        />
                      </div>

                      <div className="aman-form-group">
                        <label>Business Name (Optional)</label>
                        <input
                          type="text"
                          className="aman-form-input"
                          placeholder="e.g. Malappuram Dental Clinic"
                          value={leadForm.business}
                          onChange={(e) => setLeadForm({ ...leadForm, business: e.target.value })}
                        />
                      </div>

                      <div className="aman-form-group">
                        <label>Target Location (Optional)</label>
                        <input
                          type="text"
                          className="aman-form-input"
                          placeholder="e.g. Malappuram / Calicut / GCC"
                          value={leadForm.location}
                          onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })}
                        />
                      </div>

                      <div className="aman-form-group">
                        <label>Interested Service</label>
                        <select
                          className="aman-form-select"
                          value={leadForm.service}
                          onChange={(e) => setLeadForm({ ...leadForm, service: e.target.value })}
                        >
                          <option value="Local SEO">Local SEO (Google Maps & Rankings) - From ₹6,000/mo</option>
                          <option value="Website Development">Website Development (WordPress/Custom) - From ₹8,000</option>
                          <option value="Google & Meta Ads">Google Ads & Meta (FB/Insta) - From ₹5,000/mo</option>
                          <option value="Complete Digital Strategy">Full Digital Marketing Strategy</option>
                          <option value="Content & Video">Poster & Video Content Creation</option>
                        </select>
                      </div>

                      <div className="aman-form-group">
                        <label>Estimated Monthly Budget</label>
                        <select
                          className="aman-form-select"
                          value={leadForm.budget}
                          onChange={(e) => setLeadForm({ ...leadForm, budget: e.target.value })}
                        >
                          <option value="Under ₹10,000">Under ₹10,000</option>
                          <option value="₹10,000 - ₹25,000">₹10,000 - ₹25,000</option>
                          <option value="₹25,000 - ₹50,000">₹25,000 - ₹50,000</option>
                          <option value="₹50,000+">₹50,000+</option>
                        </select>
                      </div>

                      <div className="aman-form-group">
                        <label>Project Details / Message (Optional)</label>
                        <textarea
                          className="aman-form-textarea"
                          rows="2"
                          placeholder="Briefly describe your goals..."
                          value={leadForm.message}
                          onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                        ></textarea>
                      </div>

                      <div className="aman-form-consent">
                        <input
                          type="checkbox"
                          id="aman-lead-consent"
                          checked={leadForm.consent}
                          onChange={(e) => setLeadForm({ ...leadForm, consent: e.target.checked })}
                        />
                        <label htmlFor="aman-lead-consent">
                          I agree to be contacted by Muhammad Amanulla via WhatsApp or Call regarding this inquiry.
                        </label>
                      </div>

                      {leadError && <div className="aman-form-error">{leadError}</div>}

                      <button
                        type="submit"
                        className="aman-lead-submit-btn"
                        disabled={leadStatus === "submitting"}
                      >
                        {leadStatus === "submitting" ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i> Submitting...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-paper-plane"></i> Submit Inquiry
                          </>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
