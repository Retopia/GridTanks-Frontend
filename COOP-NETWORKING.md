# Co-op networking

The host still simulates the game. Guest inputs and host snapshots prefer a
WebRTC data channel; room membership, signaling, run lifecycle, level verification,
and leaderboard submission continue using the authenticated backend.

The sidebar reports Direct P2P, TURN relay, or Server relay. RTT is measured over
the data channel, not the signaling server. It is not input-to-screen latency.
Without WebRTC, or while it connects/reconnects, gameplay uses the existing
WebSocket relay. Sequence numbers suppress stale updates when paths overlap;
guest inputs repeat every 250 ms so reconnects do not leave held keys stale.

The backend sends its ICE configuration after room-token authentication. Its
`COOP_ICE_SERVERS` environment variable accepts a JSON array, for example:

```json
[
  {"urls":"stun:stun.l.google.com:19302"},
  {"urls":["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:5349?transport=tcp"],"username":"user","credential":"password"}
]
```

Without a configured TURN service, difficult NAT/firewall combinations fall back
to the existing game server. TURN credentials are visible to authenticated room
members; use scoped/short-lived credentials or an appropriately restricted TURN
account. Do not commit production credentials. Direct connections expose peer
network addresses to the other player, as normal for P2P.

This is not client-side prediction or a server-authoritative physics simulation.
Existing server validation remains intact but cannot make a modified host fully
trustworthy. Cross-continent players still experience geographic latency.

Tests:

```sh
npm run test:coop
```

The optional `npm run test:coop-browser` uses Playwright from your test environment
(not an app dependency). Set `PLAYWRIGHT_MODULE` to an existing Playwright module
path if needed; `CHROMIUM_PATH` selects an existing Chromium executable. It checks
real bidirectional P2P, relay fallback, and automatic reconnection in two pages.
