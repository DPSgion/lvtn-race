import { useState, useRef } from 'react';
import './LoginPage.css';
import { USERS } from './config';

export default function LoginPage({ onLogin }) {
  const [selectedUser, setSelectedUser] = useState('A');
  const [password, setPassword]         = useState('');
  const [showPw, setShowPw]             = useState(false);
  const pwRef                           = useRef(null);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);

  function handleSelectUser(key) {
    setSelectedUser(key);
    setPassword('');
    setError('');
  }

  function handleLogin() {
    if (password === USERS[selectedUser].password) {
      setSuccess(true);
      setError('');
      setTimeout(() => onLogin(selectedUser, USERS[selectedUser].name), 600);
    } else {
      setError('Sai mật khẩu rồi, thử lại nha!');
    }
  }

  return (
    <div className="lp-wrap">
      <div className={`lp-card ${error ? 'lp-shake' : ''}`}>

        {/* Logo cây */}
        <svg className="lp-tree" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="28" cy="28" r="28" fill="#E1F5EE"/>
          <rect x="25" y="36" width="6" height="10" rx="2" fill="#0F6E56"/>
          <ellipse cx="28" cy="22" rx="11" ry="10" fill="#1D9E75"/>
          <ellipse cx="21" cy="28" rx="8"  ry="7"  fill="#1D9E75"/>
          <ellipse cx="35" cy="27" rx="8"  ry="7"  fill="#1D9E75"/>
          <ellipse cx="28" cy="18" rx="9"  ry="8"  fill="#5DCAA5"/>
        </svg>

        <h1 className="lp-title">LVTN Race 🌱</h1>
        <p className="lp-sub">Chọn người dùng và nhập mật khẩu</p>

        {/* Chọn user */}
        <div className="lp-tabs">
          {Object.entries(USERS).map(([key, user]) => (
            <button
              key={key}
              className={`lp-tab ${selectedUser === key ? 'lp-tab--active' : ''} lp-tab--${key.toLowerCase()}`}
              onClick={() => handleSelectUser(key)}
            >
              <div className="lp-avatar">{user.initials}</div>
              <span className="lp-uname">{user.name}</span>
            </button>
          ))}
        </div>

        {/* Mật khẩu */}
        <label className="lp-label" htmlFor="pw">Mật khẩu</label>
        <div className="lp-pw-wrap">
          <input
            id="pw"
            ref={pwRef}
            className="lp-input"
            type={showPw ? 'text' : 'password'}
            value={password}
            placeholder="Nhập mật khẩu..."
            autoComplete="current-password"
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <button className="lp-eye" onClick={() => { setShowPw(v => !v); setTimeout(() => { const el = pwRef.current; if (!el) return; el.focus(); const len = el.value.length; el.setSelectionRange(len, len); }, 0); }} aria-label="Hiện/ẩn mật khẩu">
            {showPw ? '🙈' : '👁️'}
          </button>
        </div>

        <button
          className={`lp-btn ${success ? 'lp-btn--success' : ''}`}
          onClick={handleLogin}
          disabled={success}
        >
          {success ? '✓ Đăng nhập thành công!' : 'Vào thôi →'}
        </button>

        {error && <p className="lp-error">{error}</p>}
      </div>
    </div>
  );
}