/**
 * Cliq Webhook Authentication
 * The Cliq participation handler (Deluge invokeurl) sends a shared secret in a header.
 * Enforced only when CLIQ_WEBHOOK_TOKEN is set, so a deploy without the secret keeps the bot up.
 */

import crypto from 'crypto';

export const CLIQ_WEBHOOK_TOKEN_HEADER = 'X-Cliq-Webhook-Token';

function getExpectedToken() {
  return (process.env.CLIQ_WEBHOOK_TOKEN || '').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest();
}

export function isValidWebhookToken(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(sha256(provided), sha256(expected));
}

export function requireCliqWebhookToken(req, res, next) {
  const expected = getExpectedToken();
  if (!expected) {
    return next();
  }

  if (!isValidWebhookToken(req.get(CLIQ_WEBHOOK_TOKEN_HEADER), expected)) {
    console.warn(`🚫 Rejected Cliq request without a valid token: ${req.method} ${req.baseUrl}${req.path}`);
    return res.status(401).json({ should_respond: false, error: 'Unauthorized' });
  }

  return next();
}

export function logCliqWebhookAuthMode() {
  if (getExpectedToken()) {
    console.log(`   - Cliq webhook auth: ✓ Enforced (${CLIQ_WEBHOOK_TOKEN_HEADER} header)`);
  } else {
    console.warn(`⚠️  CLIQ_WEBHOOK_TOKEN is not set: Cliq webhook requests are NOT authenticated. Set it and send the same value in the ${CLIQ_WEBHOOK_TOKEN_HEADER} header from the Cliq participation handler.`);
  }
}
