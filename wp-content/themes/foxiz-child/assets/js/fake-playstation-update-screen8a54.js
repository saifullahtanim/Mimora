/** PS5 preparation and installation simulation. Never contacts a console. */
(function () {
	'use strict';
	var launchBtn = document.getElementById('fconLaunch');
	var overlay = document.getElementById('fconOverlay');
	var screen = document.getElementById('fconScreen');
	var view = overlay && overlay.querySelector('.psu-view');
	if (!launchBtn || !view || !screen || !window.How7oPrank) return;

	var startSelect = document.getElementById('fconStart');
	var speedSelect = document.getElementById('fconSpeed');
	var warningCheck = document.getElementById('fconNagOn');
	var progress = view.querySelector('.psu-progress');
	var percent = view.querySelector('.psu-percent');
	var fill = view.querySelector('.psu-fill');
	var warning = overlay.querySelector('#fconNag');
	var warningText = overlay.querySelector('#fconNagMsg');
	var DURATIONS = { slow: 180000, normal: 60000, fast: 25000 };
	var PHASES = [
		{ name: 'prepare', share: 0.25, progress: true },
		{ name: 'restarting', share: 0.04 },
		{ name: 'blank', share: 0.015 },
		{ name: 'waiting', share: 0.035 },
		{ name: 'install', share: 0.62, progress: true },
		{ name: 'complete', share: 0.015 },
		{ name: 'reboot', share: 0.025 }
	];
	var CURVE = [[0, 0], [0.2, 0.15], [0.32, 0.3], [0.4, 0.3], [0.66, 0.66], [0.74, 0.66], [0.94, 0.94], [1, 1]];
	var running = false, showWarnings = false, cycleDuration = DURATIONS.normal;
	var phaseIndex = 0, phaseStarted = 0, phaseDuration = 0, startingPercent = 0;
	var frameId = null, warningTimer = null;

	function curve(t) {
		for (var i = 1; i < CURVE.length; i++) {
			if (t <= CURVE[i][0]) {
				var a = CURVE[i - 1], b = CURVE[i];
				return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
			}
		}
		return 1;
	}

	function render(value) {
		var p = Math.max(0, Math.min(100, value));
		percent.textContent = Math.floor(p) + '%';
		fill.style.width = p + '%';
		progress.setAttribute('aria-valuenow', String(Math.floor(p)));
	}

	function hideWarning() {
		clearTimeout(warningTimer);
		warningTimer = null;
		if (warning) { warning.hidden = true; warning.classList.remove('is-on'); }
	}

	function beginPhase(index, initial) {
		phaseIndex = index;
		var phase = PHASES[index];
		startingPercent = initial || 0;
		phaseStarted = performance.now();
		phaseDuration = cycleDuration * phase.share * (phase.progress ? 1 - startingPercent / 100 : 1);
		view.setAttribute('data-phase', phase.name);
		screen.setAttribute('data-phase', phase.name);
		hideWarning();
		if (phase.progress) {
			progress.setAttribute('aria-label', phase.name === 'prepare' ? 'Preparing PS5 update' : 'Installing PS5 system software');
			render(startingPercent);
		} else if (phase.name === 'complete') {
			render(100);
		}
	}

	function frame(now) {
		if (!running) return;
		var phase = PHASES[phaseIndex];
		var elapsed = Math.max(0, now - phaseStarted);
		var t = Math.min(1, elapsed / phaseDuration);
		if (phase.progress) render(startingPercent + (100 - startingPercent) * curve(t));
		if (t >= 1) beginPhase((phaseIndex + 1) % PHASES.length, 0);
		frameId = requestAnimationFrame(frame);
	}

	function onInteraction(event) {
		if (event.key === 'Escape' || event.keyCode === 27 || !running || !showWarnings || !warning) return;
		var phase = PHASES[phaseIndex].name;
		if (phase === 'blank' || phase === 'reboot') return;
		hideWarning();
		if (warningText) warningText.textContent = "Don't turn off your PS5 during installation.";
		warning.hidden = false;
		warning.classList.add('is-on');
		warningTimer = setTimeout(hideWarning, 2200);
	}

	function stop() {
		running = false;
		if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
		hideWarning();
		overlay.removeEventListener('pointerdown', onInteraction);
		document.removeEventListener('keydown', onInteraction);
	}

	launchBtn.addEventListener('click', function () {
		stop();
		cycleDuration = DURATIONS[speedSelect && speedSelect.value] || DURATIONS.normal;
		var initial = parseInt(startSelect ? startSelect.value : '0', 10);
		if (!isFinite(initial) || initial < 0 || initial > 99) initial = 0;
		showWarnings = !!(warningCheck && warningCheck.checked);
		overlay.setAttribute('aria-hidden', 'false');
		window.How7oPrank.launch(overlay, { onExit: function () { stop(); overlay.setAttribute('aria-hidden', 'true'); } });
		running = true;
		beginPhase(initial > 0 ? 4 : 0, initial);
		overlay.addEventListener('pointerdown', onInteraction);
		document.addEventListener('keydown', onInteraction);
		frameId = requestAnimationFrame(frame);
	});
})();
