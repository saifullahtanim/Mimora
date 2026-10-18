/**
 * Fake macOS Update — progress bar + time remaining animation.
 */
(function () {
	'use strict';

	var launchBtn    = document.getElementById('fmacLaunch');
	var overlay      = document.getElementById('fmacOverlay');
	var progressEl   = document.getElementById('fmacProgress');
	var remainingEl  = document.getElementById('fmacRemaining');

	if (!launchBtn || !overlay || !progressEl) return;

	var percent = 0;
	var tickTimer = null;

	function tick() {
		var roll = Math.random();
		if (roll < 0.15) {
			// pause
		} else if (roll < 0.75) {
			percent += 0.5;
		} else {
			percent += 1;
		}
		if (percent >= 100) {
			percent = 100;
			render();
			clearInterval(tickTimer);
			setTimeout(function () {
				percent = 0;
				render();
				start();
			}, 2500);
			return;
		}
		render();
	}

	function render() {
		progressEl.style.width = percent + '%';
		if (remainingEl) {
			var minsLeft = Math.max(1, Math.round((100 - percent) * 0.28));
			remainingEl.textContent = 'About ' + minsLeft + ' minute' + (minsLeft === 1 ? '' : 's') + ' remaining';
		}
	}

	function start() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = setInterval(tick, 900);
	}
	function stop() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = null;
	}

	launchBtn.addEventListener('click', function () {
		percent = 0;
		render();
		start();
		window.How7oPrank.launch(overlay, { onExit: stop });
	});

})();
