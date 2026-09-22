// The roulette settings page on the first screen, and the explanations that can be closed with a ×.
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
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL') && !msg.text().includes('fonts.g') && !msg.text().includes('ERR_QUIC')) errors.push('CONSOLE: ' + msg.text()); });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log((ok ? 'OK   ' : 'FAIL ') + label + ' — got ' + JSON.stringify(actual) + (ok ? '' : ', expected ' + JSON.stringify(expected)));
}
async function decodeHash() {
  return page.evaluate(() => {
    let b = location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0))));
  });
}
// A fresh page load (a hash-only navigation would keep the old JavaScript state).
async function freshHome() {
  await page.goto('about:blank');
  await page.goto(file);
  await page.waitForSelector('#ev-name');
}
async function fillHome(name, members) {
  await page.fill('#ev-name', name);
  let rows = await page.$$('.member-name-input');
  while (rows.length < members.length) {
    await page.click('button:has-text("メンバーを追加")');
    rows = await page.$$('.member-name-input');
  }
  for (let i = 0; i < members.length; i++) await rows[i].fill(members[i]);
}

// ---------- 1. the summary on the first screen ----------
await freshHome();
const summary = (await page.textContent('.rs-summary')).replace(/\s+/g, '');
check('first screen shows the roulette summary as the default', summary.includes('初期設定'), true);
check('summary lists the default percents', summary.includes('−20%・1%・5%・10%・20%・50%'), true);

// ---------- 2. edit on the settings page; what was typed on the first screen survives ----------
await fillHome('飲み会', ['太一', '花子', '健太']);
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
check('settings page replaces the first screen', await page.$('#ev-name'), null);
check('settings page has a back button', (await page.$$('.appbar button[aria-label="戻る"]')).length, 1);
check('rows start from the defaults', (await page.$$('.rs-row')).length, 6);
await page.fill('.rs-row >> nth=0 >> .rs-percent', '-30');
await page.click('button:has-text("項目を追加")');
await page.fill('.rs-row >> nth=6 >> .rs-percent', '2');
await page.fill('.rs-row >> nth=6 >> .rs-weight', '3');
await page.click('button:has-text("この設定で保存する")');
await page.waitForSelector('#ev-name');
check('typed event name and members are kept', [await page.inputValue('#ev-name'), await page.$$eval('.member-name-input', els => els.map(e => e.value))], ['飲み会', ['太一', '花子', '健太']]);
const changed = (await page.textContent('.rs-summary')).replace(/\s+/g, '');
check('summary shows the change', [changed.includes('変更済み'), changed.includes('−30%'), changed.includes('2%')], [true, true, true]);

// ---------- 3. the choice is carried into the new event ----------
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');
const st = await decodeHash();
check('the event carries the custom roulette', [st.r.length, st.r[0], st.r[6]], [7, [-30, 6], [2, 3]]);
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.fill('#pay-label', '飲み代');
await page.fill('#pay-amount', '3000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("最終ガチャを引く")');
check('the gacha screen lists it', (await page.textContent('.sheet .lede')).includes('-30%・1%'), true);

// ---------- 4. validation, keys, and going back without saving ----------
await freshHome();
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
await page.fill('.rs-row >> nth=1 >> .rs-percent', '0');
await page.click('button:has-text("この設定で保存する")');
check('0% is refused on the page', [(await page.textContent('#rs-err')).includes('1〜100'), (await page.$$('.rs-row')).length > 0], [true, true]);
await page.fill('.rs-row >> nth=1 >> .rs-percent', '3');
await page.press('.rs-row >> nth=1 >> .rs-percent', 'Enter');
await page.waitForSelector('#ev-name');
check('Enter saves and returns', (await page.textContent('.rs-summary')).includes('変更済み'), true);
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
await page.fill('.rs-row >> nth=0 >> .rs-percent', '-50');
await page.keyboard.press('Escape');
await page.waitForSelector('#ev-name');
check('Escape returns without saving the edit', (await page.textContent('.rs-summary')).replace(/\s+/g, '').includes('−50%'), false);
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
await page.click('button:has-text("初期値に戻す")');
await page.click('button:has-text("この設定で保存する")');
await page.waitForSelector('#ev-name');
check('back to the defaults', (await page.textContent('.rs-summary')).includes('初期設定'), true);
await fillHome('旅行', ['A', 'B']);
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');
check('default roulette is not written into the event', 'r' in (await decodeHash()), false);

// ---------- 5. explanations can be closed with a × ----------
await freshHome();
check('first-screen explanation is shown', (await page.$$('.note[data-note="home-intro"]')).length, 1);
await page.click('.note[data-note="home-intro"] .note-close');
check('the × closes it', (await page.$$('.note[data-note="home-intro"]')).length, 0);
await page.click('button:has-text("ルーレットの％を設定する")');
await page.waitForSelector('.rs-row');
check('settings page explanations have a ×', (await page.$$('.note .note-close')).length, 2);
await page.click('.note[data-note="rs-1"] .note-close');
await page.click('button:has-text("戻る") >> nth=-1');
await page.waitForSelector('#ev-name');
check('a closed explanation stays closed after re-rendering', (await page.$$('.note[data-note="home-intro"]')).length, 0);

await fillHome('旅行', ['A', 'B']);
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');
check('the hint on the event screen has a ×', (await page.$$('#event-hint .hint-close')).length, 1);
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.fill('#pay-label', '飲み代');
await page.fill('#pay-amount', '3000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(100);
await page.click('button:has-text("精算結果")');
await page.click('button:has-text("最終ガチャを引く")');
check('gacha explanations each have a ×', (await page.$$('.sheet .note')).length, 3);
await page.click('.note[data-note="fg-setup-1"] .note-close');
check('one is closed', (await page.$$('.sheet .note')).length, 2);
await page.click('.sheet-head button[aria-label="閉じる"]');
await page.click('button:has-text("最終ガチャを引く")');
check('and stays closed when the sheet is reopened', (await page.$$('.sheet .note')).length, 2);
await page.click('button:has-text("ルーレットの％を設定する")');
check('the settings sheet shares the closed roulette explanation', (await page.$$('.sheet .note[data-note="rs-1"]')).length, 0);
await page.click('button:has-text("戻る")');
await page.click('.sheet-head button[aria-label="閉じる"]');

// toasts have a × too
await page.fill('#new-member-name', '健太');
await page.press('#new-member-name', 'Enter');
await page.waitForSelector('.toast');
await page.click('.toast .toast-close');
check('the toast × closes the toast', (await page.$$('.toast')).length, 0);

check('no page errors', errors, []);
console.log(failures ? 'FAILURES: ' + failures : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
