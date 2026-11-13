// Enables the Place order button and submits the order. If this file fails to load,
// the page still renders with HTTP 200 but nobody can buy anything.
(function () {
  const form = document.getElementById('checkout-form');
  const button = document.getElementById('place-order');
  const error = document.getElementById('checkout-error');
  button.disabled = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    error.textContent = '';
    try {
      const res = await fetch('/api/orders', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.reason || body.error || res.status);
      window.location.href = '/order/' + body.order_id;
    } catch (err) {
      error.textContent = 'Payment failed: ' + err.message;
      button.disabled = false;
    }
  });
})();
