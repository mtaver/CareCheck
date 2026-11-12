import { configured, request } from './api.js';

const requestForm = document.querySelector('#request-reset');
const passwordForm = document.querySelector('#choose-password');
const status = document.querySelector('#reset-status');
const callback = new URLSearchParams(location.hash.slice(1));
let token = callback.get('type') === 'recovery' ? callback.get('access_token') : null;
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

requestForm.hidden = !configured || Boolean(token);
passwordForm.hidden = !configured || !token;
if (!configured) status.textContent = 'Password recovery is unavailable. Try again later.';
else if (token) status.textContent = 'Choose a new password with at least eight characters.';
else if (callback.has('error') || callback.has('error_code')) {
  status.textContent = 'This link is invalid or expired. Request a new reset link.';
}

function handle(form, submit) {
  const button = form.querySelector('button');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Working…';
    try {
      await submit(Object.fromEntries(new FormData(form)));
    } catch (error) {
      status.textContent = error.message || 'The request failed. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
}

handle(requestForm, async ({ email }) => {
  const redirect = new URL('./staff.html', location.href);
  await request('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect.href), {
    method: 'POST', body: { email: email.trim() },
  });
  status.textContent = 'If this email has a CareCheck account, a reset link will arrive shortly. Check your spam folder too.';
});

handle(passwordForm, async ({ password, confirmation }) => {
  if (!token) throw new Error('Open the reset link from your email.');
  if (password !== confirmation) throw new Error('The two passwords must match.');
  try {
    await request('/auth/v1/user', { method: 'PUT', token, body: { password } });
  } catch (error) {
    if (/jwt|expired|session.*not found/i.test(error.message)) {
      token = null;
      passwordForm.reset();
      passwordForm.hidden = true;
      requestForm.hidden = false;
      throw new Error('This link is invalid or expired. Request a new reset link.');
    }
    throw error;
  }
  token = null;
  passwordForm.reset();
  passwordForm.hidden = true;
  status.textContent = 'Password updated. Sign in using your new password.';
});
