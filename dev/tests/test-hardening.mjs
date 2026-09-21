// Regression tests for the hardening pass: crafted share links, stale "送金済み" marks,
// reused member ids, the hint that kept coming back, reset confirmation, undo, and
// QR codes for long events.
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../../index.html');
const launchOpts = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
  ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }
  : (process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL') && !msg.text().includes('fonts.g')) errors.push('CONSOLE: ' + msg.text()); });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log((ok ? 'OK   ' : 'FAIL ') + label + ' — got ' + JSON.stringify(actual) + (ok ? '' : ', expected ' + JSON.stringify(expected)));
}

async function encode(o) {
  return page.evaluate(o => {
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }, o);
}
async function decodeHash() {
  return page.evaluate(() => {
    let b = location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0))));
  });
}
async function openWith(state) {
  const hash = await encode(state);
  await page.goto(file + '#s=' + hash);
  await page.reload();
}
async function addPayment(payer, label, amount, only) {
  await page.click('button:has-text("支払いを追加")');
  await page.waitForSelector('#pay-payer');
  await page.selectOption('#pay-payer', { label: payer });
  await page.fill('#pay-label', label);
  await page.fill('#pay-amount', String(amount));
  if (only) {
    for (const box of await page.$$('.pay-participant')) {
      const name = await box.evaluate(e => e.parentElement.textContent.trim().slice(1));
      await box.evaluate((e, on) => { e.checked = on; }, only.includes(name));
    }
  }
  await page.click('.overlay .btn-primary:has-text("追加する")');
  await page.waitForTimeout(100);
}

await page.goto(file);
await page.waitForSelector('#ev-name');

// --- 1. crafted share links cannot run script ---
const base = { v: 1, n: 'X', m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }], p: [{ i: 1, y: 1, l: 'x', a: 1000, s: [1, 2] }], d: [] };
await openWith({ ...base, fg: { loser: 1, amount: 100, percent: '<img src=x onerror="window.__pwn=1">' } });
await page.click('button:has-text("精算結果")');
await page.waitForTimeout(200);
check('HTML in fg.percent does not execute', await page.evaluate(() => window.__pwn), undefined);
check('HTML in fg.percent is not injected', (await page.$$('.fg-result-row img')).length, 0);

await openWith({ ...base, m: [{ i: '1);window.__pwn=2//', a: 'A' }, { i: 2, a: 'B' }] });
await page.waitForTimeout(200);
check('non-numeric member id is rejected', await page.evaluate(() => window.__pwn), undefined);
check('rejected link shows the error on the home screen', (await page.textContent('.err-text')).includes('リンクを正しく読み込めませんでした'), true);

await openWith({ ...base, p: [{ i: 1, y: 99, l: 'x', a: 1000, s: [1, 2] }] });
check('payment by an unknown member is rejected', await page.$('#ev-name') !== null, true);

// a well-formed link still round-trips untouched
await openWith({ ...base, fg: { loser: 2, amount: 100, percent: 10 }, r: [[5, 1], [10, 1]] });
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("精算結果")');
check('valid link with final gacha still loads', (await page.textContent('.fg-result-row')).includes('B様'), true);

// --- 2. a "送金済み" mark does not survive a change of the amount ---
await openWith({ v: 1, n: 'T', m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }, { i: 3, a: 'C' }], p: [], d: [] });
await page.waitForSelector('.appbar-title');
await addPayment('A', 'x', 3000, ['A', 'B']);
await page.click('button:has-text("精算結果")');
await page.click('.done-btn');
check('transfer marked done', (await page.textContent('.done-btn')).includes('送金済み') && !(await page.textContent('.done-btn')).includes('にする'), true);
await page.click('button:has-text("支払い")');
await addPayment('A', 'y', 9000, ['A', 'B']);
await page.click('button:has-text("精算結果")');
check('changed transfer is not shown as done', (await page.textContent('.done-btn')).trim(), '送金済みにする');
check('stale done keys are pruned from the URL', (await decodeHash()).d, []);

// --- 3. a removed member's gacha result does not move to the next new member ---
await openWith({ v: 1, n: 'T', m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }, { i: 3, a: 'C' }], p: [{ i: 1, y: 1, l: 'x', a: 3000, s: [1, 2] }], d: [], fg: { loser: 3, amount: 150, percent: 5 } });
await page.waitForSelector('.appbar-title');
for (const chip of await page.$$('.chip-member')) {
  if ((await chip.$eval('.name', e => e.textContent)) === 'C') { await chip.$eval('.chip-remove', e => e.click()); break; }
}
await page.waitForTimeout(100);
await page.fill('#new-member-name', 'D');
await page.click('button:has-text("追加")');
await page.waitForTimeout(100);
await page.click('button:has-text("精算結果")');
check('no gacha result carried over to the new member', (await page.$$('.fg-result-row')).length, 0);
check('gacha is offered again', (await page.$$('button:has-text("最終ガチャを引く")')).length, 1);

