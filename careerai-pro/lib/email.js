import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendVerificationEmail(to, name, token) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  const transport = getTransporter();
  await transport.sendMail({
    from: `"CareerAI" <${process.env.FROM_EMAIL || 'noreply@careerai.com'}>`,
    to,
    subject: 'Verify your email - CareerAI',
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif">
        <h2>Welcome to CareerAI, ${name}!</h2>
        <p>Please verify your email address to get started.</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;text-decoration:none;border-radius:8px;font-weight:bold">Verify Email</a>
        <p style="margin-top:20px;color:#666">If you did not create this account, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to, name, token) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  const transport = getTransporter();
  await transport.sendMail({
    from: `"CareerAI" <${process.env.FROM_EMAIL || 'noreply@careerai.com'}>`,
    to,
    subject: 'Reset your password - CareerAI',
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif">
        <h2>Password Reset Request</h2>
        <p>Hi ${name}, we received a request to reset your password.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;text-decoration:none;border-radius:8px;font-weight:bold">Reset Password</a>
        <p style="margin-top:20px;color:#666">This link expires in 1 hour. If you did not request this, please ignore.</p>
      </div>
    `,
  });
}