// ── UI.JS — UI helpers, tooltip tour, quiet moments ──

// Enter key on name input
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('name-input');
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enterApp();
    });
  }
});

// Prevent default touch behaviors on map
document.addEventListener('touchmove', (e) => {
  if (e.target.id === 'main-map') e.preventDefault();
}, { passive: false });


// ── TOOLTIP TOUR ──
const Tour = {
  steps: [
    {
      targetId: 'add-btn',
      text: 'tap anywhere on the map first, then tap here to mark a place for others',
      position: 'top'
    },
    {
      targetId: 'add-btn',
      text: '⚠ use a name only locals know. "the blue door." "abu\'s place." never a real street name. the more people name places this way, the more useful your map becomes.',
      position: 'top',
      warning: true
    },
    {
      targetId: 'sos-btn',
      text: 'sends a silent distress signal to everyone nearby. no sound. use only when you truly need help.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(2) button',
      text: '◉  tell people nearby you are safe, injured, or need help. silent. no sound ever.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(4) button',
      text: '⌕  search all pins by name or type — food, water, shelter, medical.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(5) button',
      text: '✎  leave a note for everyone nearby. use only names locals would understand. never real street names.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(6) button',
      text: '⇄  share all your pins with someone nearby using a QR code. works with no internet at all.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(7) button',
      text: '♡  post a name. everyone nearby sees it. use this to find people you have lost.',
      position: 'top'
    },
    {
      selector: '#bottom-controls > div:nth-child(8) button',
      text: '♪  propose a song. everyone nearby votes. majority plays it on all devices at once.',
      position: 'top'
    },
    {
      targetId: 'main-map',
      text: 'the map is blank on purpose. tap anywhere to choose where to drop a pin.',
      position: 'center'
    },
    {
      targetId: 'minimap-container',
      text: 'when navigating to a pin, walk toward the arrow. distance shows at the bottom of this circle.',
      position: 'left'
    },
    {
      targetId: 'ymir-logo',
      text: 'hold this for 3 seconds to erase everything on this device instantly. nothing left to find.',
      position: 'bottom',
      warning: true
    }
  ],

  current: 0,
  tooltipEl: null,

  start() {
    if (localStorage.getItem('dm_tour_done')) return;
    this.current = 0;
    setTimeout(() => this.showStep(0), 1000);
  },

  showStep(index) {
    this.removeTooltip();
    if (index >= this.steps.length) {
      this.finish();
      return;
    }

    const step = this.steps[index];
    const target = step.targetId
      ? document.getElementById(step.targetId)
      : step.selector
      ? document.querySelector(step.selector)
      : null;

    if (!target && !step.targetId && !step.selector) {
      this.showStep(index + 1);
      return;
    }

    const box = target ? target.getBoundingClientRect() : null;

    const tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 9999;
      max-width: 220px;
      background: rgba(8,12,16,0.97);
      border: 1px solid ${step.warning ? 'rgba(255,59,92,0.4)' : 'rgba(92,184,232,0.35)'};
      border-radius: 10px;
      padding: 14px 16px;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: ${step.warning ? 'rgba(255,160,160,0.9)' : 'rgba(160,210,245,0.85)'};
      line-height: 1.7;
      letter-spacing: 0.5px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      animation: fadeIn 0.3s ease;
    `;

    // position tooltip
    if (box) {
      if (step.position === 'top') {
        // always show above center of screen, left-aligned to target
        tooltip.style.bottom = `${window.innerHeight - box.top + 16}px`;
        tooltip.style.left = `${Math.max(12, Math.min(box.left - 10, window.innerWidth - 244))}px`;
        // clamp so it never goes off top
        const estimatedTop = box.top - 160;
        if (estimatedTop < 80) {
          tooltip.style.bottom = '';
          tooltip.style.top = `${box.bottom + 12}px`;
        }
      } else if (step.position === 'left') {
        tooltip.style.top = `${Math.max(70, box.top - 20)}px`;
        tooltip.style.right = `${window.innerWidth - box.left + 12}px`;
      } else if (step.position === 'bottom') {
        tooltip.style.top = `${box.bottom + 12}px`;
        tooltip.style.right = '16px';
      } else {
        tooltip.style.top = '30%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
      }
    } else {
      tooltip.style.top = '30%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';
    }

    // highlight target
    if (target && step.target !== 'main-map') {
      target.style.transition = 'box-shadow 0.3s';
      target.style.boxShadow = step.warning
        ? '0 0 0 2px rgba(255,59,92,0.5), 0 0 20px rgba(255,59,92,0.2)'
        : '0 0 0 2px rgba(92,184,232,0.5), 0 0 20px rgba(92,184,232,0.2)';
      this.highlightedEl = target;
    }

    // buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

    const nextBtn = document.createElement('button');
    nextBtn.textContent = index === this.steps.length - 1 ? 'done' : 'next →';
    nextBtn.style.cssText = `flex:1;padding:8px;background:transparent;border:1px solid ${step.warning ? 'rgba(255,59,92,0.3)' : 'rgba(92,184,232,0.3)'};color:${step.warning ? 'rgba(255,120,120,0.8)' : 'rgba(92,184,232,0.8)'};font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;cursor:pointer;border-radius:6px;`;
    nextBtn.onclick = () => this.showStep(index + 1);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'skip tour';
    skipBtn.style.cssText = `padding:8px 10px;background:transparent;border:none;color:rgba(160,210,245,0.25);font-family:'Space Mono',monospace;font-size:8px;cursor:pointer;`;
    skipBtn.onclick = () => this.finish();

    btnRow.appendChild(nextBtn);
    btnRow.appendChild(skipBtn);
    tooltip.appendChild(document.createTextNode(step.text));
    tooltip.appendChild(btnRow);

    document.body.appendChild(tooltip);
    this.tooltipEl = tooltip;
    this.current = index;
  },

  removeTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
    if (this.highlightedEl) {
      this.highlightedEl.style.boxShadow = '';
      this.highlightedEl = null;
    }
  },

  finish() {
    this.removeTooltip();
    localStorage.setItem('dm_tour_done', '1');
    QuietMoment.show('you\'re ready. start with what you need right now.');
  }
};


// ── QUIET MOMENTS ──
const QuietMoment = {
  queue: [],
  showing: false,

  show(text, color) {
    this.queue.push({ text, color: color || 'rgba(160,210,245,0.7)' });
    if (!this.showing) this.next();
  },

  next() {
    if (this.queue.length === 0) { this.showing = false; return; }
    this.showing = true;
    const { text, color } = this.queue.shift();

    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      color: ${color};
      letter-spacing: 2px;
      text-align: center;
      z-index: 800;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.6s ease;
      white-space: nowrap;
    `;
    el.textContent = text;
    document.body.appendChild(el);

    setTimeout(() => el.style.opacity = '1', 50);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        setTimeout(() => this.next(), 300);
      }, 600);
    }, 3500);
  }
};


