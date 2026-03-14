// ── APP.JS — ties everything together ──

const App = {
  user: null,
  nodes: [],
  familyBoard: [],
  selectedNode: null,
  navigatingTo: null,
  threatMode: false,
  meshPeers: 0,
  gps: null,

  initGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Convert lat/lng to canvas x/y
        // Origin is first GPS fix — everything relative to that
        if (!App.gpsOrigin) {
          App.gpsOrigin = { lat: latitude, lng: longitude };
        }
        const scale = 100000; // 1 degree ≈ 111km, scale to pixels
        App.gps = {
          lat: latitude,
          lng: longitude,
          x: (longitude - App.gpsOrigin.lng) * scale,
          y: -(latitude - App.gpsOrigin.lat) * scale
        };
        // Recalculate distances for all nodes
        App.nodes.forEach(n => {
          if (n.lat && n.lng) {
            n.distanceM = haversine(latitude, longitude, n.lat, n.lng);
          }
        });
        MapEngine.render();
      },
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  },


  
  gpsOrigin: null,

  async init() {
    // Boot sequence
    const statuses = [
      'initializing mesh...',
      'checking local storage...',
      'loading node data...',
      'scanning for peers...',
      'ready.'
    ];
    for (let i = 0; i < statuses.length; i++) {
      document.getElementById('boot-status').textContent = statuses[i];
      await sleep(400);
    }
    await sleep(300);

    // Check if returning user
    const saved = localStorage.getItem('dm_user');
    if (saved) {
      App.user = JSON.parse(saved);
      App.launch();
    } else {
      // Show onboarding
      fadeOut('boot-screen');
      await sleep(600);
      fadeIn('onboard-screen');
    }

    // Load saved nodes
    const savedNodes = localStorage.getItem('dm_nodes');
    if (savedNodes) App.nodes = JSON.parse(savedNodes);

    // Start mesh
    Mesh.init();

    // Start threat sensor
    ThreatSensor.init();
  },

  launch() {
    fadeOut('boot-screen');
    fadeOut('onboard-screen');
    setTimeout(() => {
      document.getElementById('app-screen').classList.remove('hidden');
      document.getElementById('user-tag').textContent = App.user.name || 'anonymous';
      MapEngine.init();
      MapHint.show();
setTimeout(() => Tour.start(), 2000);
      MapEngine.render();
      App.initGPS();
      App.familyBoard = JSON.parse(localStorage.getItem('dm_family') || '[]');
    }, 600);
    PinNudge.init();
  },

  saveNodes() {
    localStorage.setItem('dm_nodes', JSON.stringify(App.nodes));
  },

  wipeAll() {
    localStorage.clear();
    App.nodes = [];
    App.user = null;
    location.reload();
  }
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── ONBOARDING ──
function enterApp() {
  localStorage.setItem('dm_tutorial_done', '1');
  const name = document.getElementById('name-input').value.trim();
  App.user = {
    id: generateId(),
    name: name || null,
    joinedAt: Date.now()
  };
  localStorage.setItem('dm_user', JSON.stringify(App.user));
  App.launch();
}

function nextSlide(n) {
  document.querySelectorAll('.tutorial-slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tdot').forEach(d => d.classList.remove('active'));
  document.getElementById('slide-' + n).classList.add('active');
  document.getElementById('dot-' + n).classList.add('active');
}

// ── NODE CREATOR ──
let selectedType = null;
let selectedNH = 'have';
let selectedExpiry = 1; // hours, 0 = never

