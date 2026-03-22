'use strict';

/**
 * server.js — EduRate application entry point
 *
 * Wires together:
 *   - Environment config  (.env via dotenv)
 *   - MongoDB connection  (Mongoose)
 *   - Express middleware  (helmet, morgan, sessions, static files)
 *   - EJS view engine    (views/ directory)
 *   - Route mounting     (/auth, /student, /lecturer, /admin)
 *   - Error handlers     (404, 500, global async errors)
 *   - HTTP server start
 */

/* ── Load environment variables first ──────────────────────────── */
require('dotenv').config();

const path         = require('path');
const express      = require('express');
const mongoose     = require('mongoose');
const session      = require('express-session');
const MongoStore   = require('connect-mongo');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const methodOverride = require('method-override');

const app = express();

/* ═══════════════════════════════════════════════════════════════
   1. DATABASE CONNECTION
═══════════════════════════════════════════════════════════════ */

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edurate';

mongoose.connect(MONGO_URI, {
  // Connection pooling — handles burst load from concurrent students
  maxPoolSize        : 50,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS    : 45000,
})
  .then(() => console.log(`✅  MongoDB connected: ${mongoose.connection.host}`))
  .catch(err => {
    console.error('❌  MongoDB connection error:', err.message);
    process.exit(1);
  });

mongoose.connection.on('disconnected', () =>
  console.warn('⚠️   MongoDB disconnected — attempting to reconnect…')
);

/* ═══════════════════════════════════════════════════════════════
   2. SECURITY MIDDLEWARE
═══════════════════════════════════════════════════════════════ */

// Helmet sets secure HTTP headers (X-Frame-Options, HSTS, etc.)
// Content-Security-Policy is relaxed to allow Google Fonts + jsDelivr CDN
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc              : ["'self'"],
      scriptSrc               : ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      styleSrc                : ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc                 : ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc                  : ["'self'", 'data:'],
      connectSrc              : ["'self'"],
      // Disable upgrade-insecure-requests — Helmet 7 adds this by default,
      // which tells browsers to convert HTTP → HTTPS. On localhost (HTTP only)
      // that silently blocks every CSS/JS asset request.
      upgradeInsecureRequests : null,
    },
  },
  // Allow same-origin cross-origin resource loads (CSS/JS served from same host)
  crossOriginResourcePolicy  : { policy: 'same-origin' },
  crossOriginEmbedderPolicy  : false,
}));

// Rate limiting — protects against brute-force and DoS
// Auth routes get a tighter window
const globalLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000, // 15 minutes
  max             : 500,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : { error: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000, // 15 minutes
  max             : 30,              // max 30 login attempts per window
  standardHeaders : true,
  legacyHeaders   : false,
  skipSuccessfulRequests: true,      // don't count successful logins
  message         : 'Too many login attempts. Please wait 15 minutes.',
});

app.use(globalLimiter);
app.use('/auth/login',           authLimiter);
app.use('/auth/forgot-password', authLimiter);

/* ═══════════════════════════════════════════════════════════════
   3. REQUEST PARSING
═══════════════════════════════════════════════════════════════ */

// Parse URL-encoded form bodies (all our HTML forms use method="POST")
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parse JSON bodies (used by no current route but useful for any API endpoints added later)
app.use(express.json({ limit: '10kb' }));

// method-override lets HTML forms send PUT/PATCH/DELETE via ?_method=PUT
// (Not strictly required here since all forms use POST, but good practice)
app.use(methodOverride('_method'));

/* ═══════════════════════════════════════════════════════════════
   4. LOGGING
═══════════════════════════════════════════════════════════════ */

if (process.env.NODE_ENV === 'development') {
  // Coloured, concise dev logging
  app.use(morgan('dev'));
} else {
  // Apache combined format for production log aggregation
  app.use(morgan('combined'));
}

/* ═══════════════════════════════════════════════════════════════
   5. SESSION
   Sessions are stored in MongoDB so they survive server restarts.
   The session store is created from the existing Mongoose connection.
═══════════════════════════════════════════════════════════════ */

const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE, 10) || 8 * 60 * 60 * 1000; // 8 hours

app.use(session({
  secret            : process.env.SESSION_SECRET || 'edurate_dev_secret_change_in_production',
  resave            : false,
  saveUninitialized : false,
  rolling           : true,              // Reset expiry on every request
  store             : MongoStore.create({
    mongoUrl          : MONGO_URI,
    collectionName    : 'sessions',
    ttl               : SESSION_MAX_AGE / 1000, // MongoStore uses seconds
    autoRemove        : 'native',        // Let MongoDB TTL index clean up expired sessions
    touchAfter        : 24 * 3600,       // Only update session in DB once every 24h if unchanged
  }),
  cookie: {
    httpOnly  : true,                    // Not accessible via document.cookie
    secure    : process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite  : 'lax',                   // CSRF protection
    maxAge    : SESSION_MAX_AGE,
  },
  name: 'edurate.sid',                   // Don't expose that we use express-session
}));

/* ═══════════════════════════════════════════════════════════════
   6. VIEW ENGINE — EJS
═══════════════════════════════════════════════════════════════ */

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disable view caching in development so template changes appear instantly
if (process.env.NODE_ENV === 'development') {
  app.set('view cache', false);
}

