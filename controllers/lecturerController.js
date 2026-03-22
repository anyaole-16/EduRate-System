'use strict';

/**
 * controllers/lecturerController.js
 *
 * All analytics are scoped strictly to req.user._id so a lecturer
 * can never see another lecturer's data.
 *
 * Views rendered:
 *   lecturer/dashboard  — overallStats, criteriaStats[], trend[], totalResponses, filters
 *   lecturer/reports    — criteriaStats[], feedbacks[], totalResponses, courses[], filters
 *   lecturer/profile    — user, courses[], successMsg?, errorMsg?
 */

const User               = require('../models/User');
const Course             = require('../models/Course');
const Evaluation         = require('../models/Evaluation');

/* ── Shared stat computation (pure, no I/O) ──────────────────────── */

function computeStats(scores) {
  if (!scores.length) return null;
  const n      = scores.length;
  const sum    = scores.reduce((a, b) => a + b, 0);
  const mean   = +(sum / n).toFixed(2);

  const sorted = [...scores].sort((a, b) => a - b);
  const mid    = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);

  const freq = {};
  scores.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
  const mode = +Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);

  const label =
    mean >= 4.5 ? 'Excellent'     :
    mean >= 3.5 ? 'Good'          :
    mean >= 2.5 ? 'Average'       : 'Below Average';

  return { mean, median, mode, count: n, label };
}

