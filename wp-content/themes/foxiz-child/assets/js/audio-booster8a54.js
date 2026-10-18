(function () {
	'use strict';

	// ---------------------------------------------------------------
	// Pure helpers (Node-testable)
	// ---------------------------------------------------------------

	var KNOWN_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };

	function getStem(filename) {
		var idx = filename.lastIndexOf('.');
		return idx <= 0 ? filename : filename.slice(0, idx);
	}

	function formatBytes(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
	}

	function sanitizeFilename(name) {
		return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
	}

	function formatBoost(n) {
		var fixed = Number(n).toFixed(2);
		return fixed.replace(/\.?0+$/, '');
	}

	/**
	 * Build FFmpeg argument array. Video stream-copy, audio re-encode with volume filter.
	 */
	function buildCommand(filename, boost) {
		var v = formatBoost(boost);
		var args = [
			'-i', 'input',
			'-c:v', 'copy',
			'-c:a', 'aac',
			'-b:a', '128k',
			'-af', 'volume=' + v,
			'-movflags', '+faststart',
			'output.mp4'
		];
		return { args: args, outName: 'output.mp4' };
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;

		var fbCases = [
			[1, '1'], [1.5, '1.5'], [2, '2'], [3, '3'], [5, '5'], [10, '10'],
			[2.50, '2.5'], [1.25, '1.25']
		];
		var fbFailed = 0;
		fbCases.forEach(function (c, i) {
			if (formatBoost(c[0]) !== c[1]) { console.error('[aub] formatBoost case', i, c[0], '→', formatBoost(c[0]), 'want', c[1]); fbFailed++; }
		});
		if (fbFailed === 0) console.log('[aub] formatBoost: OK (' + fbCases.length + ' cases)');

		var bcCases = [
			{ in: ['a.mp4', 2],   expectAfArg: 'volume=2' },
			{ in: ['b.mkv', 5],   expectAfArg: 'volume=5' },
			{ in: ['c.MOV', 1.5], expectAfArg: 'volume=1.5' }
		];
		var bcFailed = 0;
		bcCases.forEach(function (c, i) {
			var r = buildCommand.apply(null, c.in);
			var afIdx = r.args.indexOf('-af');
			var afVal = afIdx >= 0 ? r.args[afIdx + 1] : null;
			if (afVal !== c.expectAfArg) { console.error('[aub] buildCommand case', i, '-af =', afVal, 'want', c.expectAfArg); bcFailed++; }
			if (r.args.indexOf('-c:v') < 0 || r.args[r.args.indexOf('-c:v') + 1] !== 'copy') { console.error('[aub] buildCommand case', i, 'missing -c:v copy'); bcFailed++; }
			if (r.outName !== 'output.mp4') { console.error('[aub] buildCommand case', i, 'outName =', r.outName); bcFailed++; }
		});
		if (bcFailed === 0) console.log('[aub] buildCommand: OK (' + bcCases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var MAX_INPUT_BYTES = Infinity;
	var DEFAULT_BOOST = 2;
	var MIN_BOOST = 1;
	var MAX_BOOST = 10;
	var BOOST_NOOP_EPSILON = 0.02;

	var refs = {};
	var state = {
		file: null,
		boost: DEFAULT_BOOST,
		outputBlobUrl: null,
		previewObjectUrl: null
	};

	function setLoadingState(opts) {
		var panel = refs.loadingPanel;
		if (!panel) return;
		if (!opts.visible) { panel.classList.remove('is-visible', 'is-error'); return; }
		panel.classList.add('is-visible');
		panel.classList.toggle('is-error', !!opts.isError);
		if (opts.label !== undefined) refs.loadingLabel.textContent = opts.label;
		if (opts.icon !== undefined)  refs.loadingIcon.innerHTML = opts.icon;
		if (opts.percent !== undefined) {
			if (opts.percent === null) {
				refs.loadingBar.classList.add('is-indeterminate');
				refs.loadingPercent.textContent = '';
			} else {
				refs.loadingBar.classList.remove('is-indeterminate');
				var pct = Math.round(opts.percent * 100);
				refs.loadingBarFill.style.width = pct + '%';
				refs.loadingPercent.textContent = pct + '%';
			}
		}
		if (opts.hint !== undefined) refs.loadingHint.textContent = opts.hint;
		if (opts.eta !== undefined) {
			refs.loadingEta.textContent = opts.eta;
			refs.loadingEta.hidden = !opts.eta;
		}
		refs.loadingRetry.hidden = !opts.showRetry;
	}

	function showSection(name) {
		refs.dropZone.hidden = (name !== 'idle');
		refs.controls.hidden = (name !== 'controls');
		refs.results.hidden  = (name !== 'results');
		if (name === 'loading') refs.controls.hidden = true;
	}

	function syncPresetActiveState() {
		var b = state.boost;
		var matched = false;
		Array.prototype.forEach.call(refs.presetButtons, function (btn) {
			var pb = parseFloat(btn.getAttribute('data-boost'));
			var active = Math.abs(pb - b) < 0.005;
			btn.classList.toggle('is-active', active);
			if (active) matched = true;
		});
		if (!matched && document.activeElement !== refs.boostCustom && !refs.boostCustom.value) {
			refs.boostCustom.value = formatBoost(b);
		}
	}

	function updateBoostInfo() {
		if (!state.file) {
			refs.boostInfo.textContent = 'Pick a boost level.';
			refs.boostInfo.className = 'aub-boost-info';
			refs.applyBtn.disabled = true;
			return;
		}
		if (state.file.size > MAX_INPUT_BYTES) {
			refs.boostInfo.textContent = '';
			refs.applyBtn.disabled = true;
			return;
		}
		var b = state.boost;
		if (!isFinite(b) || b < MIN_BOOST || b > MAX_BOOST) {
			refs.boostInfo.textContent = 'Boost must be between ' + MIN_BOOST + '× and ' + MAX_BOOST + '×.';
			refs.boostInfo.className = 'aub-boost-info is-error';
			refs.applyBtn.disabled = true;
			return;
		}
		if (Math.abs(b - 1) < BOOST_NOOP_EPSILON) {
			refs.boostInfo.textContent = 'Boost must be greater than 1.0× — this is a booster, not a volume control.';
			refs.boostInfo.className = 'aub-boost-info is-error';
			refs.applyBtn.disabled = true;
			return;
		}
		var stem = getStem(state.file.name);
		var warn = b > 5 ? ' ⚠ may distort' : '';
		refs.boostInfo.textContent = 'Output: ' + stem + '-boosted-' + formatBoost(b) + 'x.mp4 (video copied, audio re-encoded)' + warn;
		refs.boostInfo.className = warn ? 'aub-boost-info is-warn' : 'aub-boost-info';
		refs.applyBtn.disabled = false;
	}

	function setBoost(n) {
		var b = Math.max(MIN_BOOST, Math.min(MAX_BOOST, Number(n)));
		state.boost = b;
		syncPresetActiveState();
		updateBoostInfo();
	}

	function acceptFile(file) {
		state.file = file;
		refs.fileName.textContent = file.name;
		refs.fileMeta.textContent = formatBytes(file.size);
		showSection('controls');

		var oversize = file.size > MAX_INPUT_BYTES;
		refs.oversizedWarning.hidden = !oversize;
		if (oversize) {
			refs.previewVideo.removeAttribute('src');
			refs.applyBtn.disabled = true;
			refs.boostInfo.textContent = '';
			return;
		}

		if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
		state.previewObjectUrl = URL.createObjectURL(file);
		refs.previewVideo.src = state.previewObjectUrl;

		state.boost = DEFAULT_BOOST;
		refs.boostCustom.value = '';
		syncPresetActiveState();
		updateBoostInfo();
	}

	function clearFile() {
		state.file = null;
		state.boost = DEFAULT_BOOST;
		if (state.outputBlobUrl) { URL.revokeObjectURL(state.outputBlobUrl); state.outputBlobUrl = null; }
		if (state.previewObjectUrl) { URL.revokeObjectURL(state.previewObjectUrl); state.previewObjectUrl = null; }
		refs.fileInput.value = '';
		refs.previewVideo.removeAttribute('src');
		refs.resultsVideo.removeAttribute('src');
		refs.oversizedWarning.hidden = true;
		refs.boostCustom.value = '';
		showSection('idle');
		setLoadingState({ visible: false });
		syncPresetActiveState();
	}

	function doApply() {
		if (!state.file || !window.how7oFfmpeg) return;
		var cmd = buildCommand(state.file.name, state.boost);
		var stem = getStem(state.file.name);
		var outputFilename = sanitizeFilename(stem + '-boosted-' + formatBoost(state.boost) + 'x.mp4');

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Boosting audio at ' + formatBoost(state.boost) + '× volume',
				icon: '&#128266;',
				percent: 0,
				hint: 'Video stream-copied · audio re-encoded · fast',
				eta: '',
				isError: false,
				showRetry: false
			});
			unsub = window.how7oFfmpeg.onProcessProgress(function (evt) {
				var p = Math.max(0, Math.min(1, evt.progress || 0));
				var elapsed = (Date.now() - processStart) / 1000;
				var eta = p > 0.02 ? Math.max(0, Math.round(elapsed / p - elapsed)) : null;
				setLoadingState({ visible: true, percent: p, eta: eta !== null ? '~' + eta + ' seconds remaining' : '' });
			});

			window.how7oFfmpeg.exec(cmd.args, state.file, cmd.outName).then(function (data) {
				try {
					var blob = new Blob([data.buffer], { type: 'video/mp4' });
					if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
					state.outputBlobUrl = URL.createObjectURL(blob);
					refs.resultsVideo.src = state.outputBlobUrl;
					refs.resultsMsg.textContent = 'Done! ' + outputFilename + ' · ' + formatBytes(blob.size);
					refs.downloadBtn.dataset.filename = outputFilename;
					showSection('results');
				} finally {
					if (unsub) unsub();
					setLoadingState({ visible: false });
				}
			}).catch(function (err) {
				if (unsub) unsub();
				console.error('[aub] boost error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				setLoadingState({
					visible: true,
					label: likelyMemory ? 'Video too large for your browser' : 'Couldn\'t boost the audio',
					icon: '&#9888;',
					percent: 0,
					hint: likelyMemory
						? 'Your browser ran out of memory. Try a smaller clip.'
						: 'The video may use an unsupported codec, or the file may be corrupted. Try a different file.',
					eta: '',
					isError: true,
					showRetry: false
				});
				refs.controls.hidden = false;
			});
		}

		if (window.how7oFfmpeg.isLoaded()) {
			startProcess();
		} else {
			setLoadingState({
				visible: true,
				label: 'Preparing processing engine',
				icon: '&#9881;',
				percent: 0,
				hint: 'One-time download. Future visits start instantly.',
				eta: '',
				isError: false,
				showRetry: false
			});
			window.how7oFfmpeg.load(function (frac) {
				setLoadingState({ visible: true, percent: frac });
			}).then(function () {
				setLoadingState({ visible: true, label: 'Initializing', percent: null, hint: '' });
				return new Promise(function (r) { setTimeout(r, 250); });
			}).then(startProcess).catch(function (err) {
				console.error('[aub] FFmpeg load error', err);
				setLoadingState({
					visible: true,
					label: 'Couldn\'t load the processing engine',
					icon: '&#9888;',
					percent: 0,
					hint: 'Check your connection and try again.',
					eta: '',
					isError: true,
					showRetry: true
				});
				refs.controls.hidden = false;
			});
		}
	}

	function doDownload() {
		if (!state.outputBlobUrl) return;
		var a = document.createElement('a');
		a.href = state.outputBlobUrl;
		a.download = refs.downloadBtn.dataset.filename || 'video-boosted.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone         = document.getElementById('aubDropZone');
		refs.fileInput        = document.getElementById('aubFileInput');
		refs.browseBtn        = document.getElementById('aubBrowseBtn');
		refs.controls         = document.getElementById('aubControls');
		refs.fileName         = document.getElementById('aubFileName');
		refs.fileMeta         = document.getElementById('aubFileMeta');
		refs.fileClearBtn     = document.getElementById('aubFileClearBtn');
		refs.oversizedWarning = document.getElementById('aubOversizedWarning');
		refs.previewVideo     = document.getElementById('aubPreviewVideo');
		refs.presetButtons    = document.querySelectorAll('.aub-boost-preset');
		refs.boostCustom      = document.getElementById('aubBoostCustom');
		refs.boostInfo        = document.getElementById('aubBoostInfo');
		refs.applyBtn         = document.getElementById('aubApplyBtn');
		refs.loadingPanel     = document.getElementById('aubLoadingPanel');
		refs.loadingLabel     = document.getElementById('aubLoadingLabel');
		refs.loadingIcon      = document.getElementById('aubLoadingIcon');
		refs.loadingBar       = document.getElementById('aubLoadingBar');
		refs.loadingBarFill   = document.getElementById('aubLoadingBarFill');
		refs.loadingPercent   = document.getElementById('aubLoadingPercent');
		refs.loadingHint      = document.getElementById('aubLoadingHint');
		refs.loadingEta       = document.getElementById('aubLoadingEta');
		refs.loadingRetry     = document.getElementById('aubLoadingRetry');
		refs.results          = document.getElementById('aubResults');
		refs.resultsMsg       = document.getElementById('aubResultsMsg');
		refs.resultsVideo     = document.getElementById('aubResultsVideo');
		refs.downloadBtn      = document.getElementById('aubDownloadBtn');
		refs.resetBtn         = document.getElementById('aubResetBtn');

		if (!refs.dropZone) return;

		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#aubBrowseBtn')) return;
			refs.fileInput.click();
		});
		refs.browseBtn.addEventListener('click', function (e) { e.stopPropagation(); refs.fileInput.click(); });
		refs.fileInput.addEventListener('change', function (e) {
			var f = e.target.files && e.target.files[0];
			if (f) acceptFile(f);
		});

		['dragenter', 'dragover'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.add('is-dragover'); });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.remove('is-dragover'); });
		});
		refs.dropZone.addEventListener('drop', function (e) {
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (!f) return;
			var ext = (f.name.split('.').pop() || '').toLowerCase();
			if (f.type.indexOf('video/') === 0 || KNOWN_EXTS[ext]) acceptFile(f);
		});

		Array.prototype.forEach.call(refs.presetButtons, function (btn) {
			btn.addEventListener('click', function () {
				var v = parseFloat(btn.getAttribute('data-boost'));
				if (isFinite(v)) {
					refs.boostCustom.value = '';
					setBoost(v);
				}
			});
		});
		refs.boostCustom.addEventListener('input', function (e) {
			var v = parseFloat(e.target.value);
			if (isFinite(v)) setBoost(v);
		});
		refs.boostCustom.addEventListener('change', function (e) {
			var v = parseFloat(e.target.value);
			if (isFinite(v)) {
				setBoost(v);
				e.target.value = formatBoost(state.boost);
			} else {
				updateBoostInfo();
			}
		});

		refs.fileClearBtn.addEventListener('click', clearFile);
		refs.applyBtn.addEventListener('click', doApply);
		refs.loadingRetry.addEventListener('click', doApply);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', clearFile);

		// FAQ accordion
		document.querySelectorAll('.aub-faq-item').forEach(function (item) {
			var btn = item.querySelector('.aub-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('aub-faq-touched');
				item.classList.toggle('aub-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
