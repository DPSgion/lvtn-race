import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from './firebase';
import './HomePage.css';
import { getMyConfig, getFriendConfig } from './config';

/**
 * Tính index hình (0-based) dựa vào % tiến độ và số lượng hình.
 * VD: 5 hình, 0–19% → hình 1, 20–39% → hình 2, ..., 80–100% → hình 5
 */
function getImageIndex(pct, totalImages) {
  if (totalImages <= 0) return 0;
  const idx = Math.floor((pct / 100) * totalImages);
  return Math.min(idx, totalImages - 1);
}

/**
 * Tính % tiến độ từ dữ liệu categories trong Firebase.
 * Đếm số subtask done / tổng subtask.
 */
function calcProgress(categories) {
  if (!categories) return { pct: 0, done: 0, total: 0 };
  let done = 0, total = 0;
  Object.values(categories).forEach(cat => {
    const subtasks = cat.subtasks ? Object.values(cat.subtasks) : [];
    subtasks.forEach(t => {
      total++;
      if (t.done) done++;
    });
  });
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { pct, done, total };
}

function PlayerCard({ name, folder, totalImages, progress, streak, isMe }) {
  const { pct, done, total } = progress;
  const imgIdx  = getImageIndex(pct, totalImages);
  const base    = import.meta.env.BASE_URL;
  const imgSrc  = `${base}${folder}/${imgIdx + 1}.png`;
  const imgSrcGif = `${base}${folder}/${imgIdx + 1}.gif`;
  const stage   = imgIdx + 1;

  function handleImgError(e) {
    if (e.target.src.endsWith('.png')) {
      e.target.src = imgSrcGif;
    } else {
      e.target.style.display = 'none';
    }
  }

  return (
    <div className={`hp-player-card ${isMe ? 'hp-player-card--me' : ''}`}>
      <div className="hp-player-name">
        {name}
        {isMe && <span className="hp-badge-me">bạn</span>}
      </div>

      <div className="hp-img-frame">
        <img
          src={imgSrc}
          alt={`${name} giai đoạn ${stage}`}
          onError={handleImgError}
        />
        <span className="hp-img-stage">
          Giai đoạn {stage}/{totalImages}
        </span>
      </div>

      <div className="hp-prog-row">
        <div className="hp-prog-label">
          <span className="hp-prog-num">{pct}%</span>
          <span className="hp-prog-sub">{done}/{total} tasks</span>
        </div>
        <div className="hp-bar-bg">
          <div
            className={`hp-bar-fill ${isMe ? 'hp-bar-fill--me' : 'hp-bar-fill--friend'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="hp-streak-row">
        <span>🔥</span>
        <span className="hp-streak-txt">
          Streak: <strong>{streak}</strong> ngày
        </span>
      </div>
    </div>
  );
}

export default function HomePage({ currentUserKey, onNavigate, onLogout }) {
  const [meData,     setMeData]     = useState(null);
  const [friendData, setFriendData] = useState(null);
  const [meStreak,   setMeStreak]   = useState(0);
  const [frStreak,   setFrStreak]   = useState(0);

  const me = getMyConfig(currentUserKey);
  const fr = getFriendConfig(currentUserKey);

  useEffect(() => {
    const unsubMe = onValue(ref(db, `tasks/${me.dbKey}/categories`), snap => {
      setMeData(snap.val());
    });
    const unsubFriend = onValue(ref(db, `tasks/${fr.dbKey}/categories`), snap => {
      setFriendData(snap.val());
    });
    const unsubMeStreak = onValue(ref(db, `users/${me.dbKey}/streak`), snap => {
      setMeStreak(snap.val() || 0);
    });
    const unsubFrStreak = onValue(ref(db, `users/${fr.dbKey}/streak`), snap => {
      setFrStreak(snap.val() || 0);
    });

    return () => { unsubMe(); unsubFriend(); unsubMeStreak(); unsubFrStreak(); };
  }, [me.dbKey, fr.dbKey]);

  const myProgress = calcProgress(meData);
  const frProgress = calcProgress(friendData);
  const vsTotal    = (myProgress.pct + frProgress.pct) || 1;

  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  });

  return (
    <div className="hp-wrap">
      <div className="hp-header">
        <div className="hp-logo">🌱 LVTN Race</div>
        <div className="hp-date">{today}</div>
      </div>

      <div className="hp-grid">
        <PlayerCard
          name={me.name}
          folder={me.imgFolder}
          totalImages={me.imgCount}
          progress={myProgress}
          streak={meStreak}
          isMe={true}
        />
        <PlayerCard
          name={fr.name}
          folder={fr.imgFolder}
          totalImages={fr.imgCount}
          progress={frProgress}
          streak={frStreak}
          isMe={false}
        />
      </div>

      <div className="hp-vs-row">
        <span className="hp-vs-label">{me.name} {myProgress.pct}%</span>
        <div className="hp-vs-bar">
          <div className="hp-vs-me"     style={{ width: `${Math.round(myProgress.pct / vsTotal * 100)}%` }} />
          <div className="hp-vs-friend" style={{ width: `${Math.round(frProgress.pct / vsTotal * 100)}%` }} />
        </div>
        <span className="hp-vs-label">{fr.name} {frProgress.pct}%</span>
      </div>

      <div className="hp-nav">
        <button className="hp-nav-btn hp-nav-btn--active" onClick={() => onNavigate('home')}>
          <i className="ti ti-home" aria-hidden="true" />
          <span>Trang chủ</span>
        </button>
        <button className="hp-nav-btn" onClick={() => onNavigate('tasks')}>
          <i className="ti ti-checkbox" aria-hidden="true" />
          <span>Việc của tôi</span>
        </button>
        <button className="hp-nav-btn" onClick={() => onNavigate('log')}>
          <i className="ti ti-timeline" aria-hidden="true" />
          <span>Nhật ký</span>
        </button>
        <button className="hp-nav-btn hp-nav-btn--logout" onClick={onLogout}>
          <i className="ti ti-logout" aria-hidden="true" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}
