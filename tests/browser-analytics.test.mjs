import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the adapter without sending any requests to Google.
const source = await readFile(new URL('../lib/browser-analytics.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const { createBrowserAnalytics } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function environment(hostname = 'ramenscout.ca') {
  const scripts = [];
  const win = { setTimeout, clearTimeout };
  globalThis.window = win;
  globalThis.location = { hostname };
  globalThis.document = {
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({ remove() { this.removed = true; } }),
  };
  // Automatic startup must not depend on a stored opt-in or storage availability.
  globalThis.localStorage = { getItem() { throw Error('Storage unavailable'); } };
  return { win, scripts, controller: createBrowserAnalytics() };
}

test('starts automatically without consent or storage and configures only one pageview', async () => {
  for (const hostname of ['ramenscout.ca', 'www.ramenscout.ca']) {
    const { win, scripts, controller } = environment(hostname);
    const first = controller.start();
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-KKD42WHEGE');
    assert.equal(controller.start(), first);
    scripts[0].onload();
    await first;
    await controller.start();
    assert.equal(scripts.length, 1);
    const commands = win.dataLayer.map(row => Array.from(row));
    assert.equal(commands.filter(row => row[0] === 'config').length, 1);
    assert.equal(commands.find(row => row[0] === 'config')[1], 'G-KKD42WHEGE');
    assert.equal(commands.find(row => row[0] === 'config')[2].allow_google_signals, false);
    assert.equal(commands.filter(row => row[0] === 'event' && row[1] === 'page_view').length, 0);
    assert.equal(commands.filter(row => row[0] === 'consent').length, 0);
  }
});

test('local and hosted previews do not load analytics', async () => {
  for (const host of ['localhost', '127.0.0.1', 'preview.example.com']) {
    const { win, scripts, controller } = environment(host);
    await controller.start();
    assert.equal(scripts.length, 0);
    assert.equal(win.dataLayer, undefined);
  }
});

test('a failed script can retry without queuing a duplicate config', async () => {
  const { win, scripts, controller } = environment();
  const failed = controller.start();
  scripts[0].onerror();
  await assert.rejects(failed, /did not load/);
  assert.equal(scripts[0].removed, true);
  const retried = controller.start();
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  await retried;
  assert.equal(win.dataLayer.filter(row => row[0] === 'config').length, 1);
});
