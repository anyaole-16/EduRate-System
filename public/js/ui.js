/**
 * ui.js — EduRate shared UI layer
 *
 * Responsibilities:
 *  1. Flash → Toast   reads server-injected .flash-data elements, fires toasts
 *  2. Toast system    programmatic showToast() + auto-dismiss
 *  3. Password toggle show/hide for all .password-field inputs
 *  4. Sidebar         responsive open/close, overlay dismiss, active-link highlight
 *  5. Modal system    open / close / backdrop-click / Esc-key for .modal-overlay dialogs
 *  6. Confirm dialogs data-confirm="…" on any button/link before submit or nav
 *  7. Form guards     prevent double-submit, loading state on submit buttons
 *  8. Table search    live filter for tables with data-search-target
 *  9. Char counter    for textareas with data-max-chars + data-char-target
 * 10. Tooltips        data-tooltip="…" hover tooltips
 * 11. Auto-dismiss    alerts with data-autodismiss="ms"
 */

;(function () {
  'use strict';

  /* ============================================================
     CONSTANTS
  ============================================================ */
  const TOAST_ICONS = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const TOAST_DURATION = { success: 4000, error: 6000, info: 4000, warning: 5000 };


  /* ============================================================
     1. FLASH → TOAST
     The toast.ejs partial renders hidden <div class="flash-data"
     data-type="success|error|info|warning" data-msg="…">
     We pick them up on DOMContentLoaded, fire toasts, remove nodes.
  ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.flash-data').forEach(el => {
      const type = el.dataset.type || 'info';
      const msg  = el.dataset.msg  || '';
      if (msg) showToast(msg, type);
      el.remove();
    });

    _initSidebar();
    _initModals();
    _initTableSearch();
    _initCharCounters();
    _initTooltips();
    _initAutoDismiss();
    _initActiveNavLinks();
  });


  /* ============================================================
     2. TOAST SYSTEM
  ============================================================ */

  /**
   * Display a toast notification.
   * @param {string} msg
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {number} [duration] Override auto-dismiss ms
   */
  function showToast(msg, type, duration) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;

    const dismiss = duration != null ? duration : (TOAST_DURATION[type] || 4000);
    const icon    = TOAST_ICONS[type] || '•';

    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.setAttribute('role', 'alert');
    t.setAttribute('aria-live', 'polite');
    t.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="toast-msg">'  + msg + '</span>' +
      '<button class="toast-close" aria-label="Dismiss">&times;</button>';

    t.querySelector('.toast-close').addEventListener('click', function () {
      _dismissToast(t);
    });

    container.appendChild(t);

    // Stagger if many toasts appear at once
    var count = container.children.length;
    if (count > 1) t.style.animationDelay = ((count - 1) * 60) + 'ms';

    t._dismissTimer = setTimeout(function () { _dismissToast(t); }, dismiss);
  }

  function _dismissToast(el) {
    clearTimeout(el._dismissTimer);
    el.style.animation = 'toastOut 0.25s ease forwards';
    el.addEventListener('animationend', function () { el.remove(); }, { once: true });
  }

  // Expose globally
  window.showToast = showToast;


  /* ============================================================
     3. PASSWORD TOGGLE
     Delegated listener — works on dynamically added fields.
     <div class="password-field">
       <input type="password">
       <button type="button" class="password-toggle">👁</button>
     </div>
  ============================================================ */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.password-toggle');
    if (!btn) return;

    var field = btn.closest('.password-field');
    if (!field) return;

    var input = field.querySelector('input[type="password"], input[type="text"]');
    if (!input) return;

    var hidden      = input.type === 'password';
    input.type      = hidden ? 'text' : 'password';
    btn.textContent = hidden ? '🙈' : '👁';
    btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    input.focus();
  });


  /* ============================================================
     4. SIDEBAR
     Toggle button: <button id="sidebar-toggle">
     Sidebar:       <aside id="sidebar" class="sidebar">
     Mobile overlay auto-created + destroyed.
  ============================================================ */
  var _sidebarOverlay = null;

  function _initSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    document.addEventListener('click', function (e) {
      if (!e.target.closest('#sidebar-toggle')) return;
      var isOpen = sidebar.classList.toggle('open');
      _toggleOverlay(isOpen, function () {
        sidebar.classList.remove('open');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        _removeOverlay();
      }
    });
  }

  function _toggleOverlay(create, onClose) {
    if (create) {
      if (_sidebarOverlay) return;
      _sidebarOverlay = document.createElement('div');
      _sidebarOverlay.className = 'sidebar-overlay';
      _sidebarOverlay.addEventListener('click', function () {
        onClose();
        _removeOverlay();
      });
      document.body.appendChild(_sidebarOverlay);
      requestAnimationFrame(function () {
        _sidebarOverlay && _sidebarOverlay.classList.add('visible');
      });
    } else {
      _removeOverlay();
    }
  }

  function _removeOverlay() {
    if (!_sidebarOverlay) return;
    _sidebarOverlay.classList.remove('visible');
    _sidebarOverlay.addEventListener('transitionend', function () {
      if (_sidebarOverlay) { _sidebarOverlay.remove(); _sidebarOverlay = null; }
    }, { once: true });
  }


  /* ============================================================
     5. MODAL SYSTEM
     Open:  <button data-modal-open="myModal">
     Close: <button data-modal-close> inside .modal-overlay
     HTML:
       <div id="myModal" class="modal-overlay" aria-hidden="true">
         <div class="modal" role="dialog" aria-modal="true">
           …
         </div>
       </div>
  ============================================================ */
  function _initModals() {
    document.addEventListener('click', function (e) {
      // Open
      var trigger = e.target.closest('[data-modal-open]');
      if (trigger) {
        e.preventDefault();
        openModal(trigger.dataset.modalOpen);
        return;
      }
      // Close button
      var closeBtn = e.target.closest('[data-modal-close]');
      if (closeBtn) {
        var overlay = closeBtn.closest('.modal-overlay');
        if (overlay) closeModal(overlay.id);
        return;
      }
      // Backdrop click
      if (e.target.classList.contains('modal-overlay')) {
        closeModal(e.target.id);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.modal-overlay.open');
      if (open) closeModal(open.id);
    });
  }

  function openModal(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    // Focus first interactive element
    var focusable = overlay.querySelector(
      'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }

  function closeModal(id) {
    var overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  window.openModal  = openModal;
  window.closeModal = closeModal;


  /* ============================================================
     6. CONFIRM DIALOGS
     <button data-confirm="Are you sure you want to delete this?">
     <a href="/delete/123" data-confirm="This cannot be undone.">
  ============================================================ */
  document.addEventListener('click', function (e) {
    var el  = e.target.closest('[data-confirm]');
    if (!el) return;
    var msg = el.dataset.confirm || 'Are you sure?';
    if (!confirm(msg)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });


  /* ============================================================
     7. FORM GUARDS — prevent double-submit + show loading state
     <form data-loading-text="Saving…">
       <button type="submit">Save</button>
     </form>
  ============================================================ */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.dataset.loadingText) return;

    var btn = form.querySelector('[type="submit"]');
    if (!btn || btn.disabled) return; // already submitted

    var originalHTML  = btn.innerHTML;
    var loadingText   = form.dataset.loadingText || 'Processing…';

    btn.disabled  = true;
    btn.innerHTML =
      '<span class="btn-spinner" aria-hidden="true"></span>' +
      '<span>' + loadingText + '</span>';

    // Restore if the user presses Back (bfcache restore)
    window.addEventListener('pageshow', function () {
      btn.disabled  = false;
      btn.innerHTML = originalHTML;
    }, { once: true });
  });


  /* ============================================================
     8. TABLE SEARCH — live row filter
     <input type="search"
            data-search-target="tableId"
            placeholder="Search…">
     <table id="tableId">…</table>
  ============================================================ */
  function _initTableSearch() {
    document.querySelectorAll('[data-search-target]').forEach(function (input) {
      var tableId = input.dataset.searchTarget;
      var table   = document.getElementById(tableId);
      if (!table) return;

      input.addEventListener('input', function () {
        var q    = input.value.trim().toLowerCase();
        var rows = table.querySelectorAll('tbody tr:not([data-empty-row])');
        var visible = 0;

        rows.forEach(function (row) {
          var match = !q || row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          if (match) visible++;
        });

        var emptyRow = table.querySelector('[data-empty-row]');
        if (emptyRow) emptyRow.style.display = visible === 0 ? '' : 'none';
      });
    });
  }


  /* ============================================================
     9. CHARACTER COUNTERS
     <textarea
       data-max-chars="1000"
       data-char-target="counterId"
     ></textarea>
     <span id="counterId">0 / 1000</span>
  ============================================================ */
  function _initCharCounters() {
    document.querySelectorAll('[data-max-chars]').forEach(function (el) {
      var max      = parseInt(el.dataset.maxChars, 10);
      var targetId = el.dataset.charTarget;
      var counter  = targetId ? document.getElementById(targetId) : null;

      function update() {
        var len = el.value.length;
        // Hard-cap
        if (len > max) {
          el.value = el.value.slice(0, max);
          len = max;
        }
        if (!counter) return;
        counter.textContent = len + ' / ' + max;
        counter.style.color =
          len >= max          ? 'var(--danger)'  :
          len >= max * 0.9    ? 'var(--warning)' :
          'var(--text-dim)';
      }

      el.addEventListener('input', update);
      update(); // initialise display
    });
  }


  /* ============================================================
    10. TOOLTIPS — lightweight hover tooltip via data-tooltip="…"
     <button data-tooltip="This is a helpful tip">?</button>
  ============================================================ */
  function _initTooltips() {
    var tip = null;

    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-tooltip]');
      if (!el || tip) return;

      tip = document.createElement('div');
      tip.className   = 'ui-tooltip';
      tip.textContent = el.dataset.tooltip;
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);

      var rect    = el.getBoundingClientRect();
      var tipRect = tip.getBoundingClientRect();
      var top     = rect.top  + window.scrollY - tipRect.height - 10;
      var left    = rect.left + window.scrollX + (rect.width / 2) - (tipRect.width / 2);

      // Flip below viewport top
      if (top < window.scrollY + 4) {
        top = rect.bottom + window.scrollY + 10;
        tip.classList.add('below');
      }
      // Clamp horizontal
      left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

      tip.style.top  = top  + 'px';
      tip.style.left = left + 'px';
    });

    document.addEventListener('mouseout', function (e) {
      var el = e.target.closest('[data-tooltip]');
      if (el && tip) {
        tip.remove();
        tip = null;
      }
    });

    // Also hide on scroll
    document.addEventListener('scroll', function () {
      if (tip) { tip.remove(); tip = null; }
    }, { passive: true });
  }


  /* ============================================================
    11. AUTO-DISMISS ALERTS
     <div class="alert alert-success" data-autodismiss="3000">…</div>
  ============================================================ */
  function _initAutoDismiss() {
    document.querySelectorAll('[data-autodismiss]').forEach(function (el) {
      var delay = parseInt(el.dataset.autodismiss, 10) || 3000;
      setTimeout(function () {
        el.style.transition = 'opacity 0.4s ease, max-height 0.5s ease, margin 0.4s ease, padding 0.4s ease';
        el.style.opacity    = '0';
        el.style.maxHeight  = el.offsetHeight + 'px'; // set explicit height before animating
        requestAnimationFrame(function () {
          el.style.maxHeight = '0';
          el.style.margin    = '0';
          el.style.padding   = '0';
          el.style.overflow  = 'hidden';
        });
        el.addEventListener('transitionend', function () { el.remove(); }, { once: true });
      }, delay);
    });
  }


  /* ============================================================
     ACTIVE NAV LINKS
     Compares a.nav-item[href] to current pathname.
     The server also sets .active via EJS (activeNav prop),
     but this JS ensures correctness even if the partial
     is rendered without the prop.
  ============================================================ */
  function _initActiveNavLinks() {
    var path  = window.location.pathname;
    var links = document.querySelectorAll('a.nav-item');
    if (!links.length) return;

    var bestMatch  = null;
    var bestLen    = 0;

    links.forEach(function (link) {
      // Don't override server-set .active — it knows best
      if (link.classList.contains('active')) { bestMatch = null; bestLen = Infinity; return; }
      var href = link.getAttribute('href') || '';
      if (path === href && href.length > bestLen) {
        bestMatch = link; bestLen = href.length;
      } else if (path.startsWith(href) && href !== '/' && href.length > bestLen) {
        bestMatch = link; bestLen = href.length;
      }
    });

    if (bestMatch && bestLen !== Infinity) bestMatch.classList.add('active');
  }

})();