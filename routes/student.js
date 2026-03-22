'use strict';

/**
 * routes/student.js
 *
 * All routes are protected by requireAuth + requireRole('student').
 * Uses PRG (Post/Redirect/Get) on all POST handlers so that
 * browser refresh never re-submits a form.
 *
 * GET  /student/dashboard               → overview: pending + completed evaluations
 * GET  /student/evaluate                → alias → redirect to /student/dashboard
 * GET  /student/evaluate/:courseId      → evaluation form for one course
 * POST /student/evaluate/:courseId      → submit evaluation, redirect to dashboard
 * GET  /student/profile                 → view profile details
 * POST /student/profile/password        → change password, redirect back with flash
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/studentController');
const { requireAuth, requireRole } = require('../middleware/role');

/* ── Apply auth + role guard to every student route ─────────────── */
const guard = [requireAuth, requireRole('student')];

/* ── Dashboard ───────────────────────────────────────────────────── */
router.get('/dashboard', ...guard, controller.dashboard);

/* ── Evaluations ─────────────────────────────────────────────────── */
// Sidebar "My Evaluations" link: just re-show the dashboard
router.get('/evaluate', ...guard, (req, res) => res.redirect('/student/dashboard'));

// Show evaluation form for a specific course
router.get('/evaluate/:courseId', ...guard, controller.showEvaluateForm);

// Submit completed evaluation
router.post('/evaluate/:courseId', ...guard, controller.submitEvaluation);

/* ── Profile ─────────────────────────────────────────────────────── */
router.get('/profile', ...guard, controller.showProfile);

// Change password
router.post('/profile/password', ...guard, controller.changePassword);

module.exports = router;