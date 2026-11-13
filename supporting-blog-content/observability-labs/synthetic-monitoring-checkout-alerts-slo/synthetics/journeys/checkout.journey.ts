import { journey, step, monitor, expect } from '@elastic/synthetics';

journey('Checkout journey', ({ page, params }) => {
  monitor.use({ id: 'checkout-journey', schedule: 5 });

  step('open the shop', async () => {
    await page.goto(params.url);
    await expect(page.getByTestId('product-kenya-nyeri')).toBeVisible();
  });

  step('add a coffee to the cart', async () => {
    await page.getByTestId('add-kenya-nyeri').click();
    await expect(page.getByTestId('cart-total')).toHaveText('Total: $21.00');
  });

  step('go to checkout', async () => {
    await page.getByTestId('go-checkout').click();
    await expect(page.getByTestId('checkout-total')).toHaveText('Total: $21.00');
  });

  step('pay and get a confirmation', async () => {
    await page.getByTestId('email').fill('synthetics@example.com');
    await page.getByTestId('card').fill('4242424242424242');
    await expect(page.getByTestId('place-order')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('place-order').click();
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 10000 });
  });
});
