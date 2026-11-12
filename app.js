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
  const current = confirmed <= now && localDay(confirmed) === today && (!cutoff || cutoff > now);
  card.querySelector('.badge').textContent = current
    ? (facility.status === 'available' ? 'Confirmed today' : 'Unavailable today')
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
    const records = await request('/rest/v1/facilities?approved=eq.true&select=name,community,address,phone,kind,services(service,status,price,cutoff,confirmed_at)');
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
    renderFacilities();
  } catch {
    connection.textContent = 'Live updates unavailable · showing saved directory';
  }
}

function renderFacilities() {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [...directory, ...listings].filter((facility) => {
    const searchable = [facility.name, facility.community, facility.service, facility.searchTerms, facility.kind]
      .join(' ').toLowerCase();
    const matchesCommunity = community.selectedIndex === 0 || facility.community === community.value;
    return matchesCommunity && words.every((word) => searchable.includes(word));
  });

  count.textContent = `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`;
  cards.replaceChildren();
  if (!matches.length) {
    const message = document.createElement('p');
    message.textContent = 'No matching listings. Try “laboratory” or choose all listed communities.';
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
window.addEventListener('online', () => {
  updateConnection();
  refreshListings();
});
window.addEventListener('offline', updateConnection);
listings = readSavedListings();
refreshCommunities();
updateConnection();
renderFacilities();
refreshListings();
setInterval(renderFacilities, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('CareCheck offline setup failed:', error);
  });
}
