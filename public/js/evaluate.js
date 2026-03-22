// ===== evaluate.js — Likert form interactions =====

const totalCriteria = document.querySelectorAll('.likert-group').length;
const answeredGroups = new Set();

function updateProgress() {
  const pct = totalCriteria ? Math.round((answeredGroups.size / totalCriteria) * 100) : 0;
  const bar   = document.getElementById('completion-bar');
  const label = document.getElementById('completion-label');
  if (bar)   bar.style.width = pct + '%';
  if (label) label.textContent = `${answeredGroups.size} / ${totalCriteria} answered`;

  // Turn bar green when complete
  if (bar) {
    if (pct === 100) bar.style.background = 'var(--success)';
    else if (pct >= 50) bar.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
    else bar.style.background = 'var(--accent)';
  }
}

document.querySelectorAll('.likert-radio').forEach(radio => {
  radio.addEventListener('change', () => {
    answeredGroups.add(radio.dataset.group);
    updateProgress();
  });
});

// Character counter
const feedback = document.getElementById('feedback-textarea');
const charCount = document.getElementById('char-count');
if (feedback && charCount) {
  feedback.addEventListener('input', () => {
    const len = feedback.value.length;
    charCount.textContent = `${len} / 1000`;
    charCount.style.color = len > 900 ? 'var(--warning)' : 'var(--text-dim)';
  });
}

// Prevent double-submit
const form = document.getElementById('eval-form');
const submitBtn = document.getElementById('submit-btn');
if (form && submitBtn) {
  form.addEventListener('submit', () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  });
}

updateProgress();
