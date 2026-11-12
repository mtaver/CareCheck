import { configured, request } from './api.js';

const notice = document.querySelector('#notice');
const login = document.querySelector('#login');
const workspace = document.querySelector('#workspace');
const register = document.querySelector('#register');
const update = document.querySelector('#update');
let session;
let facilities = [];

const labTests = ['Full blood count (FBC)', 'Fasting blood glucose test', 'Urinalysis', 'Malaria microscopy'];
const serviceOptions = {
  Hospital: ['General outpatient consultation', 'Antenatal consultation', 'Obstetric ultrasound', 'Chest X-ray', ...labTests],
  Clinic: ['General outpatient consultation', 'Antenatal consultation', 'Routine childhood immunisation', 'Blood pressure check', ...labTests],
  Laboratory: labTests,
  Pharmacy: ['Prescription dispensing', 'Pharmacist consultation'],
};
const facilitySelect = update.elements.facility;
const feeInput = update.elements.quote;
const customInput = update.elements.service_name;
const customLabel = customInput.closest('label');
const serviceSelect = document.createElement('select');
serviceSelect.required = true;
const serviceLabel = document.createElement('label');
serviceLabel.append('Service', serviceSelect);
customLabel.before(serviceLabel);
customLabel.firstChild.textContent = 'Other service name';
customInput.placeholder = 'Enter one service';
feeInput.closest('label').firstChild.textContent = 'Fee for this service (₦)';
feeInput.required = true;

function refreshServiceOptions() {
  const facility = facilities.find((row) => row.id === facilitySelect.value);
  const names = serviceOptions[facility?.kind] ?? [];
  serviceSelect.replaceChildren(new Option('Select one service', ''),
    ...names.map((name) => new Option(name, name)), new Option('Other service', 'other'));
  clearServiceDetails();
}

function clearServiceDetails() {
  const other = serviceSelect.value === 'other';
  customLabel.hidden = !other;
  customInput.disabled = !other;
  customInput.required = other;
  customInput.value = '';
  feeInput.value = '';
  update.elements.arrival_cutoff.value = '';
  update.elements.availability.value = 'available';
}

facilitySelect.addEventListener('change', refreshServiceOptions);
serviceSelect.addEventListener('change', clearServiceDetails);
refreshServiceOptions();

const confirmationStatus = document.createElement('p');
confirmationStatus.setAttribute('role', 'status');
confirmationStatus.style.gridColumn = '1 / -1';
update.append(confirmationStatus);

async function loadFacilities() {
  const rows = await request('/rest/v1/facilities?select=id,name,approved,kind&owner_id=eq.' + session.user.id, {
    token: session.access_token,
  });
  facilities = rows;
  update.elements.facility.replaceChildren(...rows.map((row) =>
    new Option(row.name + (row.approved ? '' : ' (pending review)'), row.id)));
  update.querySelector('button').disabled = !rows.length;
  refreshServiceOptions();
}

function handle(form, action, status = notice) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    if (form === update) status.textContent = 'Saving confirmation…';
    try {
      await action(Object.fromEntries(new FormData(form)), event.submitter);
    } catch (error) {
      status.textContent = form === update ? 'Could not save confirmation. ' + error.message : error.message;
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
  const name = serviceSelect.value === 'other' ? (values.service_name ?? '').trim() : serviceSelect.value;
  if (name.length < 2 || /[,;\n]/.test(name)) {
    throw new Error('Enter one service at a time, with its own fee.');
  }
  if (values.quote === '' || !Number.isInteger(Number(values.quote)) ||
      Number(values.quote) < 0 || Number(values.quote) > 100000000) {
    throw new Error('Enter the fee for this service. Use 0 for a free service.');
  }
  const available = values.availability === 'available';
  await request('/rest/v1/rpc/confirm_service', {
    method: 'POST', token: session.access_token,
    body: {
      facility: values.facility,
      service_name: name,
      availability: values.availability,
      quote: Number(values.quote),
      arrival_cutoff: available ? values.arrival_cutoff || null : null,
    },
  });
  const pending = facilities.find((row) => row.id === values.facility)?.approved === false;
  if (facilitySelect.value === values.facility && (serviceSelect.value === name ||
      (serviceSelect.value === 'other' && customInput.value.trim() === name))) {
    refreshServiceOptions();
  }
  confirmationStatus.textContent = pending
    ? name + ' and its fee were saved. They will appear in public search after the facility is approved.'
    : name + ' and its fee were saved.';
}, confirmationStatus);

document.querySelector('#logout').addEventListener('click', () => {
  session = undefined;
  confirmationStatus.textContent = '';
  workspace.hidden = true;
  login.hidden = false;
  notice.textContent = 'Signed out.';
});
