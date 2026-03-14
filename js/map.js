// ── MAP.JS — Genshin-style minimap + main map engine ──

const MapEngine = {
  canvas: null,
  ctx: null,
  miniCanvas: null,
  miniCtx: null,
  offset: { x: 0, y: 0 },
  scale: 1,
  heading: 0,
  dragging: false,
  lastTouch: null,
  navigating: null,
  navPulse: 0,

  init() {
    this.canvas = document.getElementById('main-map');
    this.ctx = this.canvas.getContext('2d');
    this.miniCanvas = document.getElementById('minimap');
    this.miniCtx = this.miniCanvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', () => this.dragging = false);
    this.canvas.addEventListener('mousedown', (e) => { this.dragging = true; this.lastTouch = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.offset.x += e.clientX - this.lastTouch.x;
      this.offset.y += e.clientY - this.lastTouch.y;
      this.lastTouch = { x: e.clientX, y: e.clientY };
      this.render();
    });
    this.canvas.addEventListener('mouseup', () => this.dragging = false);
    // Scroll to zoom (desktop)
this.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  this.scale = Math.max(0.3, Math.min(8, this.scale * zoomFactor));
  this.render();
}, { passive: false });
    this.canvas.addEventListener('click', (e) => this.onTap(e));

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.alpha !== null) this.heading = (e.alpha * Math.PI) / 180;
      });
    }

    setInterval(() => this.expireNodes(), 60000);
    this.animLoop();
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render();
  },

  expireNodes() {
    const now = Date.now();
    const before = App.nodes.length;
    App.nodes = App.nodes.filter(n => !n.expiresAt || n.expiresAt > now);
    if (App.nodes.length !== before) {
      App.saveNodes();
      this.render();
    }
  },

  animLoop() {
    this.navPulse += 0.05;
    if (this.navigating) {
      this.render();
      this.checkArrival();
    }
    this.renderMinimap();
    requestAnimationFrame(() => this.animLoop());
  },

  // ── CHECK ARRIVAL ──
  checkArrival() {
    if (!this.navigating || !App.gps) return;
    const node = this.navigating;
    if (!node.lat || !node.lng) return;
    const dist = haversine(App.gps.lat, App.gps.lng, node.lat, node.lng);
    if (dist < 20) {
      this.showArrival(node);
      this.stopNavigation();
    }
  },

  showArrival(node) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed;top:70px;left:16px;right:16px;
      background:rgba(12,18,24,0.98);
      border:1px solid rgba(92,184,232,0.4);
      border-radius:12px;padding:18px 16px;
      z-index:999;animation:slideUp 0.3s ease;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      text-align:center;
    `;
    banner.innerHTML = `
      <div style="font-size:24px;margin-bottom:8px;">${typeIcon(node.type)}</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-style:normal;color:#e8f4ff;margin-bottom:4px;">${node.name}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:rgba(92,184,232,0.7);letter-spacing:2px;">you have arrived</div>
    `;
    document.body.appendChild(banner);
    onArrival();
    setTimeout(() => banner.remove(), 4000);
  },

  // ── MAIN MAP RENDER ──
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2 + this.offset.x;
    const cy = H / 2 + this.offset.y;

    ctx.clearRect(0, 0, W, H);

    // Background grid — graph paper style ice blue
    const gridSize = 40;
    const gridSmall = 8;

    ctx.strokeStyle = 'rgba(92,184,232,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = (cx % gridSmall); x < W; x += gridSmall) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = (cy % gridSmall); y < H; y += gridSmall) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(92,184,232,0.1)';
    ctx.lineWidth = 0.5;
    for (let x = (cx % gridSize); x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = (cy % gridSize); y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(92,184,232,0.18)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

    // Draw nodes
    App.nodes.forEach(node => {
      const nx = cx + node.x * this.scale;
      const ny = cy + node.y * this.scale;
      this.drawNode(ctx, node, nx, ny);
    });

    // Draw navigation line
    if (this.navigating) {
      const tn = this.navigating;
      const tx = cx + tn.x * this.scale;
      const ty = cy + tn.y * this.scale;

      const alpha = 0.3 + 0.2 * Math.sin(this.navPulse);
      ctx.strokeStyle = `rgba(92,184,232,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // distance label on the line
      if (this.navigating.distanceM) {
        const midX = (cx + tx) / 2;
        const midY = (cy + ty) / 2;
        const dist = this.navigating.distanceM;
        const label = dist > 1000
          ? `${(dist / 1000).toFixed(1)}km`
          : `${Math.round(dist)}m`;
        ctx.fillStyle = 'rgba(8,12,16,0.8)';
        ctx.fillRect(midX - 22, midY - 9, 44, 16);
        ctx.fillStyle = 'rgba(92,184,232,0.8)';
        ctx.font = '9px Space Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
      }
    }

    this.drawSelf(ctx, cx, cy);
  },

  drawNode(ctx, node, x, y) {
    const isNeed = node.needHave === 'need';
    const color = this.nodeColor(node.type);
    const expiringSoon = node.expiresAt && (node.expiresAt - Date.now()) < 5 * 60 * 1000;
    const isNavTarget = this.navigating?.id === node.id;

    // Pulse ring for nav target, SOS or expiring
    if (isNavTarget || node.type === 'sos' || expiringSoon) {
      const pulse = 0.5 + 0.5 * Math.sin(this.navPulse * 2);
      ctx.strokeStyle = isNavTarget ? '#5cb8e8' : color;
      ctx.globalAlpha = pulse * (isNavTarget ? 0.6 : 0.4);
      ctx.lineWidth = isNavTarget ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(x, y, 20 + pulse * (isNavTarget ? 12 : 8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Trust opacity — more confirms = more visible
    const confirms = (node.confirms || []).length;
    const trustAlpha = Math.min(1, 0.3 + confirms * 0.15);

    // Node circle
    ctx.fillStyle = isNeed ? `rgba(255,59,59,${trustAlpha * 0.5})` : `rgba(92,184,232,${trustAlpha * 0.25})`;
    ctx.strokeStyle = isNeed ? '#ff3b3b' : color;
    ctx.globalAlpha = trustAlpha;
    ctx.lineWidth = isNavTarget ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Icon
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(typeIcon(node.type), x, y);

    // Name label
    if (node.name) {
      ctx.font = '9px Space Mono, monospace';
      ctx.fillStyle = isNavTarget ? 'rgba(92,184,232,0.9)' : 'rgba(160,210,245,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(node.name.slice(0, 16), x, y + 24);
    }

    ctx.globalAlpha = 1;

    // Time remaining label
    if (node.expiresAt) {
      const mins = Math.round((node.expiresAt - Date.now()) / 60000);
      const timeLabel = mins > 60 ? `${Math.round(mins/60)}h` : `${mins}m`;
      ctx.font = '7px Space Mono, monospace';
      ctx.fillStyle = expiringSoon ? 'rgba(255,59,92,0.7)' : 'rgba(160,210,245,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText(timeLabel, x, y + 34);
    }
  },

  drawSelf(ctx, x, y) {
    const pulse = 0.5 + 0.5 * Math.sin(this.navPulse);

    ctx.strokeStyle = 'rgba(92,184,232,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 28 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(92,184,232,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 80, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#5cb8e8';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#5cb8e8';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#5cb8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + Math.sin(this.heading) * 14,
      y - Math.cos(this.heading) * 14
    );
    ctx.stroke();
  },

  // ── MINIMAP (Genshin-style rotating) ──
  renderMinimap() {
    const ctx = this.miniCtx;
    const W = this.miniCanvas.width;
    const H = this.miniCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = W / 2 - 2;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(4,8,14,0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.heading);

    const miniScale = 0.15;
    App.nodes
  .filter(n => activeFilter === 'all' || n.type === activeFilter)
  .forEach(node => {
      const nx = node.x * miniScale;
      const ny = node.y * miniScale;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const isNavTarget = this.navigating?.id === node.id;

      if (dist < radius - 8) {
        if (isNavTarget) {
          const pulse = 0.5 + 0.5 * Math.sin(this.navPulse * 2);
          ctx.fillStyle = '#5cb8e8';
          ctx.globalAlpha = 0.3 + 0.4 * pulse;
          ctx.beginPath();
          ctx.arc(nx, ny, 5 + pulse * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#5cb8e8';
          ctx.beginPath();
          ctx.arc(nx, ny, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = this.nodeColor(node.type);
          ctx.beginPath();
          ctx.arc(nx, ny, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const angle = Math.atan2(ny, nx);
        const ex = Math.cos(angle) * (radius - 8);
        const ey = Math.sin(angle) * (radius - 8);

        if (isNavTarget) {
          // pulsating arrow at minimap edge pointing to destination
          const pulse = 0.5 + 0.5 * Math.sin(this.navPulse * 2);
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(angle);
          ctx.globalAlpha = 0.5 + 0.5 * pulse;
          ctx.fillStyle = '#5cb8e8';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#5cb8e8';
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-5, -5);
          ctx.lineTo(-5, 5);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
          ctx.restore();
        } else {
          ctx.font = '10px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(typeIcon(node.type), ex, ey);
        }
      }
    });

    ctx.restore();

    // North indicator
    ctx.fillStyle = 'rgba(160,210,245,0.35)';
    ctx.font = '8px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 10);

    // Self dot
    ctx.fillStyle = '#5cb8e8';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#5cb8e8';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Direction line
    ctx.strokeStyle = '#5cb8e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 10);
    ctx.stroke();

    ctx.restore();

    // Circle border
    ctx.strokeStyle = 'rgba(92,184,232,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Distance on minimap when navigating
    if (this.navigating && this.navigating.distanceM) {
      const dist = this.navigating.distanceM;
      const label = dist > 1000
        ? `${(dist / 1000).toFixed(1)}km`
        : `${Math.round(dist)}m`;
      ctx.fillStyle = 'rgba(8,12,16,0.85)';
      ctx.fillRect(cx - 22, H - 18, 44, 14);
      ctx.fillStyle = 'rgba(92,184,232,0.9)';
      ctx.font = '8px Space Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, H - 8);
    }

    // Peer indicator — vague, no numbers for safety
    document.getElementById('mesh-count').textContent =
      App.meshPeers > 0 ? 'mesh active' : 'scanning...';
  },

  onTap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const tx = e.clientX - rect.left;
    const ty = e.clientY - rect.top;
    const cx = this.canvas.width / 2 + this.offset.x;
    const cy = this.canvas.height / 2 + this.offset.y;

    for (const node of App.nodes) {
      const nx = cx + node.x * this.scale;
      const ny = cy + node.y * this.scale;
      const dist = Math.sqrt((tx - nx) ** 2 + (ty - ny) ** 2);
      if (dist < 24) {
        showNodePopup(node);
        return;
      }
    }

    // Store tapped map position for pin placement
    MapEngine.tapX = (tx - cx) / this.scale;
    MapEngine.tapY = (ty - cy) / this.scale;

    // Convert to lat/lng if GPS origin exists
    if (App.gpsOrigin) {
      const scale = 100000;
      MapEngine.tapLat = App.gpsOrigin.lat - (MapEngine.tapY / scale);
      MapEngine.tapLng = App.gpsOrigin.lng + (MapEngine.tapX / scale);
    }

    // Store tapped map position for pin placement
    MapEngine.tapX = (tx - cx) / this.scale;
    MapEngine.tapY = (ty - cy) / this.scale;

    // Convert to lat/lng if GPS origin exists
    if (App.gpsOrigin) {
      const scale = 100000;
      MapEngine.tapLat = App.gpsOrigin.lat - (MapEngine.tapY / scale);
      MapEngine.tapLng = App.gpsOrigin.lng + (MapEngine.tapX / scale);
    }

    // Tap ripple feedback
    this.showTapRipple(tx, ty);

    closePopup();
  },

  // ── TOUCH PAN ──
  onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      // pinch to zoom
      this.dragging = false;
      this.lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else {
      this.dragging = true;
      this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  },
  onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      // pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.lastPinchDist) {
        const zoomFactor = dist / this.lastPinchDist;
        this.scale = Math.max(0.3, Math.min(8, this.scale * zoomFactor));
        this.render();
      }
      this.lastPinchDist = dist;
    } else if (this.dragging) {
      this.offset.x += e.touches[0].clientX - this.lastTouch.x;
      this.offset.y += e.touches[0].clientY - this.lastTouch.y;
      this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.render();
    }
  },


  showTapRipple(x, y) {
    this.tapRipples = this.tapRipples || [];
    this.tapRipples.push({ x, y, r: 0, alpha: 1, t: Date.now() });
    if (!this.rippleLoop) {
      this.rippleLoop = true;
      const animate = () => {
        this.tapRipples = (this.tapRipples || []).filter(r => r.alpha > 0);
        if (this.tapRipples.length === 0) { this.rippleLoop = false; return; }
        this.tapRipples.forEach(r => {
          r.r += 2.5;
          r.alpha -= 0.04;
          const ctx = this.ctx;
          ctx.strokeStyle = `rgba(92,184,232,${r.alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();

          // small center dot
          ctx.fillStyle = `rgba(92,184,232,${r.alpha * 1.5})`;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  },

  startNavigation(node) {
    this.navigating = node;
  },

  stopNavigation() {
    this.navigating = null;
    this.navTarget = null;
    this.render();
  },

  nodeColor(type) {
    const colors = {
      food:       '#f0c060',
      water:      '#5cb8e8',
      medical:    '#e87890',
      shelter:    '#a088e8',
      power:      '#60e8a8',
      rescue:     '#e8a060',
      checkpoint: '#a8c8e8',
      danger:     '#ff3b5c',
      family:     '#e870a8',
      custom:     '#c8dff0',
      sos:        '#ff3b5c'
    };
    return colors[type] || '#c8dff0';
  }
};