/**
 * Fake Console Update Screen — Xbox / PlayStation / Nintendo Switch.
 *
 * Xbox prepares the console, then uses the dark "Updating..." layout with
 * three stage segments and separate overall progress. After 100% it briefly
 * goes black before preparing the next cycle.
 * The other styles repeat after a simulated error. Optional interaction
 * warnings are off by default; fullscreen and exit controls are shared.
 * No console is contacted and no update is downloaded.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fconLaunch');
	var overlay   = document.getElementById('fconOverlay');
	var screenEl  = document.getElementById('fconScreen');
	var titleEl   = document.getElementById('fconTitle');
	var subEl     = document.getElementById('fconSub');
	var pctEl     = document.getElementById('fconPct');
	var barFill   = document.getElementById('fconBarFill');
	var ringFill  = document.getElementById('fconRingFill');
	var footEl    = document.getElementById('fconFoot');
	var nagEl     = document.getElementById('fconNag');
	var nagMsg    = document.getElementById('fconNagMsg');
	var xboxTitle = overlay && overlay.querySelector('.fcon-xbox-title');
	var xboxNotice = overlay && overlay.querySelector('.fcon-xbox-notice');
	var xboxStep  = overlay && overlay.querySelector('.fcon-xbox-step');
	var xboxTotal = overlay && overlay.querySelector('.fcon-xbox-total');
	var xboxProgress = overlay && overlay.querySelector('.fcon-xbox-progress');
	var xboxBars = overlay ? overlay.querySelectorAll('.fcon-xbox-segments i') : [];

	var skinSel  = document.getElementById('fconSkin');
	var speedSel = document.getElementById('fconSpeed');
	var startSel = document.getElementById('fconStart');
	var nagChk   = document.getElementById('fconNagOn');

	if (!launchBtn || !overlay || !screenEl) return;

	/* Circumference of the r=54 ring in the markup (2 * PI * 54). */
	var RING_LEN = 339.292;

	var COPY = {
		xbox: {
			stages: [
				{ label: 'Downloading' },
				{ label: 'Verifying' },
				{ label: 'Applying' }
			],
			foot: "Don't turn off your console",
			nag:  "Don't turn off your console"
		},
		ps: {
			stages: [
				{ title: 'Preparing to install…',        sub: 'Do not turn off the power until this is complete.' },
				{ title: 'Installing update file 1 of 1', sub: 'The system will restart automatically.' },
				{ title: 'Updating system software',      sub: 'Do not turn off the power or remove the disc.' }
			],
			fail: { title: 'An error has occurred (CE-34878-0)', sub: 'Cannot continue the update. Restarting the process.' },
			foot: 'Do not turn off the power.',
			nag:  'Do not turn off the power.'
		},
		'switch': {
			stages: [
				{ title: 'Downloading update…',   sub: 'Please do not turn off the power.' },
				{ title: 'Updating…',             sub: 'The console will restart when the update is complete.' },
				{ title: 'Applying system update', sub: 'Please do not turn off the power.' }
			],
			fail: { title: 'The update could not be completed.', sub: 'Error Code: 2110-3127. Trying again.' },
			foot: 'Do not turn off the power.',
			nag:  'Please do not turn off the power.'
		}
	};

	/* Milliseconds per stage. Three stages per cycle, so slow ~3 min. */
	var DURATIONS = { slow: 60000, normal: 20000, fast: 7000 };

	/*
	 * Progress is not linear — real console updates crawl, sit on one number
	 * long enough to worry you, then jump. Two deliberate plateaus (27% and
	 * 66%) do most of the work of selling it.
	 */
	var CURVE = [
		[0, 0], [0.18, 0.14], [0.30, 0.27], [0.38, 0.27],
		[0.55, 0.52], [0.70, 0.66], [0.80, 0.66], [0.92, 0.93], [1, 1]
	];

	function curve(t) {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		for (var i = 1; i < CURVE.length; i++) {
			if (t <= CURVE[i][0]) {
				var a = CURVE[i - 1], b = CURVE[i];
				var span = b[0] - a[0];
				var f = span ? (t - a[0]) / span : 0;
				return a[1] + (b[1] - a[1]) * f;
			}
		}
		return 1;
	}

	var copy, duration, startPct, nagOn, skin;
	var initialStage = 0, initialPct = 0;
	// Simulated weighting matches the visible checkpoints in the video.
	// Overall progress is independent of the three equally sized stage tracks.
	var XBOX_RANGES = [1, 51, 66, 100];
	var XBOX_STAGE_TIMES = [1.2, 0.3, 1.5];
	var stage = 0, running = false, waiting = false;
	var stageStart = 0, raf = null, phaseTimer = null, nagTimer = null;

	function render(p) {
		var v = Math.max(0, Math.min(100, p));
		if (skin === 'xbox') {
			// Preserve exact selected percentages through floating-point conversion.
			var weighted = XBOX_RANGES[stage] + (XBOX_RANGES[stage + 1] - XBOX_RANGES[stage]) * v / 100;
			var overall = stage === 0 ? Math.ceil(weighted - 1e-7) : Math.floor(weighted + 1e-7);
			if (xboxStep) xboxStep.textContent = 'Step ' + (stage + 1) + ' of 3: ' + copy.stages[stage].label + ' (' + Math.floor(v) + '%)';
			if (xboxTotal) xboxTotal.textContent = overall + '%';
			if (xboxProgress) {
				xboxProgress.setAttribute('aria-valuenow', String(overall));
				xboxProgress.setAttribute('aria-valuetext', copy.stages[stage].label + ': ' + Math.floor(v) + '%, overall ' + overall + '%');
			}
			for (var i = 0; i < xboxBars.length; i++) {
				xboxBars[i].style.width = (i < stage ? 100 : i === stage ? v : 0) + '%';
			}
			return;
		}
		if (pctEl) pctEl.textContent = Math.floor(v) + '%';
		if (barFill) barFill.style.width = v + '%';
		if (ringFill) ringFill.style.strokeDashoffset = String(RING_LEN * (1 - v / 100));
	}

	function setStageCopy(s) {
		if (titleEl) titleEl.textContent = s.title;
		if (subEl) subEl.textContent = s.sub;
	}

	function beginStage(i) {
		stage = i;
		waiting = false;
		screenEl.setAttribute('data-phase', 'run');
		if (skin === 'xbox') {
			xboxTitle.textContent = 'Updating...';
			xboxNotice.textContent = 'Your console will restart during the update.';
		} else {
			setStageCopy(copy.stages[i]);
		}
		stageStart = Date.now();
		render(i === initialStage ? initialPct : 0);
	}

	function beginXboxPreparation() {
		waiting = true;
		initialStage = 0;
		initialPct = 0;
		screenEl.setAttribute('data-phase', 'prepare');
		xboxTitle.textContent = 'Preparing console...';
		xboxNotice.textContent = "Don't turn off or unplug your console.";
		xboxStep.textContent = '';
		xboxTotal.textContent = '0%';
		xboxProgress.setAttribute('aria-valuenow', '0');
		xboxProgress.setAttribute('aria-valuetext', 'Preparing console');
		for (var i = 0; i < xboxBars.length; i++) xboxBars[i].style.width = '0%';
		phaseTimer = setTimeout(function () {
			if (!running) return;
			beginStage(0);
			raf = requestAnimationFrame(frame);
		}, Math.max(1400, duration * 0.18));
	}

	function beginXboxRestart() {
		waiting = true;
		render(100);
		screenEl.setAttribute('data-phase', 'complete');
		// Leave Applying (100%) visible before the screen goes black.
		phaseTimer = setTimeout(function () {
			if (!running) return;
			screenEl.setAttribute('data-phase', 'restart');
			if (nagEl) { nagEl.hidden = true; nagEl.classList.remove('is-on'); }
			phaseTimer = setTimeout(function () {
				if (running) beginXboxPreparation();
			}, 1600);
		}, 900);
	}

	function beginFail() {
		waiting = true;
		screenEl.setAttribute('data-phase', 'fail');
		setStageCopy(copy.fail);
		render(100);
		phaseTimer = setTimeout(function () {
			if (!running) return;
			initialStage = 0;
			initialPct = 0;
			beginStage(0);
			raf = requestAnimationFrame(frame);
		}, 3600);
	}

	function frame() {
		if (!running || waiting) return;

		var elapsed = Date.now() - stageStart;
		var stageDuration = duration * (skin === 'xbox' ? XBOX_STAGE_TIMES[stage] : 1);
		var t = Math.min(1, elapsed / stageDuration);
		var base = (stage === initialStage) ? initialPct : 0;
		var p = base + (100 - base) * curve(t);
		render(p);

		if (t >= 1) {
			if (stage < copy.stages.length - 1) {
				beginStage(stage + 1);
			} else {
				// Xbox restarts; the other styles show their simulated error.
				if (skin === 'xbox') beginXboxRestart();
				else beginFail();
				return;
			}
		}
		raf = requestAnimationFrame(frame);
	}

	function showNag() {
		if (!nagOn || !nagEl || !running || (skin === 'xbox' && screenEl.getAttribute('data-phase') === 'restart')) return;
		if (nagMsg) nagMsg.textContent = copy.nag;
		nagEl.hidden = false;
		nagEl.classList.add('is-on');
		clearTimeout(nagTimer);
		nagTimer = setTimeout(function () {
			nagEl.classList.remove('is-on');
			nagTimer = setTimeout(function () { if (nagEl) nagEl.hidden = true; }, 260);
		}, 2200);
	}

	function onPointer() { showNag(); }

	function onKey(e) {
		// ESC belongs to the shared controller — never swallow it.
		if (e.key === 'Escape' || e.keyCode === 27) return;
		showNag();
	}

	function stop() {
		running = false;
		waiting = false;
		if (raf) { cancelAnimationFrame(raf); raf = null; }
		clearTimeout(phaseTimer); phaseTimer = null;
		clearTimeout(nagTimer); nagTimer = null;
		overlay.removeEventListener('pointerdown', onPointer);
		document.removeEventListener('keydown', onKey);
		if (nagEl) { nagEl.hidden = true; nagEl.classList.remove('is-on'); }
	}

	function onExit() {
		stop();
		overlay.setAttribute('aria-hidden', 'true');
	}

	launchBtn.addEventListener('click', function () {
		stop();

		skin = (skinSel && COPY[skinSel.value]) ? skinSel.value : 'xbox';
		copy = COPY[skin];
		screenEl.setAttribute('data-skin', skin);

		duration = DURATIONS[speedSel ? speedSel.value : 'normal'] || DURATIONS.normal;
		startPct = parseInt(startSel ? startSel.value : '0', 10);
		if (isNaN(startPct) || startPct < 0 || startPct > 99) startPct = 0;
		nagOn = nagChk ? nagChk.checked : false;
		initialStage = 0;
		initialPct = startPct;
		if (skin === 'xbox') {
			while (initialStage < 2 && startPct >= XBOX_RANGES[initialStage + 1]) initialStage++;
			initialPct = Math.max(0, (startPct - XBOX_RANGES[initialStage]) / (XBOX_RANGES[initialStage + 1] - XBOX_RANGES[initialStage]) * 100);
		}

		if (footEl) footEl.textContent = copy.foot;

		overlay.setAttribute('aria-hidden', 'false');

		window.How7oPrank.launch(overlay, { onExit: onExit });

		running = true;
		if (skin === 'xbox' && startPct === 0) beginXboxPreparation();
		else beginStage(initialStage);
		overlay.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		if (!waiting) raf = requestAnimationFrame(frame);
	});

})();
