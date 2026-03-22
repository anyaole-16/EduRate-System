'use strict';

/**
 * controllers/authController.js
 *
 * Handles all authentication flows. Uses express-session for
 * session management and bcrypt (via the User model) for password
 * hashing. All POST handlers follow PRG (Post/Redirect/Get).
 *
 * Dependencies injected at runtime — wire in server.js:
 *   const User              = require('../models/User');
 *   const EvaluationPeriod  = require('../models/EvaluationPeriod');
 *   (nodemailer transport configured via utils/email.js)
 */

const crypto   = require('crypto');
const User     = require('../models/User');
const Course   = require('../models/Course');
const { sendEmail } = require('../utils/email');

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Role → landing page after login */
const ROLE_DASHBOARD = {
  student  : '/student/dashboard',
  lecturer : '/lecturer/dashboard',
  admin    : '/admin/dashboard',
};

/** Write the user object into the session */
function setSession(req, user) {
  req.session.user = {
    _id        : user._id,
    fullName   : user.fullName,
    email      : user.email,
    role       : user.role,
    department : user.department,
    school     : user.school,
    isActive   : user.isActive,
    lastLogin  : user.lastLogin,
    matricNumber : user.matricNumber,
    createdAt  : user.createdAt,
  };
}

/* ════════════════════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════════════════════ */

/** GET /auth/login */
exports.showLogin = (req, res) => {
  // Already logged in — send to their dashboard
  if (req.session && req.session.user) {
    return res.redirect(ROLE_DASHBOARD[req.session.user.role] || '/');
  }
  const _loginError = req.session.flash_error || undefined;
  const _loginForm  = req.session.flash_form  || undefined;
  delete req.session.flash_error;
  delete req.session.flash_form;
  res.render('auth/login', {
    title    : 'Sign In',
    errorMsg : _loginError,
    formData : _loginForm,
  });
};

/** POST /auth/login */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.session.flash_error = 'Email and password are required.';
      req.session.flash_form  = { email };
      return res.redirect('/auth/login');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
                           .select('+password');

    if (!user || !(await user.matchPassword(password))) {
      req.session.flash_error = 'Invalid email or password.';
      req.session.flash_form  = { email };
      return res.redirect('/auth/login');
    }

    if (!user.isActive) {
      req.session.flash_error = 'Your account has been deactivated. Contact your administrator.';
      return res.redirect('/auth/login');
    }

    // Stamp last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    setSession(req, user);

    // Honour returnTo param set by requireAuth redirect
    const returnTo = req.query.returnTo
      ? decodeURIComponent(req.query.returnTo)
      : ROLE_DASHBOARD[user.role] || '/';

    return res.redirect(returnTo);
  } catch (err) {
    console.error('[authController.login]', err);
    req.session.flash_error = 'Something went wrong. Please try again.';
    return res.redirect('/auth/login');
  }
};

/* ════════════════════════════════════════════════════════════════
   ADMIN LOGIN — separate page, rejects non-admin credentials
════════════════════════════════════════════════════════════════ */

/** GET /auth/admin-login */
exports.showAdminLogin = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect(ROLE_DASHBOARD[req.session.user.role] || '/');
  }
  const _adminError = req.session.flash_error || undefined;
  const _adminForm  = req.session.flash_form  || undefined;
  delete req.session.flash_error;
  delete req.session.flash_form;
  res.render('auth/admin-login', {
    title    : 'Admin Portal',
    errorMsg : _adminError,
    formData : _adminForm,
  });
};

/** POST /auth/admin-login */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      req.session.flash_error = 'Email and password are required.';
      req.session.flash_form  = { email };
      return res.redirect('/auth/admin-login');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
                           .select('+password');

    // Deliberately vague error — don't reveal whether email exists
    if (!user || !(await user.matchPassword(password))) {
      req.session.flash_error = 'Invalid credentials.';
      req.session.flash_form  = { email };
      return res.redirect('/auth/admin-login');
    }

    // Only admin accounts may use this portal
    if (user.role !== 'admin') {
      req.session.flash_error = 'This portal is for administrators only. Please use the standard login.';
      return res.redirect('/auth/admin-login');
    }

    if (!user.isActive) {
      req.session.flash_error = 'Your account has been deactivated. Contact your system administrator.';
      return res.redirect('/auth/admin-login');
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    setSession(req, user);
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('[authController.adminLogin]', err);
    req.session.flash_error = 'Something went wrong. Please try again.';
    return res.redirect('/auth/admin-login');
  }
};

/* ════════════════════════════════════════════════════════════════
   STUDENT REGISTRATION
════════════════════════════════════════════════════════════════ */

