/**
 * Fake Windows 10 Update — preview + fullscreen launcher.
 *
 * The page now has:
 *   - A small mini preview (showing the current "start time" %)
 *   - Settings: update time (minutes), start time (%), restart button
 *   - A fullscreen overlay launched via the corner fullscreen button
 *
 * The percentage in the fullscreen overlay climbs from "start time"
 * to 100% over "update time" minutes, then loops.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fwu10Launch');
	var overlay = document.getElementById('fwu10Overlay');
	var percentEl = document.getElementById('fwu10Percent');
	var minutesEl = document.getElementById('fwu10Minutes');
	var startEl = document.getElementById('fwu10StartPercent');
	var restartBtn = document.getElementById('fwu10Restart');
	var miniPctEl = document.querySelector('[data-fwu10-mini-percent]');

	if (!launchBtn || !overlay || !percentEl) return;

	var percent = 7;
	var startPct = 7;
	var minutes = 42;
	var tickTimer = null;

	function getStart() {
		var v = parseInt(startEl && startEl.value, 10);
		if (isNaN(v) || v < 0) v = 0;
		if (v > 99) v = 99;
		return v;
	}
	function getMinutes() {
		var v = parseInt(minutesEl && minutesEl.value, 10);
		if (isNaN(v) || v < 1) v = 1;
		if (v > 999) v = 999;
		return v;
	}

	function renderFullscreen() { percentEl.textContent = Math.floor(percent); }
	function renderMini() { if (miniPctEl) miniPctEl.textContent = Math.floor(startPct); }

	function tick() {
		percent += stepSize;
		if (percent >= 100) {
			percent = 100;
			renderFullscreen();
			clearInterval(tickTimer);
			tickTimer = null;
			setTimeout(function () {
				percent = startPct;
				renderFullscreen();
				startTicker();
			}, 3000);
			return;
		}
		renderFullscreen();
	}

	var TICK_MS = 800;
	var stepSize = 1;

	function recomputeStep() {
		var totalTicks = (minutes * 60 * 1000) / TICK_MS;
		stepSize = (100 - startPct) / totalTicks;
		if (stepSize < 0.05) stepSize = 0.05;
	}

	function startTicker() {
		if (tickTimer) clearInterval(tickTimer);
		recomputeStep();
		tickTimer = setInterval(tick, TICK_MS);
	}
	function stopTicker() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = null;
	}

	function applySettings() {
		startPct = getStart();
		minutes = getMinutes();
		percent = startPct;
		renderMini();
		renderFullscreen();
	}

	// ---------- Wiring ----------
	if (startEl) {
		startEl.addEventListener('input', function () {
			startPct = getStart();
			renderMini();
		});
	}
	if (minutesEl) {
		minutesEl.addEventListener('input', function () {
			minutes = getMinutes();
		});
	}
	if (restartBtn) {
		restartBtn.addEventListener('click', function () {
			applySettings();
			stopTicker();
		});
	}

	launchBtn.addEventListener('click', function () {
		applySettings();
		startTicker();
		window.How7oPrank.launch(overlay, { onExit: stopTicker });
	});

	// Initial render
	applySettings();
})();
