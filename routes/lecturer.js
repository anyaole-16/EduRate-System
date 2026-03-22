'use strict';

/**
 * routes/lecturer.js
 *
 * All routes are protected by requireAuth + requireRole('lecturer').
 * A lecturer can only see their own data — enforced at the
 * controller level using req.user._id as the filter.
 *
 * GET  /lecturer/dashboard              → overview with score ring + charts
 *                                          ?semester=First&academicYear=2023/2024
 * GET  /lecturer/reports                → detailed criteria table + written feedback
 *                                          ?semester=…&academicYear=…&courseId=…
 * GET  /lecturer/profile                → read-only account info + change-password form
 * POST /lecturer/profile/password       → update password, redirect back with flash
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/lecturerController');
const { requireAuth, requireRole } = require('../middleware/role');

/* ── Apply auth + role guard to every lecturer route ────────────── */
const guard = [requireAuth, requireRole('lecturer')];

/* ── Dashboard ───────────────────────────────────────────────────── */
// Supports optional GET filters: ?semester=First&academicYear=2023/2024
router.get('/dashboard', ...guard, controller.dashboard);

/* ── Evaluation reports ──────────────────────────────────────────── */
// Supports optional GET filters: ?semester=…&academicYear=…&courseId=…
router.get('/reports', ...guard, controller.reports);

/* ── Profile ─────────────────────────────────────────────────────── */
router.get('/profile', ...guard, controller.showProfile);
router.post('/profile/password', ...guard, controller.changePassword);

module.exports = router;