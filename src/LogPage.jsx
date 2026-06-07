import { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from './firebase';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import './LogPage.css';
import { CAT_LABEL, getMyConfig, getFriendConfig } from './config';

/** Lấy ISO week string, vd: "T23/2025" */
function isoWeekLabel(ts) {
  const d = new Date(ts);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const year = d.getFullYear();
  const week = Math.ceil(((d - new Date(year, 0, 1)) / 86400000 + 1) / 7);
  return `T${week}`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round(Math.abs(b - a) / 86400000);
}

/**
 * Từ raw Firebase snapshot, trả về:
 *  - doneTasks: [{catId, catLabel, text, createdAt, doneAt}] sắp xếp mới nhất lên đầu
 *  - catStats:  [{catId, catLabel, firstCreated, lastDone, totalDays, doneCount, totalCount}]
 *  - weeklyPct: {week: pct} — % theo từng ISO week
 */
function processData(categoriesSnap, customCatsSnap) {
  const doneTasks = [];
  const catStats  = {};
  let totalDone = 0, totalAll = 0;
  const weekMap = {}; // week → {done, total}

  function processCategory(catId, catLabel, catData) {
    const subtasks = catData.subtasks ? Object.values(catData.subtasks) : [];
    if (!catStats[catId]) catStats[catId] = { catId, catLabel, firstCreated: null, lastDone: null, doneCount: 0, totalCount: 0 };
    const stat = catStats[catId];

    subtasks.forEach(t => {
      stat.totalCount++;
      totalAll++;
      if (t.createdAt) {
        stat.firstCreated = stat.firstCreated ? Math.min(stat.firstCreated, t.createdAt) : t.createdAt;
      }
      if (t.done && t.doneAt !== null && t.doneAt !== undefined) {
        stat.doneCount++;
        totalDone++;
        stat.lastDone = stat.lastDone ? Math.max(stat.lastDone, t.doneAt) : t.doneAt;
        doneTasks.push({ catId, catLabel, text: t.text || '(task)', createdAt: t.createdAt, doneAt: t.doneAt });

        // weekly
        const wk = isoWeekLabel(t.doneAt);
        if (!weekMap[wk]) weekMap[wk] = { done: 0, total: 0, ts: t.doneAt };
        weekMap[wk].done++;
        if (weekMap[wk].ts < t.doneAt) weekMap[wk].ts = t.doneAt;
      }
    });
  }

  // Fixed categories
  if (categoriesSnap) {
    Object.entries(categoriesSnap).forEach(([catId, catData]) => {
      const catLabel = CAT_LABEL[catId] || catId;
      processCategory(catId, catLabel, catData);
    });
  }
  // Custom categories
  if (customCatsSnap) {
    Object.entries(customCatsSnap).forEach(([catId, catData]) => {
      processCategory(catId, catData.label || catId, catData);
    });
  }

  doneTasks.sort((a, b) => b.doneAt - a.doneAt);
  const catStatsArr = Object.values(catStats)
    .filter(s => s.totalCount > 0)
    .sort((a, b) => (a.firstCreated ?? 0) - (b.firstCreated ?? 0));

  // Build weekly cumulative % — sắp xếp theo tuần
  const weekEntries = Object.entries(weekMap).sort((a, b) => a[1].ts - b[1].ts);
  let cumDone = 0;
  const weeklyPct = weekEntries.map(([wk, v]) => {
    cumDone += v.done;
    return { week: wk, pct: totalAll ? Math.round(cumDone / totalAll * 100) : 0 };
  });

  return { doneTasks, catStats: catStatsArr, weeklyPct, totalDone, totalAll };
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TimelineItem({ task, isLast }) {
  const days = daysBetween(task.createdAt, task.doneAt);
  return (
    <div className={`lg-timeline-item ${isLast ? 'last' : ''}`}>
      <div className="lg-tl-dot" />
      <div className="lg-tl-body">
        <div className="lg-tl-task">{task.text}</div>
        <div className="lg-tl-meta">
          <span className="lg-tl-cat">{task.catLabel}</span>
          <span className="lg-tl-sep">·</span>
          <span>{fmtDate(task.doneAt)}</span>
          {days !== null && (
            <>
              <span className="lg-tl-sep">·</span>
              <span className="lg-tl-days">{days === 0 ? 'Hôm đó' : `${days} ngày`}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CatStatRow({ stat }) {
  const days = daysBetween(stat.firstCreated, stat.lastDone);
  const pct  = stat.totalCount ? Math.round(stat.doneCount / stat.totalCount * 100) : 0;
  return (
    <div className="lg-stat-row">
      <div className="lg-stat-name">{stat.catLabel}</div>
      <div className="lg-stat-bar-wrap">
        <div className="lg-stat-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="lg-stat-info">
        <span className="lg-stat-pct">{pct}%</span>
        <span className="lg-stat-range">
          {stat.firstCreated ? fmtDate(stat.firstCreated) : '—'}
          {stat.lastDone ? ` → ${fmtDate(stat.lastDone)}` : ''}
          {days !== null ? ` (${days}n)` : ''}
        </span>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="lg-tooltip">
      <div className="lg-tooltip-week">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="lg-tooltip-line" style={{ color: p.color }}>
          {p.name}: <strong>{p.value}%</strong>
        </div>
      ))}
    </div>
  );
};

// ── Main LogPage ────────────────────────────────────────────────────────────
export default function LogPage({ currentUserKey, onNavigate, onLogout }) {
  const [meCategories,    setMeCategories]    = useState(null);
  const [meCustom,        setMeCustom]        = useState(null);
  const [frCategories,    setFrCategories]    = useState(null);
  const [frCustom,        setFrCustom]        = useState(null);
  const [viewMode,        setViewMode]        = useState('me'); // 'me' | 'friend' | 'both'
  const [activeSection,   setActiveSection]   = useState('timeline'); // 'timeline' | 'stats' | 'chart'

  const me     = getMyConfig(currentUserKey);
  const fr     = getFriendConfig(currentUserKey);
  const myName = me.name;
  const frName = fr.name;

  useEffect(() => {
    const u1 = onValue(ref(db, `tasks/${me.dbKey}/categories`),        s => setMeCategories(s.val()));
    const u2 = onValue(ref(db, `tasks/${me.dbKey}/custom_categories`), s => setMeCustom(s.val()));
    const u3 = onValue(ref(db, `tasks/${fr.dbKey}/categories`),        s => setFrCategories(s.val()));
    const u4 = onValue(ref(db, `tasks/${fr.dbKey}/custom_categories`), s => setFrCustom(s.val()));
    return () => { u1(); u2(); u3(); u4(); };
  }, [me.dbKey, fr.dbKey]);

  const meData = useMemo(() => processData(meCategories, meCustom), [meCategories, meCustom]);
  const frData = useMemo(() => processData(frCategories, frCustom), [frCategories, frCustom]);

  // Dữ liệu hiển thị theo viewMode
  const displayMe     = viewMode !== 'friend';
  const displayFriend = viewMode !== 'me';

  // Merge weekly data cho biểu đồ
  const chartData = useMemo(() => {
    const weeks = new Set([
      ...meData.weeklyPct.map(w => w.week),
      ...frData.weeklyPct.map(w => w.week),
    ]);
    const meMap = Object.fromEntries(meData.weeklyPct.map(w => [w.week, w.pct]));
    const frMap = Object.fromEntries(frData.weeklyPct.map(w => [w.week, w.pct]));
    return [...weeks].sort().map(wk => ({
      week: wk,
      [myName]: meMap[wk] ?? null,
      [frName]: frMap[wk] ?? null,
    }));
  }, [meData, frData, myName, frName]);

  // Timeline tasks to show
  const timelineTasks = useMemo(() => {
    if (viewMode === 'me')     return meData.doneTasks;
    if (viewMode === 'friend') return frData.doneTasks;
    // both: merge + sort
    return [...meData.doneTasks.map(t => ({ ...t, who: myName })),
            ...frData.doneTasks.map(t => ({ ...t, who: frName }))]
      .sort((a, b) => b.doneAt - a.doneAt);
  }, [viewMode, meData, frData, myName, frName]);

  const catStats = viewMode === 'friend' ? frData.catStats
    : viewMode === 'both' ? meData.catStats  // với "cả 2" chỉ hiện của mình trong stats
    : meData.catStats;

  return (
    <div className="lg-wrap">
      {/* Header */}
      <div className="lg-header">
        <div className="lg-title">Nhật ký tiến độ</div>
        <div className="lg-toggle">
          {['me', 'friend', 'both'].map(m => (
            <button
              key={m}
              className={`lg-toggle-btn ${viewMode === m ? 'active' : ''}`}
              onClick={() => setViewMode(m)}
            >
              {m === 'me' ? 'Tôi' : m === 'friend' ? frName : 'Cả 2'}            </button>
          ))}
        </div>
      </div>

      {/* Section tabs */}
      <div className="lg-tabs">
        {[
          { key: 'timeline', label: 'Timeline', icon: 'ti-timeline' },
          { key: 'stats',    label: 'Thống kê', icon: 'ti-chart-bar' },
          { key: 'chart',    label: 'Biểu đồ',  icon: 'ti-chart-line' },
        ].map(tab => (
          <button
            key={tab.key}
            className={`lg-tab ${activeSection === tab.key ? 'active' : ''}`}
            onClick={() => setActiveSection(tab.key)}
          >
            <i className={`ti ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="lg-content">

        {/* ── TIMELINE ── */}
        {activeSection === 'timeline' && (
          <div className="lg-section">
            {timelineTasks.length === 0 ? (
              <div className="lg-empty">
                <i className="ti ti-clock-off" />
                <span>Chưa có task nào hoàn thành</span>
              </div>
            ) : (
              <div className="lg-timeline">
                {timelineTasks.map((t, i) => (
                  <div key={`${t.catId}-${t.doneAt}-${i}`} className={`lg-timeline-item ${i === timelineTasks.length - 1 ? 'last' : ''}`}>
                    <div className="lg-tl-dot" />
                    <div className="lg-tl-body">
                      <div className="lg-tl-task">
                        {t.text}
                        {viewMode === 'both' && t.who && (
                          <span className={`lg-tl-who ${t.who === myName ? 'me' : 'friend'}`}>{t.who}</span>
                        )}
                      </div>
                      <div className="lg-tl-meta">
                        <span className="lg-tl-cat">{t.catLabel}</span>
                        <span className="lg-tl-sep">·</span>
                        <span>{fmtDate(t.doneAt)}</span>
                        {daysBetween(t.createdAt, t.doneAt) !== null && (
                          <>
                            <span className="lg-tl-sep">·</span>
                            <span className="lg-tl-days">
                              {daysBetween(t.createdAt, t.doneAt) === 0 ? 'Hôm đó' : `${daysBetween(t.createdAt, t.doneAt)} ngày`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── STATS ── */}
        {activeSection === 'stats' && (
          <div className="lg-section">
            {/* Summary cards */}
            <div className="lg-stat-cards">
              {displayMe && (
                <div className="lg-stat-card lg-stat-card--me">
                  <div className="lg-stat-card-name">{myName}</div>
                  <div className="lg-stat-card-num">{meData.totalDone}<span>/{meData.totalAll}</span></div>
                  <div className="lg-stat-card-sub">tasks hoàn thành</div>
                </div>
              )}
              {displayFriend && (
                <div className="lg-stat-card lg-stat-card--friend">
                  <div className="lg-stat-card-name">{frName}</div>
                  <div className="lg-stat-card-num">{frData.totalDone}<span>/{frData.totalAll}</span></div>
                  <div className="lg-stat-card-sub">tasks hoàn thành</div>
                </div>
              )}
            </div>

            {/* Per-category stats */}
            <div className="lg-stat-label">Thời gian từng hạng mục</div>
            {catStats.length === 0 ? (
              <div className="lg-empty"><i className="ti ti-chart-bar-off" /><span>Chưa có dữ liệu</span></div>
            ) : (
              <div className="lg-stat-list">
                {catStats.map(stat => (
                  <div key={stat.catId} className="lg-stat-row">
                    <div className="lg-stat-name">{stat.catLabel}</div>
                    <div className="lg-stat-bar-wrap">
                      <div
                        className="lg-stat-bar"
                        style={{
                          width: `${stat.totalCount ? Math.round(stat.doneCount / stat.totalCount * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <div className="lg-stat-info">
                      <span className="lg-stat-pct">
                        {stat.totalCount ? Math.round(stat.doneCount / stat.totalCount * 100) : 0}%
                      </span>
                      <span className="lg-stat-range">
                        {stat.firstCreated ? fmtDate(stat.firstCreated) : '—'}
                        {stat.lastDone ? ` → ${fmtDate(stat.lastDone)}` : ''}
                        {daysBetween(stat.firstCreated, stat.lastDone) !== null
                          ? ` (${daysBetween(stat.firstCreated, stat.lastDone)}n)`
                          : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CHART ── */}
        {activeSection === 'chart' && (
          <div className="lg-section">
            <div className="lg-chart-title">% hoàn thành theo tuần</div>
            {chartData.length === 0 ? (
              <div className="lg-empty"><i className="ti ti-chart-line-off" /><span>Chưa có dữ liệu</span></div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef4f1" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#aaa', fontFamily: 'Sora' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#aaa', fontFamily: 'Sora' }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', fontFamily: 'Sora', paddingTop: '8px' }}
                    iconType="circle" iconSize={8}
                  />
                  {displayMe && (
                    <Line
                      type="monotone" dataKey={myName}
                      stroke="#1D9E75" strokeWidth={2.5}
                      dot={{ r: 4, fill: '#1D9E75', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  )}
                  {displayFriend && (
                    <Line
                      type="monotone" dataKey={frName}
                      stroke="#378ADD" strokeWidth={2.5}
                      dot={{ r: 4, fill: '#378ADD', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
            <div className="lg-chart-note">
              Mỗi điểm trên biểu đồ là % tích lũy đến cuối tuần đó
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="lg-nav">
        <button className="lg-nav-btn" onClick={() => onNavigate('home')}>
          <i className="ti ti-home" /><span>Trang chủ</span>
        </button>
        <button className="lg-nav-btn" onClick={() => onNavigate('tasks')}>
          <i className="ti ti-checkbox" /><span>Việc của tôi</span>
        </button>
        <button className="lg-nav-btn lg-nav-btn--active" onClick={() => onNavigate('log')}>
          <i className="ti ti-timeline" /><span>Nhật ký</span>
        </button>
        <button className="lg-nav-btn lg-nav-btn--logout" onClick={onLogout}>
          <i className="ti ti-logout" /><span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}