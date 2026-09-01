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
await page.fill('#ev-name', '飲み会');
const rows = await page.$$('.member-name-input');
await rows[0].fill('太一'); await rows[1].fill('花子');
await page.click('button:has-text("メンバーを追加")');
const rows2 = await page.$$('.member-name-input');
await rows2[2].fill('健太');
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');

// plain equal-split payment: 太一 pays 9000 for all 3 (3000 each) — no gacha option on the form
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
const hasModebar = await page.$('.modebar');
console.log('MODEBAR PRESENT ON PAYMENT FORM (expect null):', hasModebar);
await page.fill('#pay-label', '飲み代');
await page.fill('#pay-amount', '9000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);

await page.click('button:has-text("精算結果")');
await page.waitForTimeout(100);
const balancesBefore = await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim()));
console.log('BALANCES BEFORE FINAL GACHA:', JSON.stringify(balancesBefore));

// stage 1: open final gacha, spin the percentage roulette wheel
await page.click('button:has-text("最終ガチャを引く")');
await page.waitForSelector('button:has-text("ルーレットを回す")');
await page.click('button:has-text("ルーレットを回す")');
await page.waitForSelector('.rw-wheel.rw-spinning', { timeout: 3000 });
const wheelLabels = await page.$$eval('.rw-label', els => els.map(e => e.textContent.trim()));
console.log('ROULETTE WHEEL LABELS (expect 5%/10%/20%/50%/100%):', JSON.stringify(wheelLabels));
await page.click('#rw-stop-btn');
await page.waitForSelector('.gacha-percent-banner', { timeout: 8000 });
const percentBanner = await page.textContent('.gacha-percent-banner');
console.log('PERCENT BANNER:', percentBanner.replace(/\s+/g, ' ').trim());
const percentMatch = percentBanner.match(/【(\d+)%】/);
const percent = percentMatch ? parseInt(percentMatch[1], 10) : null;
console.log('DECIDED PERCENT:', percent);

// stage 2: proceed to the loser roulette
await page.click('button:has-text("次へ：奢っていただく方を決める")');
await page.waitForSelector('.gm-machine', { timeout: 3000 });
await page.click('.gm-crank');
await page.waitForSelector('.gacha-result-banner', { timeout: 8000 });
const banner = await page.textContent('.gacha-result-banner');
console.log('FINAL GACHA BANNER:', banner.replace(/\s+/g, ' ').trim());
const breakdown = await page.$$eval('.gacha-breakdown .row2', els => els.map(e => e.textContent.trim()));
console.log('FINAL GACHA BREAKDOWN:', JSON.stringify(breakdown));

// verify displayed amount equals round(total * percent / 100) = round(9000 * percent / 100)
function parseYen(s) {
  var sign = s.startsWith('-') ? -1 : 1;
  var digits = s.replace(/[^0-9]/g, '');
  return sign * parseInt(digits || '0', 10);
}
const expectedAmount = Math.round(9000 * percent / 100);
const bannerAmount = parseYen((banner.match(/（([^）]+)）/) || [null, ''])[1]);
console.log('EXPECTED AMOUNT:', expectedAmount, 'BANNER AMOUNT:', bannerAmount, 'MATCH:', expectedAmount === bannerAmount);

await page.click('button:has-text("この結果を反映する")');
await page.waitForTimeout(150);

const fgCardText = await page.textContent('.fg-card');
console.log('FG CARD AFTER CONFIRM:', fgCardText.replace(/\s+/g, ' ').trim());

const balancesAfter = await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim()));
console.log('BALANCES AFTER FINAL GACHA:', JSON.stringify(balancesAfter));

const sum = balancesAfter.reduce((acc, s) => acc + parseYen(s), 0);
console.log('SUM OF NET BALANCES (expect 0):', sum);

// reload via share link to confirm fg persists through URL round-trip
await page.click('button[aria-label="共有"]');
await page.waitForSelector('.qrbox svg');
const url = await page.inputValue('#share-url-input');
await page.click('.sheet-head button[aria-label="閉じる"]');
const hash = url.split('#')[1];
await page.goto(file + '#' + hash);
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("精算結果")');
await page.waitForTimeout(100);
const fgCardAfterReload = await page.textContent('.fg-card');
console.log('FG CARD AFTER RELOAD:', fgCardAfterReload.replace(/\s+/g, ' ').trim());

// redraw from the card: should restart directly at the spinning percentage roulette
await page.click('button:has-text("引き直す")');
await page.waitForSelector('.rw-wheel.rw-spinning', { timeout: 3000 });
const redrawLabels = await page.$$eval('.rw-label', els => els.map(e => e.textContent.trim()));
console.log('REDRAW WHEEL LABELS (expect 5%/10%/20%/50%/100% again):', JSON.stringify(redrawLabels));

// close and test removeFinalGacha instead
await page.click('.sheet-head button[aria-label="閉じる"]');
await page.waitForTimeout(100);
await page.click('button:has-text("取り消す")');
await page.waitForTimeout(100);
const fgCardAfterRemove = await page.textContent('.fg-card');
console.log('FG CARD AFTER REMOVE:', fgCardAfterRemove.replace(/\s+/g, ' ').trim());
const balancesAfterRemove = await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim()));
console.log('BALANCES AFTER REMOVE (should match BEFORE):', JSON.stringify(balancesAfterRemove));

console.log('ERRORS:', JSON.stringify(errors));
await browser.close();
