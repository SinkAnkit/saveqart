const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Email transporter.
 *
 * Configure via env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * In development (no SMTP_HOST set), emails are logged to console
 * and also captured via Ethereal test accounts if available.
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    logger.info({ host, port }, 'SMTP mailer configured');
  } else {
    // Dev fallback: log-only transport
    transporter = {
      sendMail: async (opts) => {
        logger.info({ to: opts.to, subject: opts.subject }, '[mailer] email would be sent (no SMTP configured)');
        return { messageId: `dev-${Date.now()}` };
      },
    };
    logger.warn('No SMTP configured — emails will be logged only');
  }

  return transporter;
}

const FROM = process.env.SMTP_FROM || 'SaveQart <noreply@saveqart.local>';

async function sendPasswordReset(email, token) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  const mailer = getTransporter();

  await mailer.sendMail({
    from: FROM,
    to: email,
    subject: 'Reset your SaveQart password',
    text: `You requested a password reset.\n\nClick this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #047857;">Reset your password</h2>
        <p>You requested a password reset for your SaveQart account.</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #047857; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset password</a></p>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, just ignore this email.</p>
      </div>
    `,
  });
}

async function sendEmailVerification(email, token) {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
  const mailer = getTransporter();

  await mailer.sendMail({
    from: FROM,
    to: email,
    subject: 'Verify your SaveQart email',
    text: `Verify your email address by clicking:\n${verifyUrl}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #047857;">Verify your email</h2>
        <p>Confirm your email address to complete your SaveQart setup.</p>
        <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #047857; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Verify email</a></p>
      </div>
    `,
  });
}

module.exports = { sendPasswordReset, sendEmailVerification };
