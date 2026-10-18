/**
 * Fake Low Battery / Dead Phone.
 *
 * Drains a fake battery percentage on a fake lock screen, fires the low-battery
 * alerts the real OS uses (20 / 10 / 5%), and at 0% blacks the screen out and
 * shows the empty-battery icon. Tapping the dead screen wakes the icon for a
 * couple of seconds, exactly like a genuinely flat phone.
 *
 * Every button is a dead end: dismissing an alert (or tapping "Low Power
 * Mode" / "Battery Saver") knocks a further 2% off and brings the warning back
 * sooner — the more they try to fix it, the faster it dies.
 *
 * The real battery is never read or touched. Fullscreen / ESC / exit-bar come
 * from the shared How7oPrank controller. No vendor JS, no audio.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fbatLaunch');
	var overlay   = document.getElementById('fbatOverlay');
	var screenEl  = document.getElementById('fbatScreen');
	var pctEl     = document.getElementById('fbatPct');
	var fillEl    = document.getElementById('fbatFill');
	var timeEl    = document.getElementById('fbatTime');
	var dateEl    = document.getElementById('fbatDate');
	var statusTime = document.getElementById('fbatStatusTime');
	var alertBox  = document.getElementById('fbatAlert');
	var alertTtl  = document.getElementById('fbatAlertTitle');
	var alertMsg  = document.getElementById('fbatAlertMsg');
	var alertB1   = document.getElementById('fbatAlertB1');
	var alertB2   = document.getElementById('fbatAlertB2');
	var deadEl    = document.getElementById('fbatDead');

	var skinSel   = document.getElementById('fbatSkin');
	var startSel  = document.getElementById('fbatStart');
	var speedSel  = document.getElementById('fbatSpeed');
	var alertsChk = document.getElementById('fbatAlerts');

	if (!launchBtn || !overlay || !screenEl) return;

	// Milliseconds to drain the full starting charge.
	var DURATIONS = { slow: 180000, normal: 60000, fast: 20000 };

	var COPY = {
		ios: {
			title: 'Low Battery',
			msg: '{n}% battery remaining.',
			b1: 'Low Power Mode',
			b2: 'OK'
		},
		android: {
			title: 'Battery low',
			msg: '{n}% remaining. Turn on Battery Saver to extend battery life.',
			b1: 'No thanks',
			b2: 'Turn on'
		}
	};

	// Thresholds the real systems warn at.
	var STEPS = [20, 10, 5];

	var timers  = [];
	var raf     = null;
	var running = false;
	var startAt = 0;
	var startPct = 15;
	var pct      = 15;
	var penalty  = 0;     // extra drain earned by "fixing" it
	var duration = DURATIONS.normal;
	var copy     = COPY.ios;
	var alertsOn = true;
	var fired    = {};

	function every(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }
	function after(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

	function clearTimers() {
		timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
		timers = [];
		if (raf) { cancelAnimationFrame(raf); raf = null; }
	}

	/* ---------- Rendering ---------- */
	function renderBattery() {
		var shown = Math.max(0, Math.ceil(pct));
		if (pctEl) pctEl.textContent = shown + '%';
		if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
		screenEl.classList.toggle('is-low', shown <= 20 && shown > 10);
		screenEl.classList.toggle('is-critical', shown <= 10);
	}

	function setClock() {
		var d = new Date();
		var h = d.getHours(), m = d.getMinutes();
		var mm = (m < 10 ? '0' : '') + m;
		var h12 = h % 12 || 12;
		if (timeEl) timeEl.textContent = h12 + ':' + mm;
		if (statusTime) statusTime.textContent = h12 + ':' + mm;
		if (dateEl) {
			dateEl.textContent = d.toLocaleDateString(undefined, {
				weekday: 'long', day: 'numeric', month: 'long'
			});
		}
	}

	/* ---------- Alerts (every button is a dead end) ---------- */
	function showAlert(level) {
		if (!alertsOn || !alertBox) return;
		if (alertTtl) alertTtl.textContent = copy.title;
		if (alertMsg) alertMsg.textContent = copy.msg.replace('{n}', level);
		if (alertB1) alertB1.textContent = copy.b1;
		if (alertB2) alertB2.textContent = copy.b2;
		alertBox.hidden = false;
	}

	function hideAlert() {
		if (alertBox) alertBox.hidden = true;
	}

	function dismiss() {
		hideAlert();
		// "Fixing" it costs you: 2% now, and the next warning arrives sooner.
		penalty += 2;
		renderBattery();
	}

	if (alertB1) alertB1.addEventListener('click', dismiss);
	if (alertB2) alertB2.addEventListener('click', dismiss);

	/* ---------- Drain loop ---------- */
	function frame() {
		if (!running) return;

		var elapsed = Date.now() - startAt;
		pct = Math.max(0, startPct - (elapsed / duration) * startPct - penalty);
		renderBattery();

		var shown = Math.ceil(pct);
		STEPS.forEach(function (step) {
			if (!fired[step] && shown <= step && shown > 0) {
				fired[step] = true;
				showAlert(shown);
			}
		});

		if (pct <= 0) {
			running = false;
			die();
			return;
		}

		raf = requestAnimationFrame(frame);
	}

	/* ---------- Death ---------- */
	function die() {
		hideAlert();
		screenEl.setAttribute('data-state', 'dead');
		wake(2600);
	}

	// Show the empty-battery icon for a moment, then let it fade — a dead phone
	// does exactly this each time you press the power button.
	function wake(ms) {
		screenEl.classList.add('is-waking');
		after(function () {
			screenEl.classList.remove('is-waking');
		}, ms || 2200);
	}

	if (deadEl) {
		deadEl.addEventListener('click', function () { wake(2200); });
	}

	/* ---------- Reset / exit ---------- */
	function reset() {
		clearTimers();
		running = false;
		penalty = 0;
		fired = {};
		hideAlert();
		screenEl.setAttribute('data-state', 'lock');
		screenEl.classList.remove('is-waking', 'is-low', 'is-critical');
	}

	function onExit() {
		clearTimers();
		running = false;
	}

	/* ---------- Launch ---------- */
	launchBtn.addEventListener('click', function () {
		reset();

		var skin = (skinSel && COPY[skinSel.value]) ? skinSel.value : 'ios';
		copy = COPY[skin];
		screenEl.setAttribute('data-skin', skin);

		startPct = parseInt(startSel ? startSel.value : '15', 10) || 15;
		pct = startPct;
		duration = DURATIONS[speedSel ? speedSel.value : 'normal'] || DURATIONS.normal;
		alertsOn = alertsChk ? alertsChk.checked : true;

		// Thresholds we already start below are treated as seen, or they would
		// all fire at once on launch. Strictly-less-than on purpose: starting
		// AT 5% should still warn at 5% — that preset wants instant drama.
		STEPS.forEach(function (step) {
			if (startPct < step) fired[step] = true;
		});

		setClock();
		renderBattery();

		window.How7oPrank.launch(overlay, { onExit: onExit });

		running = true;
		startAt = Date.now();
		every(setClock, 10000);
		raf = requestAnimationFrame(frame);
	});

})();
