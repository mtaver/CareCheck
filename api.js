import { projectUrl, publishableKey } from './config.js';

export const configured = Boolean(projectUrl && publishableKey);

export async function request(path, options = {}) {
  const { token, body, method = 'GET' } = options;
  const response = await fetch(projectUrl.replace(/\/$/, '') + path, {
    method,
    headers: {
      apikey: publishableKey,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(data?.message || data?.msg || 'Request failed. Try again.');
  return data;
}
