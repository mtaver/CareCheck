import { configured, request } from './api.js';

const directory = [
  {
    name: 'Benue State University Teaching Hospital',
    community: 'Makurdi',
    address: 'KM 3, Makurdi–Gboko Road, Makurdi',
    service: 'Laboratory services',
    searchTerms: 'lab haematology hematology blood glucose malaria kidney function thyroid function liver function',
    contact: 'tel:+2348087208583',
    contactLabel: 'Call facility enquiries',
    source: 'https://www.bsuth.org.ng/laboratory-services',
  },
  {
    name: 'Federal Medical Centre, Makurdi',
    community: 'Apir',
    address: 'Permanent site, Apir',
    service: 'Laboratory complex',
    searchTerms: 'lab laboratory services',
    contact: 'mailto:info@fmcmakurdi.gov.ng',
    contactLabel: 'Email facility enquiries',
    source: 'https://fmcmakurdi.gov.ng/about-us/',
  },
];

const form = document.querySelector('#search');
const query = document.querySelector('#query');
const community = document.querySelector('#community');
const cards = document.querySelector('#cards');
const count = document.querySelector('#count');
const template = document.querySelector('#facility-card');
const connection = document.querySelector('#connection');

const cacheKey = 'carecheck-facility-directory-v1';
const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
let listings = [];
const fares = new Map();
const facilityType = document.createElement('select');
const facilityTypeLabel = document.createElement('label');
facilityTypeLabel.append('Facility type', facilityType);
facilityType.append(new Option('All facility types', ''), new Option('Pharmacies', 'pharmacy'));
form.insertBefore(facilityTypeLabel, form.querySelector('button'));
const comparison = document.createElement('select');
const comparisonLabel = document.createElement('label');
comparisonLabel.append('Compare one service', comparison);
comparisonLabel.style.gridColumn = '1 / -1';
form.append(comparisonLabel);
const comparisonStatus = document.createElement('p');
comparisonStatus.hidden = true;
cards.before(comparisonStatus);

function matchesFacilityType(entry) {
  return !facilityType.value || String(entry.kind ?? '').trim().toLowerCase() === facilityType.value;
}

function isMedicine(entry) {
  return String(entry.kind ?? '').trim().toLowerCase() === 'pharmacy' &&
    entry.service.split(' · ').length === 4;
}

function refreshComparison() {
  const selected = comparison.value;
  const services = [...new Set(listings.filter((entry) => matchesFacilityType(entry) && entry.confirmed_at && !/[,;\n]/.test(entry.service))
    .map((entry) => entry.service))].sort();
  comparison.replaceChildren(new Option(services.length ? 'Choose a service to compare' : 'No individually listed services yet', ''),
    ...services.map((service) => new Option(service, service)));
  if (services.includes(selected)) comparison.value = selected;
  comparison.disabled = !services.length;
  query.disabled = Boolean(comparison.value);
}

function addTripEstimate(card, facility) {
  const label = document.createElement('label');
  label.textContent = 'Estimated return fare (₦)';
  const fare = document.createElement('input');
  fare.type = 'number';
  fare.inputMode = 'numeric';
  fare.min = '0';
  fare.max = '100000000';
  fare.step = '1';
  fare.placeholder = 'Enter fare';
  const key = JSON.stringify([facility.id ?? facility.name, facility.community, facility.address]);
  fare.value = fares.get(key) ?? '';
  label.append(fare);
  const estimate = document.createElement('output');
  estimate.setAttribute('aria-live', 'polite');
  function updateEstimate() {
    const amount = fare.valueAsNumber;
    const hasFare = fare.value !== '' && fare.validity.valid && Number.isFinite(amount);
    estimate.textContent = Number.isFinite(facility.price) && hasFare
      ? 'Estimated total using listed fee: ' + naira.format(facility.price + amount)
      : 'Estimated total: ' + (Number.isFinite(facility.price) ? 'Enter a valid return fare' : 'Ask facility for price');
  }
  fare.addEventListener('input', () => {
    fares.set(key, fare.value);
    updateEstimate();
  });
  card.querySelector('.actions').before(label, estimate);
  updateEstimate();
}

function readSavedListings() {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function refreshCommunities() {
  const selected = community.value;
  const names = [...new Set([...directory, ...listings].map((facility) => facility.community))].sort();
  community.replaceChildren(new Option('All listed communities', ''), ...names.map((name) => new Option(name, name)));
  if (names.includes(selected)) community.value = selected;
}

function displayConfirmation(card, facility) {
  if (!facility.confirmed_at) return;
  const confirmed = new Date(facility.confirmed_at);
  const now = new Date();
  const localDay = (date) => new Date(date.getTime() + 3600000).toISOString().slice(0, 10);
  const today = localDay(now);
  const cutoff = facility.cutoff && new Date(today + 'T' + facility.cutoff + '+01:00');
  const medicine = isMedicine(facility);
  const current = confirmed <= now && localDay(confirmed) === today && (!cutoff || cutoff > now);
  card.querySelector('.badge').textContent = current
    ? (facility.status === 'available' ? (medicine ? 'In stock today' : 'Confirmed today') : (medicine ? 'Out of stock today' : 'Unavailable today'))
    : 'Call to confirm';
  card.querySelector('.confirmed').textContent = 'Last confirmed ' + new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short',
  }).format(confirmed) + ' WAT';
  if (facility.price !== null) {
    card.querySelector('.price').textContent = naira.format(facility.price) + (current ? ' quoted' : ' last quoted');
  }
  if (current && cutoff) card.querySelector('.cutoff').textContent = time.format(cutoff) + ' WAT';
}

