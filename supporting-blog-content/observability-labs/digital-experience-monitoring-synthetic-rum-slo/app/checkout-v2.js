// Checkout v2: same flow, but enabling the button is scheduled as a low-priority task
// so it doesn't compete with the first paint. scheduler.postTask() exists in Chromium-based
// browsers and Firefox 142+, but not in Safari, where this throws and the Place order button stays disabled.
(function () {
  const form = document.getElementById('checkout-form');
  const button = document.getElementById('place-order');
  const error = document.getElementById('checkout-error');
  scheduler.postTask(() => { button.disabled = false; }, { priority: 'background' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    button.disabled = true;
    error.textContent = '';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, card: form.card.value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.reason || body.error || res.status);
      window.location.href = '/order/' + body.order_id;
    } catch (err) {
      error.textContent = 'Payment failed: ' + err.message;
      button.disabled = false;
    }
  });
})();
