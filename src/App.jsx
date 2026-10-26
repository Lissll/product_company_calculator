import { useState, useEffect, useCallback, useMemo } from 'react';
import { Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale,
  RadialLinearScale, Tooltip, Legend, Filler
} from 'chart.js';
import {
  LS, PRESETS, COLORS, Q_FORMULAS, Q_LETTERS, L_DESCRIPTIONS, SYSTEM_SYMBOLS
} from './config.js';
import { solve } from './calc.js';

ChartJS.register(
  LineElement, PointElement, LinearScale, CategoryScale,
  RadialLinearScale, Tooltip, Legend, Filler
);

const SYSTEM_FORMULAS = [
  {
    latex: 'dLᵢ / dt = (1 / L*ᵢ) · (Gᵢ(L, q) − Dᵢ(L, q))',
    note: 'Система ОДУ · метод Эйлера'
  },
  {
    latex: 'Lᵢ(t + Δt) = clamp( Lᵢ(t) + L̇ᵢ(t)·Δt , 0, 1 )',
    note: 'Шаг интегрирования'
  },
  {
    latex: 'AI = N_crit / 15 ,  N_crit = #{ i : Lᵢ(t) < Lᵢᵐⁱⁿ }',
    note: 'Индекс риска'
  }
];

function FormulasModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Формулы модели"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>Формулы модели</h2>
            <p>Системная динамика · 15 показателей · 5 внешних возмущений</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="formulas-grid">
            <div className="formula-col">
              <h3>Возмущения qᵢ(t)</h3>
              {Object.entries(Q_FORMULAS).map(([key, f]) => (
                <div className="formula-row" key={key}>
                  <div className="formula-math">{f.title}</div>
                  <div className="formula-meta">{f.desc}</div>
                  <dl className="formula-params">
                    {Object.entries(f.params).map(([letter, meaning]) => (
                      <div className="param-row" key={letter}>
                        <dt>{letter}</dt>
                        <dd>{meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            <div className="formula-col">
              <h3>Динамика показателей</h3>
              {SYSTEM_FORMULAS.map((f, i) => (
                <div className="formula-row" key={i}>
                  <div className="formula-math">{f.latex}</div>
                  <div className="formula-meta">{f.note}</div>
                </div>
              ))}

              <h3 className="formula-subhead">Обозначения букв в формулах</h3>
              <dl className="formula-params">
                {SYSTEM_SYMBOLS.map(s => (
                  <div className="param-row" key={s.sym}>
                    <dt>{s.sym}</dt>
                    <dd>{s.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="formula-legend">
            <h3 className="formula-subhead">Показатели Lᵢ</h3>
            {LS.map(item => (
              <span key={item.id} className="legend-chip">
                <b>{item.id}</b> — {L_DESCRIPTIONS[item.id] || item.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  L, setL, q, setQ, tMax, setTMax, dt, setDt,
  onCalculate, onReset, onApplyPreset, data, loading
}) {
  const updateL = (i, v) => setL(prev => prev.map((x, k) => k === i ? v : x));
  const updateQ = (key, i, v) => setQ(prev => ({
    ...prev, [key]: prev[key].map((x, k) => k === i ? v : x)
  }));

  const indicators = useMemo(() => {
    if (!data) return null;
    const last = data.L[data.L.length - 1];
    const critical = last.filter((v, i) => v < data.L_min[i]).length;
    const avg = last.reduce((a, b) => a + b, 0) / last.length;
    const minVal = Math.min(...last);
    return { avg, critical, minVal, last };
  }, [data]);

  const statusOk = indicators ? indicators.critical === 0 : true;

  return (
    <aside className="sidebar">
      <div className="side-block">
        <h3>Пресеты</h3>
        <div className="preset-row">
          {[0, 1, 2].map(i => (
            <button key={i} type="button" className="chip-btn" onClick={() => onApplyPreset(i)}>
              Реализация {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="side-block">
        <h3>Параметры · Lᵢ(0)</h3>
        <div className="l-grid">
          {LS.map((item, i) => (
            <label className="slider-field" key={item.id} title={item.name}>
              <span className="slider-label">
                <span>{item.id}</span>
                <input
                  type="number" step="0.05" min="0" max="1"
                  value={L[i]}
                  onChange={e => updateL(i, parseFloat(e.target.value) || 0)}
                />
              </span>
              <input
                type="range" min="0" max="1" step="0.05"
                value={L[i]}
                onChange={e => updateL(i, parseFloat(e.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="side-block">
        <h3>Возмущения qᵢ(t)</h3>
        {Object.keys(Q_FORMULAS).map(key => (
          <div className="q-block" key={key}>
            <div className="q-head">
              <span className="q-name">{Q_FORMULAS[key].title}</span>
              <span className="q-tag">{Q_FORMULAS[key].desc}</span>
            </div>
            <div className="q-fields">
              {Q_LETTERS[key].map((letter, i) => (
                <label className="mini-field" key={letter} title={Q_FORMULAS[key].params[letter]}>
                  <span>{letter}</span>
                  <input
                    type="number" step="0.1"
                    value={q[key][i]}
                    onChange={e => updateQ(key, i, parseFloat(e.target.value) || 0)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="side-block">
        <h3>Расчёт</h3>
        <div className="calc-row">
          <label className="mini-field grow">
            <span>t<sub>max</sub></span>
            <input type="number" step="0.1" value={tMax}
                   onChange={e => setTMax(parseFloat(e.target.value) || 1)} />
          </label>
          <label className="mini-field grow">
            <span>Δt</span>
            <input type="number" step="0.001" value={dt}
                   onChange={e => setDt(parseFloat(e.target.value) || 0.01)} />
          </label>
        </div>
      </div>

      {indicators && (
        <div className="side-block indicators">
          <h3>Показатели</h3>
          <div className="ind-list">
            <div className="ind-row">
              <span>Средний L</span>
              <b>{indicators.avg.toFixed(3)}</b>
            </div>
            <div className="ind-row">
              <span>Мин. Lᵢ</span>
              <b>{indicators.minVal.toFixed(3)}</b>
            </div>
            <div className="ind-row">
              <span>Ниже минимума</span>
              <b className={indicators.critical ? 'bad' : 'good'}>{indicators.critical}</b>
            </div>
            <div className="ind-row">
              <span>Горизонт t</span>
              <b>{tMax}</b>
            </div>
          </div>
          <div className={`status-pill ${statusOk ? 'ok' : 'warn'}`}>
            {statusOk ? 'Норма' : 'Риск'}
          </div>
        </div>
      )}

      <div className="side-actions">
        <button type="button" className="btn-primary" onClick={onCalculate} disabled={loading}>
          {loading ? 'Расчёт…' : 'Рассчитать'}
        </button>
        <button type="button" className="btn-ghost" onClick={onReset}>Сброс</button>
      </div>
    </aside>
  );
}

function LineChart({ data }) {
  const { t, L, L_min } = data;
  const avgMin = L_min.reduce((a, b) => a + b, 0) / L_min.length;

  const datasets = useMemo(() => {
    const lines = LS.map((item, j) => ({
      label: item.id,
      data: t.map((_, i) => L[i][j]),
      borderColor: COLORS[j],
      backgroundColor: COLORS[j] + '22',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: false
    }));

    lines.push({
      label: 'Порог min',
      data: t.map(() => avgMin),
      borderColor: '#c45c4a',
      backgroundColor: 'rgba(196, 92, 74, 0.08)',
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: { target: 'origin', above: 'transparent', below: 'rgba(196, 92, 74, 0.06)' },
      tension: 0
    });

    return lines;
  }, [t, L, avgMin]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          font: { size: 11, family: "'IBM Plex Mono', monospace" },
          padding: 12,
          color: '#4a5568',
          usePointStyle: true,
          pointStyle: 'line'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(20, 28, 36, 0.92)',
        titleFont: { family: "'IBM Plex Mono', monospace", size: 12 },
        bodyFont: { family: "'IBM Plex Mono', monospace", size: 11 },
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          title: items => `t = ${items[0].label}`,
          label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}`
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'время t',
          font: { size: 12, family: "'Manrope', sans-serif", weight: '600' },
          color: '#64748b'
        },
        ticks: {
          maxTicksLimit: 12,
          font: { size: 11, family: "'IBM Plex Mono', monospace" },
          color: '#94a3b8'
        },
        grid: { color: 'rgba(15, 23, 42, 0.06)', drawBorder: false }
      },
      y: {
        min: 0,
        max: 1,
        title: {
          display: true,
          text: 'Lᵢ(t)',
          font: { size: 12, family: "'Manrope', sans-serif", weight: '600' },
          color: '#64748b'
        },
        ticks: {
          font: { size: 11, family: "'IBM Plex Mono', monospace" },
          color: '#94a3b8'
        },
        grid: { color: 'rgba(15, 23, 42, 0.06)', drawBorder: false }
      }
    }
  };

  return (
    <div className="viz-frame">
      <div className="viz-head">
        <h2>Динамика показателей Lᵢ(t)</h2>
        <span className="viz-sub">15 переменных · порог минимальных значений</span>
      </div>
      <div className="chart-wrap">
        <Line data={{ labels: t.map(x => x.toFixed(2)), datasets }} options={options} />
      </div>
    </div>
  );
}

function RadarGrid({ data, tMax }) {
  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 10, family: "'IBM Plex Mono', monospace" },
          boxWidth: 10,
          color: '#64748b'
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 1.0,
        ticks: { stepSize: 0.25, font: { size: 9, family: "'IBM Plex Mono', monospace" }, backdropColor: 'transparent' },
        pointLabels: { font: { size: 10, family: "'IBM Plex Mono', monospace" }, color: '#64748b' },
        grid: { color: 'rgba(15, 23, 42, 0.08)' },
        angleLines: { color: 'rgba(15, 23, 42, 0.08)' }
      }
    }
  };

  return (
    <div className="radar-section">
      <div className="viz-head">
        <h2>Срезы состояния</h2>
        <span className="viz-sub">профиль Lᵢ в выбранные моменты времени</span>
      </div>
      <div className="radar-grid">
        {[0, 0.25, 0.5, 0.75, 1.0].map((f, idx) => {
          const targetT = f * tMax;
          let i = data.t.findIndex(v => v >= targetT - 1e-9);
          if (i === -1) i = data.t.length - 1;
          const chartData = {
            labels: LS.map(item => item.id),
            datasets: [
              {
                label: 'Lᵢ(t)',
                data: data.L[i],
                borderColor: '#1a6b6b',
                backgroundColor: 'rgba(26, 107, 107, 0.18)',
                borderWidth: 2,
                pointBackgroundColor: '#1a6b6b',
                pointRadius: 2.5
              },
              {
                label: 'Минимум',
                data: data.L_min,
                borderColor: '#c45c4a',
                backgroundColor: 'rgba(196, 92, 74, 0.06)',
                borderWidth: 1.5,
                pointRadius: 0,
                borderDash: [4, 3]
              }
            ]
          };
          return (
            <div className="radar-card" key={idx}>
              <h3>t = {data.t[i].toFixed(2)}</h3>
              <div className="radar-wrap"><Radar data={chartData} options={radarOptions} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [L, setL] = useState(LS.map(i => i.def));
  const [q, setQ] = useState(PRESETS[0].q);
  const [tMax, setTMax] = useState(1.0);
  const [dt, setDt] = useState(0.01);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ text: '', cls: '' });
  const [formulasOpen, setFormulasOpen] = useState(false);

  const runCalculate = useCallback(async () => {
    setLoading(true); setError(null);
    setStatus({ text: 'расчёт…', cls: '' });

    await new Promise(r => setTimeout(r, 30));

    try {
      const result = solve(L, q, tMax, dt);
      setData({ ok: true, ...result });
      setStatus({ text: 'готово', cls: 'ok' });
    } catch (e) {
      setError(e.message);
      setStatus({ text: 'ошибка', cls: 'err' });
    } finally {
      setLoading(false);
    }
  }, [L, q, tMax, dt]);

  const applyPreset = i => {
    setL([...PRESETS[i].L]);
    setQ(JSON.parse(JSON.stringify(PRESETS[i].q)));
  };

  const reset = () => {
    setL(LS.map(i => i.def));
    setTMax(1.0); setDt(0.01);
    applyPreset(0);
  };

  useEffect(() => { runCalculate(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1>Прогноз успешности<br />продуктовой компании</h1>
          <p>Модель системной динамики · 15 переменных · 5 возмущений</p>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="info-btn"
            onClick={() => setFormulasOpen(true)}
            aria-label="Показать формулы модели"
            title="Формулы модели"
          >
            !
          </button>
          <div className={`header-status ${status.cls}`}>
            <span className="status-dot" />
            {status.text || 'ожидание'}
          </div>
        </div>
      </header>

      <div className="workspace">
        <Sidebar
          L={L} setL={setL} q={q} setQ={setQ}
          tMax={tMax} setTMax={setTMax} dt={dt} setDt={setDt}
          onCalculate={runCalculate} onReset={reset} onApplyPreset={applyPreset}
          data={data} loading={loading}
        />

        <main className="main-stage">
          {loading && (
            <div className="loader">
              <div className="spinner" />
              <span>Интегрирование системы ОДУ…</span>
            </div>
          )}

          {data && !loading && (
            <>
              <LineChart data={data} />
              <RadarGrid data={data} tMax={tMax} />
            </>
          )}

          {!loading && !data && (
            <div className="empty-state">
              <p>{error ? `Ошибка: ${error}` : 'Задайте параметры и нажмите «Рассчитать»'}</p>
            </div>
          )}
        </main>
      </div>

      <FormulasModal open={formulasOpen} onClose={() => setFormulasOpen(false)} />
    </div>
  );
}