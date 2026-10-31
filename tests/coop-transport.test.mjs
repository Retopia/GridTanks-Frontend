import assert from 'node:assert/strict';
import { CoopTransport } from '../src/game/CoopTransport.js';

const received = [];
const relayed = [];
const t = new CoopTransport({ role: 'guest', runId: 'run', Peer: null,
    signal() {}, relay: (m) => { relayed.push(m); return true; },
    receive: (m) => received.push(m), status() {} });
t.start();
assert.equal(t.timer, undefined, 'disabled WebRTC starts no negotiation or heartbeat timer');
assert.equal(t.send('coop_input', { keys: { w: true } }), true);
assert.equal(relayed.length, 1, 'unsupported WebRTC falls back');
const packet = (seq, run_id = 'run', type = 'coop_snapshot') => ({ seq, run_id, type, stream: 'peer', payload: {} });
t.deliver(packet(3));
t.deliver(packet(2));
t.deliver(packet(3));
t.deliver(packet(4, 'different-run'));
t.deliver(packet(4, 'run', 'coop_input'));
assert.equal(received.length, 1, 'reject stale, duplicate, wrong-run and wrong-role messages');
const direct = [];
t.channel = { readyState: 'open', bufferedAmount: 0, send: (data) => direct.push(JSON.parse(data)) };
t.lastPong = Date.now();
t.send('coop_input', {});
assert.equal(direct.length, 1, 'healthy channel bypasses relay');
t.channel.bufferedAmount = 70000;
t.send('coop_input', {});
assert.equal(relayed.length, 2, 'congested channel falls back');
t.channel.bufferedAmount = 0;
t.lastPong = 0;
t.send('coop_input', {});
assert.equal(relayed.length, 3, 'stale channel falls back');
t.close();
assert.equal(t.send('coop_input', {}), false);
console.log('CoopTransport unit checks passed');
