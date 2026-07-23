/**
 * EmailService with support for development console logs,
 * in-memory retrieval (for dev tools), and SMTP production adapter.
 */

global.sentEmails = global.sentEmails || [];

class EmailService {
  static async send({ to, subject, html, text }) {
    const isProd = process.env.NODE_ENV === 'production';
    
    // Construct email record
    const emailRecord = {
      id: Math.random().toString(36).substr(2, 9),
      to,
      subject,
      html,
      text,
      sentAt: new Date().toISOString()
    };

    // Store in global memory for local Dev Panel
    global.sentEmails.push(emailRecord);
    // Keep max 100 emails to prevent memory bloat
    if (global.sentEmails.length > 100) {
      global.sentEmails.shift();
    }

    console.log(`\n================= EMAIL SENT =================`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text:    ${text}`);
    console.log(`==============================================\n`);

    if (isProd) {
      // SMTP Implementation placeholder or using simple nodemailer
      try {
        const nodemailer = require('nodemailer');
        if (process.env.SMTP_HOST) {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS
            }
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Mama-Papa Bank" <no-reply@mamapapabank.local>',
            to,
            subject,
            text,
            html
          });
        }
      } catch (err) {
        console.error('Failed to send production SMTP email:', err);
      }
    }

    return emailRecord;
  }

  static async sendVerificationEmail(email, name, token) {
    const devUrl = process.env.DEV_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${devUrl}/verify-email?token=${token}`;
    
    return this.send({
      to: email,
      subject: 'Подтвердите Ваш Email — Мама-Папа Банк',
      text: `Здравствуйте, ${name}! Пожалуйста, подтвердите регистрацию Вашей семьи, перейдя по ссылке: ${verifyUrl}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Добро пожаловать в Мама-Папа Банк!</h2>
          <p>Здравствуйте, <strong>${name}</strong>!</p>
          <p>Вы успешно создали аккаунт для Вашей семьи. Чтобы активировать платформу, пожалуйста, подтвердите Ваш email:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Подтвердить Email</a>
          </p>
          <p style="color: #666; font-size: 12px;">Если Вы не регистрировались на нашей платформе, просто проигнорируйте это письмо.</p>
        </div>
      `
    });
  }

  static async sendInvitationEmail(email, inviteeName, senderName, familyName, token) {
    const devUrl = process.env.DEV_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${devUrl}/accept-invitation?token=${token}`;

    return this.send({
      to: email,
      subject: `Приглашение в семью "${familyName}" — Мама-Папа Банк`,
      text: `Здравствуйте, ${inviteeName}! ${senderName} приглашает Вас присоединиться к семейному банку "${familyName}" в качестве Администратора. Ссылка: ${acceptUrl}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Вас пригласили в Семью!</h2>
          <p>Здравствуйте, <strong>${inviteeName}</strong>!</p>
          <p>Пользователь <strong>${senderName}</strong> приглашает Вас присоединиться к пространству <strong>"${familyName}"</strong> на обучающей платформе "Мама-Папа Банк" в роли Администратора.</p>
          <p style="margin: 30px 0;">
            <a href="${acceptUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Принять приглашение</a>
          </p>
          <p style="color: #666; font-size: 12px;">Ссылка действительна в течение 72 часов.</p>
        </div>
      `
    });
  }

  static async sendPasswordResetEmail(email, name, token) {
    const devUrl = process.env.DEV_APP_URL || 'http://localhost:3000';
    const resetUrl = `${devUrl}/reset-password?token=${token}`;

    return this.send({
      to: email,
      subject: 'Восстановление пароля — Мама-Папа Банк',
      text: `Здравствуйте, ${name}! Для восстановления пароля Вашей учетной записи, пожалуйста, перейдите по следующей ссылке: ${resetUrl}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #dc2626;">Восстановление доступа</h2>
          <p>Здравствуйте, <strong>${name}</strong>!</p>
          <p>Вы получили это письмо, потому что запросили сброс пароля для Вашего аккаунта в "Мама-Папа Банк".</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Сбросить пароль</a>
          </p>
          <p style="color: #666; font-size: 12px;">Ссылка действительна в течение 1 часа. Если Вы не запрашивали сброс, просто удалите это письмо.</p>
        </div>
      `
    });
  }
}

module.exports = EmailService;
