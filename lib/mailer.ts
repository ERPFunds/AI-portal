import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.office365.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { ciphers: "SSLv3" },
});

export async function sendBriefEmail(params: {
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: `"ERP Funds AI Portal" <${process.env.SMTP_USER}>`,
    to: [
      "mparad@erpfunds.com",
      "mberry@erpfunds.com",
      "wmeyer@erpfunds.com",
      "bberry@erpfunds.com",
    ].join(", "),
    subject: params.subject,
    html: params.html,
  });
}
