/**
 * Fake Android Update Screen — classic recovery installer and modern Settings
 * update page. Pure animation: nothing on the phone is updated or changed.
 *
 * Timing reads only requestAnimationFrame timestamps and performance.now(),
 * so one clock drives every phase.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fauLaunch');
	var overlay = document.getElementById('fauOverlay');
	var screen = document.getElementById('fauScreen');
	var view = screen && screen.querySelector('.fau-view');
	var preview = document.querySelector('.fau-phone .fau-view');
	if (!launchBtn || !overlay || !view || !window.How7oPrank) return;

	function byId(id) { return document.getElementById(id); }
	var ctl = {
		style: byId('fauStyle'),
		version: byId('fauVersion'),
		theme: byId('fauTheme'),
		start: byId('fauStart'),
		speed: byId('fauSpeed'),
		fail: byId('fauFail')
	};
	var rows = { version: byId('fauVersionRow'), theme: byId('fauThemeRow'), fail: byId('fauFailRow') };

	var DURATIONS = { slow: 180000, normal: 60000, fast: 25000 };
	var STYLES = {
		classic: [
			{ name: 'install',  share: 0.66, progress: true },
			{ name: 'reboot',   share: 0.03 },
			{ name: 'upgrade',  share: 0.25, counter: true },
			{ name: 'starting', share: 0.03 },
			{ name: 'reboot2',  share: 0.03 }
		],
		modern: [
			{ name: 'prepare',    share: 0.08, wave: 'indeterminate' },
			{ name: 'download',   share: 0.27, progress: true },
			{ name: 'install',    share: 0.45, progress: true },
			{ name: 'restarting', share: 0.04, wave: 'indeterminate' },
			{ name: 'black',      share: 0.03 },
			{ name: 'boot',       share: 0.10 },
			{ name: 'black2',     share: 0.03 }
		]
	};
	var FAIL = [{ name: 'blank', share: 0.03 }, { name: 'nocommand', share: Infinity }];
	// Plateaus at 27% and 66%: the update visibly sticks, then carries on.
	var CURVE = [[0, 0], [0.22, 0.18], [0.32, 0.27], [0.42, 0.27], [0.66, 0.66], [0.75, 0.66], [0.94, 0.94], [1, 1]];
	var MODERN_TEXT = {
		prepare:    ['Preparing system update…',   'Downloading and installing update'],
		download:   ['System update downloading…', 'Downloading and installing update'],
		install:    ['Installing system update…',  'Optimizing your device, this may take a while'],
		restarting: ['Restarting…',                'Optimizing your device, this may take a while']
	};

	var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	var running = false, style = 'classic', seq = STYLES.classic, idx = 0;
	var phaseStart = 0, phaseDur = 0, startPct = 0, cycleMs = DURATIONS.normal;
	var failOn = false, counterMax = 147, frameId = null, wakeLock = null, clockAt = -Infinity;

	function curve(t) {
		for (var i = 1; i < CURVE.length; i++) {
			if (t <= CURVE[i][0]) {
				var a = CURVE[i - 1], b = CURVE[i];
				return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
			}
		}
		return 1;
	}

	/* ---------- Icosahedron in the robot's chest ---------- */
	var PHI = (1 + Math.sqrt(5)) / 2;
	var VERTS = [
		[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
		[0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
		[PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
	];
	// Faces are the vertex triples whose three edges all have length 2.
	var FACES = (function () {
		function d2(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; }
		var f = [], n = VERTS.length;
		for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) for (var k = j + 1; k < n; k++) {
			if (Math.abs(d2(VERTS[i], VERTS[j]) - 4) < 1e-6 && Math.abs(d2(VERTS[j], VERTS[k]) - 4) < 1e-6 && Math.abs(d2(VERTS[i], VERTS[k]) - 4) < 1e-6) f.push([i, j, k]);
		}
		return f;
	})();
	var ICO_SCALE = 27 / Math.sqrt(1 + PHI * PHI);
	var LIGHT = (function () { var l = [-0.45, -0.6, 0.66], m = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();

	function drawIco(root, angle) {
		var polys = root.querySelectorAll('.fau-ico polygon');
		if (polys.length < FACES.length) return;
		var ca = Math.cos(angle), sa = Math.sin(angle), ct = Math.cos(0.42), st = Math.sin(0.42);
		var P = VERTS.map(function (v) {
			var x = v[0] * ca + v[2] * sa, z = -v[0] * sa + v[2] * ca, y = v[1];
			return [x * ICO_SCALE, (y * ct - z * st) * ICO_SCALE, (y * st + z * ct) * ICO_SCALE];
		});
		var vis = [];
		FACES.forEach(function (f) {
			var a = P[f[0]], b = P[f[1]], c = P[f[2]];
			var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
			var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
			var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
			var cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
			if (nx * cx + ny * cy + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; } // outward
			if (nz <= 0) return;
			var m = Math.sqrt(nx * nx + ny * ny + nz * nz);
			var lum = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / m);
			vis.push({ z: cz, lum: lum, pts: [a, b, c] });
		});
		vis.sort(function (p, q) { return p.z - q.z; });
		for (var i = 0; i < polys.length; i++) {
			var poly = polys[i], face = vis[i];
			if (!face) { poly.setAttribute('visibility', 'hidden'); continue; }
			poly.setAttribute('points', face.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '));
			// Deep blue in shadow to pale blue facing the light.
			var l = 0.25 + 0.75 * face.lum;
			poly.setAttribute('fill', 'rgb(' + Math.round(20 + 120 * l) + ',' + Math.round(90 + 120 * l) + ',' + Math.round(170 + 80 * l) + ')');
			poly.setAttribute('visibility', 'visible');
		}
	}

	/* ---------- Material wavy progress line ---------- */
	function drawWave(root, pct, mode, now) {
		var wave = root.querySelector('.fau-wave');
		if (!wave) return;
		var svg = wave.querySelector('.fau-wave-svg');
		var path = wave.querySelector('.fau-wave-path');
		var track = wave.querySelector('.fau-wave-track');
		var W = wave.clientWidth || 300, H = wave.clientHeight || 16;
		var mid = H / 2, amp = H * 0.22, len = Math.max(H * 2.6, 10), gap = H * 0.55;
		var shift = reduceMotion ? 0 : (now / 1000) * Math.PI * 1.8;
		var x0, x1;
		if (mode === 'indeterminate') {
			var seg = W * 0.35, pos = ((now % 1700) / 1700) * (W + seg) - seg;
			x0 = Math.max(0, pos); x1 = Math.min(W, pos + seg);
			if (reduceMotion) { x0 = 0; x1 = W * 0.35; }
		} else {
			x0 = 0; x1 = W * Math.max(0, Math.min(100, pct)) / 100;
		}
		svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
		var d = '';
		if (x1 - x0 >= 1) {
			for (var x = x0; x <= x1 + 0.01; x += 2) {
				var xx = Math.min(x, x1);
				d += (d ? 'L' : 'M') + xx.toFixed(1) + ' ' + (mid + amp * Math.sin((xx / len) * 2 * Math.PI - shift)).toFixed(2);
			}
		}
		path.setAttribute('d', d);
		var t = '';
		if (d && x0 - gap > 0) t += 'M0 ' + mid + 'H' + (x0 - gap).toFixed(1);
		var tStart = d ? x1 + gap : 0;
		if (tStart < W) t += 'M' + tStart.toFixed(1) + ' ' + mid + 'H' + W.toFixed(1);
		track.setAttribute('d', t);
		// Indeterminate progress has no value (WAI-ARIA), so drop it rather than announce 0%.
		if (mode === 'indeterminate') wave.removeAttribute('aria-valuenow');
		else wave.setAttribute('aria-valuenow', String(Math.floor(pct)));
	}

	/* ---------- Status-bar clock ---------- */
	function clockText() {
		var d = new Date(), s = '';
		try { s = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { s = ''; }
		s = s.replace(/\s*[ap]\.?\s*m\.?\s*$/i, '').replace(/^\s*[ap]\.?\s*m\.?\s*/i, '').trim();
		if (!/^\d{1,2}:\d{2}$/.test(s)) s = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
		return s;
	}

	function setClock(root) {
		var c = root.querySelector('.fau-clock');
		if (c) c.textContent = clockText();
	}

	/* ---------- Screen wake lock (phones dim after ~30 s otherwise) ---------- */
	function requestWake() {
		try {
			if (!navigator.wakeLock || !navigator.wakeLock.request) return;
			navigator.wakeLock.request('screen').then(function (lock) {
				// Exited meanwhile, or another request already won: don't orphan a lock.
				if (!running || wakeLock) { lock.release(); return; }
				wakeLock = lock;
				lock.addEventListener('release', function () { if (wakeLock === lock) wakeLock = null; });
			}).catch(function () {});
		} catch (e) { /* unsupported */ }
	}

	function releaseWake() {
		var lock = wakeLock;
		wakeLock = null;
		if (lock) { try { lock.release(); } catch (e) { /* already released */ } }
	}

	// The browser drops the lock whenever the tab is hidden; take it back on return.
	document.addEventListener('visibilitychange', function () {
		if (running && !wakeLock && document.visibilityState === 'visible') requestWake();
	});

	/* ---------- Settings → view ---------- */
	function applySettings(root) {
		root.setAttribute('data-style', ctl.style.value === 'modern' ? 'modern' : 'classic');
		root.setAttribute('data-theme', ctl.theme.value === 'light' ? 'light' : 'dark');
		var v = root.querySelector('.fau-version');
		if (v) v.textContent = ctl.version.value;
	}

	function syncSettings() {
		var modern = ctl.style.value === 'modern';
		rows.version.hidden = !modern;
		rows.theme.hidden = !modern;
		rows.fail.hidden = modern;
		if (!preview) return;
		applySettings(preview);
		preview.setAttribute('data-phase', 'install');
		if (modern) {
			setClock(preview);
			drawWave(preview, 58, 'determinate', 0);
		} else {
			drawIco(preview, 0.6);
		}
	}

	/* ---------- Phase machine ---------- */
	function render(t, now) {
		var ph = seq[idx];
		var pct = ph.progress ? startPct + (100 - startPct) * curve(t) : 100;
		if (style === 'classic') {
			if (ph.name === 'install') {
				var bar = view.querySelector('.fau-recovery-bar');
				view.querySelector('.fau-recovery-fill').style.width = pct.toFixed(2) + '%';
				bar.setAttribute('aria-valuenow', String(Math.floor(pct)));
			} else if (ph.counter) {
				var n = Math.max(1, Math.min(counterMax, Math.ceil(t * counterMax)));
				view.querySelector('.fau-dialog-msg').textContent = 'Optimizing app ' + n + ' of ' + counterMax + '.';
			} else if (ph.name === 'starting') {
				view.querySelector('.fau-dialog-msg').textContent = 'Starting apps.';
			}
		} else if (ph.progress) {
			drawWave(view, pct, 'determinate', now);
		} else if (ph.wave) {
			drawWave(view, 0, 'indeterminate', now);
		}
	}

	function beginPhase(i, initialPct, now) {
		idx = i;
		var ph = seq[i];
		startPct = initialPct || 0;
		phaseStart = now;
		phaseDur = ph.share === Infinity ? Infinity : cycleMs * ph.share * (ph.progress ? 1 - startPct / 100 : 1);
		view.setAttribute('data-phase', ph.name);
		if (ph.counter) counterMax = 120 + Math.floor(Math.random() * 61);
		if (style === 'modern' && MODERN_TEXT[ph.name]) {
			view.querySelector('.fau-headline').textContent = MODERN_TEXT[ph.name][0];
			view.querySelector('.fau-subtitle').textContent = MODERN_TEXT[ph.name][1];
		}
		render(0, now);
	}

	function advance(now) {
		if (seq === FAIL) {
			beginPhase(Math.min(idx + 1, FAIL.length - 1), 0, now);
		} else if (failOn && seq[idx].name === 'install') {
			seq = FAIL;
			beginPhase(0, 0, now);
		} else {
			beginPhase((idx + 1) % seq.length, 0, now);
		}
	}

	function frame(now) {
		if (!running) return;
		var t = phaseDur === Infinity ? 0 : Math.min(1, Math.max(0, now - phaseStart) / phaseDur);
		render(t, now);
		if (style === 'classic' && seq[idx].name === 'install') {
			drawIco(view, reduceMotion ? 0.6 : now / 1000 * 1.7);
		}
		if (style === 'modern' && now - clockAt >= 1000) {
			clockAt = now;
			setClock(view);
		}
		if (t >= 1) advance(now);
		frameId = requestAnimationFrame(frame);
	}

	function stop() {
		running = false;
		if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
		releaseWake();
	}

	launchBtn.addEventListener('click', function () {
		stop();
		style = ctl.style.value === 'modern' ? 'modern' : 'classic';
		seq = STYLES[style];
		cycleMs = DURATIONS[ctl.speed.value] || DURATIONS.normal;
		failOn = style === 'classic' && !!ctl.fail.checked;
		var initial = parseInt(ctl.start.value, 10);
		if (!isFinite(initial) || initial < 0 || initial > 99) initial = 0;

		applySettings(view);
		overlay.setAttribute('aria-hidden', 'false');
		window.How7oPrank.launch(overlay, {
			onExit: function () { stop(); overlay.setAttribute('aria-hidden', 'true'); }
		});
		running = true;
		requestWake();

		var now = performance.now();
		clockAt = now;
		setClock(view);
		var installAt = 0;
		for (var i = 0; i < seq.length; i++) if (seq[i].name === 'install') installAt = i;
		beginPhase(initial > 0 ? installAt : 0, initial, now);
		drawIco(view, 0);
		frameId = requestAnimationFrame(frame);
	});

	Object.keys(ctl).forEach(function (k) {
		if (ctl[k]) ctl[k].addEventListener('change', syncSettings);
	});
	window.addEventListener('resize', function () {
		if (preview && ctl.style.value === 'modern') drawWave(preview, 58, 'determinate', 0);
	});
	syncSettings();
	if (preview) drawIco(preview, 0.6);
})();
