/** A short, key-free reason the user can act on (wrong key, unknown model, no credit). */
export function providerError(name: string, status: number, body: string): string {
  let reason = '';
  try { reason = JSON.parse(body)?.error?.message || ''; } catch { reason = ''; }
  reason = reason.replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-…').slice(0, 200);
  if (status === 401) return `${name} refused the API key. Check it in Settings → API Keys → AI Brain.`;
  if (status === 429) return `${name} limit or credit reached. ${reason}`.trim();
  if (status === 404) return `${name} does not know this model. Choose another in Settings → API Keys → AI Brain.`;
  return `The AI service returned an error (${status})${reason ? `: ${reason}` : '.'}`;
}
