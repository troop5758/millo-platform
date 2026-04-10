/**
 * Notifications — emails (logo, dark/light), push, in-app.
 * Email providers: sendgrid, aws_ses, resend, smtp, console.
 * https://milloapp.com
 */
const branding = require('./branding');
const emailTemplates = require('./emailTemplates');
const push = require('./push');
const inApp = require('./inApp');
const sendEmail = require('./sendEmail');
const emailService = require('./email');

module.exports = {
  ...branding,
  ...emailTemplates,
  ...push,
  ...inApp,
  ...sendEmail,

  // Email service
  assertEmailProviderConfigured: emailService.assertEmailProviderConfigured,
  validateEmailConfig: emailService.validateEmailConfig,
  getEmailConfigStatus: emailService.getConfigStatus,
  getEmailProvider: emailService.getProvider,
  isRealEmailProvider: emailService.isRealProviderConfigured,
  isConsoleEmailTransport: emailService.isConsoleEmailTransport,
  emailHealthCheck: emailService.healthCheck,
  resetEmailTransporter: emailService.resetTransporter,
};
