/**
 * middleware/role.js — Role-Based Access Control (RBAC)
 *
 * EduRate has three roles:  student | lecturer | admin
 *
 * Usage in routes:
 *
 *   const { requireAuth, requireRole, requireSelf } = require('../middleware/role');
 *
 *   // Any authenticated user
 *   router.get('/profile', requireAuth, controller.profile);
 *
 *   // Only admins
 *   router.get('/admin/users', requireAuth, requireRole('admin'), controller.users);
 *
 *   // Admins OR lecturers
 *   router.get('/reports', requireAuth, requireRole('admin', 'lecturer'), controller.reports);
 *
 *   // User can only access their own resource (or admin can access any)
 *   router.get('/student/:id', requireAuth, requireSelf('id'), controller.student);
 *
 * Session shape expected on req.session.user (set by authController after login):
 *   { _id, fullName, email, role, department, school, isActive }
 *
 * All unauthenticated redirects go to /auth/login.
 * All forbidden responses go to /403 (or render inline if no 403 route exists).
 */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   INTERNAL HELPERS
────────────────────────────────────────────────────────────────── */

/**
 * Redirect to login, preserving the intended URL so we can
 * bounce the user back after they authenticate.
 */
function redirectToLogin(req, res) {
  const returnTo = encodeURIComponent(req.originalUrl);
  return res.redirect('/auth/login?returnTo=' + returnTo);
}

/**
 * Render a 403 Forbidden response.
 * Falls back to a plain-text JSON response if the view engine
 * is not configured (useful during testing).
 */
function forbidden(req, res, message) {
  message = message || 'You do not have permission to access this page.';
  res.status(403);

  if (req.accepts('html')) {
    // Try to render a 403 view if it exists; otherwise inline
    return res.render('errors/403', {
      title   : '403 — Forbidden',
      message : message,
      user    : req.session && req.session.user,
    }, function (renderErr, html) {
      if (renderErr) {
        // View doesn't exist — send a minimal HTML page
        return res.send(
          '<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body>' +
          '<h1>403 — Forbidden</h1><p>' + message + '</p>' +
          '<p><a href="javascript:history.back()">Go back</a></p>' +
          '</body></html>'
        );
      }
      return res.send(html);
    });
  }

  // API / JSON client
  return res.json({ success: false, status: 403, message: message });
}

/* ──────────────────────────────────────────────────────────────────
   1. requireAuth
   Ensures a user session exists. Redirects to /auth/login if not.
────────────────────────────────────────────────────────────────── */

/**
 * Middleware — user must be logged in.
 * Attaches req.user as a shorthand alias for req.session.user.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return redirectToLogin(req, res);
  }

  // Guard against deactivated accounts that somehow kept a session
  if (req.session.user.isActive === false) {
    req.session.destroy(function () {});
    return redirectToLogin(req, res);
  }

  // Convenience alias used throughout controllers and views
  req.user = req.session.user;
  return next();
}

/* ──────────────────────────────────────────────────────────────────
   2. requireRole(...roles)
   Factory — returns a middleware that allows only the listed roles.
   Must be chained AFTER requireAuth so req.user is populated.

   Examples:
     requireRole('admin')
     requireRole('admin', 'lecturer')
────────────────────────────────────────────────────────────────── */

/**
 * @param {...string} roles - One or more allowed role strings
 * @returns {Function} Express middleware
 */
function requireRole() {
  // Accept requireRole('admin') OR requireRole(['admin', 'lecturer'])
  var allowed = Array.isArray(arguments[0])
    ? arguments[0]
    : Array.prototype.slice.call(arguments);

  if (allowed.length === 0) {
    throw new Error('requireRole() called with no roles — pass at least one role string');
  }

  return function roleGuard(req, res, next) {
    // requireAuth must run first
    if (!req.user) {
      return redirectToLogin(req, res);
    }

    if (allowed.indexOf(req.user.role) === -1) {
      var msg = 'Access restricted to: ' + allowed.join(', ') + '. ' +
                'Your role is: ' + req.user.role + '.';
      return forbidden(req, res, msg);
    }

    return next();
  };
}

/* ──────────────────────────────────────────────────────────────────
   3. requireSelf(paramName)
   Allows access only if the route param matches the logged-in
   user's _id, OR the user is an admin (who can access any record).

   Example:
     router.get('/student/:id/profile', requireAuth, requireSelf('id'), ...)
────────────────────────────────────────────────────────────────── */

/**
 * @param {string} [paramName='id'] - The req.params key holding the target user ID
 * @returns {Function} Express middleware
 */
function requireSelf(paramName) {
  paramName = paramName || 'id';

  return function selfGuard(req, res, next) {
    if (!req.user) {
      return redirectToLogin(req, res);
    }

    // Admins can access any user record
    if (req.user.role === 'admin') {
      return next();
    }

    var targetId  = req.params[paramName];
    var currentId = String(req.user._id);

    if (!targetId || targetId !== currentId) {
      return forbidden(
        req, res,
        'You can only access your own account.'
      );
    }

    return next();
  };
}

/* ──────────────────────────────────────────────────────────────────
   4. requireActive
   Extra guard that re-checks isActive in case it was toggled
   by an admin while the user is mid-session.
   Call AFTER requireAuth.
────────────────────────────────────────────────────────────────── */

/**
 * Middleware — rejects deactivated users even if they hold a valid session.
 * In production you'd do a lightweight DB lookup here. This version
 * trusts the session value (refreshed on each login).
 */
function requireActive(req, res, next) {
  if (!req.user) {
    return redirectToLogin(req, res);
  }
  if (req.user.isActive === false) {
    req.session.destroy(function () {});
    req.session = null;
    return redirectToLogin(req, res);
  }
  return next();
}

/* ──────────────────────────────────────────────────────────────────
   5. Convenience composed guards
   Pre-built combos used frequently in routes.
────────────────────────────────────────────────────────────────── */

/** requireAuth + requireRole('admin') */
var adminOnly = [requireAuth, requireRole('admin')];

/** requireAuth + requireRole('lecturer') */
var lecturerOnly = [requireAuth, requireRole('lecturer')];

/** requireAuth + requireRole('student') */
var studentOnly = [requireAuth, requireRole('student')];

/** requireAuth + requireRole('admin', 'lecturer') */
var staffOnly = [requireAuth, requireRole('admin', 'lecturer')];

/* ──────────────────────────────────────────────────────────────────
   EXPORTS
────────────────────────────────────────────────────────────────── */

module.exports = {
  requireAuth,
  requireRole,
  requireSelf,
  requireActive,

  // Convenience composed arrays (spread into router.use / router.get etc.)
  adminOnly,
  lecturerOnly,
  studentOnly,
  staffOnly,
};