/* ═══════════════════════════════════════════════════════════════
   7. STATIC FILES
   Served before routes so assets bypass all auth middleware.
═══════════════════════════════════════════════════════════════ */

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge    : process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag      : true,
  index     : false, // Don't serve directory index files
}));

/* ═══════════════════════════════════════════════════════════════
   8. TEMPLATE LOCALS
   Variables available in every EJS template without passing them
   explicitly. Useful for nav state, environment flags, etc.
═══════════════════════════════════════════════════════════════ */

app.use((req, res, next) => {
  // Make the logged-in user available as `currentUser` in every template
  // (distinct from the per-view `user` local which controllers set explicitly)
  res.locals.currentUser = req.session?.user || null;
  res.locals.env         = process.env.NODE_ENV || 'development';
  next();
});

/* ═══════════════════════════════════════════════════════════════
   9. ROUTES
   Order matters: more specific prefixes must come before catch-alls.
═══════════════════════════════════════════════════════════════ */

// Root — landing page (redirect to dashboard if already logged in)
app.get('/', (req, res) => {
  if (req.session?.user) {
    const dashboards = {
      student  : '/student/dashboard',
      lecturer : '/lecturer/dashboard',
      admin    : '/admin/dashboard',
    };
    return res.redirect(dashboards[req.session.user.role] || '/auth/login');
  }
  return res.render('landing', { title: 'Welcome' });
});

// Authentication (public)
app.use('/auth', require('./routes/auth'));

// Student portal
app.use('/student', require('./routes/student'));

// Lecturer portal
app.use('/lecturer', require('./routes/lecturer'));

// Admin portal
app.use('/admin', require('./routes/admin'));

/* ═══════════════════════════════════════════════════════════════
   10. ERROR HANDLERS

   IMPORTANT: Error handlers must be registered AFTER all routes.
   Express identifies error handlers by their 4-parameter signature
   (err, req, res, next).
═══════════════════════════════════════════════════════════════ */

// ── 404 — No route matched ─────────────────────────────────────
app.use((req, res) => {
  res.status(404);

  // Respect content negotiation — JSON for API clients, HTML for browsers
  if (req.accepts('html')) {
    return res.render('errors/404', {
      title    : '404 — Page Not Found',
      user     : req.session?.user || null,
      url      : req.originalUrl,
    }, (renderErr, html) => {
      if (renderErr) {
        // errors/404.ejs doesn't exist yet — send a minimal inline page
        return res.send(`
          <!DOCTYPE html><html lang="en">
          <head><meta charset="UTF-8"><title>404 — EduRate</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:4rem">
            <h1>404 — Page Not Found</h1>
            <p>The page <code>${req.originalUrl}</code> does not exist.</p>
            <a href="/">← Go home</a>
          </body></html>
        `);
      }
      return res.send(html);
    });
  }

  return res.json({ success: false, status: 404, message: `Route not found: ${req.originalUrl}` });
});

// ── 500 — Unhandled errors ─────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log the full stack in development; only the message in production
  if (process.env.NODE_ENV === 'development') {
    console.error('\n🔴 Unhandled error:', err);
  } else {
    console.error(`[${new Date().toISOString()}] Error on ${req.method} ${req.originalUrl}:`, err.message);
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode);

  if (req.accepts('html')) {
    return res.render('errors/500', {
      title   : '500 — Server Error',
      user    : req.session?.user || null,
      message : process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong. Please try again.',
      stack   : process.env.NODE_ENV === 'development' ? err.stack   : null,
    }, (renderErr, html) => {
      if (renderErr) {
        return res.send(`
          <!DOCTYPE html><html lang="en">
          <head><meta charset="UTF-8"><title>500 — EduRate</title></head>
          <body style="font-family:sans-serif;text-align:center;padding:4rem">
            <h1>500 — Server Error</h1>
            <p>Something went wrong on our end. Please try again later.</p>
            ${process.env.NODE_ENV === 'development' ? `<pre style="text-align:left;background:#111;color:#f87171;padding:1rem;border-radius:6px">${err.stack}</pre>` : ''}
            <a href="/">← Go home</a>
          </body></html>
        `);
      }
      return res.send(html);
    });
  }

  return res.json({
    success : false,
    status  : statusCode,
    message : process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

/* ═══════════════════════════════════════════════════════════════
   11. START HTTP SERVER
═══════════════════════════════════════════════════════════════ */

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🚀  EduRate running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`    View engine : EJS → ./views`);
  console.log(`    Static dir  : ./public\n`);
});

/* ── Graceful shutdown ─────────────────────────────────────────── */
// Closes the HTTP server first (stops accepting new connections),
// then disconnects from MongoDB cleanly.

function gracefulShutdown(signal) {
  console.log(`\n⚡  ${signal} received — shutting down gracefully…`);
  server.close(() => {
    console.log('✅  HTTP server closed.');
    mongoose.connection.close(false, () => {
      console.log('✅  MongoDB connection closed.');
      process.exit(0);
    });
  });

  // Force exit after 10s if something hangs
  setTimeout(() => {
    console.error('❌  Forced exit after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Catch unhandled promise rejections (e.g. missing await) — log and exit
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌  Unhandled Rejection at:', promise, '\n    Reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app; // exported for testing
