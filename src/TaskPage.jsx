import { useEffect, useState, useRef } from 'react';
import { ref, onValue, push, remove, update } from 'firebase/database';
import { db } from './firebase';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import confetti from 'canvas-confetti';
import './TaskPage.css';
import { FIXED_CATS, getMyConfig, getFriendConfig } from './config';

/** "2025-06-08" — dùng để so sánh ngày */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cập nhật streak sau mỗi lần tick task thành công.
 * Đọc lastActiveDate từ Firebase, so sánh với hôm nay:
 *   - Cùng ngày  → không làm gì
 *   - Hôm qua    → tăng streak thêm 1
 *   - Xa hơn     → reset streak về 1
 */
async function updateStreak(userKey) {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const userRef = ref(db, `users/${userKey}`);
  const snap = await get(userRef);
  const data = snap.val() || {};
  const last = data.lastActiveDate || null;
  const streak = data.streak || 0;

  if (last === today) return; // đã cập nhật hôm nay rồi

  const newStreak = last === yesterday ? streak + 1 : 1;
  await update(userRef, { streak: newStreak, lastActiveDate: today });
}

/** Bắn confetti ăn mừng */
function fireConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;
  const colors = ['#1D9E75', '#5DCAA5', '#85DBC0', '#FFD700', '#FF6B6B'];

  (function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ── Subtask row (sortable) ──────────────────────────────────────────────────
function SortableSubtask({ task, readOnly, onToggle, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tk-subtask-row ${task.done ? 'done' : ''} ${readOnly ? 'readonly' : ''}`}
    >
      {!readOnly && (
        <span className="tk-drag-handle" {...attributes} {...listeners} aria-label="Kéo để sắp xếp">
          <i className="ti ti-grip-vertical" aria-hidden="true" />
        </span>
      )}
      <input
        type="checkbox"
        className="tk-cb"
        checked={!!task.done}
        disabled={readOnly}
        onChange={() => onToggle(task.id)}
      />
      <span className="tk-subtask-name">{task.text}</span>
      {!readOnly && (
        <button className="tk-del-btn" onClick={() => onDelete(task.id)} aria-label="Xóa subtask">
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Category card ───────────────────────────────────────────────────────────
function CategoryCard({ cat, isFixed, readOnly, userKey, onDeleteCat, onTaskToggled }) {
  const [open,     setOpen]     = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [subtasks, setSubtasks] = useState([]);

  const basePath = `tasks/${userKey}/categories/${cat.id}/subtasks`;

  useEffect(() => {
    const unsub = onValue(ref(db, basePath), snap => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
      list.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
      setSubtasks(list);
    });
    return unsub;
  }, [basePath]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function addSubtask() {
    const text = inputVal.trim();
    if (!text) return;
    const minOrder = subtasks.length ? Math.min(...subtasks.map(s => s.order ?? 0)) : 0;
    await push(ref(db, basePath), { text, done: false, createdAt: Date.now(), order: minOrder - 1 });
    setInputVal('');
  }

  async function toggleSubtask(taskId) {
    const t = subtasks.find(s => s.id === taskId);
    if (!t) return;
    const nowDone = !t.done;
    // Ghi doneAt khi tick, xóa doneAt khi untick để timestamp luôn là lần tick cuối cùng
    const updates = { done: nowDone, doneAt: nowDone ? Date.now() : null };
    await update(ref(db, `${basePath}/${taskId}`), updates);
    if (nowDone) onTaskToggled();
  }

  async function deleteSubtask(taskId) {
    await remove(ref(db, `${basePath}/${taskId}`));
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = subtasks.findIndex(s => s.id === active.id);
    const newIdx = subtasks.findIndex(s => s.id === over.id);
    const reordered = arrayMove(subtasks, oldIdx, newIdx);
    const writes = {};
    reordered.forEach((s, i) => { writes[`${basePath}/${s.id}/order`] = i; });
    await update(ref(db), writes);
  }

  const doneCnt = subtasks.filter(s => s.done).length;
  const pct     = subtasks.length ? Math.round(doneCnt / subtasks.length * 100) : 0;
  const R = 12, circ = 2 * Math.PI * R;
  const dash = circ * (pct / 100);

  return (
    <div className="tk-cat-card">
      <div className="tk-cat-head" onClick={() => setOpen(v => !v)}>
        <svg className="tk-circle" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r={R} fill="none" stroke="#eef4f1" strokeWidth="2.5" />
          <circle cx="14" cy="14" r={R} fill="none" stroke="#1D9E75" strokeWidth="2.5"
            strokeDasharray={`${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`}
            strokeDashoffset={(circ / 4).toFixed(1)}
            strokeLinecap="round" />
        </svg>
        <div className="tk-cat-info">
          <div className="tk-cat-name">{cat.label}</div>
          <div className="tk-cat-sub">{doneCnt}/{subtasks.length} subtask</div>
        </div>
        {!isFixed && !readOnly && (
          <button className="tk-del-cat-btn" onClick={e => { e.stopPropagation(); onDeleteCat(cat.id); }} aria-label="Xóa hạng mục">
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        )}
        <i className={`ti ti-chevron-down tk-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
      </div>

      {open && (
        <div className="tk-cat-body">
          {!readOnly && (
            <div className="tk-add-row">
              <input
                className="tk-add-input"
                placeholder="Thêm subtask..."
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
              />
              <button className="tk-add-btn" onClick={addSubtask}>+ Thêm</button>
            </div>
          )}

          {subtasks.length === 0
            ? <div className="tk-empty">Chưa có subtask nào</div>
            : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={subtasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="tk-subtask-list">
                    {subtasks.map(t => (
                      <SortableSubtask
                        key={t.id} task={t} readOnly={readOnly}
                        onToggle={toggleSubtask} onDelete={deleteSubtask}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )
          }
        </div>
      )}
    </div>
  );
}

// ── TaskPage ────────────────────────────────────────────────────────────────
export default function TaskPage({ currentUserKey, onNavigate, onLogout }) {
  const [viewMode,   setViewMode]   = useState('me');
  const [customCats, setCustomCats] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [totalStats, setTotalStats] = useState({ done: 0, total: 0 });
  const [showComplete, setShowComplete] = useState(false);

  // Dùng ref để không re-render khi check confetti đã bắn chưa
  const confettiFiredRef = useRef(false);

  const me       = getMyConfig(currentUserKey);
  const fr       = getFriendConfig(currentUserKey);
  const myKey    = me.dbKey;
  const viewKey  = viewMode === 'me' ? me.dbKey : fr.dbKey;
  const readOnly = viewMode === 'friend';
  const viewName = viewMode === 'me' ? me.name : fr.name;

  // Load custom categories
  useEffect(() => {
    const unsub = onValue(ref(db, `tasks/${viewKey}/custom_categories`), snap => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([k, v]) => ({ id: k, ...v }));
      list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      setCustomCats(list);
    });
    return unsub;
  }, [viewKey]);

  // Tính tổng stats realtime — 2 listener độc lập, mỗi cái giữ snapshot riêng
  // trong object cục bộ để tính gộp mà không cần get() chéo (tránh race condition)
  useEffect(() => {
    const snapshots = { cats: {}, custom: {} };

    function recompute() {
      let done = 0, total = 0;
      const count = obj => {
        Object.values(obj.subtasks || {}).forEach(t => { total++; if (t.done) done++; });
      };
      Object.values(snapshots.cats).forEach(count);
      Object.values(snapshots.custom).forEach(count);
      setTotalStats({ done, total });
    }

    const unsubCats = onValue(ref(db, `tasks/${viewKey}/categories`), snap => {
      snapshots.cats = snap.val() || {};
      recompute();
    });

    const unsubCustom = onValue(ref(db, `tasks/${viewKey}/custom_categories`), snap => {
      snapshots.custom = snap.val() || {};
      recompute();
    });

    return () => { unsubCats(); unsubCustom(); };
  }, [viewKey]);

  // Khi stats thay đổi, kiểm tra confetti (chỉ khi đang xem của mình)
  useEffect(() => {
    if (viewMode !== 'me') return;
    if (totalStats.total > 0 && totalStats.done === totalStats.total) {
      if (!confettiFiredRef.current) {
        confettiFiredRef.current = true;
        setShowComplete(true);
        fireConfetti();
      }
    } else {
      // Reset để bắn lại nếu người dùng untick rồi tick lại đến 100%
      confettiFiredRef.current = false;
      setShowComplete(false);
    }
  }, [totalStats, viewMode]);

  /**
   * Gọi mỗi khi user tick 1 task thành công.
   * Cập nhật streak trong Firebase.
   */
  async function handleTaskToggled() {
    await updateStreak(myKey);
  }

  async function addCustomCat() {
    const label = newCatName.trim();
    if (!label) return;
    await push(ref(db, `tasks/${myKey}/custom_categories`), { label, createdAt: Date.now() });
    setNewCatName('');
    setShowNewCat(false);
  }

  async function deleteCustomCat(catId) {
    await remove(ref(db, `tasks/${myKey}/custom_categories/${catId}`));
  }

  const pct = totalStats.total ? Math.round(totalStats.done / totalStats.total * 100) : 0;
  const allFixed  = FIXED_CATS.map(c => ({ ...c, isFixed: true }));
  const allCustom = customCats.map(c => ({ ...c, isFixed: false }));

  return (
    <div className="tk-wrap">
      {/* Banner hoàn thành */}
      {showComplete && viewMode === 'me' && (
        <div className="tk-complete-banner">
          🎉 Bạn đã hoàn thành luận văn!
        </div>
      )}

      {/* Header */}
      <div className="tk-header">
        <div className="tk-title">Việc của {viewName}</div>
        <div className="tk-toggle">
          <button
            className={`tk-toggle-btn ${viewMode === 'me' ? 'active' : ''}`}
            onClick={() => setViewMode('me')}
          >Của tôi</button>
          <button
            className={`tk-toggle-btn ${viewMode === 'friend' ? 'active' : ''}`}
            onClick={() => setViewMode('friend')}
          >Của {fr.name}</button>
        </div>
      </div>

      {/* Stats */}
      <div className="tk-summary">
        <div className="tk-stat"><div className="tk-stat-num">{totalStats.done}</div><div className="tk-stat-lbl">task xong</div></div>
        <div className="tk-stat"><div className="tk-stat-num">{totalStats.total}</div><div className="tk-stat-lbl">tổng task</div></div>
        <div className="tk-stat"><div className="tk-stat-num">{pct}%</div><div className="tk-stat-lbl">hoàn thành</div></div>
      </div>

      {/* Danh sách categories */}
      <div className="tk-list">
        {[...allFixed, ...allCustom].map(cat => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            isFixed={cat.isFixed}
            readOnly={readOnly}
            userKey={viewKey}
            onDeleteCat={deleteCustomCat}
            onTaskToggled={handleTaskToggled}
          />
        ))}

        {!readOnly && (
          showNewCat ? (
            <div className="tk-new-cat-row">
              <input
                className="tk-add-input"
                placeholder="Tên hạng mục mới..."
                value={newCatName}
                autoFocus
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addCustomCat();
                  if (e.key === 'Escape') setShowNewCat(false);
                }}
              />
              <button className="tk-add-btn" onClick={addCustomCat}>Tạo</button>
              <button className="tk-cancel-btn" onClick={() => setShowNewCat(false)}>Huỷ</button>
            </div>
          ) : (
            <button className="tk-add-cat-btn" onClick={() => setShowNewCat(true)}>
              <i className="ti ti-plus" aria-hidden="true" /> Thêm hạng mục
            </button>
          )
        )}
      </div>

      {/* Bottom nav */}
      <div className="tk-nav">
        <button className="tk-nav-btn" onClick={() => onNavigate('home')}>
          <i className="ti ti-home" aria-hidden="true" /><span>Trang chủ</span>
        </button>
        <button className="tk-nav-btn tk-nav-btn--active" onClick={() => onNavigate('tasks')}>
          <i className="ti ti-checkbox" aria-hidden="true" /><span>Việc của tôi</span>
        </button>
        <button className="tk-nav-btn" onClick={() => onNavigate('log')}>
          <i className="ti ti-timeline" aria-hidden="true" /><span>Nhật ký</span>
        </button>
        <button className="tk-nav-btn tk-nav-btn--logout" onClick={onLogout}>
          <i className="ti ti-logout" aria-hidden="true" /><span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}