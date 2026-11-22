import { journey, step, monitor, expect } from '@elastic/synthetics';

// One scripted shopper: desktop Chromium, the provider's 4242 test card, every 3 minutes.
journey('Checkout journey', ({ page, params }) => {
  monitor.use({ id: 'dem-checkout-journey' });

  step('open the shop', async () => {
    await page.goto(params.url);
    await expect(page.getByTestId('product-kenya-nyeri')).toBeVisible();
  });

  step('open a product and add it to the cart', async () => {
    await page.getByTestId('open-kenya-nyeri').click();
    await page.getByTestId('add-to-cart').click();
    await expect(page.getByTestId('cart-total')).toHaveText('Total: $21.00');
  });

  step('go to checkout', async () => {
    await page.getByTestId('go-checkout').click();
    await expect(page.getByTestId('checkout-total')).toHaveText('Total: $21.00');
  });

  step('pay with the test card', async () => {
    await page.getByTestId('email').fill('synthetics@example.com');
    await page.getByTestId('card').fill('4242424242424242');
    await expect(page.getByTestId('place-order')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10000 });
  });
});
