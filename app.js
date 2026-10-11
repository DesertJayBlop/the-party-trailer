const CART_KEY = 'partyTrailerEnquiryCart';
const INTEREST_KEY = 'partyTrailerInterestLog';
const BASE_HIRE = 250;

function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function recordInterest(action, addon) {
  const entry = { action, addon, at: new Date().toISOString() };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'party_trailer_interest', ...entry });
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
      cart.splice(existing, 1);
      recordInterest('removed', name);
    } else {
      cart.push({ name, price: Number(button.dataset.price) });
      recordInterest('added', name);
    }
    saveCart(cart);
    renderCart();
  });
});

document.getElementById('cartItems').addEventListener('click', event => {
  const button = event.target.closest('.remove-addon');
  if (!button) return;
  const cart = readCart().filter(item => item.name !== button.dataset.addon);
  recordInterest('removed', button.dataset.addon);
  saveCart(cart);
  renderCart();
});

document.getElementById('clearCart').addEventListener('click', () => {
  readCart().forEach(item => recordInterest('removed', item.name));
  saveCart([]);
  renderCart();
});

function submitBooking(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const cart = readCart();
  const selected = data.addons || 'No add-ons selected';
  const msg = document.getElementById('formMsg');
  recordInterest('enquiry-prepared', selected);
  msg.textContent = `Enquiry prepared for ${data.name.split(' ')[0]}. Selected add-ons: ${selected}. Connect this form to your inbox or booking tool to receive submissions.`;
  return false;
}

renderCart();
document.getElementById('yr').textContent = new Date().getFullYear();
