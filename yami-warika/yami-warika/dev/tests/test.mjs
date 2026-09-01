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
page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

await page.goto(file);
await page.waitForSelector('#ev-name');

// Fill create form
await page.fill('#ev-name', '沖縄旅行');
const rows = await page.$$('.member-name-input');
await rows[0].fill('太一');
await rows[1].fill('花子');
await page.click('button:has-text("メンバーを追加")');
await page.waitForTimeout(50);
const rows2 = await page.$$('.member-name-input');
await rows2[2].fill('健太');
await page.click('button:has-text("メンバーを追加")');
const rows3 = await page.$$('.member-name-input');
await rows3[3].fill('美咲');

await page.click('button:has-text("イベントを作成する")');
try {
  await page.waitForSelector('.appbar-title', { timeout: 5000 });
} catch (e) {
  console.log('CREATE FAILED. app html:', await page.$eval('#app', el => el.innerHTML.slice(0, 2000)));
  console.log('ERRORS SO FAR:', JSON.stringify(errors));
  await browser.close();
  process.exit(1);
}
const title = await page.textContent('.appbar-title');
console.log('EVENT TITLE:', title);

// Add payment 1: 花子 pays hotel 64000 for all 4
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.selectOption('#pay-payer', { label: '花子' });
await page.fill('#pay-label', 'ホテル代');
await page.fill('#pay-amount', '64000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);

// Add payment 2: 太一 pays rental car 48000 for all 4
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.selectOption('#pay-payer', { label: '太一' });
await page.fill('#pay-label', 'レンタカー代');
await page.fill('#pay-amount', '48000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);

// Add payment 3: 健太 pays dinner 40000 for all 4
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.selectOption('#pay-payer', { label: '健太' });
await page.fill('#pay-label', '夕食代');
await page.fill('#pay-amount', '40000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);

const total = await page.textContent('.container .card .num');
console.log('TOTAL:', total);

// switch to settlement tab
await page.click('button:has-text("精算結果")');
await page.waitForTimeout(100);
const settleText = await page.textContent('.container');
console.log('CONTAINS 26,000:', settleText.includes('26,000'));
console.log('CONTAINS 10,000:', settleText.includes('10,000'));
console.log('CONTAINS 2,000 :', settleText.includes('2,000'));
console.log('CONTAINS 最少3件:', settleText.includes('最少3件'));

// mark a transfer done
const doneBtn = await page.$('.done-btn');
await doneBtn.click();
await page.waitForTimeout(100);
const doneText = await page.textContent('.done-btn');
console.log('DONE BTN TEXT AFTER CLICK:', doneText.trim());

// open share sheet, check QR + url
await page.click('button[aria-label="共有"]');
await page.waitForSelector('.qrbox svg');
const url = await page.inputValue('#share-url-input');
console.log('SHARE URL LENGTH:', url.length);
console.log('SHARE URL HASH PREFIX OK:', url.includes('#s='));
const svgShapeCount = await page.$$eval('.qrbox svg rect, .qrbox svg path', els => els.length);
console.log('QR SHAPE COUNT:', svgShapeCount);
const svgOuter = await page.$eval('.qrbox svg', el => el.outerHTML.slice(0, 150));
console.log('QR SVG SNIPPET:', svgOuter);
await page.click('.sheet-head button[aria-label="閉じる"]');

// reload with same hash to test round-trip decode
const hash = url.split('#')[1];
await page.goto(file + '#' + hash);
await page.waitForSelector('.appbar-title');
const title2 = await page.textContent('.appbar-title');
console.log('RELOADED TITLE:', title2);
const bodyText2 = await page.textContent('.container');
console.log('RELOAD HAS 花子:', bodyText2.includes('花子'));
await page.click('button:has-text("精算結果")');
await page.waitForTimeout(100);
const settleText2 = await page.textContent('.container');
console.log('RELOAD SETTLEMENT HAS 26,000:', settleText2.includes('26,000'));
const doneText2 = await page.$$eval('.done-btn', els => els.map(e => e.textContent.trim()));
console.log('RELOAD DONE STATES:', JSON.stringify(doneText2));

// test invalid hash handling
await page.goto(file + '#s=garbage***not-base64');
await page.waitForSelector('#ev-name');
const errText = await page.textContent('.err-text');
console.log('INVALID HASH ERROR SHOWN:', errText);

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