function openNodeCreator() {
  document.getElementById('node-creator').classList.remove('hidden');
  document.getElementById('node-creator').classList.add('fade-in');
}
// quiet moment handled when confirmed by others
function closeNodeCreator() {
  document.getElementById('node-creator').classList.add('hidden');
  selectedType = null;
  document.querySelectorAll('.node-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('node-name').value = '';
  document.getElementById('node-desc').value = '';
  document.getElementById('create-node-btn').disabled = true;
}
function selectNodeType(btn) {
  document.querySelectorAll('.node-type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedType = btn.dataset.type;
  document.getElementById('create-node-btn').disabled = false;
}
function selectNH(btn) {
  document.querySelectorAll('.nh-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedNH = btn.dataset.nh;
}

function selectExpiry(btn) {
  document.querySelectorAll('.expiry-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedExpiry = parseFloat(btn.dataset.hours);
}


function createNode() {
  if (!selectedType) return;
  const node = {
    id: generateId(),
    type: selectedType,
    name: document.getElementById('node-name').value.trim() || typeLabel(selectedType),
    desc: document.getElementById('node-desc').value.trim(),
    needHave: selectedNH,
    createdBy: App.user?.id,
    createdAt: Date.now(),
    expiresAt: selectedExpiry === 0 ? null : Date.now() + (selectedExpiry * 60 * 60 * 1000),
    // Position relative to center for now — will use GPS when available
    x: (MapEngine.tapX !== undefined ? MapEngine.tapX : (App.gps ? App.gps.x : (Math.random() - 0.5) * 400)) + (Math.random() - 0.5) * 8,
y: (MapEngine.tapY !== undefined ? MapEngine.tapY : (App.gps ? App.gps.y : (Math.random() - 0.5) * 400)) + (Math.random() - 0.5) * 8,
    lat: MapEngine.tapLat || App.gps?.lat || null,
    lng: MapEngine.tapLng || App.gps?.lng || null,
    confirms: [],
    comments: [],
  };
  App.nodes.push(node);
  App.saveNodes();
  MapEngine.render();
  closeNodeCreator();
  Mesh.broadcast({ type: 'node', node });
  // reset tap position so next pin doesn't stack
  MapEngine.tapX = undefined;
  MapEngine.tapY = undefined;
  MapEngine.tapLat = undefined;
  MapEngine.tapLng = undefined;
}

// ── SOS ──
function triggerSOS() {
  if (!confirm('Send SOS to all nearby devices?')) return;
  const sos = {
    type: 'sos',
    from: App.user?.name || 'anonymous',
    userId: App.user?.id,
    timestamp: Date.now()
  };
  Mesh.broadcast(sos);
  // Visual feedback
  document.getElementById('sos-btn').style.animation = 'pulse 0.3s infinite';
  setTimeout(() => {
    document.getElementById('sos-btn').style.animation = '';
  }, 3000);
}

// ── VOICE ──
function startVoice() {
  document.getElementById('voice-btn').classList.add('recording');
  Mesh.startVoiceBroadcast();
}
function stopVoice() {
  document.getElementById('voice-btn').classList.remove('recording');
  Mesh.stopVoiceBroadcast();
}

function deleteNode() {
  if (!App.selectedNode) return;
  App.nodes = App.nodes.filter(n => n.id !== App.selectedNode.id);
  App.saveNodes();
  Mesh.broadcast({ type: 'delete', nodeId: App.selectedNode.id });
  closePopup();
  MapEngine.render();
}

function cancelNavigation() {
  App.navigatingTo = null;
  MapEngine.stopNavigation();
  document.getElementById('cancel-nav-btn').classList.add('hidden');
  document.getElementById('navigate-btn').classList.remove('hidden');
}

// ── NODE POPUP ──
function showNodePopup(node) {
  App.selectedNode = node;
  document.getElementById('node-popup-icon').textContent = typeIcon(node.type);
  document.getElementById('node-popup-name').textContent = node.name;
  document.getElementById('node-popup-desc').textContent = node.desc || '';
  document.getElementById('node-popup-distance').textContent =
    node.distanceM ? `~${Math.round(node.distanceM)}m away` : 'nearby';

  // Show delete only if you created it, flag if someone else's
  const deleteBtn = document.getElementById('delete-node-btn');
  const flagBtn = document.getElementById('flag-node-btn');
  const confirmBtn = document.getElementById('confirm-node-btn');
  const commentRow = document.getElementById('node-comment-input-row');

  const isOwn = !node.fromMesh && node.createdBy === App.user?.id;
  const alreadyConfirmed = (node.confirms || []).includes(App.user?.id);

  if (isOwn) {
    deleteBtn.classList.remove('hidden');
    flagBtn.classList.add('hidden');
    confirmBtn.classList.add('hidden');
  } else {
    deleteBtn.classList.add('hidden');
    flagBtn.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    confirmBtn.textContent = alreadyConfirmed
      ? `✓ confirmed (${(node.confirms||[]).length})`
      : `confirm this is real${(node.confirms||[]).length > 0 ? ` (${node.confirms.length})` : ''}`;
    confirmBtn.style.opacity = alreadyConfirmed ? '0.4' : '1';
    confirmBtn.disabled = alreadyConfirmed;
  }

  // comments
  commentRow.classList.remove('hidden');
  renderComments(node);

  // timestamp
  const age = Date.now() - node.createdAt;
  const ageLabel = age < 3600000
    ? `${Math.round(age/60000)}m ago`
    : age < 86400000
    ? `${Math.round(age/3600000)}h ago`
    : `${Math.round(age/86400000)}d ago`;
  document.getElementById('node-popup-distance').textContent =
    (node.distanceM ? `~${Math.round(node.distanceM)}m away · ` : '') + `marked ${ageLabel}`;

  document.getElementById('node-popup').classList.remove('hidden');
  document.getElementById('node-popup').classList.add('fade-in');
}
function closePopup() {
  document.getElementById('node-popup').classList.add('hidden');
  App.selectedNode = null;
  App.navigatingTo = null;
  MapEngine.render();
}


function flagNodeGone() {
  if (!App.selectedNode) return;
  const node = App.selectedNode;
  
  // Send flag message over mesh to owner
  Mesh.broadcast({
    type: 'flag',
    nodeId: node.id,
    nodeOwnerId: node.createdBy,
    flaggedBy: App.user?.name || 'someone nearby',
    nodeName: node.name
  });

  // Show feedback
  const btn = document.getElementById('flag-node-btn');
  btn.textContent = 'reported ✓';
  btn.style.opacity = '0.4';
  btn.disabled = true;
  setTimeout(() => closePopup(), 1500);
}


// ── NAVIGATE ──
document.getElementById('navigate-btn').addEventListener('click', () => {
  if (!App.selectedNode) return;
  App.navigatingTo = App.selectedNode;
  document.getElementById('node-popup').classList.add('hidden');
  document.getElementById('navigate-btn').classList.add('hidden');
  document.getElementById('cancel-nav-btn').classList.remove('hidden');
  MapEngine.startNavigation(App.selectedNode);
});

// ── THREAT MODE ──
const ThreatSensor = {
  init() {
    // Listen for device motion (explosions = sharp acceleration)
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', (e) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
        if (magnitude > 25) ThreatSensor.activateThreat('motion detected');
      });
    }
  },
  activateThreat(reason) {
    if (App.threatMode) return;
    App.threatMode = true;
    document.getElementById('threat-overlay').classList.remove('hidden');
    document.getElementById('threat-indicator').style.display = 'block';
    document.getElementById('threat-indicator').className = 'threat-active';
    document.getElementById('threat-indicator').textContent = '● THREAT';
    // Dim screen, pause broadcasts
    Mesh.pauseBroadcast();
    setTimeout(() => ThreatSensor.clearThreat(), 60000); // auto-clear after 1 min
  },
  clearThreat() {
    App.threatMode = false;
    document.getElementById('threat-overlay').classList.add('hidden');
    document.getElementById('threat-indicator').style.display = 'none';
    document.getElementById('threat-indicator').className = 'threat-safe';
    document.getElementById('threat-indicator').textContent = '● CLEAR';
    Mesh.resumeBroadcast();
  }
};

function clearMyNodes() {
  App.nodes = App.nodes.filter(n => n.fromMesh);
  App.saveNodes();
  MapEngine.render();
}

// ── WIPE (long press) ──
let wipeTimer = null;

function attachWipeLogo() {
  const logo = document.getElementById('ymir-logo');
  if (!logo) return;

  // touch (mobile)
  logo.addEventListener('touchstart', () => {
    logo.style.opacity = '0.5';
    wipeTimer = setTimeout(() => {
      logo.style.opacity = '1';
      if (confirm('wipe ALL data from this device? this cannot be undone.')) {
        App.wipeAll();
      }
    }, 3000);
  });
  logo.addEventListener('touchend', () => {
    clearTimeout(wipeTimer);
    logo.style.opacity = '1';
  });

  // mouse (desktop)
  logo.addEventListener('mousedown', () => {
    logo.style.opacity = '0.5';
    wipeTimer = setTimeout(() => {
      logo.style.opacity = '1';
      if (confirm('wipe ALL data from this device? this cannot be undone.')) {
        App.wipeAll();
      }
    }, 3000);
  });
  logo.addEventListener('mouseup', () => {
    clearTimeout(wipeTimer);
    logo.style.opacity = '1';
  });
  logo.addEventListener('mouseleave', () => {
    clearTimeout(wipeTimer);
    logo.style.opacity = '1';
  });
}

// attach after app launches
const _origLaunch = App.launch.bind(App);
App.launch = function() {
  _origLaunch();
  setTimeout(attachWipeLogo, 700);
};

// ── UTILS ──
function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fadeOut(id) {
  const el = document.getElementById(id);
  el.style.opacity = '0';
  setTimeout(() => el.classList.add('hidden'), 600);
}
function fadeIn(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.style.opacity = '0';
  setTimeout(() => el.style.opacity = '1', 50);
}
function typeIcon(type) {
  const icons = {
    food: '🍞', water: '💧', medical: '🩺', shelter: '🏠',
    power: '🔋', rescue: '🚨', checkpoint: '🚧', danger: '⚠️',
    family: '👨‍👩‍👧', custom: '📍', sos: '🆘'
  };
  return icons[type] || '📍';
}
function typeLabel(type) {
  const labels = {
    food: 'Food', water: 'Water', medical: 'Medical', shelter: 'Shelter',
    power: 'Power', rescue: 'Rescue', checkpoint: 'Checkpoint', danger: 'Danger',
    family: 'Find Family', custom: 'Location', sos: 'SOS'
  };
  return labels[type] || 'Location';
}

  function generateQR() {
  const el = document.getElementById('qr-code');
  el.innerHTML = '';

  // Strip heavy fields to keep QR data small
  const nodes = App.nodes
    .filter(n => !n.fromMesh)
    .map(n => ({
      id: n.id,
      type: n.type,
      name: n.name,
      desc: n.desc,
      needHave: n.needHave,
      lat: n.lat,
      lng: n.lng,
      x: n.x,
      y: n.y,
      expiresAt: n.expiresAt,
      createdAt: n.createdAt
    }));

  const data = JSON.stringify({
    nodes,
    by: App.user?.name,
    t: Date.now()
  });

  // QR codes break above ~2KB — warn if too many pins
  if (data.length > 1800) {
    el.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:9px;color:#ffd6a0;letter-spacing:1px;padding:16px;text-align:center;line-height:1.8;">too many pins for one QR.<br>clear some pins and try again.</div>`;
    return;
  }

  try {
    new QRCode(el, {
      text: data,
      width: 220,
      height: 220,
      colorDark: '#000',
      colorLight: '#fff',
      correctLevel: QRCode.CorrectLevel.L
    });
  } catch(e) {
    el.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:9px;color:#ff3b5c;letter-spacing:1px;padding:16px;text-align:center;">could not generate QR</div>`;
  }
}

let qrScanner = null;

async function startQRScan() {
  const video = document.getElementById('qr-video');
  const result = document.getElementById('scan-result');
  const btn = document.getElementById('scan-btn');

  // Stop any existing scan first
  stopQRScan();

  video.style.display = 'block';
  btn.textContent = 'scanning... (tap to stop)';
  btn.onclick = stopQRScan;
  result.textContent = 'point camera at QR code...';
  result.style.color = 'rgba(255,240,243,0.4)';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
    });
    video.srcObject = stream;
    video.play();
    qrScanner = stream;
    scanLoop(video);
  } catch(e) {
    result.textContent = 'camera denied — try HTTPS or check permissions';
    result.style.color = '#ff3b5c';
    btn.textContent = 'scan qr code';
    btn.onclick = startQRScan;
  }
}

