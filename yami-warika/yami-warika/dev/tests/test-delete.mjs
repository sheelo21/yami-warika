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
await page.waitForSelector('#ev-name');
await page.fill('#ev-name', '沖縄旅行');
const rows = await page.$$('.member-name-input');
await rows[0].fill('太一'); await rows[1].fill('花子');
await page.click('button:has-text("メンバーを追加")');
const rows2 = await page.$$('.member-name-input');
await rows2[2].fill('健太');
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');

// 太一 pays for everyone (3 participants)
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.selectOption('#pay-payer', { label: '太一' });
await page.fill('#pay-label', '夕食代');
await page.fill('#pay-amount', '30000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);

console.log('--- payment count before any deletion:', await page.$$eval('.paycard', els => els.length));

// Try removing 太一 (payer) -> should be blocked with message, member count unchanged
const chipRemoveBtns = await page.$$('.chip-remove');
console.log('removable chips before block test (expect 2 - only 花子,健太 removable, 太一 locked):', chipRemoveBtns.length);
const lockIcons = await page.$$('.icon-disabled');
console.log('locked chip count (expect 1, for 太一):', lockIcons.length);

// Remove 健太 (a participant, not payer) -> should succeed and cascade
const names = await page.$$eval('.chip-member .name', els => els.map(e => e.textContent));
console.log('member names before removal:', names);
// click the remove button on 健太's chip specifically
const chips = await page.$$('.chip-member');
for (const chip of chips) {
  const name = await chip.$eval('.name', e => e.textContent);
  if (name === '健太') {
    await chip.$eval('.chip-remove', e => e.click());
    break;
  }
}
await page.waitForTimeout(100);
const namesAfter = await page.$$eval('.chip-member .name', els => els.map(e => e.textContent));
console.log('member names after removing 健太:', namesAfter);
const payLabel = await page.textContent('.paycard .sub');
console.log('payment sub-line after cascade (expect "2人で割り勘"):', payLabel);

// Now delete the payment itself
await page.click('.icon-danger');
await page.waitForTimeout(100);
const payCount = await page.$$eval('.paycard', els => els.length);
console.log('payment count after deleting the payment (expect 0):', payCount);

// Now 太一 should be removable since no more payments reference them as payer
const lockIconsAfter = await page.$$('.icon-disabled');
console.log('locked chip count after payment deleted (expect 0):', lockIconsAfter.length);

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
