import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const audio=()=>page.evaluate(()=>window.__PELAGIC__.diagnostics.audio);
await mkdir('test-results',{recursive:true});
try{
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5174/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__PELAGIC__?.diagnostics.time>.1,{timeout:60000});
 assert.equal((await audio()).contextState,'uninitialized','未点击不能自动播放或创建声源');
 await page.locator('#sound').click();
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.rms>.0001,{timeout:15000});
 const playing=await audio();assert.equal(playing.contextState,'running');assert.equal(playing.sourceCount,5);
 assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
 await page.locator('#sound-volume').fill('0');
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.contextState==='suspended');
 assert.equal((await audio()).rms,0);
 await page.locator('#sound-volume').fill('65');
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.rms>.0001);
 assert.equal((await audio()).volume,.65);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.contextState==='suspended');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.contextState==='running');
 await page.locator('#sound').click();
 await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.contextState==='suspended');
 await page.locator('#sound').click();await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.rms>.0001);
 assert.equal((await audio()).sourceCount,5,'重复开启不能叠加声源');
 // Render the same production graph offline to check signal energy, stereo
 // content and headroom; this does not rely on the test machine's speakers.
 let waveform=null;
 if(!process.env.TEST_URL){
   waveform=await page.evaluate(async()=>{
     const {createAmbienceGraph,ambienceMix}=await import('/src/ambience.js');
     const context=new OfflineAudioContext(2,22050*14,22050),graph=createAmbienceGraph(context);
     graph.master.gain.value=.7;
     for(let t=0;t<14;t+=.1)graph.apply(ambienceMix({wind:1.3,waves:1.5,storm:.7,distance:55},t),t);
     const buffer=await context.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
     let energy=0,peak=0,difference=0;for(let i=0;i<left.length;i++){energy+=left[i]**2;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));difference+=(left[i]-right[i])**2;}
     return {rms:Math.sqrt(energy/left.length),peak,stereoDifference:Math.sqrt(difference/left.length)};
   });
   assert.ok(waveform.rms>.003&&waveform.rms<.4);assert.ok(waveform.peak<.98);assert.ok(waveform.stereoDifference>.001);
 }
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('.sound-controls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await page.screenshot({path:'test-results/sound-mobile.png'});
 // Verify the self-contained file:// artifact also starts audio on a click.
 if(!process.env.TEST_URL){
   await page.goto(pathToFileURL(path.resolve('海岛-双击打开.html')).href);
   await page.waitForFunction(()=>window.__PELAGIC__?.diagnostics.time>.1,{timeout:60000});
   assert.equal((await audio()).contextState,'uninitialized');
   await page.locator('#sound').click();await page.waitForFunction(()=>window.__PELAGIC__.diagnostics.audio.rms>.0001);
 }
 assert.deepEqual(errors,[]);
 const report={ok:true,errors,playing,waveform,mute:true,volume:true,pauseResume:true,sourceReuse:true,mobile:true,offline:!process.env.TEST_URL};
 await writeFile(process.env.TEST_URL?'test-results/sound-public-report.json':'test-results/sound-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