function stopQRScan() {
  if (qrScanner) {
    qrScanner.getTracks().forEach(t => t.stop());
    qrScanner = null;
  }
  const video = document.getElementById('qr-video');
  video.srcObject = null;
  video.style.display = 'none';
  const btn = document.getElementById('scan-btn');
  btn.textContent = 'scan qr code';
  btn.onclick = startQRScan;
  document.getElementById('scan-result').textContent = '';
}

function scanLoop(video) {
  if (!qrScanner) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tick = () => {
    if (!qrScanner) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      try {
        // Use jsQR if available
        if (window.jsQR) {
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleQRData(code.data);
            return;
          }
        }
      } catch(e) {}
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

 function handleQRData(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data.nodes) throw new Error('invalid');

    let added = 0;
    let skipped = 0;
    const now = Date.now();

    (data.nodes || []).forEach(node => {
      // Skip expired pins
      if (node.expiresAt && node.expiresAt < now) { skipped++; return; }
      // Skip duplicates
      if (App.nodes.find(n => n.id === node.id)) { skipped++; return; }
      App.nodes.push({ ...node, fromMesh: true });
      added++;
    });

    App.saveNodes();
    MapEngine.render();
    stopQRScan();

    const result = document.getElementById('scan-result');
    result.style.color = '#a8f4c8';
    if (added > 0) {
      if (added > 0) onQRScanned(added);
      result.textContent = `✓ ${added} pin${added > 1 ? 's' : ''} added from ${data.by || 'someone'}${skipped > 0 ? ` (${skipped} skipped)` : ''}`;
    } else {
      result.textContent = `no new pins — ${skipped} already known or expired`;
      result.style.color = 'rgba(255,240,243,0.4)';
    }
  } catch(e) {
    const result = document.getElementById('scan-result');
    result.textContent = 'could not read code — try again';
    result.style.color = '#ff3b5c';
  }
}


