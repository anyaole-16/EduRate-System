'use strict';

const nodemailer = require('nodemailer');

/**
 * sendEmail — thin wrapper around Nodemailer.
 * Creates a fresh transport per call so config changes in .env
 * take effect without a server restart (useful during development).
 *
 * @param {Object} options
 * @param {string} options.to      - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html    - HTML body content
 * @param {string} [options.text]  - Plain-text fallback (auto-generated if omitted)
 */
async function sendEmail({ to, subject, html, text }) {
  const transporter = nodemailer.createTransport({
    host  : process.env.EMAIL_HOST   || 'smtp.mailtrap.io',
    port  : parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true',   // true for port 465, false for others
    auth  : {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from   : process.env.EMAIL_FROM || 'EduRate <noreply@edurate.edu>',
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
}

module.exports = { sendEmail };