function buildFilter(lecturerId, query) {
  const filter = { lecturer: lecturerId };
  if (query.semester)     filter.semester     = query.semester;
  if (query.academicYear) filter.academicYear = query.academicYear;
  if (query.courseId)     filter.course       = query.courseId;
  return filter;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/* ════════════════════════════════════════════════════════════════
   DASHBOARD — GET /lecturer/dashboard
   Query params: ?semester=First&academicYear=2023/2024
════════════════════════════════════════════════════════════════ */

exports.dashboard = async (req, res) => {
  try {
    const lecturerId = req.user._id;
    const filters    = {
      semester    : req.query.semester     || '',
      academicYear: req.query.academicYear || '',
    };

    const evaluations = await Evaluation.find(buildFilter(lecturerId, filters)).lean();
    const totalResponses = evaluations.length;

    let overallStats  = null;
    let criteriaStats = [];
    let trend         = [];

    if (totalResponses > 0) {
      // ── Per-criteria stats ───────────────────────────────────────
      const criteriaMap = {};
      evaluations.forEach(ev => {
        ev.ratings.forEach(r => {
          if (!criteriaMap[r.criteriaName]) criteriaMap[r.criteriaName] = [];
          criteriaMap[r.criteriaName].push(r.score);
        });
      });
      criteriaStats = Object.entries(criteriaMap).map(([name, scores]) => ({
        name,
        ...computeStats(scores),
      }));

      // ── Overall stats ────────────────────────────────────────────
      const allScores = evaluations.flatMap(ev => ev.ratings.map(r => r.score));
      overallStats = computeStats(allScores);

      // ── Trend — average score grouped by academicYear + semester ─
      const trendMap = {};
      evaluations.forEach(ev => {
        const key = `${ev.academicYear || '?'} ${ev.semester || '?'}`;
        if (!trendMap[key]) trendMap[key] = [];
        ev.ratings.forEach(r => trendMap[key].push(r.score));
      });
      trend = Object.entries(trendMap).map(([label, scores]) => ({
        label,
        avg: computeStats(scores).mean,
      }));
    }

    res.render('lecturer/dashboard', {
      title         : 'My Dashboard',
      user          : req.user,
      totalResponses,
      overallStats,
      criteriaStats,
      trend,
      filters,
      activeNav     : 'overview',
      pageTitle     : 'My Dashboard',
    });
  } catch (err) {
    console.error('[lecturerController.dashboard]', err);
    res.render('lecturer/dashboard', {
      title         : 'My Dashboard',
      user          : req.user,
      totalResponses: 0,
      overallStats  : null,
      criteriaStats : [],
      trend         : [],
      filters       : {},
      activeNav     : 'overview',
      pageTitle     : 'My Dashboard',
      errorMsg      : 'Could not load evaluation data.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   REPORTS — GET /lecturer/reports
   Query params: ?semester=…&academicYear=…&courseId=…
════════════════════════════════════════════════════════════════ */

exports.reports = async (req, res) => {
  try {
    const lecturerId = req.user._id;
    const filters    = {
      semester    : req.query.semester     || '',
      academicYear: req.query.academicYear || '',
      courseId    : req.query.courseId     || '',
    };

    // Courses this lecturer teaches (for the filter dropdown)
    const lecturerDoc = await User.findById(lecturerId)
      .select('courses')
      .populate('courses', 'code title semester academicYear')
      .lean();
    const courses = lecturerDoc?.courses || [];

    const evaluations = await Evaluation.find(buildFilter(lecturerId, filters)).lean();
    const totalResponses = evaluations.length;

    let criteriaStats = [];
    let overallStats  = null;
    let feedbacks     = [];

    if (totalResponses > 0) {
      // Per-criteria stats
      const criteriaMap = {};
      evaluations.forEach(ev => {
        ev.ratings.forEach(r => {
          if (!criteriaMap[r.criteriaName]) {
            criteriaMap[r.criteriaName] = { scores: [], category: '' };
          }
          criteriaMap[r.criteriaName].scores.push(r.score);
        });
      });
      criteriaStats = Object.entries(criteriaMap).map(([name, d]) => ({
        name,
        category: d.category,
        ...computeStats(d.scores),
      }));

      // Overall
      const allScores = evaluations.flatMap(ev => ev.ratings.map(r => r.score));
      overallStats = computeStats(allScores);

      // Written feedback — anonymous, no student ID stored
      feedbacks = evaluations
        .filter(ev => ev.feedback && ev.feedback.trim())
        .map(ev => ({
          text    : ev.feedback,
          course  : ev.course?.code || null,
          semester: ev.semester,
          date    : ev.submittedAt,
        }));
    }

    res.render('lecturer/reports', {
      title         : 'Evaluation Reports',
      user          : req.user,
      courses,
      totalResponses,
      criteriaStats,
      overallStats,
      feedbacks,
      filters,
      activeNav     : 'reports',
      pageTitle     : 'Evaluation Reports',
    });
  } catch (err) {
    console.error('[lecturerController.reports]', err);
    res.render('lecturer/reports', {
      title         : 'Evaluation Reports',
      user          : req.user,
      courses       : [],
      totalResponses: 0,
      criteriaStats : [],
      overallStats  : null,
      feedbacks     : [],
      filters       : {},
      activeNav     : 'reports',
      pageTitle     : 'Evaluation Reports',
      errorMsg      : 'Could not load report data.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   PROFILE — GET /lecturer/profile
════════════════════════════════════════════════════════════════ */

exports.showProfile = async (req, res) => {
  try {
    // Load assigned courses for the courses-assigned chip row in the view
    const lecturerDoc = await User.findById(req.user._id)
      .select('courses')
      .populate('courses', 'code title semester academicYear')
      .lean();

    res.render('lecturer/profile', {
      title      : 'My Profile',
      user       : req.user,
      courses    : lecturerDoc?.courses || [],
      activeNav  : 'profile',
      pageTitle  : 'My Profile',
      successMsg : req.session.flash_success || null,
      errorMsg   : req.session.flash_error   || null,
    });
    delete req.session.flash_success;
    delete req.session.flash_error;
  } catch (err) {
    console.error('[lecturerController.showProfile]', err);
    res.render('lecturer/profile', {
      title    : 'My Profile',
      user     : req.user,
      courses  : [],
      activeNav: 'profile',
      pageTitle: 'My Profile',
      errorMsg : 'Could not load profile data.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   CHANGE PASSWORD — POST /lecturer/profile/password
════════════════════════════════════════════════════════════════ */

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      req.session.flash_error = 'All password fields are required.';
      return res.redirect('/lecturer/profile');
    }

    if (newPassword.length < 6) {
      req.session.flash_error = 'New password must be at least 6 characters.';
      return res.redirect('/lecturer/profile');
    }

    if (newPassword !== confirmPassword) {
      req.session.flash_error = 'New passwords do not match.';
      return res.redirect('/lecturer/profile');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.matchPassword(currentPassword))) {
      req.session.flash_error = 'Current password is incorrect.';
      return res.redirect('/lecturer/profile');
    }

    user.password = newPassword;
    await user.save();

    req.session.flash_success = 'Password updated successfully.';
    return res.redirect('/lecturer/profile');
  } catch (err) {
    console.error('[lecturerController.changePassword]', err);
    req.session.flash_error = 'Could not update password. Please try again.';
    return res.redirect('/lecturer/profile');
  }
};