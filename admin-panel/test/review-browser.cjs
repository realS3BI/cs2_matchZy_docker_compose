// Opt-in Chromium integration: hidden Electron windows, local fixtures, no uploads.
const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.REVIEW_TEST_PORT || 5179);
const output = path.join(root, 'build', 'review-browser');
mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'user-data'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => { console.error('Review-Browsertests: Zeitüberschreitung'); app.exit(1); }, 90_000);
let server;
(async () => {
  await app.whenReady();
  const { createServer } = await import('vite');
  server = await createServer({ configFile: path.join(root, 'client/vite.config.ts'), root: path.join(root, 'client'), server: { host: '127.0.0.1', port, strictPort: true } });
  await server.listen();
  const cases = [
    ['review-desktop', 'checkConnectFailure()'],
    ['review-desktop', 'checkPhoto("aim")'], ['review-desktop', 'checkPhoto("front")'], ['review-desktop', 'checkOldFront()'], ['review-desktop', 'checkPhoto("effect")'],
    ['review-desktop', 'checkPhoto("aim",true)'], ['review-desktop', 'checkPhotoRecover()'], ['review-desktop', 'checkPhotoSignals()'], ['review-desktop', 'checkVideo()'], ['review-desktop', 'checkVideoAbort()'], ['review-desktop', 'checkVideoRecover()'], ['review-desktop', 'checkFollowVideo()'],
    ['review-session', 'checkSession()'], ['review-session', 'checkSession()', 375],
    ['review-capture', 'checkPhoto("aim")'], ['review-capture', 'checkPhoto("front")'],
    ['review-capture', 'checkVideoCrop()'],
    ['review-pages', 'checkPages()'], ['review-pages', 'checkPages()', 375], ['review-pages?role=player', 'checkPages()'],
  ];
  for (const [fixture, check, width = 1440] of cases) {
    if (process.argv[2] && !fixture.includes(process.argv[2])) continue;
    if (process.argv[3] && !check.includes(process.argv[3])) continue;
    const window = new BrowserWindow({ show: false, width, height: 1100, webPreferences: { backgroundThrottling: false, sandbox: true, offscreen: fixture.startsWith('review-pages') } });
    try {
      const [file, query] = fixture.split('?');
      await window.loadURL(`http://127.0.0.1:${port}/test/${file}.html${query ? `?${query}` : ''}`);
      if (file === 'review-pages' && !query) {
        await window.webContents.executeJavaScript(`(async()=>{for(let i=0;i<100&&!document.querySelector('[data-slot="collapsible-trigger"]');i++)await new Promise(r=>setTimeout(r,30));})()`);
        await new Promise(resolve => setTimeout(resolve, 150));
        writeFileSync(path.join(output, `review-queue-${width}.png`), (await window.webContents.capturePage()).toPNG());
      }
      const result = await window.webContents.executeJavaScript(`(async()=>{for(let i=0;i<200&&!window.${check.split('(')[0]};i++)await new Promise(r=>setTimeout(r,30));return await window.${check};})()`);
      console.log(JSON.stringify({ fixture, check, width, result }));
      if (file === 'review-pages' && !query) {
        const layout = await window.webContents.executeJavaScript('(async()=>{[...document.querySelectorAll("button")].find(button=>button.textContent==="Review öffnen").click();for(let i=0;i<100&&!document.querySelector(".review-stepper");i++)await new Promise(r=>setTimeout(r,30));window.scrollTo(0,0);return {stepper:!!document.querySelector(".review-stepper"),width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("body *")].filter(element=>element.getBoundingClientRect().right>innerWidth).slice(0,15).map(element=>({tag:element.tagName,cls:element.className,width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right}))};})()');
        await new Promise(resolve => setTimeout(resolve, 150));
        writeFileSync(path.join(output, `${file}-${width}.png`), (await window.webContents.capturePage()).toPNG());
        if (!layout.stepper || layout.scroll > layout.width) throw Error(`Review-Seite läuft über oder fehlt: ${JSON.stringify(layout)}`);
      }
    } catch (error) {
      const layout = await window.webContents.executeJavaScript('({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("body *")].filter(element=>element.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(element=>({tag:element.tagName,cls:element.className,width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right}))})');
      console.error(JSON.stringify({ fixture, check, width, layout }));
      writeFileSync(path.join(output, `${fixture.split('?')[0]}-failure-${width}.png`), (await window.webContents.capturePage()).toPNG());
      throw error;
    } finally { window.destroy(); }
  }
  clearTimeout(deadline);
  await server.close();
  console.log('REVIEW_BROWSER_RESULT passed');
  app.exit(0);
})().catch(async error => { console.error(error); clearTimeout(deadline); await server?.close(); app.exit(1); });
