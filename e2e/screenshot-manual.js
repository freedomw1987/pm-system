// pm-system manual screenshots — 20 pages + key modals
// Run: cd e2e && node ../screenshot.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, '../docs/screenshots');
const BASE = 'http://localhost:8080';

const PROJECT_ID = 'bfba6607-c843-449c-97a4-75815e5f483c';
const REQ_ID = 'ae85bc2c-de5a-4c8d-b1e1-dae1f8ff8fb9';
const TASK_ID = '27e47044-2cbe-42a8-9dc8-77a86de1b191';

// Pages to capture: [name, path, description, waitSelector?]
const PAGES = [
  ['01-login',          '/login',                                                  '登入頁'],
  ['02-dashboard',      '/',                                                       '儀表板'],
  ['03-projects',       '/projects',                                               '項目列表'],
  ['04-project-detail', `/projects/${PROJECT_ID}`,                                 '項目詳情'],
  ['05-my-requirements','/my-requirements',                                        '我的需求'],
  ['06-my-tasks',       '/my-tasks',                                               '我的任務'],
  ['07-my-bugs',        '/my-bugs',                                                '我的缺陷'],
  ['08-work-logs',      '/work-logs',                                              '工作時數'],
  ['09-reports',        '/reports',                                                '報表'],
  ['10-profile',        '/profile',                                                '個人資料'],
  ['11-chat',           '/chat',                                                   'AI 助手'],
  ['12-wiki',           `/projects/${PROJECT_ID}`,                                 'Wiki (項目內)'],
  ['13-requirement-detail', `/requirements/${REQ_ID}`,                             '需求詳情'],
  ['14-task-detail',    `/projects/${PROJECT_ID}#tasks`,                          '任務詳情 (項目任務 tab)'],
  ['15-users',          '/users',                                                  '用戶管理'],
  ['16-departments',    '/departments',                                            '部門管理'],
  ['17-roles',          '/roles',                                                  '角色權限'],
  ['18-agents',         '/agents',                                                 'Agent 管理'],
  ['20-settings',       '/settings',                                               'AI 設定'],
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-TW',
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // === Login ===
  console.log('→ 登入 admin...');
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/01-login.png`, fullPage: false });

  await page.fill('input[type="email"], input[name="email"]', 'admin@test.com');
  await page.fill('input[type="password"], input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  console.log('✅ 登入成功');

  for (const [name, route, desc] of PAGES.slice(1)) {
    try {
      console.log(`→ ${desc} (${route})`);
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Wait for content to render
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
      await page.waitForTimeout(800); // settle animations
      // Special: if it's task-detail (project page with tasks tab), click "任務" tab
      if (name === '14-task-detail') {
        const tasksTab = page.locator('button').filter({ hasText: /^任務\s*\(/ }).first();
        if (await tasksTab.count() > 0) {
          await tasksTab.click();
          await page.waitForTimeout(800);
        }
      }
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
      console.log(`  ✅ ${name}.png`);
    } catch (e) {
      console.error(`  ❌ ${name} failed: ${e.message.split('\n')[0]}`);
    }
  }

  // === Modal: 新建項目 (open from /projects) ===
  try {
    console.log('→ 新建項目 modal');
    await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
    // Try to find a "新建" / "新增" / "Create" button
    const createBtn = page.locator('button').filter({ hasText: /^(新增|新建|建立|創建|Add|Create|New).*$/ }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/21-create-project-modal.png`, fullPage: false });
      console.log('  ✅ 21-create-project-modal.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  } catch (e) {
    console.error(`  ⚠️ modal 截圖失敗: ${e.message.split('\n')[0]}`);
  }

  // === Wiki edit modal (open from project detail wiki tab) ===
  try {
    console.log('→ Wiki 編輯 modal');
    await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
    await page.waitForTimeout(500);
    // Click wiki tab
    const wikiTab = page.locator('button, a').filter({ hasText: /Wiki|wiki/ }).first();
    if (await wikiTab.count() > 0) {
      await wikiTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/22-wiki-tab.png`, fullPage: false });
      // Create wiki page
      const newWiki = page.locator('button').filter({ hasText: /(新增|新建|建立|創建|Add|New).*Wiki/i }).first();
      if (await newWiki.count() > 0) {
        await newWiki.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/23-wiki-editor.png`, fullPage: false });
        console.log('  ✅ 23-wiki-editor.png');
        await page.keyboard.press('Escape');
      }
    }
  } catch (e) {
    console.error(`  ⚠️ wiki 截圖失敗: ${e.message.split('\n')[0]}`);
  }

  // === Project Agents tab (open from project detail agents tab) ===
  try {
    console.log('→ 項目 Agent tab');
    await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
    await page.waitForTimeout(500);
    const agentsTab = page.locator('button').filter({ hasText: /Agent|agent/ }).first();
    if (await agentsTab.count() > 0) {
      await agentsTab.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/19-project-agents-tab.png`, fullPage: false });
      console.log('  ✅ 19-project-agents-tab.png');
    }
  } catch (e) {
    console.error(`  ⚠️ project-agents 截圖失敗: ${e.message.split('\n')[0]}`);
  }

  // === Role permission modal (open from /roles) ===
  try {
    console.log('→ 角色權限 modal');
    await page.goto(`${BASE}/roles`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/24-roles-page.png`, fullPage: false });
    // Edit role (try clicking first role card)
    const editBtn = page.locator('button').filter({ hasText: /編輯|Edit/ }).first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/25-role-edit-modal.png`, fullPage: false });
      console.log('  ✅ 25-role-edit-modal.png');
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    console.error(`  ⚠️ role 截圖失敗: ${e.message.split('\n')[0]}`);
  }

  // === AI Chat with sample prompt ===
  try {
    console.log('→ AI Chat 對話');
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
    await page.waitForTimeout(500);
    const chatInput = page.locator('textarea, input[placeholder*="輸入"], input[placeholder*="問"]').first();
    if (await chatInput.count() > 0) {
      await chatInput.fill('呢個項目有幾多個進行中嘅任務？');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/26-chat-prompt.png`, fullPage: false });
    }
  } catch (e) {
    console.error(`  ⚠️ chat 截圖失敗: ${e.message.split('\n')[0]}`);
  }

  await browser.close();
  console.log(`\n🎉 全部截圖完成，輸出: ${OUT}`);
  console.log('Files:');
  fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort().forEach(f => {
    const sz = fs.statSync(`${OUT}/${f}`).size;
    console.log(`  ${f}  (${(sz/1024).toFixed(1)} KB)`);
  });
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
