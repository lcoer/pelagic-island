import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:800}});
const errors=[], requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
page.on('request',r=>requests.push(r.url()));
try {
  // Reproduce the exact entry in the user's screenshot, including the space
  // in the directory name. It should redirect to the self-contained build.
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>window.__PELAGIC__?.diagnostics.time>.15,{timeout:60000});
  assert.ok(decodeURIComponent(page.url()).endsWith('/海岛-双击打开.html'));
  await page.locator('[data-weather="night"]').click();
  assert.equal(await page.locator('[data-weather="night"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests.filter(u=>/^https?:/.test(u)),[]);
  console.log('PASS: file:// index.html redirects to offline scene; WebGL renders; weather controls respond; no console errors or network requests.');
} finally {await browser.close();}
