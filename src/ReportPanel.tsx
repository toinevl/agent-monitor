import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

type Confidence = 'high' | 'medium' | 'low';

interface Finding {
  angle: string;
  confidence: Confidence;
}

interface Report {
  ready: boolean;
  generatedAt?: string;
  markdown?: string;
  findings?: Finding[];
}

interface ReportPanelProps {
  onClose: () => void;
}

const confidenceStyle: Record<Confidence, { bg: string; border: string; color: string }> = {
  high:   { bg: '#14532d22', border: '#166534', color: '#4ade80' },
  medium: { bg: '#78350f22', border: '#92400e', color: '#fbbf24' },
  low:    { bg: '#1e293b',   border: '#334155', color: '#64748b' },
};

const mdComponents: Components = {
  h1: ({ children }) => <h1 style={{ color: '#f1f5f9', fontSize: 22, marginBottom: 8, marginTop: 0 }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ color: '#e2e8f0', fontSize: 17, marginTop: 28, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ color: '#cbd5e1', fontSize: 14, marginTop: 16, marginBottom: 6 }}>{children}</h3>,
  p:  ({ children }) => <p style={{ marginBottom: 12, marginTop: 0 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: '#e2e8f0' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ color: '#94a3b8' }}>{children}</em>,
  code:   ({ children }) => <code style={{ background: '#1e293b', padding: '1px 6px', borderRadius: 4, fontSize: 12, color: '#7dd3fc' }}>{children}</code>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #334155', paddingLeft: 12, color: '#64748b', margin: '12px 0' }}>{children}</blockquote>,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ padding: '8px 12px', textAlign: 'left', background: '#1e293b', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #334155' }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>{children}</td>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '20px 0' }} />,
};

export default function ReportPanel({ onClose }: ReportPanelProps): JSX.Element {
  const [report, setReport]   = useState<Report | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch(`${BACKEND_HTTP}/api/report`)
      .then(r => r.json())
      .then((data: Report) => { setReport(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 16,
        width: '100%',
        maxWidth: 860,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
              📄 OpenClaw ROI Research Report
            </div>
            {report?.generatedAt && (
              <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                Generated {new Date(report.generatedAt).toLocaleString()}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 22, lineHeight: 1,
          }}>×</button>
        </div>

        {(report?.findings?.length ?? 0) > 0 && (
          <div style={{
            display: 'flex', gap: 8, padding: '10px 24px',
            borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap',
          }}>
            {report!.findings!.map(f => {
              const style = confidenceStyle[f.confidence] || confidenceStyle.low;
              return (
                <div key={f.angle} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11,
                  background: style.bg, border: `1px solid ${style.border}`, color: style.color,
                }}>
                  {f.angle} · {f.confidence}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>Loading report...</div>
          ) : !report?.ready ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              Report not ready yet — agents still working.
            </div>
          ) : (
            <div style={{ color: '#94a3b8', lineHeight: 1.7, fontSize: 14 }}>
              <ReactMarkdown components={mdComponents}>
                {report.markdown ?? ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