async function refreshListings() {
  if (!configured) return;
  try {
    const records = await request('/rest/v1/facilities?approved=eq.true&select=id,name,community,address,phone,kind,services(service,status,price,cutoff,confirmed_at)');
    listings = records.flatMap(({ services, phone, ...facility }) => {
      const contact = { contact: 'tel:' + phone, contactLabel: 'Call facility enquiries' };
      return (services.length ? services : [{ service: facility.kind }])
        .map((service) => ({ ...facility, ...service, ...contact }));
    });
    try {
      localStorage.setItem(cacheKey, JSON.stringify(listings));
    } catch {
      // The current online search still works when browser storage is unavailable.
    }
    refreshCommunities();
    refreshComparison();
    renderFacilities();
  } catch {
    connection.textContent = 'Live updates unavailable · showing saved directory';
  }
}

function renderFacilities() {
  const service = comparison.value;
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [...directory, ...listings].filter((facility) => {
    if (!matchesFacilityType(facility)) return false;
    const searchable = [facility.name, facility.community, facility.service, facility.searchTerms, facility.kind]
      .join(' ').toLowerCase();
    const matchesCommunity = community.selectedIndex === 0 || facility.community === community.value;
    return matchesCommunity && (service
      ? Boolean(facility.confirmed_at) && facility.service === service
      : words.every((word) => searchable.includes(word)));
  });

  comparisonStatus.hidden = !service;
  comparisonStatus.textContent = service
    ? (matches.length === 1 ? 'One facility has listed this service in the selected area. ' : '') +
      'Add the fare for the return trip. Confirm current fees and availability before travelling.'
    : '';
  cards.style.gridTemplateColumns = service ? 'repeat(auto-fit, minmax(min(100%, 19rem), 1fr))' : '';
  count.textContent = `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`;
  cards.replaceChildren();
  if (!matches.length) {
    const message = document.createElement('p');
    message.textContent = service ? 'No listings for this service in the selected community.' :
      facilityType.value ? 'No pharmacies match this search. Try a medicine name or another community.' :
      'No matching listings. Try “laboratory” or choose all listed communities.';
    cards.append(message);
    return;
  }

  for (const facility of matches) {
    const card = template.content.cloneNode(true);
    card.querySelector('h3').textContent = facility.name;
    card.querySelector('.address').textContent = facility.address;
    card.querySelector('.service').textContent = facility.service;
    const contact = card.querySelector('.contact');
    contact.href = facility.contact;
    contact.textContent = facility.contactLabel;
    if (facility.contact.startsWith('tel:')) {
      const phone = facility.contact.slice(4);
      const dialNumber = /^0[0-9]{10}$/.test(phone) ? '+234' + phone.slice(1) : phone;
      contact.href = 'tel:' + dialNumber;
      contact.textContent = 'Call ' + phone;
      contact.setAttribute('aria-label', 'Call ' + facility.name + ' enquiries at ' + phone);
    }
    const source = card.querySelector('.source');
    if (facility.source) source.href = facility.source;
    else source.remove();
    displayConfirmation(card, facility);
    if (isMedicine(facility)) {
      card.querySelector('.price').previousElementSibling.textContent = 'Price per listed pack';
      card.querySelector('.cutoff').parentElement.hidden = true;
    }
    if (service) addTripEstimate(card, facility);
    cards.append(card);
  }
}

function updateConnection() {
  connection.textContent = navigator.onLine ? '' : 'Offline · saved directory';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  renderFacilities();
});
comparison.addEventListener('change', () => {
  query.disabled = Boolean(comparison.value);
  renderFacilities();
});
community.addEventListener('change', renderFacilities);
facilityType.addEventListener('change', () => {
  query.placeholder = facilityType.value ? 'Search for a medicine or pharmacy' : 'e.g. laboratory services';
  refreshComparison();
  renderFacilities();
});
window.addEventListener('online', () => {
  updateConnection();
  refreshListings();
});
window.addEventListener('offline', updateConnection);
listings = readSavedListings();
refreshCommunities();
refreshComparison();
updateConnection();
renderFacilities();
refreshListings();
setInterval(() => {
  if (!cards.contains(document.activeElement)) renderFacilities();
}, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('CareCheck offline setup failed:', error);
  });
}
