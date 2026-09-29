// Everything that goes to a model passes through here first. A leaked token in a prompt is a leaked token.

const PATTERNS: [RegExp, string][] = [
  [/\bgsk_[A-Za-z0-9_-]{20,}\b/g, '[api key]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private key]'],
  [/(authorization\s*[:=]\s*)(?:bearer|basic|token)?\s*[^\s"',]+/gi, '$1[redacted]'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[jwt]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g, '[github token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/g, '[github token]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[api key]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[api key]'],
  // Newer Google AI Studio keys: AQ. followed by a long base64url body.
  [/\bAQ\.[A-Za-z0-9_-]{40,}/g, '[api key]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[aws key]'],
];

const SECRET_NAME = /TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE|CREDENTIAL|_PAT$/i;
// Short values ("true", "1") would redact half the log and protect nothing.
const MIN_SECRET_LENGTH = 8;

export function secretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([name, value]) => SECRET_NAME.test(name) && value !== undefined && value.length >= MIN_SECRET_LENGTH)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const value of secrets) out = out.split(value).join('[secret]');
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
