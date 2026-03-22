// ===== profile.js — Password strength + match validation =====

const newPwd     = document.getElementById('newPassword');
const confirmPwd = document.getElementById('confirmPassword');
const strengthBar = document.getElementById('pwd-strength-bar');
const strengthLbl = document.getElementById('pwd-strength-label');
const matchHint   = document.getElementById('confirm-match-hint');
const submitBtn   = document.getElementById('pwd-submit-btn');

function getStrength(pwd) {
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function updateStrength() {
  if (!newPwd || !strengthBar || !strengthLbl) return;
  const val = newPwd.value;
  if (!val) {
    strengthBar.style.width = '0%';
    strengthLbl.textContent = 'Enter a new password';
    return;
  }
  const s = getStrength(val);
  const pcts   = [0, 20, 40, 60, 80, 100];
  const colors = ['','var(--danger)','var(--danger)','var(--warning)','var(--accent2)','var(--success)'];
  const labels = ['','Too short','Weak','Fair','Good','Strong'];
  strengthBar.style.width  = pcts[s] + '%';
  strengthBar.style.background = colors[s];
  strengthLbl.textContent  = labels[s];
  strengthLbl.style.color  = colors[s];
}

function updateMatch() {
  if (!newPwd || !confirmPwd || !matchHint) return;
  if (!confirmPwd.value) { matchHint.textContent = ''; return; }
  const match = newPwd.value === confirmPwd.value;
  matchHint.textContent = match ? '✓ Passwords match' : '✕ Passwords do not match';
  matchHint.style.color = match ? 'var(--success)' : 'var(--danger)';
}

if (newPwd) {
  newPwd.addEventListener('input', () => { updateStrength(); updateMatch(); });
}
if (confirmPwd) {
  confirmPwd.addEventListener('input', updateMatch);
}

// Guard submit
const pwdForm = document.getElementById('pwd-form');
if (pwdForm && submitBtn) {
  pwdForm.addEventListener('submit', e => {
    if (newPwd.value !== confirmPwd.value) {
      e.preventDefault();
      if (matchHint) {
        matchHint.textContent = '✕ Passwords do not match';
        matchHint.style.color = 'var(--danger)';
      }
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';
  });
}
