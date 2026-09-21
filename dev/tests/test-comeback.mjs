// End-to-end test of the comeback ("一発逆転"): the gachapon picks the first member, the roulette
// lands on the -20% wedge, and the result is reflected into the books.
// Math.random is forced to a tiny value so both draws take the first entry.
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
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL') && !msg.text().includes('fonts.g')) errors.push('CONSOLE: ' + msg.text()); });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log((ok ? 'OK   ' : 'FAIL ') + label + ' — got ' + JSON.stringify(actual) + (ok ? '' : ', expected ' + JSON.stringify(expected)));
}

await page.addInitScript(() => { Math.random = () => 0.001; });
await page.goto(file);
await page.waitForSelector('#ev-name');
await page.fill('#ev-name', '飲み会');
const rows = await page.$$('.member-name-input');
await rows[0].fill('太一'); await rows[1].fill('花子');
await page.click('button:has-text("イベントを作成する")');
await page.waitForSelector('.appbar-title');
await page.click('button:has-text("支払いを追加")');
await page.waitForSelector('#pay-payer');
await page.selectOption('#pay-payer', { label: '太一' });
await page.fill('#pay-label', '飲み代');
await page.fill('#pay-amount', '1000');
await page.click('.overlay .btn-primary:has-text("追加する")');
await page.waitForTimeout(150);
await page.click('button:has-text("精算結果")');
check('before the gacha: 太一 +500, 花子 -500', await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim())), ['+¥500 受け取り', '-¥500 支払い']);

await page.click('button:has-text("最終ガチャを引く")');
await page.click('button:has-text("ガチャを回す")');
await page.waitForSelector('.gm-machine');
await page.click('.btn-lever-cta');
await page.waitForSelector('.gacha-percent-banner', { timeout: 10000 });
check('the gachapon comes first and picks the first member', (await page.textContent('.gacha-percent-banner')).includes('【太一】'), true);
await page.click('button:has-text("次へ：罰金の割合を決める")');
await page.waitForSelector('.rw-wheel.rw-spinning');
await page.click('#rw-stop-btn');
await page.waitForSelector('.gacha-result-banner', { timeout: 10000 });

const banner = (await page.textContent('.gacha-result-banner')).replace(/\s+/g, ' ');
check('result is announced as a comeback', banner.includes('一発逆転！太一様が、合計の20%（¥200）を受け取り'), true);
check('the banner uses the comeback style', (await page.$$('.gacha-result-banner.is-lucky')).length, 1);
check('breakdown: 太一 receives, 花子 pays', await page.$$eval('.gacha-breakdown .row2', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())), ['太一（一発逆転・受け取り）+¥200', '花子-¥200']);

await page.click('button:has-text("この結果を反映する")');
await page.waitForTimeout(150);
check('after the gacha: 太一 +700, 花子 -700', await page.$$eval('.balance-amt', els => els.map(e => e.textContent.trim())), ['+¥700 受け取り', '-¥700 支払い']);
check('one transfer: 花子 pays 太一 ¥700', [await page.$$eval('.transfer-card .transfer-name', els => els.map(e => e.textContent.trim())), (await page.textContent('.transfer-amt')).trim()], [['花子', '太一'], '¥700']);

check('no page errors', errors, []);
console.log(failures ? 'FAILURES: ' + failures : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