// ── FAMILY FINDER ──
function openFamilyFinder() {
  document.getElementById('family-panel').classList.remove('hidden');
  renderFamilyBoard();
  onFamilyPosted();
}

function closeFamilyFinder() {
  document.getElementById('family-panel').classList.add('hidden');
}

function postFamilyEntry() {
  const name = document.getElementById('family-name-input').value.trim();
  const status = document.getElementById('family-status-select').value;
  const note = document.getElementById('family-note-input').value.trim();
  if (!name) return;

  const entry = {
    id: generateId(),
    name,
    status, // 'looking' or 'found'
    note,
    postedBy: App.user?.name || 'anonymous',
    posterId: App.user?.id,
    t: Date.now(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
  };

  App.familyBoard = App.familyBoard || [];
  App.familyBoard.push(entry);
  localStorage.setItem('dm_family', JSON.stringify(App.familyBoard));
  Mesh.broadcast({ type: 'family', entry });
  document.getElementById('family-name-input').value = '';
  document.getElementById('family-note-input').value = '';
  renderFamilyBoard();
}

function renderFamilyBoard() {
  App.familyBoard = App.familyBoard || [];
  const now = Date.now();
  App.familyBoard = App.familyBoard.filter(e => e.expiresAt > now);
  const el = document.getElementById('family-entries');
  if (App.familyBoard.length === 0) {
    el.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:9px;color:rgba(255,240,243,0.3);letter-spacing:1px;text-align:center;padding:24px 0;">no posts yet</div>';
    return;
  }
  el.innerHTML = App.familyBoard.slice().reverse().map(e => `
    <div style="border:1px solid rgba(244,167,185,0.1);border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:16px;">${e.status === 'found' ? '✅' : '🔍'}</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:22px;font-style:italic;color:#fff0f3;">${e.name}</span>
        <span style="font-family:'Space Mono',monospace;font-size:8px;color:${e.status === 'found' ? '#a8f4c8' : '#f4a7b9'};margin-left:auto;">${e.status}</span>
      </div>
      ${e.note ? `<div style="font-size:12px;color:rgba(255,240,243,0.5);margin-bottom:6px;">${e.note}</div>` : ''}
      <div style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,240,243,0.25);">posted by ${e.postedBy}</div>
    </div>
  `).join('');
}

// ── SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => {
    console.log('[SW] registered');
  }).catch(e => console.warn('[SW] failed:', e));
}

