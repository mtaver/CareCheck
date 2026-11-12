import { configured, request } from './api.js';

const login = document.querySelector('#admin-login');
const workspace = document.querySelector('#admin-workspace');
const status = document.querySelector('#status');
const management = document.querySelector('#admin-management');
const currency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
let session;
let busy = false;

function add(parent, tag, value) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  parent.append(element);
  return element;
}

function secured(path, body) {
  return request('/rest/v1/rpc/' + path, {
    method: 'POST',
    token: session.access_token,
    body,
  });
}

function renderFacility(parent, facility) {
  const card = add(parent, 'article');
  card.className = 'card';
  add(card, 'h3', facility.name);
  add(card, 'p', [facility.kind, facility.community, facility.address, facility.phone].join(' · '));
  add(card, 'p', 'Submitted by ' + facility.owner_email + ' · ' + facility.status);
  if (facility.services.length) {
    const list = add(card, 'ul');
    for (const service of facility.services) {
      const fee = service.price === null ? 'Fee unlisted' : currency.format(service.price);
      add(list, 'li', service.name + ' · ' + fee + ' · last reported ' + service.status +
        (service.cutoff ? ' · arrival cutoff ' + service.cutoff + ' WAT' : ''));
    }
  } else {
    add(card, 'p', 'No services submitted.');
  }

  const form = add(card, 'form');
  const reasonLabel = add(form, 'label', 'Reason for removal');
  const reason = add(reasonLabel, 'input');
  reason.maxLength = 500;
  if (facility.status !== 'approved') add(form, 'button', 'Approve listing').value = 'approved';
  if (facility.status !== 'removed') add(form, 'button', 'Remove listing').value = 'removed';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const decision = event.submitter?.value;
    if (!decision) return;
    run(async () => {
      await secured('admin_review_facility', { facility_id: facility.id, decision, reason: reason.value.trim() || null });
      await refresh();
      return facility.name + (decision === 'approved' ? ' approved.' : ' removed from public search.');
    }, card);
  });
}

async function refresh() {
  const data = await secured('admin_dashboard', {});
  for (const [selector, pending] of [['#pending-list', true], ['#reviewed-list', false]]) {
    const container = document.querySelector(selector);
    container.replaceChildren();
    const facilities = data.facilities.filter((facility) => (facility.status === 'pending') === pending);
    if (!facilities.length) add(container, 'p', pending ? 'No pending submissions.' : 'No reviewed facilities.');
    for (const facility of facilities) renderFacility(container, facility);
  }
  management.hidden = data.role !== 'main';
  const admins = document.querySelector('#admin-list');
  admins.replaceChildren();
  for (const admin of data.admins) add(admins, 'li', admin.email + ' · ' + (admin.role === 'main' ? 'Main administrator' : 'Administrator'));
  return data;
}

async function run(action, card) {
  if (busy) return;
  busy = true;
  const feedback = card ? add(card, 'p') : status;
  feedback.setAttribute('role', 'status');
  feedback.textContent = 'Working…';
  try {
    status.textContent = await action();
    if (card?.isConnected) feedback.textContent = status.textContent;
    if (card && !card.isConnected) status.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    feedback.textContent = error.message || 'The request failed. Try again.';
  } finally {
    busy = false;
  }
}

login.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    session = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: Object.fromEntries(new FormData(login)),
    });
    try {
      const data = await refresh();
      login.reset();
      login.hidden = true;
      workspace.hidden = false;
      return data.role === 'main' ? 'Signed in as main administrator.' : 'Signed in as administrator.';
    } catch (error) {
      session = undefined;
      throw error;
    }
  });
});

document.querySelector('#admin-refresh').addEventListener('click', () => run(async () => {
  await refresh();
  return 'Submissions refreshed.';
}));

document.querySelector('#admin-logout').addEventListener('click', () => {
  if (busy) return;
  session = undefined;
  workspace.hidden = true;
  login.hidden = false;
  status.textContent = 'Signed out.';
});

for (const id of ['account-form', 'admin-form']) {
  const form = document.getElementById(id);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { email, action, reason } = Object.fromEntries(new FormData(form));
    run(async () => {
      await secured('admin_manage_account', { account_email: email.trim(), action, reason: reason?.trim() || null });
      form.reset();
      await refresh();
      return 'Account action saved for ' + email.trim() + '.';
    }, form.parentElement);
  });
}

if (!configured) {
  login.hidden = true;
  status.textContent = 'The admin portal needs a Supabase connection.';
}