/** GET /auth/register */
exports.showRegister = async (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect(ROLE_DASHBOARD[req.session.user.role] || '/');
  }
  
  try {
    // Fetch unique departments and schools from courses
    const courses = await Course.find().select('department school').lean();
    const deptSet = new Set();
    const schoolSet = new Set();
    
    courses.forEach(c => {
      if (c.department) deptSet.add(c.department);
      if (c.school) schoolSet.add(c.school);
    });
    
    const departments = Array.from(deptSet).sort();
    const schools = Array.from(schoolSet).sort();
    
    const _regError = req.session.flash_error || undefined;
    const _regForm  = req.session.flash_form  || undefined;
    delete req.session.flash_error;
    delete req.session.flash_form;
    
    res.render('auth/register', {
      title       : 'Register',
      errorMsg    : _regError,
      formData    : _regForm,
      departments,
      schools,
    });
  } catch (err) {
    console.error('[authController.showRegister]', err);
    res.render('auth/register', {
      title       : 'Register',
      errorMsg    : 'Could not load form data. Please try again.',
      departments : [],
      schools     : [],
    });
  }
};

/** POST /auth/register */
exports.register = async (req, res) => {
  try {
    const { fullName, email, matricNumber, department, school, level, password, confirmPassword } = req.body;

    if (!fullName || !email || !matricNumber || !level || !password) {
      req.session.flash_error = 'All required fields must be filled in.';
      req.session.flash_form  = { fullName, email, matricNumber, department, school, level };
      return res.redirect('/auth/register');
    }

    if (password !== confirmPassword) {
      req.session.flash_error = 'Passwords do not match.';
      req.session.flash_form  = { fullName, email, matricNumber, department, school, level };
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      req.session.flash_error = 'Password must be at least 6 characters.';
      req.session.flash_form  = { fullName, email, matricNumber, department, school, level };
      return res.redirect('/auth/register');
    }

    const existing = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { matricNumber: matricNumber.trim() },
      ],
    });
    if (existing) {
      req.session.flash_error = 'An account with this email or matric number already exists.';
      req.session.flash_form  = { fullName, email, matricNumber, department, school, level };
      return res.redirect('/auth/register');
    }

    const enrolledCourses = courses ? (Array.isArray(courses) ? courses : [courses]).map(id => id.trim()) : [];

    const user = await User.create({
      fullName    : fullName.trim(),
      email       : email.toLowerCase().trim(),
      matricNumber: matricNumber.trim(),
      department  : department ? department.trim() : undefined,
      school      : school     ? school.trim()     : undefined,
      level       : parseInt(level),
      enrolledCourses,
      password,
      role        : 'student',
    });

    // Auto-enroll in courses for their department and level
    if (department && level) {
      const levelDigit = (parseInt(level) / 100).toString();
      const departmentCourses = await Course.find({ 
        department: department.trim(),
        code: new RegExp(`^.{3}${levelDigit}`), // e.g., CSC1 for 100 level
        isActive: true 
      }).select('_id').lean();
      
      if (departmentCourses.length > 0) {
        const courseIds = departmentCourses.map(c => c._id);
        user.enrolledCourses = courseIds;
        await user.save();
        
        // Also add student to each course's enrolledStudents
        await Course.updateMany(
          { _id: { $in: courseIds } },
          { $addToSet: { enrolledStudents: user._id } }
        );
      }
    }

    setSession(req, user);
    return res.redirect('/student/dashboard');
  } catch (err) {
    console.error('[authController.register]', err);
    req.session.flash_error = err.code === 11000
      ? 'That email or matric number is already registered.'
      : 'Registration failed. Please try again.';
    req.session.flash_form = req.body;
    return res.redirect('/auth/register');
  }
};

/* ════════════════════════════════════════════════════════════════
   LECTURER SELF-REGISTRATION
════════════════════════════════════════════════════════════════ */

/** GET /auth/lecturer-register */
exports.showLecturerRegister = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect(ROLE_DASHBOARD[req.session.user.role] || '/');
  }
  const _error = req.session.flash_error || undefined;
  const _form  = req.session.flash_form  || undefined;
  delete req.session.flash_error;
  delete req.session.flash_form;
  res.render('auth/lecturer-register', {
    title    : 'Lecturer Registration',
    errorMsg : _error,
    formData : _form,
  });
};

/** POST /auth/lecturer-register */
exports.lecturerRegister = async (req, res) => {
  try {
    const { fullName, email, staffId, department, school, password, confirmPassword } = req.body;

    if (!fullName || !email || !password) {
      req.session.flash_error = 'Full name, email and password are required.';
      req.session.flash_form  = { fullName, email, staffId, department, school };
      return res.redirect('/auth/lecturer-register');
    }

    if (password !== confirmPassword) {
      req.session.flash_error = 'Passwords do not match.';
      req.session.flash_form  = { fullName, email, staffId, department, school };
      return res.redirect('/auth/lecturer-register');
    }

    if (password.length < 6) {
      req.session.flash_error = 'Password must be at least 6 characters.';
      req.session.flash_form  = { fullName, email, staffId, department, school };
      return res.redirect('/auth/lecturer-register');
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      req.session.flash_error = 'An account with this email already exists.';
      req.session.flash_form  = { fullName, email, staffId, department, school };
      return res.redirect('/auth/lecturer-register');
    }

    const user = await User.create({
      fullName    : fullName.trim(),
      email       : email.toLowerCase().trim(),
      staffId     : staffId ? staffId.trim() : undefined,
      department  : department ? department.trim() : undefined,
      school      : school ? school.trim() : undefined,
      password,
      role        : 'lecturer',
    });

    setSession(req, user);
    return res.redirect('/lecturer/dashboard');
  } catch (err) {
    console.error('[authController.lecturerRegister]', err);
    req.session.flash_error = err.code === 11000
      ? 'That email is already registered.'
      : 'Registration failed. Please try again.';
    req.session.flash_form = req.body;
    return res.redirect('/auth/lecturer-register');
  }
};

