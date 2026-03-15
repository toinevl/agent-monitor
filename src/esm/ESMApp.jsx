import { useState } from 'react';
import ChatInterface from './ChatInterface';
import TicketDashboard from './TicketDashboard';

const USER = { id: 'user-1', name: 'Alex de Vries' };

export default function ESMApp() {
  const [activeTab, setActiveTab] = useState('chat');
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [newTicketCount, setNewTicketCount] = useState(0);

  function handleTicketCreated(ticket) {
    setDashboardRefresh(n => n + 1);
    setNewTicketCount(n => n + 1);
    if (activeTab !== 'tickets') {
      setTimeout(() => setNewTicketCount(0), 4000);
    }
  }

  const tabs = [
    { key: 'chat', label: 'Servicedesk', icon: '💬', desc: 'Stel een vraag of meld een probleem' },
    { key: 'tickets', label: 'Mijn Verzoeken', icon: '🎫', desc: 'Bekijk status van je tickets', badge: newTicketCount },
  ];

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.6 } }
        .badge-new { animation: pulse 1.5s infinite; }
        .tab-btn:hover { background: #f1f5f9 !important; }
      `}</style>

      {/* App header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
        padding: '16px 24px 0',
        boxShadow: '0 4px 20px rgba(30,64,175,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🏢</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>
                ServicePortaal
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                Enterprise Service Management
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #a78bfa, #818cf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>
              {USER.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{USER.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Medewerker</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="tab-btn"
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === 'tickets') setNewTicketCount(0);
              }}
              style={{
                background: activeTab === tab.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                border: 'none', borderRadius: '10px 10px 0 0',
                padding: '10px 20px', cursor: 'pointer',
                color: activeTab === tab.key ? '#ffffff' : 'rgba(255,255,255,0.6)',
                fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 6,
                borderBottom: activeTab === tab.key ? '2px solid rgba(255,255,255,0.9)' : '2px solid transparent',
                transition: 'all 0.15s', position: 'relative',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="badge-new" style={{
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  width: 18, height: 18, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10, fontWeight: 700,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', padding: activeTab === 'tickets' ? 20 : 0 }}>
        {activeTab === 'chat' ? (
          <ChatInterface
            userId={USER.id}
            userName={USER.name}
            onTicketCreated={handleTicketCreated}
          />
        ) : (
          <TicketDashboard
            userId={USER.id}
            refreshTrigger={dashboardRefresh}
          />
        )}
      </div>
    </div>
  );
}
