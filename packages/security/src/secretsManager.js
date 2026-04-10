/**
 * Secrets manager — load from env; no hardcoded secrets. Stub for Vault/AWS Secrets Manager.
 * https://milloapp.com
 */
function getSecret(name) {
  const value = process.env[name];
  if (value === undefined && process.env.SECRETS_PROVIDER === 'vault') {
    return null;
  }
  return value ?? null;
}

function getSecretRequired(name) {
  const v = getSecret(name);
  if (v == null) throw new Error(`Missing required secret: ${name}`);
  return v;
}

module.exports = { getSecret, getSecretRequired };
