import { useState, useRef, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const INTENT_META = {
  IT_INCIDENT: { label: 'IT Storing', color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  IT_REQUEST:  { label: 'IT Verzoek', color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  HR_REQUEST:  { label: 'HR Verzoek', color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  FAQ:         { label: 'Informatie', color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
};

const PRIORITY_COLOR = {
  laag: '#6b7280', normaal: '#3b82f6', hoog: '#f59e0b', kritiek: '#ef4444',
};

const QUICK_ACTIONS = [
  { label: 'Wachtwoord resetten', msg: 'Ik kan niet inloggen, mijn wachtwoord werkt niet meer.' },
  { label: 'Verlof aanvragen', msg: 'Hoe kan ik vakantiedagen aanvragen?' },
  { label: 'VPN probleem', msg: 'Ik kan geen verbinding maken met de VPN.' },
  { label: 'Nieuwe software', msg: 'Ik wil Microsoft Teams installeren op mijn laptop.' },
  { label: 'Thuiswerk vergoeding', msg: 'Hoe werkt de thuiswerkvergoeding?' },
  { label: 'Storing melden', msg: 'Er is een storing, ik kan niet werken.' },
];

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 12px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%', background: '#94a3b8',
          animation: `bounce 1.2s ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

export default function ChatInterface({ userId = 'user-1', userName = 'Medewerker', onTicketCreated }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hoi ${userName}! 👋 Ik ben je digitale servicedesk assistent. Ik help je met IT-support, HR-verzoeken en algemene vragen.\n\nWaar kan ik je mee helpen?`,
      at: new Date().toISOString(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingTicket, setPendingTicket] = useState(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const historyForAPI = messages
    .filter(m => m.role !== 'system' && m.id !== 'welcome')
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  async function sendMessage(text) {
    const userMsg = { id: Date.now(), role: 'user', content: text, at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/esm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyForAPI, userId, userName }),
      });
      const data = await res.json();

      const aiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message || data.error || 'Er ging iets mis.',
        intent: data.intent,
        confidence: data.confidence,
        suggestTicket: data.suggestTicket,
        ticketTitle: data.ticketTitle,
        priority: data.priority,
        at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);

      if (data.suggestTicket && data.ticketTitle) {
        setPendingTicket({
          title: data.ticketTitle,
          description: text,
          category: data.intent,
          priority: data.priority,
        });
      }
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'De servicedesk is tijdelijk niet bereikbaar. Probeer het later opnieuw.',
        at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmTicket() {
    if (!pendingTicket) return;
    setCreatingTicket(true);
    try {
      const res = await fetch(`${API_BASE}/api/esm/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingTicket, userId, userName }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: 'system',
          content: `Ticket aangemaakt: **${data.ticket.id}** — ${data.ticket.title}`,
          ticketId: data.ticket.id,
          at: new Date().toISOString(),
        }]);
        onTicketCreated?.(data.ticket);
      }
    } finally {
      setCreatingTicket(false);
      setPendingTicket(null);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) sendMessage(input.trim());
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#f8fafc', borderRadius: 16, overflow: 'hidden',
    }}>
      <style>{`
        @keyframes bounce { 0%,60%,100% { transform: translateY(0) } 30% { transform: translateY(-6px) } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }
        .chat-msg { animation: fadeUp 0.2s ease-out; }
        .qa-btn:hover { background: #e2e8f0 !important; transform: scale(1.02); }
        .send-btn:hover:not(:disabled) { background: #2563eb !important; }
        .ticket-btn:hover { opacity: 0.9; transform: scale(1.01); }
      `}</style>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {messages.map(msg => (
          <div key={msg.id} className="chat-msg">
            {msg.role === 'system' ? (
              <div style={{
                textAlign: 'center', padding: '8px 16px',
                background: '#dbeafe', borderRadius: 20, fontSize: 13, color: '#1e40af',
                margin: '0 auto', maxWidth: 400,
              }}>
                {msg.content.replace('**', '').replace('**', '')}
                {msg.ticketId && (
                  <span style={{ marginLeft: 8, fontWeight: 700 }}>{msg.ticketId}</span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                  }}>🤖</div>
                )}
                <div style={{ maxWidth: '75%' }}>
                  <div style={{
                    padding: '12px 16px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                      : '#ffffff',
                    color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    fontSize: 14, lineHeight: 1.5,
                    boxShadow: msg.role === 'user'
                      ? '0 2px 8px rgba(59,130,246,0.3)'
                      : '0 2px 8px rgba(0,0,0,0.06)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                  {msg.intent && INTENT_META[msg.intent] && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, paddingLeft: 4 }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: INTENT_META[msg.intent].bg,
                        color: INTENT_META[msg.intent].color,
                        border: `1px solid ${INTENT_META[msg.intent].color}30`,
                      }}>
                        {INTENT_META[msg.intent].icon} {INTENT_META[msg.intent].label}
                      </span>
                      {msg.priority && msg.priority !== 'normaal' && (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: '#f1f5f9', color: PRIORITY_COLOR[msg.priority] || '#6b7280',
                          border: `1px solid ${PRIORITY_COLOR[msg.priority] || '#6b7280'}40`,
                        }}>
                          {msg.priority.charAt(0).toUpperCase() + msg.priority.slice(1)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>🤖</div>
            <div style={{
              background: '#ffffff', borderRadius: '18px 18px 18px 4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        {/* Ticket suggestion */}
        {pendingTicket && !loading && (
          <div className="chat-msg" style={{
            background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12,
            padding: 16, margin: '0 0 0 44px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c2410c', marginBottom: 8 }}>
              Ticket aanmaken?
            </div>
            <div style={{ fontSize: 13, color: '#7c2d12', marginBottom: 12 }}>
              <strong>{pendingTicket.title}</strong>
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: '#fef3c7', color: '#92400e',
              }}>
                {pendingTicket.priority}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="ticket-btn"
                onClick={confirmTicket}
                disabled={creatingTicket}
                style={{
                  background: '#ea580c', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {creatingTicket ? 'Aanmaken...' : 'Ja, maak ticket aan'}
              </button>
              <button
                onClick={() => setPendingTicket(null)}
                style={{
                  background: 'transparent', color: '#9a3412', border: '1px solid #fed7aa',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Nee, bedankt
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions (only shown at start) */}
      {messages.length <= 2 && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_ACTIONS.map(qa => (
            <button
              key={qa.label}
              className="qa-btn"
              onClick={() => sendMessage(qa.msg)}
              disabled={loading}
              style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20,
                padding: '6px 14px', fontSize: 12, color: '#475569',
                cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500,
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 16px', background: '#ffffff',
        borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Typ je vraag of omschrijf je probleem..."
          rows={1}
          disabled={loading}
          style={{
            flex: 1, resize: 'none', border: '1.5px solid #e2e8f0', borderRadius: 12,
            padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
            outline: 'none', lineHeight: 1.4, maxHeight: 120,
            background: loading ? '#f8fafc' : '#ffffff',
            color: '#1e293b', transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = '#3b82f6'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
        <button
          className="send-btn"
          onClick={() => input.trim() && !loading && sendMessage(input.trim())}
          disabled={loading || !input.trim()}
          style={{
            background: input.trim() && !loading ? '#3b82f6' : '#e2e8f0',
            color: input.trim() && !loading ? '#ffffff' : '#94a3b8',
            border: 'none', borderRadius: 12, width: 42, height: 42,
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            fontSize: 18, transition: 'all 0.15s', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
