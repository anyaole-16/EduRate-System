'use strict';

/**
 * routes/admin.js
 *
 * All routes are protected by requireAuth + requireRole('admin').
 *
 * ── Dashboard ──────────────────────────────────────────────────────
 * GET  /admin/dashboard
 *
 * ── Analytics ──────────────────────────────────────────────────────
 * GET  /admin/analytics                    ?semester=…&academicYear=…&department=…
 * GET  /admin/analytics/lecturer/:id       per-lecturer detail page
 *
 * ── Users ──────────────────────────────────────────────────────────
 * GET  /admin/users                        ?role=…&page=…
 * GET  /admin/users/new
 * POST /admin/users/new
 * GET  /admin/users/:id/edit
 * POST /admin/users/:id/edit
 * POST /admin/users/:id/toggle             activate / deactivate
 * POST /admin/users/advance-levels         advance all student levels
 *
 * ── Courses ────────────────────────────────────────────────────────
 * GET  /admin/courses                      ?department=…
 * GET  /admin/courses/new
 * POST /admin/courses/new
 * GET  /admin/courses/:id/edit
 * POST /admin/courses/:id/edit
 * POST /admin/courses/:id/enroll           add a student to a course
 *
 * ── Evaluation Criteria ────────────────────────────────────────────
 * GET  /admin/criteria
 * GET  /admin/criteria/new
 * POST /admin/criteria/new
 * GET  /admin/criteria/:id/edit
 * POST /admin/criteria/:id/edit
 * POST /admin/criteria/:id/toggle          activate / deactivate
 *
 * ── Evaluation Periods ─────────────────────────────────────────────
 * GET  /admin/periods
 * GET  /admin/periods/new
 * POST /admin/periods/new
 * GET  /admin/periods/:id/edit
 * POST /admin/periods/:id/edit
 * POST /admin/periods/:id/toggle           activate / deactivate
 *
 * ── Exports ────────────────────────────────────────────────────────
 * GET  /admin/export/csv                   ?semester=…&academicYear=…&department=…&lecturerId=…
 * GET  /admin/export/pdf                   same query params
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/role');

/* ── Apply auth + role guard to every admin route ───────────────── */
const guard = [requireAuth, requireRole('admin')];

/* ── Dashboard ───────────────────────────────────────────────────── */
router.get('/dashboard', ...guard, controller.dashboard);

/* ── Analytics ───────────────────────────────────────────────────── */
router.get('/analytics',                      ...guard, controller.analytics);
router.get('/analytics/lecturer/:lecturerId', ...guard, controller.lecturerDetail);

/* ── Users ───────────────────────────────────────────────────────── */
router.get( '/users',         ...guard, controller.listUsers);
router.get( '/users/new',     ...guard, controller.showNewUser);
router.post('/users/new',     ...guard, controller.createUser);
router.get( '/users/:id/edit',...guard, controller.showEditUser);
router.post('/users/:id/edit',...guard, controller.updateUser);
router.post('/users/:id/toggle',...guard, controller.toggleUser);
router.post('/users/advance-levels', ...guard, controller.advanceLevels);

/* ── Courses ─────────────────────────────────────────────────────── */
router.get( '/courses',             ...guard, controller.listCourses);
router.get( '/courses/new',         ...guard, controller.showNewCourse);
router.post('/courses/new',         ...guard, controller.createCourse);
router.get( '/courses/:id/edit',    ...guard, controller.showEditCourse);
router.post('/courses/:id/edit',    ...guard, controller.updateCourse);
router.post('/courses/:id/enroll',  ...guard, controller.enrollStudent);

/* ── Evaluation criteria ─────────────────────────────────────────── */
router.get( '/criteria',            ...guard, controller.listCriteria);
router.get( '/criteria/new',        ...guard, controller.showNewCriteria);
router.post('/criteria/new',        ...guard, controller.createCriteria);
router.get( '/criteria/:id/edit',   ...guard, controller.showEditCriteria);
router.post('/criteria/:id/edit',   ...guard, controller.updateCriteria);
router.post('/criteria/:id/toggle', ...guard, controller.toggleCriteria);

/* ── Evaluation periods ──────────────────────────────────────────── */
router.get( '/periods',            ...guard, controller.listPeriods);
router.get( '/periods/new',        ...guard, controller.showNewPeriod);
router.post('/periods/new',        ...guard, controller.createPeriod);
router.get( '/periods/:id/edit',   ...guard, controller.showEditPeriod);
router.post('/periods/:id/edit',   ...guard, controller.updatePeriod);
router.post('/periods/:id/toggle', ...guard, controller.togglePeriod);

/* ── Exports ─────────────────────────────────────────────────────── */
router.get('/export/csv', ...guard, controller.exportCSV);
router.get('/export/pdf', ...guard, controller.exportPDF);

module.exports = router;