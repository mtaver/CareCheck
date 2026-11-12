const facilities = [
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

function renderFacilities() {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = facilities.filter((facility) => {
    const searchable = [facility.name, facility.community, facility.service, facility.searchTerms]
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
    card.querySelector('.source').href = facility.source;
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
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();
renderFacilities();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('CareCheck offline setup failed:', error);
  });
}