// --- 4. the hint stays closed once dismissed ---
await page.click('button:has-text("支払い")');
check('hint shown at first', (await page.$$('#event-hint')).length, 1);
await page.click('.hint-close');
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("支払い")');
check('hint stays closed after re-render', (await page.$$('#event-hint')).length, 0);

// --- 5. reset asks first ---
let dialogs = 0, accept = false;
page.on('dialog', d => { dialogs++; accept ? d.accept() : d.dismiss(); });
await page.click('.reset-btn');
check('reset asked for confirmation', dialogs, 1);
check('cancelling keeps the event', await page.$('.appbar-title') !== null, true);
accept = true;
await page.click('.reset-btn');
await page.waitForSelector('#ev-name');
check('accepting returns to the home screen', await page.$('#ev-name') !== null, true);

// --- 6. deleting a payment can be undone ---
await openWith({ ...base });
await page.waitForSelector('.appbar-title');
await page.click('.icon-danger');
check('payment deleted', (await page.$$('.paycard')).length, 0);
await page.click('.toast button:has-text("元に戻す")');
await page.waitForTimeout(100);
check('undo brings the payment back', (await page.$$('.paycard')).length, 1);
check('undo is written back to the URL', (await decodeHash()).p.length, 1);

// --- 7. QR codes for long events ---
function longState(n) {
  const st = { v: 1, n: '沖縄旅行', m: ['田中', '佐藤', '鈴木', '高橋', '伊藤'].map((a, i) => ({ i: i + 1, a })), p: [], d: [] };
  for (let k = 1; k <= n; k++) st.p.push({ i: k, y: (k % 5) + 1, l: ['ホテル代', '居酒屋', 'タクシー', 'コンビニ', 'ランチ'][k % 5], a: 1000 * k + 230, s: [1, 2, 3, 4, 5] });
  return st;
}
await openWith(longState(30));
await page.click('.iconbtn[aria-label="共有"]');
check('30 payments: QR still generated (lower error correction)', (await page.$$('.qrbox svg')).length, 1);
await page.click('.overlay .iconbtn');
await openWith(longState(60));
await page.click('.iconbtn[aria-label="共有"]');
check('60 payments: no QR, but a readable explanation', (await page.textContent('.qrbox')).includes('QRコードにできなくなりました'), true);
check('60 payments: link is still there to copy', (await page.$('#share-url-input')) !== null, true);

// --- 8. the final gacha penalty follows the current total ---
await openWith({ ...base, m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }], p: [{ i: 1, y: 1, l: 'x', a: 1000, s: [1, 2] }], fg: { loser: 2, amount: 100, percent: 10 } });
await page.click('button:has-text("精算結果")');
check('penalty is 10% of 1,000', (await page.textContent('.fg-result-row')).includes('¥100（合計の10%）'), true);
await page.click('button:has-text("支払い")');
await addPayment('A', 'y', 1000);
await page.click('button:has-text("精算結果")');
check('penalty follows the new total (10% of 2,000)', (await page.textContent('.fg-result-row')).includes('¥200（合計の10%）'), true);

// --- 9. a payment can be edited ---
await openWith({ ...base });
await page.waitForSelector('.appbar-title');
await page.click('.icon-edit');
check('edit sheet has the edit title', (await page.textContent('.sheet h2')).trim(), '支払いを編集');
check('edit sheet is prefilled', [await page.inputValue('#pay-label'), await page.inputValue('#pay-amount')], ['x', '1000']);
await page.fill('#pay-label', '二次会');
await page.fill('#pay-amount', '2500');
await page.uncheck('.pay-participant[value="2"]');
await page.click('.overlay .btn-primary:has-text("保存する")');
await page.waitForTimeout(100);
check('still one payment after editing', (await page.$$('.paycard')).length, 1);
check('edited label shown', (await page.textContent('.paycard .label')).trim(), '二次会');
check('edited participants shown', (await page.textContent('.paycard .sub')).includes('1人で割り勘'), true);
check('edited amount saved in the URL', (await decodeHash()).p[0].a, 2500);

// non-integer amounts are refused instead of being silently rounded
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.fill('#pay-label', 'z');
await page.fill('#pay-amount', '12.5');
await page.click('.overlay .btn-primary:has-text("追加する")');
check('decimal amount is refused', (await page.textContent('#pay-err')).includes('整数'), true);
// --- 13. Escape closes the sheet ---
await page.keyboard.press('Escape');
check('Escape closes the payment sheet', (await page.$$('.overlay')).length, 0);

