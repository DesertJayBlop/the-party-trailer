const CART_KEY = 'partyTrailerEnquiryCart';
const INTEREST_KEY = 'partyTrailerInterestLog';
const BASE_HIRE = 250;
const GOOGLE_FORM_ENDPOINT = 'https://docs.google.com/forms/d/e/1FAIpQLSfhN4PeCR4r94XZnBOigMHZxcUjeXBGc3cXwDbDfSrFpn8CEg/formResponse';
const AVAILABILITY_FEED = '';
const MONTHS_PER_VIEW = 3;
let availabilityMonthOffset = 0;
let bookedDates = new Set();
let availabilityLoaded = false;

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function recordInterest(action, addon, price = 0) {
  const entry = { action, addon, price, at: new Date().toISOString() };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'party_trailer_interest', ...entry });
  const item = { item_name: addon, item_category: 'Trailer add-on', price };
  if (typeof window.gtag === 'function') {
    if (action === 'added') {
      window.gtag('event', 'add_to_cart', { currency: 'NZD', value: price, items: [item] });
    } else if (action === 'removed') {
      window.gtag('event', 'remove_from_cart', { currency: 'NZD', value: price, items: [item] });
    } else if (action === 'enquiry-prepared') {
      window.gtag('event', 'generate_lead', { currency: 'NZD', value: price, selected_addons: addon });
    }
  }
  try {
    const log = JSON.parse(localStorage.getItem(INTEREST_KEY)) || [];
    localStorage.setItem(INTEREST_KEY, JSON.stringify([...log, entry].slice(-100)));
  } catch { /* Cart still works if browser storage is unavailable. */ }
}

