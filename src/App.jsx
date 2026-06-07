import { useState, useEffect } from 'react';
import { ref, get, update } from 'firebase/database';
import { db } from './firebase';
import LoginPage from './LoginPage';
import HomePage  from './HomePage';
import TaskPage  from './TaskPage';
import LogPage   from './LogPage';
import { getMyConfig } from './config';

const STORAGE_KEY = 'lvtn_race_user';

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 80px',
      fontFamily: 'Sora, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '14px',
        padding: '20px 16px 16px',
        width: 'min(340px, calc(100% - 32px))',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: '#FCEBEB', margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-logout" style={{ fontSize: 20, color: '#E24B4A' }} aria-hidden="true" />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#111', textAlign: 'center', margin: '0 0 4px' }}>
          Đăng xuất?
        </p>
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', margin: '0 0 16px' }}>
          Bạn sẽ cần nhập lại mật khẩu để vào app.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: '#eef4f1', color: '#555',
            fontSize: 13, fontWeight: 600, fontFamily: 'Sora, sans-serif',
          }}>
            Huỷ
          </button>
          <button onClick={onConfirm} style={{
            padding: '10px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: '#E24B4A', color: '#fff',
            fontSize: 13, fontWeight: 600, fontFamily: 'Sora, sans-serif',
          }}>
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}

async function checkStreak(userKey) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const snap   = await get(ref(db, `users/${userKey}`));
  const data   = snap.val() || {};
  const last   = data.lastActiveDate || null;
  const streak = data.streak || 0;

  if (last === today) return;

  const newStreak = last === yesterday ? streak + 1 : 1;
  await update(ref(db, `users/${userKey}`), {
    streak: newStreak,
    lastActiveDate: today,
  });
}

export default function App() {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [page,         setPage]         = useState('home');
  const [loading,      setLoading]      = useState(true);
  const [showLogout,   setShowLogout]   = useState(false);

  // Khôi phục session từ localStorage khi reload
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const user = JSON.parse(saved);
        const { dbKey } = getMyConfig(user.key);
        checkStreak(dbKey).finally(() => {
          setCurrentUser(user);
          setLoading(false);
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  async function handleLogin(key, name) {
    const { dbKey } = getMyConfig(key);
    await checkStreak(dbKey);
    const user = { key, name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
    setPage('home');
    setShowLogout(false);
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f5faf8',
        fontFamily: 'Sora, sans-serif', color: '#aaa', fontSize: '14px',
      }}>
        🌱
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const sharedProps = {
    currentUserKey: currentUser.key,
    onNavigate: setPage,
    onLogout: () => setShowLogout(true),
  };

  return (
    <>
      {page === 'home'  && <HomePage  {...sharedProps} />}
      {page === 'tasks' && <TaskPage  {...sharedProps} />}
      {page === 'log'   && <LogPage   {...sharedProps} />}
      {!['home','tasks','log'].includes(page) && (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <p>Trang <strong>{page}</strong> — sắp có!</p>
          <button onClick={() => setPage('home')}>← Về trang chủ</button>
        </div>
      )}
      {showLogout && (
        <LogoutModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}