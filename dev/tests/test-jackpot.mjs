import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../../index.html');
const launchOpts = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

await page.goto(file);

// Force Math.random() to always return just-under-1, so the weighted draw always
// lands in the last bucket — currently the 1%-weight, 50%-penalty rare sector.
await page.addInitScript(() => {
  Math.random = () => 0.9999999;
});
await page.reload();

await page.waitForSelector('#ev-name');
await page.fill('#ev-name', '飲み会');
const rows = await page.$$('.member-name-input');
await rows[0].fill('太一'); await rows[1].fill('花子');
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');

await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.fill('#pay-label', '飲み代');
await page.fill('#pay-amount', '10000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(150);

await page.click('button:has-text("精算結果")');
await page.waitForTimeout(100);

await page.click('button:has-text("最終ガチャを引く")');
await page.waitForSelector('button:has-text("ルーレットを回す")');
await page.click('button:has-text("ルーレットを回す")');
await page.waitForSelector('.rw-wheel.rw-spinning', { timeout: 3000 });
await page.click('#rw-stop-btn');
await page.waitForSelector('.gacha-percent-banner', { timeout: 8000 });

const banner = await page.textContent('.gacha-percent-banner');
console.log('PERCENT BANNER (forced rare draw, expect 50%):', banner.replace(/\s+/g, ' ').trim());

const wheelTransform = await page.$eval('#rw-wheel', el => getComputedStyle(el).transform);
console.log('FINAL WHEEL TRANSFORM:', wheelTransform);

// Proceed through to the loser roulette and confirm the 50%-of-total amount flows through correctly.
await page.click('button:has-text("次へ：奢っていただく方を決める")');
await page.waitForSelector('.gm-machine', { timeout: 3000 });
await page.click('.gm-crank');
await page.waitForSelector('.gacha-result-banner', { timeout: 8000 });
const resultBanner = await page.textContent('.gacha-result-banner');
console.log('RESULT BANNER (expect 50% / ¥5,000):', resultBanner.replace(/\s+/g, ' ').trim());

await page.click('button:has-text("この結果を反映する")');
await page.waitForTimeout(150);
const balances = await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim()));
console.log('BALANCES AFTER RARE DRAW (loser should owe half, other gets half relief):', JSON.stringify(balances));

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
