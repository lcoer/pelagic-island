import { chromium } from 'playwright-core';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
const diagnostics=()=>page.evaluate(()=>window.__PELAGIC__.diagnostics);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await mkdir('test-results',{recursive:true});
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5174',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__PELAGIC__?.diagnostics.time>.25,{timeout:60000});
  await page.waitForSelector('#loading',{state:'detached',timeout:60000});
  const initial=await diagnostics();
  await page.waitForFunction(t=>window.__PELAGIC__.diagnostics.time>t+.7,initial.time,{timeout:60000});
  const cruising=await diagnostics();assert.ok(cruising.boat.position.every(Number.isFinite),'船只位置应保持有限值');assert.ok(Math.hypot(cruising.boat.position[0]-initial.boat.position[0],cruising.boat.position[2]-initial.boat.position[2])>.1);
  assert.notEqual(cruising.boat.position[1],initial.boat.position[1]);
  const [x,y]=cruising.boat.screen;
  await page.mouse.move(x,y);await page.mouse.down();
  let down=await diagnostics();assert.equal(down.boat.dragging,true);assert.equal(down.boat.controlsEnabled,false);
  const camera=down.camera;
  await page.mouse.move(x+165,y+30,{steps:15});
  await page.waitForFunction(t=>window.__PELAGIC__.diagnostics.time>t+.15,down.time,{timeout:60000});
  const dragged=await diagnostics();
  assert.ok(Math.hypot(dragged.boat.position[0]-down.boat.position[0],dragged.boat.position[2]-down.boat.position[2])>5);
  assert.deepEqual(dragged.camera,camera,'拖船不能带动镜头');
  assert.ok(dragged.boat.wakeEnergy>.0001);assert.ok(dragged.boat.wakeDistance>5);
  await page.screenshot({path:'test-results/boat-drag-wake.png'});
  await page.mouse.up();const released=await diagnostics();assert.equal(released.boat.dragging,false);assert.equal(released.boat.controlsEnabled,true);
  await page.waitForFunction(t=>window.__PELAGIC__.diagnostics.time>t+.5,released.time,{timeout:60000});
  const resumed=await diagnostics();assert.ok(Math.hypot(resumed.boat.position[0]-released.boat.position[0],resumed.boat.position[2]-released.boat.position[2])>.01);
  // Cancel a gesture as a touch interruption / OS cancellation would.
  await page.mouse.move(...resumed.boat.screen);await page.mouse.down();
  assert.equal((await diagnostics()).boat.dragging,true);
  await page.locator('canvas').evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  assert.equal((await diagnostics()).boat.controlsEnabled,true);await page.mouse.up();
  // Empty water still operates the camera after releasing the boat.
  const beforeOrbit=(await diagnostics()).camera;
  await page.mouse.move(1100,250);await page.mouse.down();await page.mouse.move(1160,280,{steps:5});await page.mouse.up();
  assert.notDeepEqual((await diagnostics()).camera,beforeOrbit);
  await page.locator('#reset').click();
  // The generated file:// build includes both buoyancy and the wake texture.
  await page.goto(pathToFileURL(path.resolve('海岛-双击打开.html')).href);
  await page.waitForFunction(()=>window.__PELAGIC__?.diagnostics.boat.wakeDistance>.1,{timeout:60000});
  assert.ok((await diagnostics()).boat.wakeEnergy>0);
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(500);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const mobile=(await diagnostics()).boat;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mobile.screen[0],y:mobile.screen[1]}]});
  assert.equal((await diagnostics()).boat.dragging,true,'触屏应能抓住小船');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mobile.screen[0]+45,y:mobile.screen[1]}]});
  const touchMoved=(await diagnostics()).boat;
  assert.ok(Math.hypot(touchMoved.position[0]-mobile.position[0],touchMoved.position[2]-mobile.position[2])>1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await diagnostics()).boat.controlsEnabled,true);
  await page.screenshot({path:'test-results/boat-mobile.png'});
  assert.deepEqual(errors,[]);
  const report={ok:true,errors,cruise:true,drag:true,cameraIsolation:true,wake:true,release:true,cancel:true,offline:true,touchDrag:true,boat:dragged.boat};
  await writeFile('test-results/boat-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
