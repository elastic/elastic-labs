// Opens the checkout in Chromium and WebKit (Safari's engine) and reports page errors
// and whether the Place order button is usable. Usage: node check-checkout.mjs <shop-url>
import { chromium, webkit } from 'playwright';

const url = process.argv[2] || 'http://localhost:8080';
for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
  const browser = await engine.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`${name.padEnd(8)} page error: ${e.name}: ${e.message}`));
  await page.goto(url);
  await page.getByTestId('open-kenya-nyeri').click();
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('go-checkout').click();
  await page.waitForTimeout(1500);
  const enabled = await page.getByTestId('place-order').isEnabled();
  console.log(`${name.padEnd(8)} Place order button: ${enabled ? 'enabled' : 'DISABLED'}`);
  await browser.close();
}