// --- 10. Enter key on the home form ---
await page.goto('about:blank');
await page.goto(file);
await page.waitForSelector('#ev-name');
await page.fill('#ev-name', '飲み会');
await page.press('#ev-name', 'Enter');
check('Enter in the event name moves to the first member', await page.evaluate(() => document.activeElement.classList.contains('member-name-input')), true);
const homeRows = await page.$$('.member-name-input');
await homeRows[0].fill('太一');
await homeRows[1].fill('太一');
await homeRows[1].press('Enter');
check('duplicate member names are refused', (await page.textContent('#create-err')).includes('同じ名前'), true);
await homeRows[1].fill('花子');
await homeRows[1].press('Enter');
await page.waitForSelector('.appbar-title');
check('Enter on the last member creates the event', (await page.textContent('.appbar-title')).trim(), '飲み会');

// --- 11. member list rules ---
await page.fill('#new-member-name', '太一');
await page.press('#new-member-name', 'Enter');
check('adding a duplicate member is refused', (await page.textContent('.err-text')).includes('同じ名前'), true);
check('the typed name stays in the box', await page.inputValue('#new-member-name'), '太一');
// Enter that only confirms a Japanese conversion must not submit
await page.fill('#new-member-name', '健太');
await page.evaluate(() => document.getElementById('new-member-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
check('IME-confirming Enter does not add the member', (await page.$$('.chip-member')).length, 2);
await page.press('#new-member-name', 'Enter');
await page.waitForTimeout(100);
check('real Enter adds the member', (await page.$$('.chip-member')).length, 3);
await page.click('.chip-remove');
await page.waitForTimeout(100);
check('removing down to 2 members is allowed', (await page.$$('.chip-member')).length, 2);
await page.click('.chip-remove');
check('removing below 2 members is refused', (await page.textContent('.err-text')).includes('最低2人'), true);
check('the member is still there', (await page.$$('.chip-member')).length, 2);

// --- 14. final gacha: no redraw from the result sheet, one redraw after reflecting ---
async function drawOnce() {
  await page.click('#rw-stop-btn');
  await page.waitForSelector('.gacha-percent-banner', { timeout: 8000 });
  check('no close button once the percentage is decided', (await page.$$('.sheet-head button[aria-label="閉じる"]')).length, 0);
  await page.click('button:has-text("次へ")');
  await page.click('.btn-lever-cta');
  await page.waitForSelector('.gacha-result-banner', { timeout: 10000 });
}
await openWith({ ...base, m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }], p: [{ i: 1, y: 1, l: 'x', a: 1000, s: [1, 2] }] });
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("最終ガチャを引く")');
check('closing is possible before the wheel is stopped', (await page.$$('.sheet-head button[aria-label="閉じる"]')).length, 1);
await page.click('button:has-text("ルーレットを回す")');
await drawOnce();
check('result sheet has no redraw button', (await page.$$('.sheet button:has-text("引き直す")')).length, 0);
check('result sheet cannot be closed without reflecting', (await page.$$('.sheet-head button[aria-label="閉じる"]')).length, 0);
await page.click('button:has-text("この結果を反映する")');
await page.waitForTimeout(150);
check('first draw is counted', (await decodeHash()).g, 1);
check('one redraw is offered', (await page.textContent('.fg-links')).includes('あと1回'), true);
await page.click('button:has-text("引き直す")');
await page.waitForSelector('.rw-wheel.rw-spinning');
await drawOnce();
await page.click('button:has-text("この結果を反映する")');
await page.waitForTimeout(150);
check('second draw is counted', (await decodeHash()).g, 2);
check('no redraw left on the card', (await page.$$('.fg-card button:has-text("引き直す")')).length, 0);
check('card says redraws are used up', (await page.textContent('.fg-card')).includes('引き直しは使い切りました'), true);
await page.click('button:has-text("取り消す")');
await page.waitForTimeout(150);
check('cancelling does not give draws back', (await page.$$('button:has-text("最終ガチャを引く")')).length, 0);
check('card says the gacha is used up', (await page.textContent('.fg-card')).includes('使い切りました'), true);

// removing the person the result pointed at voids it, and the draws come back
await openWith({ v: 1, n: 'T', m: [{ i: 1, a: 'A' }, { i: 2, a: 'B' }, { i: 3, a: 'C' }], p: [{ i: 1, y: 1, l: 'x', a: 3000, s: [1, 2] }], d: [], fg: { loser: 3, amount: 150, percent: 5 }, g: 2 });
await page.waitForSelector('.appbar-title');
for (const chip of await page.$$('.chip-member')) {
  if ((await chip.$eval('.name', e => e.textContent)) === 'C') { await chip.$eval('.chip-remove', e => e.click()); break; }
}
await page.waitForTimeout(100);
const afterRemove = await decodeHash();
check('draw counter is reset with the voided result', [afterRemove.fg, afterRemove.g], [undefined, undefined]);

check('no page errors', errors, []);
console.log(failures ? 'FAILURES: ' + failures : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
