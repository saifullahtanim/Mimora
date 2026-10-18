/**
 * How7o Prank Screens — Shared helpers.
 *
 * Exposes a small global (window.How7oPrank) that individual prank pages
 * use to handle:
 *   - Launching the fullscreen overlay
 *   - Requesting browser fullscreen via Fullscreen API
 *   - Exit-button visibility on mouse move / keypress
 *   - ESC-to-exit handling
 *
 * Each prank page calls How7oPrank.init(rootEl) after building its overlay.
 */
(function () {
	'use strict';

	var HIDE_DELAY = 2500; // ms — exit bar hides after this many ms of no mouse movement
	var state = {
		root: null,
		originalParent: null,
		originalNextSibling: null,
		exitBar: null,
		hideTimer: null,
		onExit: null,
		isActive: false,
	};

	function showExitBar() {
		if (!state.exitBar) return;
		state.exitBar.classList.add('is-visible');
		if (state.hideTimer) clearTimeout(state.hideTimer);
		state.hideTimer = setTimeout(function () {
			state.exitBar.classList.remove('is-visible');
		}, HIDE_DELAY);
	}

	function requestBrowserFullscreen() {
		var el = document.documentElement;
		var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
		if (req) {
			try { req.call(el); } catch (e) { /* silent */ }
		}
	}

	function exitBrowserFullscreen() {
		if (document.fullscreenElement || document.webkitFullscreenElement) {
			var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
			if (exit) {
				try { exit.call(document); } catch (e) { /* silent */ }
			}
		}
	}

	function launch(root, opts) {
		opts = opts || {};
		state.root = root;
		state.isActive = true;
		state.onExit = opts.onExit || null;

		// Move overlay out to <body> so no ancestor transform/filter/overflow
		// can clip it. Remember its original spot so we can put it back on exit.
		if (root.parentNode !== document.body) {
			state.originalParent = root.parentNode;
			state.originalNextSibling = root.nextSibling;
			document.body.appendChild(root);
		} else {
			state.originalParent = null;
			state.originalNextSibling = null;
		}

		root.classList.add('is-active');
		document.documentElement.classList.add('prank-active');
		document.body.classList.add('prank-active');

		// Build or find exit bar
		var exitBar = root.querySelector('.prank-exit-bar');
		if (!exitBar) {
			exitBar = document.createElement('div');
			exitBar.className = 'prank-exit-bar';
			exitBar.innerHTML =
				'<button type="button" class="prank-exit-btn" data-prank-exit>' +
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
					'<span>Exit (ESC)</span>' +
				'</button>';
			document.body.appendChild(exitBar);
		}
		state.exitBar = exitBar;

		// Wire exit button
		var exitBtn = exitBar.querySelector('[data-prank-exit]');
		if (exitBtn) {
			exitBtn.addEventListener('click', exit);
		}

		// Show exit bar briefly on launch, then hide
		showExitBar();

		// Mouse-move reveals exit bar
		document.addEventListener('mousemove', onMouseMove, { passive: true });
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('fullscreenchange', onFullscreenChange);
		document.addEventListener('webkitfullscreenchange', onFullscreenChange);

		if (opts.fullscreen !== false) {
			requestBrowserFullscreen();
		}
	}

	function onFullscreenChange() {
		// If the user pressed ESC (browser exits fullscreen), kill the overlay too.
		if (!document.fullscreenElement && !document.webkitFullscreenElement) {
			exit();
		}
	}

	function exit() {
		if (!state.isActive) return;
		state.isActive = false;

		if (state.root) state.root.classList.remove('is-active');
		document.documentElement.classList.remove('prank-active');
		document.body.classList.remove('prank-active');

		if (state.exitBar) {
			state.exitBar.classList.remove('is-visible');
		}

		if (state.hideTimer) clearTimeout(state.hideTimer);
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('keydown', onKeyDown);
		document.removeEventListener('fullscreenchange', onFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', onFullscreenChange);

		exitBrowserFullscreen();

		// Restore overlay to its original position in the DOM.
		if (state.root && state.originalParent) {
			if (state.originalNextSibling) {
				state.originalParent.insertBefore(state.root, state.originalNextSibling);
			} else {
				state.originalParent.appendChild(state.root);
			}
		}
		state.originalParent = null;
		state.originalNextSibling = null;

		if (typeof state.onExit === 'function') {
			try { state.onExit(); } catch (e) { /* silent */ }
		}
	}

	function onMouseMove() {
		showExitBar();
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') {
			exit();
		}
	}

	// Expose global
	window.How7oPrank = {
		launch: launch,
		exit: exit,
		showExitBar: showExitBar,
	};

	/* ---------- Shared FAQ accordion (mirrors index FAQ behavior) ---------- */
	function initFaqAccordions() {
		var lists = document.querySelectorAll('.prank-page-faq-list');
		lists.forEach(function (list) {
			list.addEventListener('click', function (e) {
				var btn = e.target.closest('.prank-page-faq-question');
				if (!btn) return;
				var item = btn.closest('.prank-page-faq-item');
				if (!item) return;
				item.classList.add('prank-faq-touched');
				item.classList.toggle('prank-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initFaqAccordions);
	} else {
		initFaqAccordions();
	}
})();
