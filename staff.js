import { configured, request } from './api.js';

const notice = document.querySelector('#notice');
const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const register = document.querySelector('#register');
const update = document.querySelector('#update');
let session;

async function loadFacilities() {
  const rows = await request('/rest/v1/facilities?select=id,name,approved&owner_id=eq.' + session.user.id, {
    token: session.access_token,
  });
  update.elements.facility.replaceChildren(...rows.map((row) =>
    new Option(row.name + (row.approved ? '' : ' (pending review)'), row.id)));
  update.querySelector('button').disabled = !rows.length;
}

function handle(form, action) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    try {
      await action(Object.fromEntries(new FormData(form)), event.submitter);
    } catch (error) {
      notice.textContent = error.message;
    } finally {
      delete form.dataset.busy;
    }
  });
}

login.hidden = !configured;
notice.textContent = configured ? 'Sign in to manage your facility.' : 'Facility registration is not open yet.';

handle(login, async (credentials, button) => {
  const signingUp = button?.value === 'signup';
  const result = await request(signingUp ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', {
    method: 'POST', body: credentials,
  });
  if (!result.access_token) {
    notice.textContent = 'Check your email to confirm your account, then sign in.';
    return;
  }
  session = result;
  await loadFacilities();
  login.reset();
  login.hidden = true;
  workspace.hidden = false;
  notice.textContent = 'Register a facility or update its services.';
});

handle(register, async (values) => {
  await request('/rest/v1/facilities', { method: 'POST', body: values, token: session.access_token });
  register.reset();
  notice.textContent = 'Facility submitted for review.';
  await loadFacilities();
});

handle(update, async (values) => {
  const available = values.availability === 'available';
  await request('/rest/v1/rpc/confirm_service', {
    method: 'POST', token: session.access_token,
    body: {
      ...values,
      quote: available && values.quote !== '' ? Number(values.quote) : null,
      arrival_cutoff: available ? values.arrival_cutoff || null : null,
    },
  });
  notice.textContent = 'Service confirmation saved.';
});

document.querySelector('#logout').addEventListener('click', () => {
  session = undefined;
  workspace.hidden = true;
  login.hidden = false;
  notice.textContent = 'Signed out.';
});
