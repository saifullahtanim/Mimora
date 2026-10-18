/**
 * Cracked Screen Prank.
 *
 * Each click lands a photographic glass-impact at the click point. The photo
 * (real shattered glass on black, 1080p/4K webp) is positioned so its impact
 * centre — measured at 48% / 45.5% of the frame — sits exactly under the
 * cursor; mix-blend-mode:screen in the CSS drops the black so only the glass
 * shows over the chosen background, and a feathered radial mask centred on the
 * same anchor fades the photo's own edges out so no rectangle is ever visible.
 * Later impacts are randomly rotated/mirrored around the anchor so repeated
 * clicks never look identical. Screens wider than ~2.5K device pixels get the
 * 4K asset (preloaded at launch); everything else reuses the 1080p image the
 * preview card has already cached. Fullscreen / ESC / exit-bar come from the
 * shared How7oPrank controller; the shatter sound is Web Audio (no asset).
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('crackLaunch');
	var overlay   = document.getElementById('crackOverlay');
	var screenEl  = document.getElementById('crackScreen');
	var shardsEl  = document.getElementById('crackShards');
	var hint      = document.getElementById('crackHint');
	var styleSel  = document.getElementById('crackStyle');
	var autoChk   = document.getElementById('crackAuto');
	var soundChk  = document.getElementById('crackSound');

	if (!launchBtn || !overlay || !screenEl || !shardsEl) return;

	// Impact centre of the photo, as fractions of its 16:9 frame.
	var ANCHOR_X = 0.48;
	var ANCHOR_Y = 0.455;
	var ASPECT   = 16 / 9;
	var MAX_SHARDS = 8;

	var SRC_1080 = screenEl.getAttribute('data-crack-1080') || '';
	var SRC_4K   = screenEl.getAttribute('data-crack-4k') || SRC_1080;

	// Physical panel resolution decides the asset; CSS pixels understate it on
	// retina/4K displays, so scale by devicePixelRatio.
	var devicePx = Math.max(window.screen.width || 0, window.screen.height || 0) *
		(window.devicePixelRatio || 1);
	var CRACK_SRC = devicePx >= 2560 ? SRC_4K : SRC_1080;

	var preloaded = false;
	function preload() {
		if (preloaded || !CRACK_SRC) return;
		preloaded = true;
		var img = new Image();
		img.src = CRACK_SRC;
	}

	var firstImpact = true;
	var soundOn = true;
	var audioCtx = null;

	function hideHint() { if (hint) hint.classList.add('is-hidden'); }

	/* ---------- Land one glass impact with its centre at (x, y) in screen px ---------- */
	function stampAt(x, y, scale, rot, flip) {
		var rect = screenEl.getBoundingClientRect();
		if (!rect.width || !rect.height) return;

		var w = Math.max(rect.width, rect.height) * scale;
		var h = w / ASPECT;

		var img = document.createElement('img');
		img.className = 'crack-shard';
		img.src = CRACK_SRC;
		img.alt = '';
		img.setAttribute('aria-hidden', 'true');
		img.draggable = false;
		img.style.width = w + 'px';
		img.style.height = h + 'px';
		img.style.left = (x - ANCHOR_X * w) + 'px';
		img.style.top = (y - ANCHOR_Y * h) + 'px';
		img.style.setProperty('--rot', rot + 'deg');
		img.style.setProperty('--flip', flip);
		shardsEl.appendChild(img);

		// Cap the number of live stamps so heavy clicking stays smooth.
		while (shardsEl.children.length > MAX_SHARDS) {
			shardsEl.removeChild(shardsEl.firstChild);
		}
	}

	function crackAt(x, y) {
		if (firstImpact) {
			// First hit: the whole screen shatters — the full photo at exact
			// viewport cover, regardless of where the click landed.
			coverStamp();
		} else {
			stampAt(
				x, y,
				0.5 + Math.random() * 0.35,
				Math.floor(Math.random() * 360),
				Math.random() < 0.5 ? 1 : -1
			);
		}
	}

	// Lay the photo so it exactly covers the viewport (object-fit:cover
	// placement, expressed as an anchored stamp) — the classic static
	// broken-screen look. Used by "start already cracked".
	function coverStamp() {
		var rect = screenEl.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		var scale = Math.max(rect.width, rect.height * ASPECT) / Math.max(rect.width, rect.height);
		stampAt(rect.width * ANCHOR_X, rect.height * ANCHOR_Y, scale, 0, 1);
		firstImpact = false;
	}

	function clearShards() {
		while (shardsEl.firstChild) shardsEl.removeChild(shardsEl.firstChild);
		firstImpact = true;
	}

	/* ---------- Glass-shatter sound (Web Audio, no asset) ---------- */
	function playCrack() {
		if (!soundOn) return;
		try {
			audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
			if (audioCtx.state === 'suspended') audioCtx.resume();
			var t = audioCtx.currentTime;

			// Impact thump.
			var thump = audioCtx.createOscillator();
			var tg = audioCtx.createGain();
			thump.type = 'sine';
			thump.frequency.setValueAtTime(150, t);
			thump.frequency.exponentialRampToValueAtTime(45, t + 0.11);
			tg.gain.setValueAtTime(0.5, t);
			tg.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
			thump.connect(tg); tg.connect(audioCtx.destination);
			thump.start(t); thump.stop(t + 0.14);

			// Fracture noise burst.
			var dur = 0.22;
			var len = Math.floor(audioCtx.sampleRate * dur);
			var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
			var data = buf.getChannelData(0);
			for (var i = 0; i < len; i++) {
				data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
			}
			var src = audioCtx.createBufferSource();
			src.buffer = buf;
			var hp = audioCtx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.value = 1600;
			var ng = audioCtx.createGain();
			ng.gain.setValueAtTime(0.55, t);
			ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
			src.connect(hp); hp.connect(ng); ng.connect(audioCtx.destination);
			src.start(t);

			// Falling glass tinkles.
			for (var k = 0; k < 5; k++) {
				var osc = audioCtx.createOscillator();
				var og = audioCtx.createGain();
				osc.type = 'triangle';
				osc.frequency.setValueAtTime(2200 + Math.random() * 4200, t);
				var st = t + 0.02 + k * 0.035 + Math.random() * 0.02;
				og.gain.setValueAtTime(0.0001, st);
				og.gain.linearRampToValueAtTime(0.14, st + 0.005);
				og.gain.exponentialRampToValueAtTime(0.001, st + 0.13);
				osc.connect(og); og.connect(audioCtx.destination);
				osc.start(st); osc.stop(st + 0.15);
			}
		} catch (e) { /* silent — sound is non-essential */ }
	}

	/* ---------- Interaction ---------- */
	screenEl.addEventListener('click', function (e) {
		var rect = screenEl.getBoundingClientRect();
		crackAt(e.clientX - rect.left, e.clientY - rect.top);
		playCrack();
		hideHint();
	});

	function onExit() {
		hideHint();
		if (audioCtx && audioCtx.state === 'running') {
			try { audioCtx.suspend(); } catch (e) { /* silent */ }
		}
	}

	function setClocks() {
		var d = new Date();
		var h = d.getHours(), m = d.getMinutes();
		var mm = (m < 10 ? '0' : '') + m;
		var h12 = h % 12 || 12;
		var bar = document.getElementById('crackBarClock');
		var lock = document.getElementById('crackLockClock');
		if (bar) bar.textContent = h12 + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM');
		if (lock) lock.textContent = h12 + ':' + mm;
	}

	launchBtn.addEventListener('click', function () {
		preload();
		clearShards();
		screenEl.setAttribute('data-style', styleSel ? styleSel.value : 'black');
		soundOn = soundChk ? soundChk.checked : false;
		if (hint) hint.classList.remove('is-hidden');
		setClocks();

		window.How7oPrank.launch(overlay, { onExit: onExit });

		if (autoChk && autoChk.checked) {
			hideHint();
			setTimeout(function () {
				coverStamp();
				playCrack();
			}, 260);
		}
	});

	// Warm the cache while the visitor is still reading the settings panel.
	launchBtn.addEventListener('mouseenter', preload, { once: true });

})();
