import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../../index.html');
const launchOpts = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : (process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log((ok ? 'OK   ' : 'FAIL ') + label + ' — got ' + JSON.stringify(actual) + (ok ? '' : ', expected ' + JSON.stringify(expected)));
}

// Force the weighted draw to land in the last bucket (Math.random() just under 1).
await page.addInitScript(() => { Math.random = () => 0.9999999; });
await page.goto(file);
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

// --- open the settings screen: it starts from the defaults ---
await page.click('button:has-text("最終ガチャを引く")');
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
const readRows = () => page.$$eval('.rs-row', els => els.map(r => [r.querySelector('.rs-percent').value, r.querySelector('.rs-weight').value, r.querySelector('.rs-chance').textContent.trim()]));
check('initial rows are the defaults', (await readRows()).map(r => r.slice(0, 2)), [['-20', '6'], ['1', '8'], ['5', '38'], ['10', '28'], ['20', '19'], ['50', '1']]);
check('initial chance column', (await readRows()).map(r => r[2]), ['6%', '8%', '38%', '28%', '19%', '1%']);

// --- validation: an out-of-range percent is rejected and nothing is saved ---
await page.fill('.rs-row:nth-child(2) .rs-percent', '0');
await page.click('button:has-text("この設定で保存する")');
check('error shown for 0%', (await page.textContent('#rs-err')).includes('1〜100'), true);
check('still on settings screen after error', await page.$('.rs-row') !== null, true);

// --- min items: cannot go below 2 rows ---
await page.click('button:has-text("初期値に戻す")');
for (let i = 0; i < 4; i++) await page.click('.rs-row >> nth=0 >> .chip-remove');
check('2 rows left after deleting 4', (await readRows()).length, 2);
await page.click('.rs-row >> nth=0 >> .chip-remove');
check('cannot delete below 2 rows', (await readRows()).length, 2);
check('min-items error shown', (await page.textContent('#rs-err')).includes('最低2個'), true);

// --- add a row and set 3 custom entries with equal weights ---
await page.click('button:has-text("項目を追加")');
const rs = await readRows();
check('3 rows after add', rs.length, 3);
const setRow = async (i, p, w) => {
  await page.fill(`.rs-row >> nth=${i} >> .rs-percent`, String(p));
  await page.fill(`.rs-row >> nth=${i} >> .rs-weight`, String(w));
};
await setRow(0, 10, 1); await setRow(1, 30, 1); await setRow(2, 80, 1);
check('live chance column updates', (await readRows()).map(r => r[2]), ['33.3%', '33.3%', '33.3%']);
await page.click('button:has-text("この設定で保存する")');
await page.waitForSelector('button:has-text("ガチャを回す")');
const setupText = await page.textContent('.sheet .lede');
check('setup text shows the custom percents', setupText.includes('10%・30%・80%'), true);

// --- wheel uses the custom entries, and equal weights mean no "rare" wedge ---
await page.click('button:has-text("ガチャを回す")');
await page.waitForSelector('.gm-machine');
await page.click('.gm-crank');
await page.waitForSelector('.gacha-percent-banner', { timeout: 10000 });
await page.click('button:has-text("次へ：罰金の割合を決める")');
await page.waitForSelector('.rw-wheel.rw-spinning');
check('wheel labels', await page.$$eval('.rw-label', els => els.map(e => e.textContent.trim())), ['10%', '30%', '80%']);
check('no jackpot label when weights are equal', await page.$$('.rw-label-jackpot').then(a => a.length), 0);
await page.click('#rw-stop-btn');
await page.waitForSelector('.gacha-result-banner', { timeout: 8000 });
check('forced last-bucket draw lands on 80%', (await page.textContent('.gacha-result-banner')).includes('合計の80%'), true);
// Once the member is picked the sheet can no longer be closed (that would be a free redraw),
// so abandon the draw by reloading instead.
check('no close button after the draw is decided', (await page.$$('.sheet-head button[aria-label="閉じる"]')).length, 0);
await page.reload();
await page.waitForSelector('.appbar-title');

// --- settings survive the share-URL round trip ---
await page.click('button[aria-label="共有"]');
await page.waitForSelector('#share-url-input');
const url = await page.inputValue('#share-url-input');
await page.click('.sheet-head button[aria-label="閉じる"]');
const hash = url.split('#')[1];
await page.goto(file + '#' + hash);
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("最終ガチャを引く")');
check('custom percents after reload', (await page.textContent('.sheet .lede')).includes('10%・30%・80%'), true);

// --- reset to defaults removes the custom setting from the saved data ---
await page.click('button:has-text("ルーレットの％を設定する")');
await page.click('button:has-text("初期値に戻す")');
await page.click('button:has-text("この設定で保存する")');
await page.waitForSelector('button:has-text("ガチャを回す")');
check('defaults restored in text', (await page.textContent('.sheet .lede')).includes('1%・5%・10%・20%・50%'), true);
const savedHash = await page.evaluate(() => location.hash.slice(3));
const savedState = await page.evaluate(h => {
  const b64 = h.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0))));
}, savedHash);
check('state.r removed when back to defaults', 'r' in savedState, false);

// --- a malformed r in the URL falls back to the defaults instead of breaking ---
const bad = { v: 1, n: '壊れ', m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }], p: [{ i: 1, y: 1, l: '飲み代', a: 1000, s: [1, 2] }], d: [], r: [[0, 1], [5, 'x']] };
const badHash = await page.evaluate(o => {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, bad);
await page.goto(file + '#s=' + badHash);
await page.reload();
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("最終ガチャを引く")');
check('malformed r falls back to defaults', (await page.textContent('.sheet .lede')).includes('1%・5%・10%・20%・50%'), true);

check('no page errors', errors, []);
console.log(failures ? 'FAILURES: ' + failures : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
