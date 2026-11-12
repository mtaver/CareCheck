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
const customLabel = document.querySelector('#custom-service-label');
const serviceSelect = document.querySelector('#service-choice');
const medicineFields = document.querySelector('#medicine-fields');
const medicineName = update.elements.medicine_name;
const customMedicineName = update.elements.medicine_custom_name;
const customMedicineLabel = document.querySelector('#other-medicine-label');

function showCustomMedicine() {
  const other = medicineName.value === 'other';
  customMedicineLabel.hidden = !other;
  customMedicineName.disabled = !other;
  customMedicineName.required = other;
  if (!other) customMedicineName.value = '';
}

medicineName.addEventListener('change', showCustomMedicine);
const serviceChoiceLabel = serviceSelect.closest('label');
const cutoffLabel = update.elements.arrival_cutoff.closest('label');
const availabilitySelect = update.elements.availability;

function selectedFacility() {
  return facilities.find((row) => row.id === facilitySelect.value);
}

function isPharmacy(facility) {
  return String(facility?.kind ?? '').trim().toLowerCase() === 'pharmacy';
}

function refreshServiceOptions() {
  const facility = selectedFacility();
  const kind = Object.keys(serviceOptions).find((key) =>
    key.toLowerCase() === String(facility?.kind ?? '').trim().toLowerCase());
  const names = kind ? serviceOptions[kind] : [...new Set(Object.values(serviceOptions).flat())];
  const pharmacy = isPharmacy(facility);
  medicineFields.hidden = !pharmacy;
  medicineFields.disabled = !pharmacy;
  serviceChoiceLabel.hidden = pharmacy;
  serviceSelect.disabled = !facility || pharmacy;
  cutoffLabel.hidden = pharmacy;
  update.elements.arrival_cutoff.disabled = pharmacy;
  update.querySelector('h2').textContent = pharmacy ? 'List a medicine' : 'Confirm a service';
  feeInput.closest('label').firstChild.textContent = pharmacy ? 'Price for this pack (₦)' : 'Fee for this service (₦)';
  availabilitySelect.closest('label').firstChild.textContent = pharmacy ? 'Stock status' : 'Availability';
  availabilitySelect.options[0].textContent = pharmacy ? 'In stock' : 'Available';
  availabilitySelect.options[1].textContent = pharmacy ? 'Out of stock' : 'Unavailable';
  serviceSelect.replaceChildren(new Option(facility ? 'Select one service' : 'Register a facility first', ''));
  if (facility) serviceSelect.append(...names.map((name) => new Option(name, name)), new Option('Other service', 'other'));
  serviceSelect.value = '';
  clearServiceDetails();
}

function clearServiceDetails() {
  const other = serviceSelect.value === 'other';
  customLabel.hidden = !other;
  customInput.disabled = !other;
  customInput.required = other;
  customInput.value = '';
  for (const input of medicineFields.querySelectorAll('input, select')) input.value = '';
  showCustomMedicine();
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
  const selected = facilitySelect.value;
  facilities = rows;
  facilitySelect.replaceChildren(...rows.map((row) =>
    new Option(row.name + (row.approved ? '' : ' (pending review)'), row.id)));
  if (!rows.length) facilitySelect.append(new Option('No registered facilities', ''));
  facilitySelect.value = rows.some((row) => row.id === selected) ? selected : rows[0]?.id ?? '';
  update.querySelector('button').disabled = !rows.length;
  refreshServiceOptions();
}

function handle(form, action, status = notice) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    if (form === update) status.textContent = 'Saving listing…';
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
  if (!facilities.some((row) => row.id === values.facility)) {
    throw new Error('Select one of your registered facilities first.');
  }
  const pharmacy = isPharmacy(selectedFacility());
  const medicineNameKey = values.medicine_name === 'other' ? 'medicine_custom_name' : 'medicine_name';
  const details = [medicineNameKey, 'medicine_strength', 'medicine_form', 'medicine_pack']
    .map((key) => (values[key] ?? '').trim().replace(/\s+/g, ' '));
  const name = pharmacy ? details.join(' · ')
    : serviceSelect.value === 'other' ? (values.service_name ?? '').trim() : serviceSelect.value;
  if (pharmacy && (details.some((part) => !part || /[,;·]/.test(part)) || name.length > 100)) {
    throw new Error('Enter one medicine, its strength, form and pack size. Keep the combined name under 100 characters.');
  }
  if (name.length < 2 || /[,;\n]/.test(name)) {
    throw new Error('Enter one service at a time, with its own fee.');
  }
  if (values.quote === '' || !Number.isInteger(Number(values.quote)) ||
      Number(values.quote) < 0 || Number(values.quote) > 100000000) {
    throw new Error('Enter the price for this listing. Use 0 if it is free.');
  }
  const available = values.availability === 'available';
  await request('/rest/v1/rpc/confirm_service', {
    method: 'POST', token: session.access_token,
    body: {
      facility: values.facility,
      service_name: name,
      availability: values.availability,
      quote: Number(values.quote),
      arrival_cutoff: available && !pharmacy ? values.arrival_cutoff || null : null,
    },
  });
  const pending = facilities.find((row) => row.id === values.facility)?.approved === false;
  if (facilitySelect.value === values.facility && (pharmacy || serviceSelect.value === name ||
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
