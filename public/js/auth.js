// ===== auth.js — client-side auth page interactions =====

document.addEventListener('DOMContentLoaded', () => {

  // ── Role selector ───────────────────────────────────────────────
  const roleBtns       = document.querySelectorAll('.role-btn');
  const loginTitle     = document.getElementById('login-title');
  const loginSubtitle  = document.getElementById('login-subtitle');
  const footerStudent  = document.getElementById('login-footer-student');
  const footerLecturer = document.getElementById('login-footer-lecturer');

  const roleConfig = {
    student: {
      title    : 'Student Sign In',
      subtitle : 'Access your evaluation dashboard',
    },
    lecturer: {
      title    : 'Lecturer Sign In',
      subtitle : 'View your evaluation results and reports',
    },
  };

  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const role = btn.dataset.role;
      const cfg  = roleConfig[role];

      if (loginTitle    && cfg) loginTitle.textContent    = cfg.title;
      if (loginSubtitle && cfg) loginSubtitle.textContent = cfg.subtitle;

      // Swap footer message
      if (footerStudent && footerLecturer) {
        footerStudent.style.display  = role === 'student'  ? '' : 'none';
        footerLecturer.style.display = role === 'lecturer' ? '' : 'none';
      }
    });
  });

  // ── Password confirmation match ─────────────────────────────────
  document.querySelectorAll('form').forEach(form => {
    const pwd     = form.querySelector('#newPassword, #password');
    const confirm = form.querySelector('#confirmPassword');
    if (!pwd || !confirm) return;

    form.addEventListener('submit', e => {
      if (pwd.value !== confirm.value) {
        e.preventDefault();
        confirm.setCustomValidity('Passwords do not match');
        confirm.reportValidity();
      } else {
        confirm.setCustomValidity('');
      }
    });

    confirm.addEventListener('input', () => {
      confirm.setCustomValidity(
        confirm.value && pwd.value !== confirm.value ? 'Passwords do not match' : ''
      );
    });
  });

});