const categories = ['All', 'Pizza', 'Burgers', 'Pasta', 'Sides', 'Desserts', 'Drinks'];
const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const menuGrid = document.querySelector('#menu-grid');
const categoryList = document.querySelector('#category-list');
const searchInput = document.querySelector('#search-input');
const cartItemsElement = document.querySelector('#cart-items');
const cartSummary = document.querySelector('#cart-summary');
const checkoutButton = document.querySelector('#checkout-button');
const checkoutDialog = document.querySelector('#checkout-dialog');
const checkoutForm = document.querySelector('#checkout-form');
const placeOrderButton = document.querySelector('#place-order-button');
const formError = document.querySelector('#form-error');
const toast = document.querySelector('#toast');

let menuItems = [];
let selectedCategory = 'All';
let cart = new Map();
let searchTimer;
let toastTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function renderCategories() {
  categoryList.innerHTML = categories.map((category) => `
    <button class="category-button${category === selectedCategory ? ' active' : ''}"
      type="button" data-category="${escapeHtml(category)}"
      aria-pressed="${category === selectedCategory}">${escapeHtml(category)}</button>
  `).join('');
}

async function loadMenu() {
  menuGrid.innerHTML = '<div class="loading-state">Getting the good stuff ready<span>...</span></div>';
  const params = new URLSearchParams();
  if (selectedCategory !== 'All') params.set('category', selectedCategory);
  const search = searchInput.value.trim();
  if (search) params.set('search', search);

  try {
    const response = await fetch(`/api/menu?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We could not load the menu.');
    menuItems = data.items;
    renderMenu();
  } catch (error) {
    menuGrid.innerHTML = `<div class="empty-results"><strong>We couldn't load the menu.</strong>${escapeHtml(error.message)} Check that the server and database are running, then try again.</div>`;
    document.querySelector('#results-count').textContent = '';
  }
}

function renderMenu() {
  document.querySelector('#results-count').textContent = `${menuItems.length} ${menuItems.length === 1 ? 'dish' : 'dishes'}`;
  if (menuItems.length === 0) {
    menuGrid.innerHTML = '<div class="empty-results"><strong>No bites found.</strong>Try another search or category.</div>';
    return;
  }

  menuGrid.innerHTML = menuItems.map((item) => `
    <article class="food-card">
      <div class="food-image-wrap">
        <img class="food-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">
        <span class="food-category">${escapeHtml(item.category)}</span>
        <span class="food-rating"><span>★</span>${Number(item.rating).toFixed(1)}</span>
      </div>
      <div class="food-card-body">
        <div class="food-name-row"><h3 class="food-name">${escapeHtml(item.name)}</h3><span class="food-price">${currency.format(item.price)}</span></div>
        <p class="food-description">${escapeHtml(item.description)}</p>
        <div class="food-card-bottom"><span class="prep-time">◷ &nbsp;${escapeHtml(item.prepTime)}</span>
          <button class="add-button" type="button" data-add="${item.id}" aria-label="Add ${escapeHtml(item.name)} to your bag"><span>+</span> Add</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderCart() {
  const entries = [...cart.values()];
  const quantityTotal = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
  document.querySelector('#header-cart-count').textContent = quantityTotal;
  document.querySelector('#cart-item-label').textContent = `(${quantityTotal})`;
  checkoutButton.disabled = entries.length === 0;

  if (entries.length === 0) {
    cartItemsElement.innerHTML = '<div class="empty-cart"><span class="empty-cart-icon">♡</span><strong>Your bag is taking a break.</strong><span>Add something delicious to get started.</span></div>';
    cartSummary.hidden = true;
    return;
  }

  cartItemsElement.innerHTML = entries.map(({ item, quantity }) => `
    <div class="cart-line">
      <span class="cart-line-name">${escapeHtml(item.name)}</span>
      <span class="cart-line-price">${currency.format(item.price * quantity)}</span>
      <div class="quantity-control">
        <button type="button" data-quantity="${item.id}" data-change="-1" aria-label="Remove one ${escapeHtml(item.name)}">−</button>
        <span>${quantity}</span>
        <button type="button" data-quantity="${item.id}" data-change="1" aria-label="Add one ${escapeHtml(item.name)}">+</button>
        <button class="remove-item" type="button" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)} from your bag">×</button>
      </div>
    </div>
  `).join('');
  cartSummary.hidden = false;
  document.querySelector('#cart-subtotal').textContent = currency.format(total);
  document.querySelector('#cart-total').textContent = currency.format(total);
  document.querySelector('#checkout-total').textContent = currency.format(total);
}

categoryList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderCategories();
  loadMenu();
});

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadMenu, 220);
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
  }
});

menuGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  const item = menuItems.find((entry) => entry.id === Number(button.dataset.add));
  if (!item) return;
  const current = cart.get(item.id);
  if (current && current.quantity >= 20) {
    showToast('You can add up to 20 of each dish.');
    return;
  }
  cart.set(item.id, { item, quantity: (current?.quantity || 0) + 1 });
  renderCart();
  showToast(`${item.name} added to your bag.`);
});

cartItemsElement.addEventListener('click', (event) => {
  const quantityButton = event.target.closest('[data-quantity]');
  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    cart.delete(Number(removeButton.dataset.remove));
  } else if (quantityButton) {
    const id = Number(quantityButton.dataset.quantity);
    const entry = cart.get(id);
    if (!entry) return;
    const nextQuantity = entry.quantity + Number(quantityButton.dataset.change);
    if (nextQuantity <= 0) cart.delete(id);
    else if (nextQuantity <= 20) cart.set(id, { ...entry, quantity: nextQuantity });
    else showToast('You can add up to 20 of each dish.');
  } else {
    return;
  }
  renderCart();
});

checkoutButton.addEventListener('click', () => {
  formError.hidden = true;
  checkoutDialog.showModal();
});

document.querySelector('#dialog-close').addEventListener('click', () => checkoutDialog.close());
checkoutDialog.addEventListener('click', (event) => {
  if (event.target === checkoutDialog) checkoutDialog.close();
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (cart.size === 0) return;
  formError.hidden = true;
  placeOrderButton.disabled = true;
  placeOrderButton.innerHTML = 'Placing your order...';
  const formData = new FormData(checkoutForm);

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: formData.get('customerName'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        items: [...cart.values()].map(({ item, quantity }) => ({ menuItemId: item.id, quantity }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Your order could not be placed.');
    cart.clear();
    renderCart();
    checkoutForm.reset();
    checkoutDialog.close();
    showToast(`Order #${data.order.id} is in! We'll get cooking.`);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    placeOrderButton.disabled = false;
    placeOrderButton.innerHTML = 'Place my order <span aria-hidden="true">→</span>';
  }
});

renderCategories();
renderCart();
loadMenu();
