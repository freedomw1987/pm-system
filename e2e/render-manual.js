// Render the user manual HTML to a screenshot for verification
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///Users/davidchu/www/pm-system/docs/pm-system-user-manual.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/user-manual-render.png' });
  console.log('✅ screenshot saved');
  await browser.close();
})();
