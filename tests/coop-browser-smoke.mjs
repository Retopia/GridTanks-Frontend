import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
// Optional browser tooling stays out of the application's dependency tree.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = await readFile(new URL('../src/game/CoopTransport.js', import.meta.url));
const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/transport.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/transport.js' ? source : '<!doctype html><title>Coop transport test</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'] });
try {
    const host = await browser.newPage();
    const guest = await browser.newPage();
    let relayCount = 0;
    for (const [page, other, role] of [[host, guest, 'host'], [guest, host, 'guest']]) {
        await page.exposeFunction('signalPeer', async payload => {
            await other.evaluate(p => window.transport?.onSignal(p), payload);
        });
        await page.exposeFunction('relayPeer', async message => {
            relayCount++;
            await other.evaluate(m => window.transport?.deliver(m), message);
        });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async role => {
            const { CoopTransport } = await import('/transport.js');
            window.received = [];
            window.transport = new CoopTransport({ role, runId: 'browser-test', iceServers: [],
                signal: p => { window.signalPeer(p); },
                relay: m => { window.relayPeer(m); return true; },
                receive: m => window.received.push(m), status: s => { window.network = s; } });
            window.transport.start();
        }, role);
    }
    await Promise.all([host, guest].map(page => page.waitForFunction(() => window.network?.path === 'Direct P2P', { timeout: 20000 })));
    await host.evaluate(() => window.transport.send('coop_snapshot', { tanks: [{ networkId: 'p2', x: 42 }] }));
    await guest.evaluate(() => window.transport.send('coop_input', { keys: { w: true } }));
    await host.waitForFunction(() => window.received.length === 1);
    await guest.waitForFunction(() => window.received.length === 1);
    assert.equal(relayCount, 0, 'gameplay must bypass server when P2P works');
    assert.equal(await guest.evaluate(() => window.received[0].payload.tanks[0].x), 42);
    await guest.evaluate(() => window.transport.channel.close());
    await host.waitForFunction(() => window.network.path === 'Server relay');
    await host.evaluate(() => window.transport.send('coop_snapshot', { tanks: [] }));
    await guest.waitForFunction(() => window.received.length === 2);
    assert.equal(relayCount, 1, 'WebSocket adapter receives gameplay after channel loss');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => window.network?.path === 'Direct P2P', null, { timeout: 20000 })));
    await host.evaluate(() => window.transport.send('coop_snapshot', { tanks: [{ x: 99 }] }));
    await guest.waitForFunction(() => window.received.length === 3);
    assert.equal(relayCount, 1, 'gameplay switches back to P2P after reconnect');
    console.log('Real Chromium: direct ICE connection, bidirectional gameplay, RTT, relay fallback and automatic reconnect passed');
} finally {
    await browser.close();
    server.close();
}