/* ════════════════════════════════════════════════════════════════
   FORGOT PASSWORD
════════════════════════════════════════════════════════════════ */

/** GET /auth/forgot-password */
exports.showForgotPassword = (req, res) => {
  const _forgotSuccess = req.session.flash_success || undefined;
  const _forgotError   = req.session.flash_error   || undefined;
  delete req.session.flash_success;
  delete req.session.flash_error;
  res.render('auth/forgot-password', {
    title      : 'Forgot Password',
    successMsg : _forgotSuccess,
    errorMsg   : _forgotError,
  });
};

/** POST /auth/forgot-password */
exports.forgotPassword = async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const user  = await User.findOne({ email });

    // Always show success to prevent email enumeration
    if (!user) {
      req.session.flash_success = 'If that email exists in our system, a reset link has been sent.';
      return res.redirect('/auth/forgot-password');
    }

    const rawToken    = user.createPasswordResetToken(); // sets hashed token + expiry on user
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/reset-password?token=${rawToken}`;

    try {
      await sendEmail({
        to      : user.email,
        subject : 'EduRate — Password Reset Request',
        html    : `
          <p>Hello ${user.fullName},</p>
          <p>You requested a password reset. Click the link below (valid for 10 minutes):</p>
          <p><a href="${resetUrl}" style="background:#2a6fdb;color:white;padding:12px 24px;
             border-radius:6px;display:inline-block;text-decoration:none;">Reset Password</a></p>
          <p>If you did not request this, ignore this email — your password will not change.</p>
        `,
      });
    } catch (mailErr) {
      console.error('[authController.forgotPassword] Email failed:', mailErr);
      // Roll back the token so user can try again
      user.passwordResetToken   = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      req.session.flash_error = 'Could not send the reset email. Please try again later.';
      return res.redirect('/auth/forgot-password');
    }

    req.session.flash_success = 'If that email exists in our system, a reset link has been sent.';
    return res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('[authController.forgotPassword]', err);
    req.session.flash_error = 'Something went wrong. Please try again.';
    return res.redirect('/auth/forgot-password');
  }
};

/* ════════════════════════════════════════════════════════════════
   RESET PASSWORD
════════════════════════════════════════════════════════════════ */

/** GET /auth/reset-password?token=… */
exports.showResetPassword = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    req.session.flash_error = 'Missing reset token. Please request a new link.';
    return res.redirect('/auth/forgot-password');
  }

  // Verify the token is still valid before showing the form
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user   = await User.findOne({
    passwordResetToken  : hashed,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    req.session.flash_error = 'Your reset link is invalid or has expired. Please request a new one.';
    return res.redirect('/auth/forgot-password');
  }

  const _resetError = req.session.flash_error || undefined;
  delete req.session.flash_error;
  res.render('auth/reset-password', {
    title    : 'Reset Password',
    token,
    errorMsg : _resetError,
  });
};

/** POST /auth/reset-password */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      req.session.flash_error = 'Missing reset token.';
      return res.redirect('/auth/forgot-password');
    }

    if (!password || password.length < 6) {
      req.session.flash_error = 'Password must be at least 6 characters.';
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    if (password !== confirmPassword) {
      req.session.flash_error = 'Passwords do not match.';
      return res.redirect(`/auth/reset-password?token=${token}`);
    }

    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user   = await User.findOne({
      passwordResetToken  : hashed,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+password +passwordResetToken +passwordResetExpires');

    if (!user) {
      req.session.flash_error = 'Your reset link is invalid or has expired. Please request a new one.';
      return res.redirect('/auth/forgot-password');
    }

    user.password             = password; // pre-save hook will hash it
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    req.session.flash_success = 'Password updated successfully. Please sign in.';
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[authController.resetPassword]', err);
    req.session.flash_error = 'Something went wrong. Please request a new reset link.';
    return res.redirect('/auth/forgot-password');
  }
};

/* ════════════════════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════════════════════ */

/** POST /auth/logout */
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('[authController.logout]', err);
    res.clearCookie('connect.sid');
    return res.redirect('/auth/login');
  });
};
