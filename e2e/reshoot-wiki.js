// Quick re-shoot: wiki editor modal (23-wiki-editor.png)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-TW',
  });
  const page = await ctx.newPage();
  const BASE = 'http://localhost:8080';
  const PROJECT_ID = 'bfba6607-c843-449c-97a4-75815e5f483c';

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', 'admin@test.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');

  await page.goto(`${BASE}/projects/${PROJECT_ID}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  // Click wiki tab
  const wikiTab = page.locator('button').filter({ hasText: /^Wiki$/ }).first();
  if (await wikiTab.count() > 0) {
    await wikiTab.click();
    await page.waitForTimeout(800);
    // Click create new wiki page button
    const newBtn = page.locator('button').filter({ hasText: /^(建立第一頁|新建頁面|\+ 新頁面|新增頁面|新增.*Wiki|新建.*Wiki)/ }).first();
    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.resolve(__dirname, '../docs/screenshots/23-wiki-editor.png') });
      console.log('✅ 23-wiki-editor.png');
    } else {
      console.log('⚠️ no new wiki button found, dumping buttons:');
      const btns = await page.locator('button').allTextContents();
      console.log(btns.filter(t => t.length < 30));
    }
  } else {
    console.log('⚠️ no wiki tab found');
  }
  await browser.close();
})();
