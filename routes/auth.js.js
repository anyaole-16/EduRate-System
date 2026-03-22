'use strict';

/**
 * routes/auth.js
 *
 * Public authentication routes — no session required.
 * All POST handlers use PRG (Post/Redirect/Get) to prevent
 * form resubmission on browser refresh.
 *
 * GET  /auth/login            → render student/lecturer login page
 * POST /auth/login            → authenticate student/lecturer, redirect to dashboard
 * GET  /auth/admin-login      → render admin-only login page
 * POST /auth/admin-login      → authenticate admin, redirect to admin dashboard
 * GET  /auth/register          → render student registration page
 * POST /auth/register          → create student account, redirect to dashboard
 * GET  /auth/lecturer-register  → render lecturer self-registration page
 * POST /auth/lecturer-register  → create lecturer account, redirect to dashboard
 * GET  /auth/forgot-password  → render forgot-password page
 * POST /auth/forgot-password  → send reset email, redirect back with flash
 * GET  /auth/reset-password   → render reset-password page (token from query)
 * POST /auth/reset-password   → update password, redirect to login
 * POST /auth/logout           → destroy session, redirect to login
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/authController');
const { requireAuth } = require('../middleware/role');

/* ── Redirect root to login ─────────────────────────────────────── */
router.get('/', (req, res) => res.redirect('/auth/login'));

/* ── Student / Lecturer login ───────────────────────────────────── */
router.get('/login',  controller.showLogin);
router.post('/login', controller.login);

/* ── Admin-only login ───────────────────────────────────────────── */
router.get('/admin-login',  controller.showAdminLogin);
router.post('/admin-login', controller.adminLogin);

/* ── Student registration ───────────────────────────────────────── */
router.get('/register',  controller.showRegister);
router.post('/register', controller.register);

/* ── Lecturer self-registration ─────────────────────────────────── */
router.get('/lecturer-register',  controller.showLecturerRegister);
router.post('/lecturer-register', controller.lecturerRegister);

/* ── Forgot / reset password ────────────────────────────────────── */
router.get('/forgot-password',  controller.showForgotPassword);
router.post('/forgot-password', controller.forgotPassword);

router.get('/reset-password',  controller.showResetPassword);   // ?token=…
router.post('/reset-password', controller.resetPassword);

/* ── Logout ─────────────────────────────────────────────────────── */
router.post('/logout', requireAuth, controller.logout);

module.exports = router;
