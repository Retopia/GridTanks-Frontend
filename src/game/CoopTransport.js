// Rooms and verification stay on the server; only transient gameplay uses WebRTC.
export class CoopTransport {
    constructor({ role, runId, signal, relay, receive, status, iceServers, Peer = globalThis.RTCPeerConnection }) {
        Object.assign(this, { role, runId, signal, relay, receive, status, iceServers, Peer });
        this.id = globalThis.crypto.randomUUID();
        this.sequence = 0;
        this.seen = new Map();
        this.pendingCandidates = [];
        this.lastPong = 0;
        this.closed = false;
        this.chain = Promise.resolve();
    }

    start() {
        this.status({ path: 'Server relay', rtt: null });
        if (!this.Peer) return;
        this.hello();
        this.timer = setInterval(() => {
            if (this.closed) return;
            if (this.channel?.readyState === 'open') {
                try { this.channel.send(JSON.stringify({ type: 'ping', at: Date.now() })); } catch { /* Relay remains available. */ }
                if (Date.now() - this.lastPong > 6000) {
                    this.resetPeer();
                    this.status({ path: 'Server relay', rtt: null });
                    this.hello();
                }
            } else {
                this.hello();
            }
        }, 2000);
    }

    hello() {
        if (this.Peer) this.signal({ kind: 'ready', id: this.id });
    }

    onSignal(message) {
        // Serialize SDP and candidates so early ICE cannot race setRemoteDescription.
        this.chain = this.chain.then(() => this.handleSignal(message)).catch(() => {
            this.resetPeer();
            if (!this.closed) this.status({ path: 'Server relay', rtt: null });
        });
        return this.chain;
    }

    async handleSignal(message) {
        if (this.closed || !this.Peer || !message || typeof message.id !== 'string') return;
        if (message.kind === 'ready') {
            if (this.peerId !== message.id) {
                this.resetPeer();
                this.peerId = message.id;
            }
            if (this.role === 'host' && !this.pc) {
                const pc = this.createPeer();
                this.attachChannel(pc.createDataChannel('gridtanks-gameplay', { ordered: true }));
                await pc.setLocalDescription(await pc.createOffer());
                if (this.pc === pc && !this.closed) this.signal({ kind: 'offer', id: this.id, description: pc.localDescription });
            }
            return;
        }
        if (message.kind === 'offer' && this.role === 'guest') {
            const candidates = !this.peerId || this.peerId === message.id ? this.pendingCandidates : [];
            this.resetPeer();
            this.pendingCandidates = candidates;
            this.peerId = message.id;
            const pc = this.createPeer();
            await pc.setRemoteDescription(message.description);
            await this.flushCandidates(pc);
            await pc.setLocalDescription(await pc.createAnswer());
            if (this.pc === pc && !this.closed) this.signal({ kind: 'answer', id: this.id, description: pc.localDescription });
        } else if (message.kind === 'answer' && this.role === 'host' && this.pc && message.id === this.peerId) {
            await this.pc.setRemoteDescription(message.description);
            await this.flushCandidates(this.pc);
        } else if (message.kind === 'candidate') {
            if (this.peerId && message.id !== this.peerId) return;
            if (this.pc?.remoteDescription) await this.pc.addIceCandidate(message.candidate);
            else if (this.pendingCandidates.length < 128) this.pendingCandidates.push(message.candidate);
        }
    }

    createPeer() {
        const pc = new this.Peer({ iceServers: this.iceServers });
        this.pc = pc;
        this.startedAt = Date.now();
        pc.onicecandidate = ({ candidate }) => {
            if (candidate && this.pc === pc && !this.closed) this.signal({ kind: 'candidate', id: this.id, candidate: candidate.toJSON() });
        };
        pc.ondatachannel = ({ channel }) => { if (this.pc === pc) this.attachChannel(channel); };
        pc.onconnectionstatechange = () => {
            if (this.pc !== pc) return;
            if (['failed', 'closed'].includes(pc.connectionState)) {
                this.resetPeer();
                if (!this.closed) this.status({ path: 'Server relay', rtt: null });
            }
        };
        return pc;
    }

    async flushCandidates(pc) {
        for (const candidate of this.pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
    }

    attachChannel(channel) {
        this.channel = channel;
        channel.onopen = () => {
            if (this.closed || this.channel !== channel) return;
            this.lastPong = Date.now();
            channel.send(JSON.stringify({ type: 'ping', at: Date.now() }));
        };
        channel.onmessage = ({ data }) => {
            if (this.closed || this.channel !== channel || typeof data !== 'string' || data.length > 2_000_000) return;
            let message;
            try { message = JSON.parse(data); } catch { return; }
            if (message?.type === 'ping') {
                if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'pong', at: message.at }));
            } else if (message?.type === 'pong' && Number.isFinite(message.at)) {
                this.lastPong = Date.now();
                this.reportPath(Math.max(0, Date.now() - message.at));
            } else {
                this.deliver(message);
            }
        };
        channel.onclose = channel.onerror = () => {
            if (!this.closed && this.channel === channel) {
                this.resetPeer();
                this.status({ path: 'Server relay', rtt: null });
            }
        };
    }

    async reportPath(rtt) {
        const pc = this.pc;
        let path = 'P2P';
        try {
            const stats = await pc.getStats();
            for (const entry of stats.values()) {
                if (entry.type !== 'transport' || !entry.selectedCandidatePairId) continue;
                const pair = stats.get(entry.selectedCandidatePairId);
                const local = stats.get(pair?.localCandidateId);
                const remote = stats.get(pair?.remoteCandidateId);
                path = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'TURN relay' : 'Direct P2P';
            }
        } catch { /* Some browsers omit candidate stats. */ }
        if (!this.closed && this.pc === pc) this.status({ path, rtt });
    }

    send(type, payload) {
        if (this.closed) return false;
        const message = { type, payload, run_id: this.runId, stream: this.id, seq: ++this.sequence };
        if (this.channel?.readyState === 'open' && Date.now() - this.lastPong < 6000 && this.channel.bufferedAmount < 65536) {
            try { this.channel.send(JSON.stringify(message)); return true; } catch { /* Fall back without interrupting the run. */ }
        }
        // Retry failed negotiations, but never stall gameplay while ICE is connecting.
        if (this.pc && this.channel?.readyState !== 'open' && Date.now() - this.startedAt > 15000) this.resetPeer();
        return this.relay(message);
    }

    deliver(message) {
        if (this.closed || !message || message.run_id !== this.runId) return;
        const expected = this.role === 'host' ? 'coop_input' : 'coop_snapshot';
        if (message.type !== expected) return;
        if (Number.isSafeInteger(message.seq) && typeof message.stream === 'string') {
            const key = `${message.stream}:${message.type}`;
            if (message.seq <= (this.seen.get(key) ?? -1)) return;
            if (this.seen.size > 32) this.seen.clear();
            this.seen.set(key, message.seq);
        }
        this.receive(message);
    }

    resetPeer() {
        const pc = this.pc;
        this.pc = null;
        this.channel = null;
        this.pendingCandidates = [];
        this.lastPong = 0;
        if (pc) pc.close();
    }

    close() {
        this.closed = true;
        clearInterval(this.timer);
        this.resetPeer();
    }
}
