// ── MESH.JS — WebRTC + ultrasonic mesh ──

const Mesh = {
  audioCtx: null,
  analyser: null,
  peers: new Map(),
  dataChannels: new Map(),
  broadcasting: true,
  messageQueue: [],
  seenIds: new Set(), // relay dedup

  async init() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await this.startListening();
      this.startBeaconing();
    } catch (e) {
      console.warn('[Mesh] Audio mesh unavailable:', e.message);
    }
    this.initWebRTC();
    this.startRelayCleanup();
  },

  // ── ULTRASONIC ──
  async startListening() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      this.listenLoop();
    } catch (e) {
      console.warn('[Mesh] Microphone access denied:', e.message);
    }
  },

  listenLoop() {
    if (!this.analyser) return;
    const buffer = new Float32Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.broadcasting) { requestAnimationFrame(tick); return; }
      this.analyser.getFloatFrequencyData(buffer);
      const sampleRate = this.audioCtx.sampleRate;
      const binSize = sampleRate / this.analyser.fftSize;
      const lowBin = Math.floor(18000 / binSize);
      const highBin = Math.floor(20000 / binSize);
      let maxAmp = -Infinity, maxBin = lowBin;
      for (let i = lowBin; i < Math.min(highBin, buffer.length); i++) {
        if (buffer[i] > maxAmp) { maxAmp = buffer[i]; maxBin = i; }
      }
      if (maxAmp > -40) {
        const freq = maxBin * binSize;
        if (freq > 18400 && freq < 18600) this.onPeerBeacon();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  onPeerBeacon() {
    // just signals presence — no count shown for safety
  },

  startBeaconing() {
    setInterval(() => {
      if (this.broadcasting) this.emitBeacon();
    }, 5000);
  },

  emitBeacon() {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.frequency.setValueAtTime(18500, this.audioCtx.currentTime);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.05);
      osc.start(this.audioCtx.currentTime);
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch (e) {}
  },

  emitSOSSignal() {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.frequency.setValueAtTime(19000, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.02, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch (e) {}
  },

  // ── WEBRTC ──
  initWebRTC() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('ymir-mesh');
      this.channel.onmessage = (e) => this.onReceive(e.data);
    }
    const SIGNAL_URL = 'ws://localhost:8001/signal/ymir-global';
    this.connectSignaling(SIGNAL_URL);
  },

  connectSignaling(url) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      App.meshPeers = 0;
      this.wsSend({ type: 'peer', id: App.user?.id });
      this.flushRelayQueue();
    };
    this.ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      await this.handleSignal(msg);
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connectSignaling(url), 3000);
    };
    this.ws.onerror = (e) => console.warn('[WebRTC] Signal error');
  },

  wsSend(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...data, from: App.user?.id }));
    }
  },

  async handleSignal(msg) {
    if (msg.from === App.user?.id) return;
    if (msg.type === 'peer') {
      App.meshPeers++;
      document.getElementById('mesh-count').textContent = 'mesh active';
      this.createPeerConnection(msg.from);
    }
    if (msg.type === 'offer') {
      const pc = this.getOrCreatePC(msg.from);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.wsSend({ type: 'answer', to: msg.from, answer });
    }
    if (msg.type === 'answer') {
      const pc = this.peers.get(msg.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    }
    if (msg.type === 'ice') {
      const pc = this.peers.get(msg.from);
      if (pc && msg.candidate) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  },

  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) this.wsSend({ type: 'ice', candidate: e.candidate });
    };
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onopen = () => this.dataChannels.set(peerId, dc);
      dc.onmessage = (ev) => this.onReceive(JSON.parse(ev.data));
    };
    const dc = pc.createDataChannel('ymir');
    dc.onopen = () => {
      this.dataChannels.set(peerId, dc);
      // send relay queue to new peer
      this.sendRelayQueueToPeer(dc);
    };
    dc.onmessage = (ev) => this.onReceive(JSON.parse(ev.data));
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      this.wsSend({ type: 'offer', offer });
    });
    this.peers.set(peerId, pc);
    return pc;
  },

  getOrCreatePC(peerId) {
    if (this.peers.has(peerId)) return this.peers.get(peerId);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) this.wsSend({ type: 'ice', candidate: e.candidate });
    };
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onopen = () => {
        this.dataChannels.set(peerId, dc);
        this.sendRelayQueueToPeer(dc);
      };
      dc.onmessage = (ev) => this.onReceive(JSON.parse(ev.data));
    };
    this.peers.set(peerId, pc);
    return pc;
  },

  // ── MESH RELAY ──
  // When device A can't reach device C but can reach B,
  // B automatically stores and forwards messages to C when they connect.

  getRelayQueue() {
    try {
      return JSON.parse(localStorage.getItem('ymir_relay') || '[]');
    } catch (e) { return []; }
  },

  saveRelayQueue(queue) {
    try {
      localStorage.setItem('ymir_relay', JSON.stringify(queue));
    } catch (e) {}
  },

  addToRelayQueue(packet) {
    if (!packet.id) return; // only relay packets with ids
    const queue = this.getRelayQueue();
    if (queue.find(p => p.id === packet.id)) return; // already have it
    queue.push({ ...packet, relayedAt: Date.now() });
    // keep last 100 messages, max 24h old
    const pruned = queue
      .filter(p => Date.now() - p.relayedAt < 24 * 60 * 60 * 1000)
      .slice(-100);
    this.saveRelayQueue(pruned);
  },

  sendRelayQueueToPeer(dc) {
    if (dc.readyState !== 'open') return;
    const queue = this.getRelayQueue();
    queue.forEach(packet => {
      try {
        dc.send(JSON.stringify({ ...packet, isRelay: true }));
      } catch (e) {}
    });
  },

  flushRelayQueue() {
    // When we reconnect to signaling, rebroadcast stored messages
    const queue = this.getRelayQueue();
    queue.forEach(packet => {
      this.dataChannels.forEach(dc => {
        if (dc.readyState === 'open') {
          try { dc.send(JSON.stringify({ ...packet, isRelay: true })); } catch (e) {}
        }
      });
    });
  },

  startRelayCleanup() {
    // Clean expired relay messages every hour
    setInterval(() => {
      const queue = this.getRelayQueue()
        .filter(p => Date.now() - p.relayedAt < 24 * 60 * 60 * 1000);
      this.saveRelayQueue(queue);
    }, 60 * 60 * 1000);
  },

  // ── BROADCAST ──
  broadcast(data) {
    if (!this.broadcasting) {
      this.messageQueue.push(data);
      return;
    }
    const packet = {
      ...data,
      id: data.id || generateId(),
      senderId: App.user?.id,
      timestamp: Date.now(),
      hops: 0
    };

    if (this.channel) this.channel.postMessage(packet);

    this.dataChannels.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(JSON.stringify(packet)); } catch (e) {}
      }
    });

    if (data.type === 'sos') this.emitSOSSignal();

    // store for relay to future peers
    this.addToRelayQueue(packet);
  },

  // ── RECEIVE ──
  onReceive(packet) {
    if (!packet || packet.senderId === App.user?.id) return;
    // dedup by packet id
    if (packet.id) {
      if (this.seenIds.has(packet.id)) return;
      this.seenIds.add(packet.id);
      // keep seenIds from growing forever
      if (this.seenIds.size > 500) {
        const arr = [...this.seenIds];
        this.seenIds = new Set(arr.slice(-250));
      }
    }

    // store for relay to peers who haven't seen it
    this.addToRelayQueue(packet);

    switch (packet.type) {
      case 'node':
        if (packet.node && !App.nodes.find(n => n.id === packet.node.id)) {
          App.nodes.push({ ...packet.node, fromMesh: true });
          App.saveNodes();
          MapEngine.render();
        }
        break;

      case 'delete':
        App.nodes = App.nodes.filter(n => n.id !== packet.nodeId);
        App.saveNodes();
        MapEngine.render();
        break;

      case 'note':
        App.notes = App.notes || [];
        if (packet.note && !App.notes.find(n => n.id === packet.note.id)) {
          App.notes.push(packet.note);
          localStorage.setItem('dm_notes', JSON.stringify(App.notes));
        }
        break;

      case 'delete_note':
        App.notes = (App.notes || []).filter(n => n.id !== packet.noteId);
        localStorage.setItem('dm_notes', JSON.stringify(App.notes));
        break;

      case 'confirm':
        const cn = App.nodes.find(n => n.id === packet.nodeId);
        if (cn) {
          cn.confirms = cn.confirms || [];
          if (!cn.confirms.includes(packet.userId)) {
            cn.confirms.push(packet.userId);
            App.saveNodes();
            MapEngine.render();
          }
        }
        break;

      case 'comment':
        const commentNode = App.nodes.find(n => n.id === packet.nodeId);
        if (commentNode) {
          commentNode.comments = commentNode.comments || [];
          if (!commentNode.comments.find(c => c.id === packet.comment.id)) {
            commentNode.comments.push(packet.comment);
            App.saveNodes();
          }
        }
        break;

      case 'flag':
        if (packet.nodeOwnerId === App.user?.id) {
          this.showFlagAlert(packet);
        }
        break;

      case 'sos':
        this.showSOSAlert(packet);
        break;

      case 'status':
        const sb = document.createElement('div');
        sb.style.cssText = `position:fixed;top:70px;left:16px;right:16px;background:rgba(12,18,24,0.98);border:1px solid rgba(92,184,232,0.3);border-radius:12px;padding:16px;z-index:999;text-align:center;`;
        sb.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:10px;color:rgba(92,184,232,0.9);letter-spacing:2px;">${packet.label}<br><span style="opacity:0.5;font-size:8px;">from someone nearby</span></div>`;
        document.body.appendChild(sb);
        setTimeout(() => sb.remove(), 5000);
        break;

      case 'family':
        App.familyBoard = App.familyBoard || [];
        if (packet.entry && !App.familyBoard.find(e => e.id === packet.entry.id)) {
          App.familyBoard.push(packet.entry);
          localStorage.setItem('dm_family', JSON.stringify(App.familyBoard));
          const fp = document.getElementById('family-panel');
          if (fp && !fp.classList.contains('hidden')) renderFamilyBoard();
        }
        break;

      case 'music_propose':
        App.musicProposals = App.musicProposals || [];
        if (packet.proposal && !App.musicProposals.find(p => p.id === packet.proposal.id)) {
          App.musicProposals.push(packet.proposal);
          renderMusicPanel();
        }
        break;

      case 'music_vote':
        const prop = (App.musicProposals || []).find(p => p.id === packet.proposalId);
        if (prop) {
          prop.votes[packet.voterId] = packet.vote;
          checkMusicThreshold(prop);
          renderMusicPanel();
        }
        break;

      case 'peer':
        App.meshPeers++;
        document.getElementById('mesh-count').textContent = 'mesh active';
        break;
    }
  },

  showSOSAlert(packet) {
    const banner = document.createElement('div');
    banner.style.cssText = `position:fixed;top:60px;left:16px;right:16px;background:rgba(255,59,59,0.95);border-radius:8px;padding:12px 16px;font-family:'Space Mono',monospace;font-size:11px;color:#fff;letter-spacing:1px;z-index:999;`;
    // never show name — anonymous only
    banner.textContent = `🆘 SOS signal received nearby`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 8000);
  },

  showFlagAlert(packet) {
    const banner = document.createElement('div');
    banner.style.cssText = `position:fixed;top:70px;left:16px;right:16px;background:rgba(12,18,24,0.98);border:1px solid rgba(255,214,160,0.3);border-radius:12px;padding:18px 16px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
    banner.innerHTML = `
      <div style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,240,243,0.4);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">your pin was flagged</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#fff0f3;margin-bottom:4px;">${packet.nodeName}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:rgba(255,240,243,0.4);margin-bottom:16px;">someone nearby says this is no longer there</div>
      <div style="display:flex;gap:8px;">
        <button onclick="PinNudge.keepPin('${packet.nodeId}'); this.closest('div[style]').remove()" style="flex:1;padding:11px;background:rgba(168,244,200,0.1);border:1px solid rgba(168,244,200,0.3);color:#a8f4c8;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:8px;">still here</button>
        <button onclick="PinNudge.removePin('${packet.nodeId}'); this.closest('div[style]').remove()" style="flex:1;padding:11px;background:rgba(255,59,92,0.1);border:1px solid rgba(255,59,92,0.3);color:#ff3b5c;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:8px;">remove it</button>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 30 * 60 * 1000);
  },

  pauseBroadcast() {
    this.broadcasting = false;
  },

  resumeBroadcast() {
    this.broadcasting = true;
    while (this.messageQueue.length > 0) {
      this.broadcast(this.messageQueue.shift());
    }
  }
};