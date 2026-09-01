import { test, expect } from '@playwright/test';

const errors = [];
const isNetworkNoise = text => /Failed to load resource/i.test(text) || /ERR_(CONNECTION|NAME|INTERNET)/i.test(text);

async function startArsenalCareer(page) {
  await page.goto('/');
  await expect(page.locator('.club-card').first()).toBeVisible({ timeout:15000 });
  await page.locator('.club-card', { hasText:'Arsenal' }).first().click();
  await page.getByRole('button', { name:/Start with Arsenal/ }).click();
  await expect(page.locator('#app')).toBeVisible({ timeout:30000 });
}

async function openMarket(page) {
  await page.waitForFunction(() => typeof window.navigateTo === 'function');
  await page.evaluate(() => window.navigateTo('transfers'));
  await expect(page.locator('#screen-transfers')).toHaveClass(/active/, { timeout:15000 });
  await expect(page.getByRole('button', { name:/^Deals/ })).toBeVisible();
}

async function createStagedEnquiry(page) {
  await page.getByRole('button', { name:'Buy', exact:true }).click();
  await page.getByRole('button', { name:'Affordable', exact:true }).click();
  await page.locator('#tr-can-sign').click();
  await expect(page.locator('.buy-row').first()).toBeVisible();
  await page.locator('.buy-row').first().click();
  await expect(page.locator('.det-offer summary')).toHaveText('Structure fee');
  await expect(page.locator('.det-offer')).not.toContainText('Wage / wk');
  await expect(page.getByRole('button', { name:'Make Offer' })).toBeVisible();
  await page.getByRole('button', { name:'Make Offer' }).click();
  await page.getByRole('button', { name:'Send Offer' }).click();
  await page.getByRole('button', { name:/^Deals/ }).click();
  await expect(page.getByText('Active Negotiations')).toBeVisible();
  await expect(page.getByText('Seller terms')).toBeVisible();
  await expect(page.getByText(/Awaiting seller/)).toBeVisible();
}

async function advanceActiveDealToContractTerms(page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('pitch_fc');
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('save', 'readwrite');
    const store = tx.objectStore('save');
    const get = store.get('active');
    const save = await new Promise((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    const deal = save.transferMarket.activeDeals[0];
    const accepted = {
      ...deal,
      state:'player_negotiation',
      awaiting:'user',
      stateOwner:'user',
      decisionLog:[...(deal.decisionLog ?? []), {
        eventKey:'e2e:seller-accepts', from:deal.state, to:'player_negotiation',
        actor:'seller', reasonCode:'seller_accepts', weekKey:'2025/26:1',
      }],
    };
    store.put({
      ...save,
      transferMarket:{
        ...save.transferMarket,
        activeDeals:save.transferMarket.activeDeals.map((item, index) => index === 0 ? accepted : item),
      },
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
}

async function assertNoOverflow(page) {
  const geometry = await page.evaluate(() => ({ viewport:window.innerWidth, documentWidth:document.documentElement.scrollWidth, screenWidth:document.querySelector('#screen-transfers')?.scrollWidth ?? 0 }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.screenWidth).toBeLessThanOrEqual(geometry.viewport + 1);
}

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error' && !isNetworkNoise(message.text())) errors.push(message.text()); });
});

test('P4 staged deal is persisted and readable at 390x844', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await startArsenalCareer(page);
  await openMarket(page);
  await createStagedEnquiry(page);
  await assertNoOverflow(page);
  const persisted = await page.evaluate(async () => {
    const request = window.indexedDB.open('pitch_fc');
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('save');
    const get = tx.objectStore('save').get('active');
    const save = await new Promise((resolve, reject) => { get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    return save.transferMarket.activeDeals[0];
  });
  expect(persisted).toMatchObject({ state:'seller_terms', awaiting:'seller', createdBy:'user' });
  await advanceActiveDealToContractTerms(page);
  await page.reload();
  await openMarket(page);
  await page.getByRole('button', { name:'Negotiate Contract' }).click();
  await expect(page.getByText(/Negotiate with/)).toBeVisible();
  await expect(page.getByText('Weekly wage')).toBeVisible();
  await expect(page.getByText('Length')).toBeVisible();
  await expect(page.getByText('Squad role')).toBeVisible();
  await expect(page.getByText('Signing bonus')).toBeVisible();
  await expect(page.getByText('Release clause')).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({ path:'test-results/p4-transfer-contract-390x844.png' });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('P4 deals and contract navigation remain readable at 1280x800', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await startArsenalCareer(page);
  await openMarket(page);
  await createStagedEnquiry(page);
  await assertNoOverflow(page);
  await expect(page.getByRole('button', { name:'Contracts', exact:true })).toBeVisible();
  await page.screenshot({ path:'test-results/p4-transfer-deals-1280x800.png' });
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});
