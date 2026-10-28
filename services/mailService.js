const nodemailer = require('nodemailer');
const env = require('../config/env');

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
});

async function sendMail(to, subject, text) {
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}

module.exports = { sendMail };