// ── CAMOUFLAGE ──
let tapCount = 0;
let tapTimer = null;

document.getElementById('fake-temp').addEventListener('click', () => {
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1000);
  if (tapCount >= 3) {
    tapCount = 0;
    document.getElementById('camouflage-screen').style.display = 'none';
    App.init();
  }
});

// ── MUSIC ──
App.musicProposals = [];
App.currentAudio = null;

function proposeTrack(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const proposal = {
      id: generateId(),
      name: file.name.replace(/\.[^.]+$/, ''),
      proposedBy: App.user?.name || 'anonymous',
      proposerId: App.user?.id,
      data: e.target.result, // base64 audio
      votes: {},
      t: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 min
    };
    App.musicProposals.push(proposal);
    Mesh.broadcast({ type: 'music_propose', proposal });
    renderMusicPanel();
  };
  reader.readAsDataURL(file);
}

function voteTrack(id, vote) {
  const p = App.musicProposals.find(p => p.id === id);
  if (!p) return;
  p.votes[App.user?.id] = vote;
  Mesh.broadcast({ type: 'music_vote', proposalId: id, vote, voterId: App.user?.id });
  checkMusicThreshold(p);
  renderMusicPanel();
}

function checkMusicThreshold(proposal) {
  const votes = Object.values(proposal.votes);
  const yes = votes.filter(v => v === 'yes').length;
  const no = votes.filter(v => v === 'no').length;
  const total = App.meshPeers + 1;
  if (yes > total / 2) {
    playTrack(proposal);
  }
}

function playTrack(proposal) {
  if (App.currentAudio) App.currentAudio.pause();
  App.currentAudio = new Audio(proposal.data);
  App.currentAudio.play();
  document.getElementById('now-playing').classList.remove('hidden');
  document.getElementById('now-playing-name').textContent = proposal.name;
  App.currentAudio.onended = () => {
    document.getElementById('now-playing').classList.add('hidden');
    App.currentAudio = null;
  };
}

function stopMusic() {
  if (App.currentAudio) {
    App.currentAudio.pause();
    App.currentAudio = null;
  }
  document.getElementById('now-playing').classList.add('hidden');
}

