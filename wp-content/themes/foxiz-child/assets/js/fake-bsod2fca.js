/**
 * Fake BSOD — launcher + % complete counter.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fbsodLaunch');
	var overlay   = document.getElementById('fbsodOverlay');
	var percentEl = document.getElementById('fbsodPercent');

	if (!launchBtn || !overlay || !percentEl) return;

	var percent = 0;
	var tickTimer = null;

	function tick() {
		var roll = Math.random();
		if (roll < 0.25) {
			// pause (real BSOD counters also stall a lot)
		} else {
			percent += 1;
		}
		if (percent >= 100) {
			percent = 100;
			percentEl.textContent = percent;
			clearInterval(tickTimer);
			// Real BSOD would restart — we just loop from 0 after a pause.
			setTimeout(function () {
				percent = 0;
				percentEl.textContent = '0';
				start();
			}, 3000);
			return;
		}
		percentEl.textContent = percent;
	}

	function start() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = setInterval(tick, 1000);
	}
	function stop() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = null;
	}

	launchBtn.addEventListener('click', function () {
		percent = 0;
		percentEl.textContent = '0';
		start();
		window.How7oPrank.launch(overlay, { onExit: stop });
	});

})();