function renderCart() {
  const cart = readCart();
  const items = document.getElementById('cartItems');
  const total = document.getElementById('cartTotal');
  const selectedAddons = document.getElementById('selectedAddons');
  const counts = document.querySelectorAll('.cart-count');
  const extrasTotal = cart.reduce((sum, item) => sum + item.price, 0);

  counts.forEach(count => { count.textContent = cart.length; });
  selectedAddons.value = cart.map(item => `${item.name} ($${item.price})`).join(', ');
  items.innerHTML = cart.length
    ? cart.map(item => `<li><span>${item.name}</span><button type="button" class="remove-addon" data-addon="${item.name}">Remove</button></li>`).join('')
    : '<li>No add-ons selected yet.</li>';
  total.textContent = cart.length
    ? `Trailer hire $${BASE_HIRE} + add-ons $${extrasTotal} = from $${BASE_HIRE + extrasTotal}`
    : `Trailer hire $${BASE_HIRE} + add-ons`;

  document.querySelectorAll('.add-on-btn').forEach(button => {
    const selected = cart.some(item => item.name === button.dataset.addon);
    button.textContent = selected ? 'Added to enquiry ✓' : 'Add to enquiry';
    button.classList.toggle('is-added', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

document.querySelectorAll('.add-on-btn').forEach(button => {
  button.addEventListener('click', () => {
    const cart = readCart();
    const name = button.dataset.addon;
    const existing = cart.findIndex(item => item.name === name);
    if (existing >= 0) {
      const [removed] = cart.splice(existing, 1);
      recordInterest('removed', name, removed.price);
    } else {
      const price = Number(button.dataset.price);
      cart.push({ name, price });
      recordInterest('added', name, price);
    }
    saveCart(cart);
    renderCart();
  });
});

document.getElementById('cartItems').addEventListener('click', event => {
  const button = event.target.closest('.remove-addon');
  if (!button) return;
  const cart = readCart();
  const removed = cart.find(item => item.name === button.dataset.addon);
  recordInterest('removed', button.dataset.addon, removed?.price || 0);
  saveCart(cart.filter(item => item.name !== button.dataset.addon));
  renderCart();
});

document.getElementById('clearCart').addEventListener('click', () => {
  readCart().forEach(item => recordInterest('removed', item.name, item.price));
  saveCart([]);
  renderCart();
});

async function submitBooking(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const cart = readCart();
  const selected = data.addons || 'No add-ons selected';
  const msg = document.getElementById('formMsg');
  const submitButton = form.querySelector('button[type="submit"]');
  const date = new Date(`${data.date}T12:00:00`);
  const nights = Number(data.nights);
  const pickupDate = new Date(date);
  pickupDate.setDate(pickupDate.getDate() + nights);
  const reservation = `${nights} night${nights === 1 ? '' : 's'} — drop-off ${formatDate(date)} at 11am; pickup ${formatDate(pickupDate)} at 9am.`;
  if (reservationOverlapsBookedDate(date, nights)) {
    msg.textContent = 'That stay includes a booked date. Please choose another drop-off date or number of nights.';
    return false;
  }
  recordInterest('enquiry-prepared', selected, BASE_HIRE + cart.reduce((sum, item) => sum + item.price, 0));
  submitButton.disabled = true;
  submitButton.textContent = 'Sending enquiry…';
  try {
    const payload = new URLSearchParams({
      'entry.949351770': data.name,
      'entry.752131767': data.email,
      'entry.1252709417': data.phone,
      'entry.1380112863': data.location,
      'entry.1878896652_year': String(date.getFullYear()),
      'entry.1878896652_month': String(date.getMonth() + 1),
      'entry.1878896652_day': String(date.getDate()),
      'entry.424130541': selected,
      'entry.31177874': `${reservation}${data.notes ? `\n\nEvent details: ${data.notes}` : ''}`
    });
    await fetch(GOOGLE_FORM_ENDPOINT, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: payload.toString()
    });
    msg.textContent = 'Your request was sent.';
    form.reset();
    renderCart();
    updateReservationSummary();
    showEnquirySuccess();
  } catch {
    msg.textContent = 'We could not send your enquiry just now. Please try again or call us on 02904317726.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Send enquiry';
  }
  return false;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(date) {
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

function updateReservationSummary() {
  const dateInput = document.querySelector('input[name="date"]');
  const nightsInput = document.querySelector('input[name="nights"]');
  const timing = document.getElementById('reservationTiming');
  if (!dateInput?.value || !timing) {
    if (timing) timing.textContent = 'Choose a drop-off date to see your 11am delivery and 9am pickup timing.';
    return;
  }
  const dropOff = new Date(`${dateInput.value}T12:00:00`);
  const nights = Math.max(1, Number(nightsInput.value) || 1);
  const pickup = new Date(dropOff);
  pickup.setDate(pickup.getDate() + nights);
  const conflict = reservationOverlapsBookedDate(dropOff, nights);
  timing.textContent = conflict
    ? `${nights} night${nights === 1 ? '' : 's'}: this stay includes a booked date. Choose another drop-off date or number of nights.`
    : `${nights} night${nights === 1 ? '' : 's'}: drop-off ${formatDate(dropOff)} at 11am · pickup ${formatDate(pickup)} at 9am.`;
  document.getElementById('reservationSummary')?.classList.toggle('has-conflict', conflict);
}

function reservationOverlapsBookedDate(dropOff, nights) {
  for (let index = 0; index < nights; index += 1) {
    const stayDate = new Date(dropOff);
    stayDate.setDate(stayDate.getDate() + index);
    if (bookedDates.has(dateKey(stayDate))) return true;
  }
  return false;
}

function renderAvailability() {
  const calendar = document.getElementById('availabilityCalendar');
  if (!calendar) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateInput = document.querySelector('input[name="date"]');
  dateInput.min = dateKey(today);
  const months = Array.from({ length: MONTHS_PER_VIEW }, (_, index) => new Date(today.getFullYear(), today.getMonth() + availabilityMonthOffset + index, 1));
  const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const range = document.getElementById('availabilityRange');
  const prev = document.getElementById('availabilityPrev');
  if (range) range.textContent = `${months[0].toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })} – ${months.at(-1).toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}`;
  if (prev) prev.disabled = availabilityMonthOffset === 0;
  calendar.innerHTML = months.map(month => {
    const firstWeekday = (month.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const pads = Array.from({ length: firstWeekday }, () => '<span class="day pad" aria-hidden="true"></span>').join('');
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
      const offset = Math.round((date - today) / 86400000);
      const status = offset < 0 ? 'past' : !availabilityLoaded ? 'checking' : bookedDates.has(dateKey(date)) ? 'booked' : 'available';
      const label = status === 'booked' ? 'Booked' : status === 'past' ? 'Past' : status === 'checking' ? 'Checking availability' : 'Available';
      const disabled = status === 'booked' || status === 'past' || status === 'checking' ? ' disabled' : '';
      return `<button class="day ${status}" type="button" data-date="${dateKey(date)}"${disabled} aria-label="${date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}: ${label}"><span class="num">${date.getDate()}</span><span class="st">${label}</span></button>`;
    }).join('');
    return `<article class="month-calendar"><h3>${month.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}</h3><div class="cal-head">${weekdayNames.map(day => `<span>${day}</span>`).join('')}</div><div class="cal-grid">${pads}${days}</div></article>`;
  }).join('');
}

document.getElementById('availabilityCalendar').addEventListener('click', event => {
  const day = event.target.closest('button.day:not([disabled])');
  if (!day) return;
  const dateInput = document.querySelector('input[name="date"]');
  dateInput.value = day.dataset.date;
  updateReservationSummary();
  document.getElementById('book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  dateInput.focus({ preventScroll: true });
});

function loadAvailability() {
  if (!AVAILABILITY_FEED) {
    availabilityLoaded = true;
    renderAvailability();
    return;
  }
  const script = document.createElement('script');
  script.src = `${AVAILABILITY_FEED}${AVAILABILITY_FEED.includes('?') ? '&' : '?'}callback=partyTrailerAvailability&v=${Date.now()}`;
  script.async = true;
  script.onerror = () => {
    availabilityLoaded = true;
    renderAvailability();
  };
  document.head.append(script);
}

window.partyTrailerAvailability = payload => {
  bookedDates = new Set(Array.isArray(payload?.booked) ? payload.booked : []);
  availabilityLoaded = true;
  renderAvailability();
  updateReservationSummary();
};

function showEnquirySuccess() {
  const dialog = document.getElementById('enquirySuccessDialog');
  if (dialog?.showModal) dialog.showModal();
}

function closeEnquirySuccess() {
  document.getElementById('enquirySuccessDialog')?.close();
}

renderCart();
renderAvailability();
loadAvailability();
document.querySelector('input[name="date"]').addEventListener('change', updateReservationSummary);
document.querySelector('input[name="nights"]').addEventListener('input', updateReservationSummary);
document.getElementById('availabilityPrev').addEventListener('click', () => {
  availabilityMonthOffset = Math.max(0, availabilityMonthOffset - MONTHS_PER_VIEW);
  renderAvailability();
});
document.getElementById('availabilityNext').addEventListener('click', () => {
  availabilityMonthOffset += MONTHS_PER_VIEW;
  renderAvailability();
});
document.getElementById('closeEnquiryDialog').addEventListener('click', closeEnquirySuccess);
document.getElementById('acknowledgeEnquiry').addEventListener('click', closeEnquirySuccess);
document.getElementById('enquirySuccessDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeEnquirySuccess();
});
updateReservationSummary();
document.getElementById('yr').textContent = new Date().getFullYear();