function renderMusicPanel() {
  const now = Date.now();
  App.musicProposals = App.musicProposals.filter(p => p.expiresAt > now);
  const el = document.getElementById('music-proposals');
  if (!el) return;
  if (App.musicProposals.length === 0) {
    el.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:9px;color:rgba(255,240,243,0.3);letter-spacing:1px;text-align:center;padding:16px 0;">no proposals yet</div>';
    return;
  }
  el.innerHTML = App.musicProposals.slice().reverse().map(p => {
    const votes = Object.values(p.votes);
    const yes = votes.filter(v => v === 'yes').length;
    const no = votes.filter(v => v === 'no').length;
    const myVote = p.votes[App.user?.id];
    return `
      <div style="border:1px solid rgba(244,167,185,0.1);border-radius:10px;padding:14px;margin-bottom:10px;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-style:italic;color:#fff0f3;margin-bottom:4px;">${p.name}</div>
        <div style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,240,243,0.3);margin-bottom:12px;">proposed by ${p.proposedBy} · ${yes} yes · ${no} no</div>
        <div style="display:flex;gap:8px;">
          <button onclick="voteTrack('${p.id}','yes')" style="flex:1;padding:10px;background:${myVote==='yes'?'rgba(168,244,200,0.15)':'transparent'};border:1px solid rgba(168,244,200,0.3);color:#a8f4c8;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:6px;">yes ${yes}</button>
          <button onclick="voteTrack('${p.id}','no')" style="flex:1;padding:10px;background:${myVote==='no'?'rgba(255,59,92,0.15)':'transparent'};border:1px solid rgba(255,59,92,0.3);color:#ff3b5c;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:6px;">no ${no}</button>
        </div>
      </div>
    `;
  }).join('');
}

// ── CONFIRM SYSTEM ──
function confirmNode() {
  if (!App.selectedNode) return;
  const node = App.selectedNode;
  node.confirms = node.confirms || [];
  if (node.confirms.includes(App.user?.id)) return;
  node.confirms.push(App.user?.id);
  App.saveNodes();
  Mesh.broadcast({ type: 'confirm', nodeId: node.id, userId: App.user?.id });
  const btn = document.getElementById('confirm-node-btn');
  btn.textContent = `✓ confirmed (${node.confirms.length})`;
  btn.style.opacity = '0.4';
  btn.disabled = true;
  MapEngine.render();
  onPinConfirmed(node);
}

// ── COMMENTS ──
function renderComments(node) {
  const el = document.getElementById('node-comments-section');
  const comments = node.comments || [];
  if (comments.length === 0) {
    el.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:8px;color:rgba(160,210,245,0.25);letter-spacing:1px;margin-bottom:8px;">no notes yet</div>';
    return;
  }
  el.innerHTML = comments.map(c => `
    <div style="border-left:2px solid rgba(92,184,232,0.2);padding:6px 10px;margin-bottom:6px;">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:rgba(160,210,245,0.7);">${c.text}</div>
      <div style="font-family:'Space Mono',monospace;font-size:7px;color:rgba(160,210,245,0.25);margin-top:3px;">${c.by} · ${Math.round((Date.now()-c.t)/60000)}m ago</div>
    </div>
  `).join('');
}

function submitComment() {
  if (!App.selectedNode) return;
  const input = document.getElementById('node-comment-input');
  const text = input.value.trim();
  if (!text) return;
  const comment = {
    id: generateId(),
    text,
    by: App.user?.name || 'anonymous',
    userId: App.user?.id,
    t: Date.now()
  };
  App.selectedNode.comments = App.selectedNode.comments || [];
  App.selectedNode.comments.push(comment);
  App.saveNodes();
  Mesh.broadcast({ type: 'comment', nodeId: App.selectedNode.id, comment });
  input.value = '';
  renderComments(App.selectedNode);
}

