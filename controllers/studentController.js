'use strict';

/**
 * controllers/studentController.js
 *
 * Serves all student-facing pages and handles form submissions.
 * req.user is set by requireAuth and is a plain object from the session.
 *
 * Views rendered:
 *   student/dashboard   — pending[], completed[]
 *   student/evaluate    — course, period, criteria[], daysLeft
 *   student/profile     — user, successMsg?, errorMsg?
 */

const crypto           = require('crypto');
const mongoose         = require('mongoose');
const User             = require('../models/User');
const Course           = require('../models/Course');
const EvaluationPeriod = require('../models/EvaluationPeriod');
const EvaluationCriteria = require('../models/EvaluationCriteria');
const Evaluation       = require('../models/Evaluation');

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Human-readable days-left string */
function daysLeftStr(endDate) {
  const diff = new Date(endDate) - Date.now();
  if (diff <= 0) return 'Closed';
  const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${d} day${d !== 1 ? 's' : ''} left`;
}

/** Format a date as "12 Jan 2024" */
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Build the submission token for anonymisation.
 * SHA-256 of (studentId + courseId + periodId) — stored instead of studentId.
 */
function submissionToken(studentId, courseId, periodId) {
  return crypto
    .createHash('sha256')
    .update(`${studentId}-${courseId}-${periodId}`)
    .digest('hex');
}

/* ════════════════════════════════════════════════════════════════
   DASHBOARD — GET /student/dashboard
════════════════════════════════════════════════════════════════ */

exports.dashboard = async (req, res) => {
  try {
    const studentId = req.user._id;
    const now       = new Date();

    // Find all active periods whose date window is currently open
    const openPeriods = await EvaluationPeriod.find({
      isActive  : true,
      startDate : { $lte: now },
      endDate   : { $gte: now },
    }).lean();

    // Student's enrolled courses, populated with lecturer name
    const studentDoc = await User.findById(studentId)
      .select('enrolledCourses department')
      .populate({
        path    : 'enrolledCourses',
        select  : 'code title department semester academicYear lecturer',
        populate: { path: 'lecturer', select: 'fullName' },
      })
      .lean();

    // Filter enrolled courses to only those in the student's department
    let enrolledCourses = studentDoc?.enrolledCourses || [];
    const studentDepartment = studentDoc?.department;
    
    if (studentDepartment) {
      enrolledCourses = enrolledCourses.filter(course => course.department === studentDepartment);
    }

    // Build pending[] and completed[] grouped by (courseCode × period)
    // Multiple lecturers for same course code appear under one grouped item
    const pending   = [];
    const completed = [];
    const seenKeys  = new Set(); // to avoid duplicates

    for (const period of openPeriods) {
      for (const course of enrolledCourses) {
        // Is this course part of this period?
        const periodHasCourse = period.courses &&
          period.courses.some(cid => cid.toString() === course._id.toString());
        if (!periodHasCourse) continue;

        // Group by courseCode + periodId to combine multiple lecturers for same course
        const groupKey = `${course.code}-${period._id}`;
        if (seenKeys.has(groupKey)) continue; // already processed this group
        seenKeys.add(groupKey);

        // Find all enrolled courses with this course code in this period
        const sameCodeCourses = enrolledCourses.filter(c => c.code === course.code);

        // Check submission status for this group (submitted if any lecturer's version is submitted)
        let submitted = false;
        const lecturers = []; // will hold array of { _id, fullName, courseId }

        for (const scc of sameCodeCourses) {
          const token = submissionToken(studentId, scc._id, period._id);
          const isSubmitted = await Evaluation.exists({ submissionToken: token });
          if (isSubmitted) submitted = true;
          lecturers.push({
            _id: scc.lecturer._id,
            fullName: scc.lecturer.fullName,
            courseId: scc._id, // actual course document ID for this lecturer
          });
        }

        const item = {
          course: {
            code: course.code,
            title: course.title,
            department: course.department,
          },
          lecturers: lecturers, // array of lecturer options
          period: {
            _id            : period._id,
            title          : period.title,
            endDate        : period.endDate,
            endDateFormatted: fmtDate(period.endDate),
          },
          daysLeft: daysLeftStr(period.endDate),
          submitted: submitted,
        };

        if (submitted) completed.push(item);
        else pending.push(item);
      }
    }

    // Also show evaluations from closed periods in completed list
    const allSubmitted = await Evaluation.find({ submissionToken: { $in: [] } }); // placeholder
    // (Full historical view can be added later — for now, show current period only)

    res.render('student/dashboard', {
      title   : 'My Dashboard',
      user    : req.user,
      pending,
      completed,
      activeNav: 'overview',
      pageTitle: 'My Dashboard',
    });
  } catch (err) {
    console.error('[studentController.dashboard]', err);
    res.render('student/dashboard', {
      title   : 'My Dashboard',
      user    : req.user,
      pending : [],
      completed: [],
      activeNav : 'overview',
      pageTitle : 'My Dashboard',
      errorMsg  : 'Could not load evaluation data. Please refresh.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   EVALUATION FORM — GET /student/evaluate/:courseId?period=…
════════════════════════════════════════════════════════════════ */

exports.showEvaluateForm = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { period: periodId } = req.query;
    const studentId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(courseId) ||
        !mongoose.Types.ObjectId.isValid(periodId)) {
      return res.redirect('/student/dashboard');
    }

    // Verify course + period exist and are active
    const [course, period] = await Promise.all([
      Course.findById(courseId)
        .populate('lecturer', 'fullName')
        .lean(),
      EvaluationPeriod.findById(periodId).lean(),
    ]);

    if (!course || !period || !period.isActive) {
      return res.redirect('/student/dashboard');
    }

    // Check the student is enrolled in this course
    const studentDoc = await User.findById(studentId).select('enrolledCourses').lean();
    const isEnrolled = (studentDoc?.enrolledCourses || [])
      .some(cid => cid.toString() === courseId);

    if (!isEnrolled) return res.redirect('/student/dashboard');

    // Check not already submitted
    const token = submissionToken(studentId, courseId, periodId);
    if (await Evaluation.exists({ submissionToken: token })) {
      req.session.flash_success = 'You have already submitted an evaluation for this course.';
      return res.redirect('/student/dashboard');
    }

    // Load active criteria ordered by display order
    const criteria = await EvaluationCriteria.find({ isActive: true })
      .sort('order')
      .lean();

    const daysLeft = daysLeftStr(period.endDate);

    res.render('student/evaluate', {
      title    : `Evaluate — ${course.title}`,
      user     : req.user,
      course,
      period   : { ...period, endDateFormatted: fmtDate(period.endDate) },
      criteria,
      daysLeft,
      activeNav: 'evaluate',
      pageTitle: 'Submit Evaluation',
      errorMsg : req.session.flash_error || null,
    });
    delete req.session.flash_error;
  } catch (err) {
    console.error('[studentController.showEvaluateForm]', err);
    res.redirect('/student/dashboard');
  }
};

/* ════════════════════════════════════════════════════════════════
   SUBMIT EVALUATION — POST /student/evaluate/:courseId
════════════════════════════════════════════════════════════════ */

exports.submitEvaluation = async (req, res) => {
  const { courseId } = req.params;
  const { periodId, ratings, feedback } = req.body;
  const studentId = req.user._id;

  const redirectBack = `/student/evaluate/${courseId}?period=${periodId}`;

  try {
    if (!mongoose.Types.ObjectId.isValid(courseId) ||
        !mongoose.Types.ObjectId.isValid(periodId)) {
      return res.redirect('/student/dashboard');
    }

    const [course, period] = await Promise.all([
      Course.findById(courseId).lean(),
      EvaluationPeriod.findById(periodId).lean(),
    ]);

    if (!course || !period || !period.isActive) {
      req.session.flash_error = 'This evaluation period is no longer active.';
      return res.redirect(redirectBack);
    }

    const now = new Date();
    if (now < period.startDate || now > period.endDate) {
      req.session.flash_error = 'This evaluation period is not currently open.';
      return res.redirect(redirectBack);
    }

    // Prevent duplicate submission
    const token = submissionToken(studentId, courseId, periodId);
    if (await Evaluation.exists({ submissionToken: token })) {
      req.session.flash_error = 'You have already submitted an evaluation for this course.';
      return res.redirect('/student/dashboard');
    }

    // Validate that ratings covers all active criteria
    const activeCriteria = await EvaluationCriteria.find({ isActive: true }).lean();
    if (!ratings || typeof ratings !== 'object') {
      req.session.flash_error = 'Please rate all criteria before submitting.';
      return res.redirect(redirectBack);
    }

    const ratingDocs = [];
    for (const criterion of activeCriteria) {
      const score = parseInt(ratings[criterion._id.toString()], 10);
      if (!score || score < 1 || score > 5) {
        req.session.flash_error = `Please provide a rating for "${criterion.name}".`;
        return res.redirect(redirectBack);
      }
      ratingDocs.push({
        criteria    : criterion._id,
        criteriaName: criterion.name,  // snapshot — safe even if name changes later
        score,
      });
    }

    await Evaluation.create({
      course          : courseId,
      lecturer        : course.lecturer,
      evaluationPeriod: periodId,
      semester        : period.semester,
      academicYear    : period.academicYear,
      ratings         : ratingDocs,
      feedback        : (feedback || '').trim().slice(0, 1000),
      submissionToken : token,
    });

    req.session.flash_success = `Evaluation for ${course.code} submitted successfully. Thank you!`;
    return res.redirect('/student/dashboard');
  } catch (err) {
    console.error('[studentController.submitEvaluation]', err);
    req.session.flash_error = 'Submission failed. Please try again.';
    return res.redirect(redirectBack);
  }
};

/* ════════════════════════════════════════════════════════════════
   PROFILE — GET /student/profile
════════════════════════════════════════════════════════════════ */

exports.showProfile = (req, res) => {
  res.render('student/profile', {
    title     : 'My Profile',
    user      : req.user,
    activeNav : 'profile',
    pageTitle : 'My Profile',
    successMsg: req.session.flash_success || null,
    errorMsg  : req.session.flash_error   || null,
  });
  delete req.session.flash_success;
  delete req.session.flash_error;
};

/* ════════════════════════════════════════════════════════════════
   CHANGE PASSWORD — POST /student/profile/password
════════════════════════════════════════════════════════════════ */

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      req.session.flash_error = 'All password fields are required.';
      return res.redirect('/student/profile');
    }

    if (newPassword.length < 6) {
      req.session.flash_error = 'New password must be at least 6 characters.';
      return res.redirect('/student/profile');
    }

    if (newPassword !== confirmPassword) {
      req.session.flash_error = 'New passwords do not match.';
      return res.redirect('/student/profile');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.matchPassword(currentPassword))) {
      req.session.flash_error = 'Current password is incorrect.';
      return res.redirect('/student/profile');
    }

    user.password = newPassword; // pre-save hook hashes it
    await user.save();

    req.session.flash_success = 'Password updated successfully.';
    return res.redirect('/student/profile');
  } catch (err) {
    console.error('[studentController.changePassword]', err);
    req.session.flash_error = 'Could not update password. Please try again.';
    return res.redirect('/student/profile');
  }
};