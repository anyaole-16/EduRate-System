'use strict';

/**
 * controllers/adminController.js
 *
 * Handles every admin action: dashboard stats, analytics, user/course/
 * criteria/period CRUD, and CSV/PDF exports.
 *
 * All POST handlers follow PRG (Post/Redirect/Get).
 * Flash messages are stored on req.session and cleared after render.
 */

const path               = require('path');
const mongoose           = require('mongoose');
const User               = require('../models/User');
const Course             = require('../models/Course');
const EvaluationCriteria = require('../models/EvaluationCriteria');
const EvaluationPeriod   = require('../models/EvaluationPeriod');
const Evaluation         = require('../models/Evaluation');

/* ── Shared helpers ─────────────────────────────────────────────── */

function computeStats(scores) {
  if (!scores.length) return { mean: 0, median: 0, mode: 0, count: 0 };
  const n      = scores.length;
  const mean   = +(scores.reduce((a, b) => a + b, 0) / n).toFixed(2);
  const sorted = [...scores].sort((a, b) => a - b);
  const mid    = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
  const freq   = {};
  scores.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
  const mode   = +Object.keys(freq).reduce((a, b) => freq[a] >= freq[b] ? a : b);
  return { mean, median, mode, count: n };
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const USERS_PER_PAGE = 20;

/* ════════════════════════════════════════════════════════════════
   DASHBOARD — GET /admin/dashboard
════════════════════════════════════════════════════════════════ */

exports.dashboard = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalStudents, totalLecturers, totalCourses, totalEvaluations, activePeriods, recentEvals] =
      await Promise.all([
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'lecturer' }),
        Course.countDocuments(),
        Evaluation.countDocuments(),
        EvaluationPeriod.countDocuments({
          isActive : true,
          startDate: { $lte: now },
          endDate  : { $gte: now },
        }),
        Evaluation.aggregate([
          { $match: { submittedAt: { $gte: sevenDaysAgo } } },
          { $group: { _id: { $dateToString: { format: '%d %b', date: '$submittedAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

    res.render('admin/dashboard', {
      title          : 'Admin Overview',
      user           : req.user,
      totalStudents,
      totalLecturers,
      totalCourses,
      totalEvaluations,
      activePeriods,
      recentEvals,
      activeNav      : 'overview',
      pageTitle      : 'Admin Overview',
      successMsg     : req.session.flash_success || null,
    });
    delete req.session.flash_success;
  } catch (err) {
    console.error('[adminController.dashboard]', err);
    res.render('admin/dashboard', {
      title: 'Admin Overview', user: req.user,
      totalStudents: 0, totalLecturers: 0, totalCourses: 0,
      totalEvaluations: 0, activePeriods: 0, recentEvals: [],
      activeNav: 'overview', pageTitle: 'Admin Overview',
      errorMsg: 'Could not load dashboard data.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   ANALYTICS — GET /admin/analytics
════════════════════════════════════════════════════════════════ */

exports.analytics = async (req, res) => {
  try {
    const filters = {
      semester    : req.query.semester     || '',
      academicYear: req.query.academicYear || '',
      department  : req.query.department   || '',
    };

    // Build Mongoose match stage
    const match = {};
    if (filters.semester)     match.semester     = filters.semester;
    if (filters.academicYear) match.academicYear = filters.academicYear;

    // Aggregate evaluations grouped by lecturer
    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from        : 'users',
          localField  : 'lecturer',
          foreignField: '_id',
          as          : 'lecturerData',
        },
      },
      { $unwind: '$lecturerData' },
      {
        $lookup: {
          from        : 'courses',
          localField  : 'course',
          foreignField: '_id',
          as          : 'courseData',
        },
      },
      { $unwind: { path: '$courseData', preserveNullAndEmptyArrays: true } },
    ];

    if (filters.department) {
      pipeline.push({ $match: { 'lecturerData.department': new RegExp(filters.department, 'i') } });
    }

    pipeline.push({
      $group: {
        _id         : '$lecturer',
        name        : { $first: '$lecturerData.fullName' },
        department  : { $first: '$lecturerData.department' },
        totalResponses: { $sum: 1 },
        allRatings  : { $push: '$ratings' },
        courses     : { $addToSet: '$courseData.code' },
      },
    });

    const raw = await Evaluation.aggregate(pipeline);

    const lecturers = raw.map(r => {
      const scores = r.allRatings.flat().map(rt => rt.score);
      return {
        _id           : r._id,
        name          : r.name,
        department    : r.department,
        totalResponses: r.totalResponses,
        courses       : r.courses.filter(Boolean),
        ...computeStats(scores),
      };
    });

    // Department summary
    const deptMap = {};
    lecturers.forEach(l => {
      const d = l.department || 'Unknown';
      if (!deptMap[d]) deptMap[d] = { scores: [], count: 0 };
      deptMap[d].scores.push(l.mean);
      deptMap[d].count += l.totalResponses;
    });
    const departmentStats = Object.entries(deptMap).map(([department, d]) => ({
      department,
      avgScore      : +(d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2),
      totalResponses: d.count,
    }));

    res.render('admin/analytics', {
      title          : 'Analytics & Reports',
      user           : req.user,
      lecturers,
      departmentStats,
      filters,
      activeNav      : 'analytics',
      pageTitle      : 'Analytics & Reports',
    });
  } catch (err) {
    console.error('[adminController.analytics]', err);
    res.render('admin/analytics', {
      title: 'Analytics & Reports', user: req.user,
      lecturers: [], departmentStats: [], filters: {},
      activeNav: 'analytics', pageTitle: 'Analytics & Reports',
      errorMsg: 'Could not load analytics data.',
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   LECTURER DETAIL — GET /admin/analytics/lecturer/:lecturerId
════════════════════════════════════════════════════════════════ */

exports.lecturerDetail = async (req, res) => {
  try {
    const { lecturerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(lecturerId)) {
      return res.redirect('/admin/analytics');
    }

    const lecturer = await User.findById(lecturerId).lean();
    if (!lecturer) return res.redirect('/admin/analytics');

    const evaluations = await Evaluation.find({ lecturer: lecturerId }).lean();
    const totalResponses = evaluations.length;

    let criteriaStats = [];
    let overallStats  = null;
    let feedbacks     = [];

    if (totalResponses > 0) {
      const criteriaMap = {};
      evaluations.forEach(ev => {
        ev.ratings.forEach(r => {
          if (!criteriaMap[r.criteriaName]) criteriaMap[r.criteriaName] = [];
          criteriaMap[r.criteriaName].push(r.score);
        });
      });
      criteriaStats = Object.entries(criteriaMap).map(([name, scores]) => ({
        name, ...computeStats(scores),
      }));

      const allScores = evaluations.flatMap(ev => ev.ratings.map(r => r.score));
      overallStats = computeStats(allScores);

      feedbacks = evaluations
        .filter(ev => ev.feedback?.trim())
        .map(ev => ({
          text  : ev.feedback,
          course: ev.course?.code || null,
          date  : ev.submittedAt,
        }));
    }

    res.render('admin/lecturer-detail', {
      title        : `${lecturer.fullName} — Report`,
      user         : req.user,
      lecturer,
      totalResponses,
      overallStats,
      criteriaStats,
      feedbacks,
      activeNav    : 'analytics',
      pageTitle    : 'Lecturer Report',
    });
  } catch (err) {
    console.error('[adminController.lecturerDetail]', err);
    res.redirect('/admin/analytics');
  }
};

/* ════════════════════════════════════════════════════════════════
   USERS
════════════════════════════════════════════════════════════════ */

exports.listUsers = async (req, res) => {
  try {
    const { role, page = 1 } = req.query;
    const filter = role ? { role } : {};
    const skip   = (parseInt(page) - 1) * USERS_PER_PAGE;

    const [users, totalCount] = await Promise.all([
      User.find(filter).sort('-createdAt').skip(skip).limit(USERS_PER_PAGE).lean(),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCount / USERS_PER_PAGE);

    res.render('admin/users', {
      title      : 'User Management',
      user       : req.user,
      users,
      filterRole : role || '',
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      activeNav  : 'users',
      pageTitle  : 'User Management',
      successMsg : req.session.flash_success || null,
    });
    delete req.session.flash_success;
  } catch (err) {
    console.error('[adminController.listUsers]', err);
    res.render('admin/users', {
      title: 'User Management', user: req.user, users: [],
      filterRole: '', currentPage: 1, totalPages: 1, totalCount: 0,
      activeNav: 'users', pageTitle: 'User Management',
      errorMsg: 'Could not load users.',
    });
  }
};

exports.showNewUser = (req, res) => {
  res.render('admin/user-form', {
    title      : 'Add User',
    currentUser: req.user,
    isEdit     : false,
    editUser   : null,
    formData   : req.session.flash_form || null,
    errorMsg   : req.session.flash_error || null,
    activeNav  : 'users',
    pageTitle  : 'Add New User',
  });
  delete req.session.flash_form;
  delete req.session.flash_error;
};

exports.createUser = async (req, res) => {
  try {
    const { fullName, email, role, password, confirmPassword, department, school, matricNumber, level } = req.body;

    if (password !== confirmPassword) {
      req.session.flash_error = 'Passwords do not match.';
      req.session.flash_form  = req.body;
      return res.redirect('/admin/users/new');
    }

    await User.create({ fullName, email: email.toLowerCase().trim(), role, password, department, school, matricNumber, level: level ? parseInt(level) : null });
    req.session.flash_success = `User "${fullName}" created successfully.`;
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[adminController.createUser]', err);
    req.session.flash_error = err.code === 11000
      ? 'Email or matric number already exists.'
      : err.message;
    req.session.flash_form = req.body;
    return res.redirect('/admin/users/new');
  }
};

exports.showEditUser = async (req, res) => {
  try {
    const editUser = await User.findById(req.params.id).lean();
    if (!editUser) return res.redirect('/admin/users');
    res.render('admin/user-form', {
      title      : 'Edit User',
      currentUser: req.user,
      isEdit     : true,
      editUser,
      formData   : req.session.flash_form || null,
      errorMsg   : req.session.flash_error || null,
      activeNav  : 'users',
      pageTitle  : 'Edit User',
    });
    delete req.session.flash_form;
    delete req.session.flash_error;
  } catch (err) {
    console.error('[adminController.showEditUser]', err);
    res.redirect('/admin/users');
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { fullName, email, role, department, school, matricNumber, level } = req.body;
    await User.findByIdAndUpdate(req.params.id, {
      fullName, email: email.toLowerCase().trim(), role, department, school, matricNumber, level: level ? parseInt(level) : null,
    }, { runValidators: true });
    req.session.flash_success = 'User updated successfully.';
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[adminController.updateUser]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect(`/admin/users/${req.params.id}/edit`);
  }
};

exports.toggleUser = async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.redirect('/admin/users');
    u.isActive = !u.isActive;
    await u.save({ validateBeforeSave: false });
    req.session.flash_success = `User ${u.isActive ? 'activated' : 'deactivated'}.`;
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[adminController.toggleUser]', err);
    return res.redirect('/admin/users');
  }
};

/* ════════════════════════════════════════════════════════════════
   ADVANCE LEVELS
════════════════════════════════════════════════════════════════ */

exports.advanceLevels = async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isActive: true });
    let advanced = 0;
    for (const student of students) {
      if (student.level === 100) student.level = 200;
      else if (student.level === 200) student.level = 300;
      else if (student.level === 300) student.level = 400;
      else if (student.level === 400) student.level = null; // Graduated
      else continue; // Skip if null or invalid
      await student.save({ validateBeforeSave: false });
      advanced++;
    }
    req.session.flash_success = `Advanced levels for ${advanced} students.`;
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[adminController.advanceLevels]', err);
    req.session.flash_error = 'Failed to advance levels.';
    return res.redirect('/admin/users');
  }
};

/* ════════════════════════════════════════════════════════════════
   COURSES
════════════════════════════════════════════════════════════════ */

exports.listCourses = async (req, res) => {
  try {
    const { department } = req.query;
    const filter = department ? { department: new RegExp(department, 'i') } : {};
    const courses = await Course.find(filter)
      .populate('lecturer', 'fullName email')
      .sort('-createdAt').lean();

    res.render('admin/courses', {
      title      : 'Course Management',
      user       : req.user,
      courses,
      filterDept : department || '',
      activeNav  : 'courses',
      pageTitle  : 'Course Management',
      successMsg : req.session.flash_success || null,
    });
    delete req.session.flash_success;
  } catch (err) {
    console.error('[adminController.listCourses]', err);
    res.render('admin/courses', {
      title: 'Course Management', user: req.user, courses: [],
      filterDept: '', activeNav: 'courses', pageTitle: 'Course Management',
      errorMsg: 'Could not load courses.',
    });
  }
};

exports.showNewCourse = async (req, res) => {
  const lecturers = await User.find({ role: 'lecturer', isActive: true }).sort('fullName').lean();
  res.render('admin/course-form', {
    title      : 'Add Course',
    currentUser: req.user,
    isEdit     : false,
    editCourse : null,
    lecturers,
    formData   : req.session.flash_form || null,
    errorMsg   : req.session.flash_error || null,
    activeNav  : 'courses',
    pageTitle  : 'Add New Course',
  });
  delete req.session.flash_form;
  delete req.session.flash_error;
};

exports.createCourse = async (req, res) => {
  try {
    const course = await Course.create(req.body);
    // Keep lecturer.courses in sync
    await User.findByIdAndUpdate(req.body.lecturer, { $addToSet: { courses: course._id } });
    req.session.flash_success = `Course "${course.code}" created.`;
    return res.redirect('/admin/courses');
  } catch (err) {
    console.error('[adminController.createCourse]', err);
    req.session.flash_error = err.code === 11000
      ? 'A course with that code already exists for this period.'
      : err.message;
    req.session.flash_form = req.body;
    return res.redirect('/admin/courses/new');
  }
};

exports.showEditCourse = async (req, res) => {
  try {
    const [editCourse, lecturers, students] = await Promise.all([
      Course.findById(req.params.id).lean(),
      User.find({ role: 'lecturer', isActive: true }).sort('fullName').lean(),
      User.find({ role: 'student', isActive: true }).sort('fullName').lean(),
    ]);
    if (!editCourse) return res.redirect('/admin/courses');
    res.render('admin/course-form', {
      title      : 'Edit Course',
      currentUser: req.user,
      isEdit     : true,
      editCourse,
      lecturers,
      students,
      formData   : req.session.flash_form || null,
      errorMsg   : req.session.flash_error || null,
      activeNav  : 'courses',
      pageTitle  : 'Edit Course',
    });
    delete req.session.flash_form;
    delete req.session.flash_error;
  } catch (err) {
    console.error('[adminController.showEditCourse]', err);
    res.redirect('/admin/courses');
  }
};

exports.updateCourse = async (req, res) => {
  try {
    await Course.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
    req.session.flash_success = 'Course updated.';
    return res.redirect('/admin/courses');
  } catch (err) {
    console.error('[adminController.updateCourse]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect(`/admin/courses/${req.params.id}/edit`);
  }
};

exports.enrollStudent = async (req, res) => {
  try {
    const { studentId } = req.body;
    const courseId      = req.params.id;
    await Promise.all([
      Course.findByIdAndUpdate(courseId,  { $addToSet: { enrolledStudents: studentId } }),
      User.findByIdAndUpdate(studentId, { $addToSet: { enrolledCourses: courseId } }),
    ]);
    req.session.flash_success = 'Student enrolled successfully.';
    return res.redirect(`/admin/courses/${courseId}/edit`);
  } catch (err) {
    console.error('[adminController.enrollStudent]', err);
    req.session.flash_error = 'Could not enroll student.';
    return res.redirect(`/admin/courses/${req.params.id}/edit`);
  }
};

/* ════════════════════════════════════════════════════════════════
   EVALUATION CRITERIA
════════════════════════════════════════════════════════════════ */

exports.listCriteria = async (req, res) => {
  try {
    const criteria = await EvaluationCriteria.find().sort('order name').lean();
    res.render('admin/criteria', {
      title    : 'Evaluation Criteria',
      user     : req.user,
      criteria,
      activeNav: 'criteria',
      pageTitle: 'Evaluation Criteria',
      successMsg: req.session.flash_success || null,
    });
    delete req.session.flash_success;
  } catch (err) {
    console.error('[adminController.listCriteria]', err);
    res.render('admin/criteria', {
      title: 'Evaluation Criteria', user: req.user, criteria: [],
      activeNav: 'criteria', pageTitle: 'Evaluation Criteria',
      errorMsg: 'Could not load criteria.',
    });
  }
};

exports.showNewCriteria = (req, res) => {
  res.render('admin/criteria-form', {
    title      : 'Add Criteria',
    currentUser: req.user,
    isEdit     : false,
    editCriteria: null,
    formData   : req.session.flash_form || null,
    errorMsg   : req.session.flash_error || null,
    activeNav  : 'criteria',
    pageTitle  : 'Add Evaluation Criteria',
  });
  delete req.session.flash_form;
  delete req.session.flash_error;
};

exports.createCriteria = async (req, res) => {
  try {
    const { name, description, category, order, isActive } = req.body;
    await EvaluationCriteria.create({
      name, description, category,
      order   : parseInt(order, 10) || 0,
      isActive: isActive === 'true' || isActive === true,
      createdBy: req.user._id,
    });
    req.session.flash_success = `Criterion "${name}" created.`;
    return res.redirect('/admin/criteria');
  } catch (err) {
    console.error('[adminController.createCriteria]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect('/admin/criteria/new');
  }
};

exports.showEditCriteria = async (req, res) => {
  try {
    const editCriteria = await EvaluationCriteria.findById(req.params.id).lean();
    if (!editCriteria) return res.redirect('/admin/criteria');
    res.render('admin/criteria-form', {
      title      : 'Edit Criteria',
      currentUser: req.user,
      isEdit     : true,
      editCriteria,
      formData   : req.session.flash_form || null,
      errorMsg   : req.session.flash_error || null,
      activeNav  : 'criteria',
      pageTitle  : 'Edit Criteria',
    });
    delete req.session.flash_form;
    delete req.session.flash_error;
  } catch (err) {
    console.error('[adminController.showEditCriteria]', err);
    res.redirect('/admin/criteria');
  }
};

exports.updateCriteria = async (req, res) => {
  try {
    const { name, description, category, order, isActive } = req.body;
    // Safe update — never touch historical evaluation records
    await EvaluationCriteria.findByIdAndUpdate(req.params.id, {
      name, description, category,
      order   : parseInt(order, 10) || 0,
      isActive: isActive === 'true' || isActive === true,
    }, { runValidators: true });
    req.session.flash_success = 'Criterion updated. Existing evaluations are unaffected.';
    return res.redirect('/admin/criteria');
  } catch (err) {
    console.error('[adminController.updateCriteria]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect(`/admin/criteria/${req.params.id}/edit`);
  }
};

exports.toggleCriteria = async (req, res) => {
  try {
    const c = await EvaluationCriteria.findById(req.params.id);
    if (!c) return res.redirect('/admin/criteria');
    c.isActive = !c.isActive;
    await c.save();
    req.session.flash_success = `Criterion "${c.name}" ${c.isActive ? 'activated' : 'deactivated'}.`;
    return res.redirect('/admin/criteria');
  } catch (err) {
    console.error('[adminController.toggleCriteria]', err);
    return res.redirect('/admin/criteria');
  }
};

/* ════════════════════════════════════════════════════════════════
   EVALUATION PERIODS
════════════════════════════════════════════════════════════════ */

exports.listPeriods = async (req, res) => {
  try {
    const periods = await EvaluationPeriod.find().sort('-startDate').lean();
    res.render('admin/periods', {
      title    : 'Evaluation Periods',
      user     : req.user,
      periods,
      activeNav: 'periods',
      pageTitle: 'Evaluation Periods',
      successMsg: req.session.flash_success || null,
    });
    delete req.session.flash_success;
  } catch (err) {
    console.error('[adminController.listPeriods]', err);
    res.render('admin/periods', {
      title: 'Evaluation Periods', user: req.user, periods: [],
      activeNav: 'periods', pageTitle: 'Evaluation Periods',
      errorMsg: 'Could not load periods.',
    });
  }
};

exports.showNewPeriod = async (req, res) => {
  const allCourses = await Course.find({ isActive: true }).sort('code').lean();
  res.render('admin/period-form', {
    title      : 'New Period',
    currentUser: req.user,
    isEdit     : false,
    editPeriod : null,
    allCourses,
    formData   : req.session.flash_form || null,
    errorMsg   : req.session.flash_error || null,
    activeNav  : 'periods',
    pageTitle  : 'Create Evaluation Period',
  });
  delete req.session.flash_form;
  delete req.session.flash_error;
};

exports.createPeriod = async (req, res) => {
  try {
    const { title, semester, academicYear, startDate, endDate, isActive } = req.body;
    // courses comes as array or single string
    const courses = req.body.courses
      ? (Array.isArray(req.body.courses) ? req.body.courses : [req.body.courses])
      : [];

    await EvaluationPeriod.create({
      title, semester, academicYear, startDate, endDate, courses,
      isActive  : isActive === 'true' || isActive === true,
      createdBy : req.user._id,
    });
    req.session.flash_success = `Evaluation period "${title}" created.`;
    return res.redirect('/admin/periods');
  } catch (err) {
    console.error('[adminController.createPeriod]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect('/admin/periods/new');
  }
};

exports.showEditPeriod = async (req, res) => {
  try {
    const [editPeriod, allCourses] = await Promise.all([
      EvaluationPeriod.findById(req.params.id).lean(),
      Course.find({ isActive: true }).sort('code').lean(),
    ]);
    if (!editPeriod) return res.redirect('/admin/periods');
    res.render('admin/period-form', {
      title      : 'Edit Period',
      currentUser: req.user,
      isEdit     : true,
      editPeriod,
      allCourses,
      formData   : req.session.flash_form || null,
      errorMsg   : req.session.flash_error || null,
      activeNav  : 'periods',
      pageTitle  : 'Edit Evaluation Period',
    });
    delete req.session.flash_form;
    delete req.session.flash_error;
  } catch (err) {
    console.error('[adminController.showEditPeriod]', err);
    res.redirect('/admin/periods');
  }
};

exports.updatePeriod = async (req, res) => {
  try {
    const { title, semester, academicYear, startDate, endDate, isActive } = req.body;
    const courses = req.body.courses
      ? (Array.isArray(req.body.courses) ? req.body.courses : [req.body.courses])
      : [];
    await EvaluationPeriod.findByIdAndUpdate(req.params.id, {
      title, semester, academicYear, startDate, endDate, courses,
      isActive: isActive === 'true' || isActive === true,
    }, { runValidators: true });
    req.session.flash_success = 'Evaluation period updated.';
    return res.redirect('/admin/periods');
  } catch (err) {
    console.error('[adminController.updatePeriod]', err);
    req.session.flash_error = err.message;
    req.session.flash_form  = req.body;
    return res.redirect(`/admin/periods/${req.params.id}/edit`);
  }
};

exports.togglePeriod = async (req, res) => {
  try {
    const p = await EvaluationPeriod.findById(req.params.id);
    if (!p) return res.redirect('/admin/periods');
    p.isActive = !p.isActive;
    await p.save();
    req.session.flash_success = `Period "${p.title}" ${p.isActive ? 'activated' : 'deactivated'}.`;
    return res.redirect('/admin/periods');
  } catch (err) {
    console.error('[adminController.togglePeriod]', err);
    return res.redirect('/admin/periods');
  }
};

/* ════════════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════════════ */

exports.exportCSV = async (req, res) => {
  try {
    const { createObjectCsvWriter } = require('csv-writer');
    const os  = require('os');
    const fs  = require('fs');
    const tmp = path.join(os.tmpdir(), `edurate_${Date.now()}.csv`);

    const filter = {};
    if (req.query.semester)     filter.semester     = req.query.semester;
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    if (req.query.lecturerId)   filter.lecturer     = req.query.lecturerId;

    const evaluations = await Evaluation.find(filter)
      .populate('course',   'code title department')
      .populate('lecturer', 'fullName department')
      .lean();

    const rows = [];
    evaluations.forEach(ev => {
      ev.ratings.forEach(r => {
        rows.push({
          lecturer    : ev.lecturer?.fullName || '—',
          department  : ev.lecturer?.department || '—',
          course      : ev.course?.code || '—',
          courseTitle : ev.course?.title || '—',
          semester    : ev.semester,
          academicYear: ev.academicYear,
          criteria    : r.criteriaName,
          score       : r.score,
          submitted   : fmtDate(ev.submittedAt),
        });
      });
    });

    const writer = createObjectCsvWriter({
      path  : tmp,
      header: [
        { id: 'lecturer',     title: 'Lecturer' },
        { id: 'department',   title: 'Department' },
        { id: 'course',       title: 'Course Code' },
        { id: 'courseTitle',  title: 'Course Title' },
        { id: 'semester',     title: 'Semester' },
        { id: 'academicYear', title: 'Academic Year' },
        { id: 'criteria',     title: 'Criteria' },
        { id: 'score',        title: 'Score (1-5)' },
        { id: 'submitted',    title: 'Date Submitted' },
      ],
    });

    await writer.writeRecords(rows);
    res.download(tmp, 'edurate_report.csv', () => fs.unlinkSync(tmp));
  } catch (err) {
    console.error('[adminController.exportCSV]', err);
    res.status(500).send('Export failed. Please try again.');
  }
};

exports.exportPDF = async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="edurate_report.pdf"');
    doc.pipe(res);

    const filter = {};
    if (req.query.semester)     filter.semester     = req.query.semester;
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    if (req.query.lecturerId)   filter.lecturer     = req.query.lecturerId;

    const evaluations = await Evaluation.find(filter)
      .populate('lecturer', 'fullName department school')
      .lean();

    // Group by lecturer
    const byLecturer = {};
    evaluations.forEach(ev => {
      const lid = ev.lecturer?._id?.toString();
      if (!lid) return;
      if (!byLecturer[lid]) {
        byLecturer[lid] = { info: ev.lecturer, evals: [] };
      }
      byLecturer[lid].evals.push(ev);
    });

    // Cover
    doc.font('Helvetica-Bold').fontSize(22).text('EduRate', { align: 'center' });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(14).text('Lecturer Evaluation Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Generated: ${fmtDate(new Date())}`, { align: 'center' });
    if (req.query.semester)     doc.text(`Semester: ${req.query.semester}`,         { align: 'center' });
    if (req.query.academicYear) doc.text(`Academic Year: ${req.query.academicYear}`, { align: 'center' });
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(2);

    for (const [, lecturer] of Object.entries(byLecturer)) {
      doc.font('Helvetica-Bold').fontSize(13).text(lecturer.info.fullName);
      doc.font('Helvetica').fontSize(10).text(`Department: ${lecturer.info.department || '—'}`);
      doc.moveDown(0.5);

      // Aggregate per criteria
      const cmap = {};
      lecturer.evals.forEach(ev => {
        ev.ratings.forEach(r => {
          if (!cmap[r.criteriaName]) cmap[r.criteriaName] = [];
          cmap[r.criteriaName].push(r.score);
        });
      });

      // Table header
      const colX = [50, 250, 310, 370, 430];
      doc.font('Helvetica-Bold').fontSize(9);
      ['Criteria', 'Mean', 'Median', 'Mode', 'Count'].forEach((h, i) => {
        doc.text(h, colX[i], doc.y, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 100, continued: i < 4 });
      });
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
      doc.moveDown(0.4);

      doc.font('Helvetica').fontSize(9);
      for (const [crit, scores] of Object.entries(cmap)) {
        const s = computeStats(scores);
        const y = doc.y;
        [crit, s.mean, s.median, s.mode, s.count].forEach((v, i) => {
          doc.text(String(v), colX[i], y, {
            width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 100,
            continued: i < 4,
          });
        });
      }

      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).dash(3, { space: 3 }).stroke().undash();
      doc.moveDown(1);
      if (doc.y > 700) doc.addPage();
    }

    doc.end();
  } catch (err) {
    console.error('[adminController.exportPDF]', err);
    if (!res.headersSent) res.status(500).send('PDF generation failed.');
  }
};