// ── STATUS BROADCAST ──
function broadcastStatus(status) {
  const labels = { safe: '✓ I am safe', injured: '⚠ I am injured', help: '🆘 I need help' };
  Mesh.broadcast({
    type: 'status',
    status,
    label: labels[status],
    from: App.user?.name || 'anonymous',
    userId: App.user?.id,
    t: Date.now()
  });
  // show confirmation
  const banner = document.createElement('div');
  banner.style.cssText = `position:fixed;top:70px;left:16px;right:16px;background:rgba(12,18,24,0.98);border:1px solid rgba(92,184,232,0.3);border-radius:12px;padding:16px;z-index:999;text-align:center;`;
  banner.innerHTML = `<div style="font-family:'Space Mono',monospace;font-size:10px;color:rgba(92,184,232,0.9);letter-spacing:2px;">${labels[status]}<br><span style="opacity:0.5;font-size:8px;">broadcast to all nearby</span></div>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3000);
  onStatusSent(status);
  document.getElementById('status-panel').classList.add('hidden');
}

// ── PIN SEARCH ──
function openSearchPanel() {
  document.getElementById('search-panel').classList.remove('hidden');
  document.getElementById('pin-search-input').value = '';
  renderPinSearch();
  setTimeout(() => document.getElementById('pin-search-input').focus(), 100);
}

function renderPinSearch() {
  const query = document.getElementById('pin-search-input').value.toLowerCase().trim();
  const el = document.getElementById('pin-search-results');
  let nodes = [...App.nodes];

  // sort by distance if available
  nodes.sort((a, b) => (a.distanceM || 99999) - (b.distanceM || 99999));

  if (query) {
    nodes = nodes.filter(n =>
      n.name?.toLowerCase().includes(query) ||
      n.type?.toLowerCase().includes(query) ||
      n.desc?.toLowerCase().includes(query)
    );
  }

  if (nodes.length === 0) {
    el.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:9px;color:rgba(160,210,245,0.3);letter-spacing:1px;text-align:center;padding:24px 0;">no pins found</div>';
    return;
  }

  el.innerHTML = nodes.slice(0, 20).map(n => {
    const dist = n.distanceM ? `${Math.round(n.distanceM)}m` : '';
    const age = Math.round((Date.now() - n.createdAt) / 60000);
    const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age/60)}h ago`;
    return `
      <div onclick="selectPinFromSearch('${n.id}')" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(92,184,232,0.1);border-radius:10px;margin-bottom:8px;cursor:pointer;">
        <span style="font-size:18px;">${typeIcon(n.type)}</span>
        <div style="flex:1;">
          <div style="font-family:'Cormorant Garamond',serif;font-size:18px;color:#e8f4ff;">${n.name}</div>
          <div style="font-family:'Space Mono',monospace;font-size:7px;color:rgba(160,210,245,0.4);letter-spacing:1px;">${ageLabel}${dist ? ' · ' + dist : ''}</div>
        </div>
        ${(n.confirms||[]).length > 0 ? `<span style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(92,184,232,0.6);">✓${(n.confirms||[]).length}</span>` : ''}
      </div>
    `;
  }).join('');
}

function selectPinFromSearch(id) {
  const node = App.nodes.find(n => n.id === id);
  if (!node) return;
  document.getElementById('search-panel').classList.add('hidden');
  // center map on pin
  MapEngine.offset.x = -node.x * MapEngine.scale;
  MapEngine.offset.y = -node.y * MapEngine.scale;
  MapEngine.render();
  setTimeout(() => showNodePopup(node), 300);
}

// ── CATEGORY FILTER ──
let activeFilter = 'all';

function toggleCategoryFilter() {
  const btns = document.getElementById('filter-buttons');
  btns.classList.toggle('hidden');
  btns.style.display = btns.classList.contains('hidden') ? 'none' : 'flex';
}

function selectFilter(btn, type) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = type;
  MapEngine.render();
  // hide filter buttons after selection
  const btns = document.getElementById('filter-buttons');
  btns.classList.add('hidden');
  btns.style.display = 'none';
}

// ── AREA NOTES ──
let selectedNoteExpiry = 1;
App.notes = JSON.parse(localStorage.getItem('dm_notes') || '[]');

function selectNoteExpiry(btn) {
  document.querySelectorAll('#notes-panel .expiry-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedNoteExpiry = parseFloat(btn.dataset.hours);
}

function postNote() {
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;
  const note = {
    id: generateId(),
    text,
    by: App.user?.id, // id only, never name
    t: Date.now(),
    expiresAt: selectedNoteExpiry === 0 ? null : Date.now() + (selectedNoteExpiry * 60 * 60 * 1000)
  };
  App.notes.push(note);
  localStorage.setItem('dm_notes', JSON.stringify(App.notes));
  Mesh.broadcast({ type: 'note', note });
  document.getElementById('note-input').value = '';
  renderNotes();
}

function renderNotes() {
  const now = Date.now();
  App.notes = App.notes.filter(n => !n.expiresAt || n.expiresAt > now);
  localStorage.setItem('dm_notes', JSON.stringify(App.notes));
  const el = document.getElementById('notes-list');
  if (!el) return;
  if (App.notes.length === 0) {
    el.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:9px;color:rgba(160,210,245,0.3);letter-spacing:1px;text-align:center;padding:16px 0;">no notes yet</div>';
    return;
  }
  el.innerHTML = App.notes.slice().reverse().map(n => {
    const age = Math.round((now - n.t) / 60000);
    const ageLabel = age < 60 ? `${age}m ago` : `${Math.round(age/60)}h ago`;
    const isOwn = n.by === App.user?.id;
    return `
      <div style="border-left:2px solid rgba(92,184,232,0.2);padding:10px 12px;margin-bottom:8px;position:relative;">
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:rgba(200,230,250,0.8);line-height:1.6;">${n.text}</div>
        <div style="font-family:'Space Mono',monospace;font-size:7px;color:rgba(160,210,245,0.3);margin-top:4px;">${ageLabel}${isOwn ? ' · yours' : ''}</div>
        ${isOwn ? `<button onclick="deleteNote('${n.id}')" style="position:absolute;top:8px;right:8px;background:transparent;border:none;color:rgba(255,59,92,0.4);font-size:10px;cursor:pointer;">✕</button>` : ''}
      </div>
    `;
  }).join('');
}

function deleteNote(id) {
  App.notes = App.notes.filter(n => n.id !== id);
  localStorage.setItem('dm_notes', JSON.stringify(App.notes));
  Mesh.broadcast({ type: 'delete_note', noteId: id });
  renderNotes();
}

// ── PIN NUDGE SYSTEM ──
const PinNudge = {
  shownNudges: new Set(),

  init() {
    // Check every 10 minutes
    setInterval(() => this.checkPins(), 10 * 60 * 1000);
    // Also check on boot after 5 seconds
    setTimeout(() => this.checkPins(), 5000);
  },

  checkPins() {
    const now = Date.now();
    App.nodes
      .filter(n => !n.fromMesh && n.createdBy === App.user?.id)
      .forEach(n => {
        if (this.shownNudges.has(n.id)) return;
        if (!n.expiresAt) return; // "until i remove it" pins skip nudge
        
        const timeLeft = n.expiresAt - now;
        const totalLife = n.expiresAt - n.createdAt;
        const halfwayPoint = totalLife * 0.5;
        
        // Nudge when halfway through the pin's life
        if (timeLeft < halfwayPoint && timeLeft > 0) {
          this.shownNudges.add(n.id);
          this.showNudge(n);
        }
      });
  },

  showNudge(node) {
    const banner = document.createElement('div');
    banner.id = 'nudge-' + node.id;
    banner.style.cssText = `
      position:fixed;
      top:70px;
      left:16px;
      right:16px;
      background:rgba(17,10,13,0.98);
      border:1px solid rgba(244,167,185,0.3);
      border-radius:12px;
      padding:18px 16px;
      z-index:999;
      animation:slideUp 0.3s ease;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
    `;
    banner.innerHTML = `
      <div style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(255,240,243,0.4);letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;">your pin</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-style:italic;color:#fff0f3;margin-bottom:4px;">${node.name}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:rgba(255,240,243,0.4);margin-bottom:16px;">is this still there?</div>
      <div style="display:flex;gap:8px;">
        <button onclick="PinNudge.keepPin('${node.id}')" style="flex:1;padding:11px;background:rgba(168,244,200,0.1);border:1px solid rgba(168,244,200,0.3);color:#a8f4c8;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:8px;">still here</button>
        <button onclick="PinNudge.removePin('${node.id}')" style="flex:1;padding:11px;background:rgba(255,59,92,0.1);border:1px solid rgba(255,59,92,0.3);color:#ff3b5c;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;cursor:pointer;border-radius:8px;">it's gone</button>
      </div>
    `;
    document.body.appendChild(banner);

    // Auto remove banner after 30 min if ignored
    setTimeout(() => banner.remove(), 30 * 60 * 1000);
  },

  keepPin(id) {
    const node = App.nodes.find(n => n.id === id);
    if (!node) return;
    // Reset expiry — same duration from now
    const duration = node.expiresAt - node.createdAt;
    node.expiresAt = Date.now() + duration;
    node.createdAt = Date.now();
    App.saveNodes();
    Mesh.broadcast({ type: 'node', node });
    document.getElementById('nudge-' + id)?.remove();
  },

  removePin(id) {
    App.nodes = App.nodes.filter(n => n.id !== id);
    App.saveNodes();
    Mesh.broadcast({ type: 'delete', nodeId: id });
    MapEngine.render();
    document.getElementById('nudge-' + id)?.remove();
  }
};

/// ── BOOT ── triggered by camouflage unlock
