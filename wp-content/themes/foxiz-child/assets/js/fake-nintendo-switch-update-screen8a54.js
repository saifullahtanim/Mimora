/** Nintendo Switch update simulation. No console connection or downloads. */
(function () {
	'use strict';
	var launch = document.getElementById('fconLaunch');
	var overlay = document.getElementById('fconOverlay');
	var screen = document.getElementById('fconScreen');
	var view = overlay && overlay.querySelector('.nsu-view');
	if (!launch || !screen || !view || !window.How7oPrank) return;
	var start = document.getElementById('nsuStart');
	var speed = document.getElementById('fconSpeed');
	var theme = document.getElementById('nsuTheme');
	var preview = document.querySelector('.fcon-preview .nsu-view');
	var underlay = view.querySelector('.nsu-underlay');
	var confirm = view.querySelector('.nsu-confirm');
	var status = view.querySelector('.nsu-status');
	var updateButton = view.querySelector('.nsu-update-button');
	var confirmOK = view.querySelector('.nsu-confirm-ok');
	var confirmBack = view.querySelector('.nsu-confirm-back');
	var DURATIONS = { slow: 180000, normal: 60000, fast: 25000 };
	var PHASES = {
		waiting: { text: 'Please wait...', share: 0.08, next: 'updating' },
		updating: { text: 'Updating...', share: 0.82, next: 'complete' },
		complete: { text: 'Update complete.\nThe system will restart momentarily.', share: 0.06, next: 'restart' },
		restart: { text: '', share: 0.04, next: 'waiting' }
	};
	var running = false, phase = 'updating', timer = null, duration = DURATIONS.normal;
	view.tabIndex = -1;

	function setTheme() {
		var value = theme && theme.value === 'light' ? 'light' : 'dark';
		view.setAttribute('data-theme', value);
		if (preview) preview.setAttribute('data-theme', value);
	}

	function showPhase(name) {
		clearTimeout(timer);
		timer = null;
		if (!running) return;
		phase = name;
		view.setAttribute('data-phase', name);
		screen.setAttribute('data-phase', name);
		underlay.inert = name !== 'ready';
		confirm.hidden = name !== 'confirm';
		status.textContent = PHASES[name] ? PHASES[name].text : '';
		if (name === 'ready') updateButton.focus({ preventScroll: true });
		else if (name === 'confirm') confirmOK.focus({ preventScroll: true });
		else {
			if (view.contains(document.activeElement) && document.activeElement !== view) view.focus({ preventScroll: true });
			var current = PHASES[name];
			timer = setTimeout(function () { showPhase(current.next); }, duration * current.share);
		}
	}

	function advance() {
		if (!running) return;
		if (phase === 'ready') showPhase('confirm');
		else if (phase === 'confirm') showPhase('waiting');
	}
	function back() {
		if (!running) return;
		if (phase === 'confirm') showPhase('ready');
		else if (phase === 'ready') window.How7oPrank.exit();
	}
	function onKey(event) {
		if (!running || (phase !== 'ready' && phase !== 'confirm')) return;
		if (event.key === 'a' || event.key === 'A' || (event.key === 'Enter' && !event.target.closest('button'))) {
			event.preventDefault(); advance();
		} else if (event.key === 'b' || event.key === 'B' || event.key === 'Backspace') {
			event.preventDefault(); back();
		} else if (phase === 'confirm' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
			event.preventDefault();
			(event.key === 'ArrowLeft' ? confirmBack : confirmOK).focus();
		}
	}
	function stop() {
		running = false;
		clearTimeout(timer);
		timer = null;
		document.removeEventListener('keydown', onKey);
		underlay.inert = true;
		overlay.setAttribute('aria-hidden', 'true');
	}

	updateButton.addEventListener('click', advance);
	view.querySelector('.nsu-ok-button').addEventListener('click', advance);
	confirmOK.addEventListener('click', advance);
	confirmBack.addEventListener('click', back);
	view.querySelector('.nsu-back-button').addEventListener('click', back);
	if (theme) theme.addEventListener('change', setTheme);
	setTheme();
	launch.addEventListener('click', function () {
		stop();
		duration = DURATIONS[speed && speed.value] || DURATIONS.normal;
		setTheme();
		overlay.setAttribute('aria-hidden', 'false');
		window.How7oPrank.launch(overlay, { onExit: stop });
		running = true;
		view.focus({ preventScroll: true });
		var initial = start && start.value;
		showPhase(initial === 'ready' || initial === 'waiting' ? initial : 'updating');
		document.addEventListener('keydown', onKey);
	});
})();
