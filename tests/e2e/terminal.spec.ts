import { expect, test, type Page } from '@playwright/test';

const APP = '/?e2e&seed=505';

async function openApp(page: Page) {
  await page.goto(APP);
  await expect(page.getByTestId('terminal')).toBeVisible();
  await page.waitForFunction(() => window.__MDR__ !== undefined);
}

const summary = (page: Page) => page.evaluate(() => window.__MDR__!.summary());

/** Activate a visible group and click on one of its digits. */
async function refineOneGroup(page: Page) {
  const id = await page.evaluate(() => window.__MDR__!.forceActivate());
  expect(id).not.toBeNull();
  const [target] = await page.evaluate(() => window.__MDR__!.activeCellPositions());
  expect(target).toBeDefined();
  await page.mouse.move(target!.x, target!.y);
  await page.mouse.down();
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('renders the board with bins and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openApp(page);
  const s = await summary(page);
  expect(s.groups).toBeGreaterThan(30);
  expect(s.refined).toBe(0);
  // Canvas has non-background pixels (digits and chrome were drawn).
  const litPixels = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 16) if (data[i + 1]! > 120) lit++;
      return lit;
    });
  await expect.poll(litPixels).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('clicking an active group refines it and persists progress', async ({ page }) => {
  await openApp(page);
  await refineOneGroup(page);
  await expect.poll(async () => (await summary(page)).refined).toBe(1);
  expect((await summary(page)).flying).toBeGreaterThan(0);

  // Digits land in the bin.
  await page.evaluate(() => window.__MDR__!.fastForward(2000));
  expect((await summary(page)).flying).toBe(0);

  // Progress survives a reload.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mdr.progress.v1') ?? '{}'));
  expect(saved.refinedGroupIds).toHaveLength(1);
  await openApp(page);
  expect((await summary(page)).refined).toBe(1);
});

test('Tab toggles the settings panel and settings apply live', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  const panel = page.getByTestId('settings-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Header text').fill('Test Floor');
  await panel.getByRole('button', { name: 'Save' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mdr.settings.v1') ?? '{}'));
  expect(saved.displaySettings.headerText).toBe('Test Floor');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('I enters idle mode and a click leaves it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('i');
  const idle = page.getByTestId('idle-screen');
  await expect(idle).toBeVisible();
  await idle.click();
  await expect(idle).toBeHidden();
});

test('refining everything shows the completion screen and a new file starts fresh', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__MDR__!.refineAll());
  const done = page.getByTestId('complete-screen');
  await expect(done).toBeVisible();
  await expect(done).toContainText('100%');
  await done.getByRole('button', { name: 'Open next file' }).click();
  await expect(done).toBeHidden();
  await expect.poll(async () => (await summary(page)).refined).toBe(0);
});

test('help overlay opens with ?', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  await expect(page.getByTestId('help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help')).toBeHidden();
});