// ── FIRST MAP HINT ──
const MapHint = {
  shown: false,
  show() {
    if (this.shown || localStorage.getItem('dm_maphint_done')) return;
    this.shown = true;
    setTimeout(() => {
      const el = document.createElement('div');
      el.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-family: 'Space Mono', monospace;
        font-size: 9px;
        color: rgba(160,210,245,0.5);
        letter-spacing: 2px;
        text-align: center;
        z-index: 50;
        pointer-events: none;
        line-height: 2;
      `;
      el.innerHTML = 'tap the map to choose a location<br>then tap + to mark it';
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity 1s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 1000);
      }, 4000);
      localStorage.setItem('dm_maphint_done', '1');
    }, 1500);
  }
};


// ── PIN QUIET MOMENTS ──
// Call these from app.js at the right moments

function onPinConfirmed(node) {
  const count = (node.confirms || []).length;
  if (count === 1) QuietMoment.show('someone found this.');
  if (count === 5) QuietMoment.show('this is helping people.');
  if (count === 10) QuietMoment.show('many people have found this.');
}

function onQRScanned(addedCount) {
  if (addedCount > 0) QuietMoment.show('your map is now with someone else.');
}

function onFamilyPosted() {
  QuietMoment.show('your post is reaching people nearby.');
}

function onArrival() {
  QuietMoment.show('you found it.', 'rgba(168,244,200,0.8)');
}

function onStatusSent(status) {
  if (status === 'safe') QuietMoment.show('people nearby know you are safe.', 'rgba(168,244,200,0.7)');
  if (status === 'injured') QuietMoment.show('people nearby know you need medical help.', 'rgba(255,214,160,0.7)');
  if (status === 'help') QuietMoment.show('your signal has been sent.', 'rgba(255,120,120,0.7)');
}