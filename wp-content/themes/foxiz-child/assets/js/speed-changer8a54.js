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

	function formatDuration(seconds) {
		var s = Math.max(0, Math.floor(seconds));
		var h = Math.floor(s / 3600);
		var m = Math.floor((s % 3600) / 60);
		var ss = s % 60;
		return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
	}

	function sanitizeFilename(name) {
		return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
	}

	/**
	 * Format a number as "N.N" or "N" for filename use (trim trailing zeros).
	 */
	function formatSpeed(n) {
		var fixed = Number(n).toFixed(2);
		return fixed.replace(/\.?0+$/, '');
	}

	/**
	 * Build the FFmpeg atempo filter chain for a given speed factor.
	 * Each atempo instance accepts factors in [0.5, 2.0] only, so values
	 * outside that range need chaining.
	 *   atempoChain(2)     → "atempo=2"
	 *   atempoChain(4)     → "atempo=2,atempo=2"
	 *   atempoChain(0.25)  → "atempo=0.5,atempo=0.5"
	 *   atempoChain(3.0)   → "atempo=2,atempo=1.5"
	 *   atempoChain(0.3)   → "atempo=0.5,atempo=0.6"
	 */
	function atempoChain(factor) {
		var f = Number(factor);
		if (!isFinite(f) || f <= 0) return 'atempo=1';
		if (f >= 0.5 && f <= 2.0) return 'atempo=' + formatSpeed(f);
		var parts = [];
		var rem = f;
		if (f > 2.0) {
			while (rem > 2.0) { parts.push('atempo=2'); rem = rem / 2; }
		} else {
			while (rem < 0.5) { parts.push('atempo=0.5'); rem = rem / 0.5; }
		}
		parts.push('atempo=' + formatSpeed(rem));
		return parts.join(',');
	}

	/**
	 * Build the FFmpeg argument array for a speed-change job.
	 *   buildCommand("clip.mkv", 2)
	 *   → { args: [...,"-filter_complex","[0:v]setpts=PTS/2[v];[0:a]atempo=2[a]",...],
	 *      outName: "output.mp4" }
	 */
	function buildCommand(filename, speed) {
		var n = formatSpeed(speed);
		var chain = atempoChain(speed);
		var filter = '[0:v]setpts=PTS/' + n + '[v];[0:a]' + chain + '[a]';
		var outName = 'output.mp4';
		var args = [
			'-i', 'input',
			'-filter_complex', filter,
			'-map', '[v]',
			'-map', '[a]?',
			'-c:v', 'libx264',
			'-preset', 'veryfast',
			'-crf', '23',
			'-c:a', 'aac',
			'-b:a', '128k',
			'-movflags', '+faststart',
			outName
		];
		return { args: args, outName: outName };
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;

		// atempoChain
		var acCases = [
			[0.25, 'atempo=0.5,atempo=0.5'],
			[0.5,  'atempo=0.5'],
			[0.75, 'atempo=0.75'],
			[1.5,  'atempo=1.5'],
			[2,    'atempo=2'],
			[4,    'atempo=2,atempo=2'],
			[3.0,  'atempo=2,atempo=1.5'],
			[0.3,  'atempo=0.5,atempo=0.6'],
			[1.0,  'atempo=1']
		];
		var acFailed = 0;
		acCases.forEach(function (c, i) {
			var got = atempoChain(c[0]);
			if (got !== c[1]) { console.error('[vsc] atempoChain case', i, c[0], '→', got, 'want', c[1]); acFailed++; }
		});
		if (acFailed === 0) console.log('[vsc] atempoChain: OK (' + acCases.length + ' cases)');

		// buildCommand
		var bcCases = [
			{ in: ['a.mp4', 2],   filter: '[0:v]setpts=PTS/2[v];[0:a]atempo=2[a]' },
			{ in: ['b.mkv', 4],   filter: '[0:v]setpts=PTS/4[v];[0:a]atempo=2,atempo=2[a]' },
			{ in: ['c.MOV', 0.5], filter: '[0:v]setpts=PTS/0.5[v];[0:a]atempo=0.5[a]' },
			{ in: ['d.webm', 1.5],filter: '[0:v]setpts=PTS/1.5[v];[0:a]atempo=1.5[a]' }
		];
		var bcFailed = 0;
		bcCases.forEach(function (c, i) {
			var r = buildCommand.apply(null, c.in);
			var fcIdx = r.args.indexOf('-filter_complex');
			var filter = fcIdx >= 0 ? r.args[fcIdx + 1] : null;
			if (filter !== c.filter) {
				console.error('[vsc] buildCommand case', i, c.in, '→', filter, 'want', c.filter);
				bcFailed++;
			}
			if (r.outName !== 'output.mp4') {
				console.error('[vsc] buildCommand case', i, 'outName', r.outName, 'want output.mp4');
				bcFailed++;
			}
		});
		if (bcFailed === 0) console.log('[vsc] buildCommand: OK (' + bcCases.length + ' cases)');

		// formatSpeed
		var fsCases = [
			[1.0, '1'], [2.0, '2'], [1.5, '1.5'], [0.25, '0.25'], [1.25, '1.25'],
			[3.50, '3.5'], [0.5, '0.5']
		];
		var fsFailed = 0;
		fsCases.forEach(function (c, i) {
			if (formatSpeed(c[0]) !== c[1]) { console.error('[vsc] formatSpeed case', i, c[0], '→', formatSpeed(c[0]), 'want', c[1]); fsFailed++; }
		});
		if (fsFailed === 0) console.log('[vsc] formatSpeed: OK (' + fsCases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var MAX_INPUT_BYTES = Infinity;
	var DEFAULT_SPEED = 2;
	var MIN_SPEED = 0.25;
	var MAX_SPEED = 4;
	var SPEED_NOOP_EPSILON = 0.02; // |N - 1| < this → disable (no-op)

	var refs = {};
	var state = {
		file: null,
		speed: DEFAULT_SPEED,
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
		var s = state.speed;
		var matched = false;
		Array.prototype.forEach.call(refs.presetButtons, function (btn) {
			var ps = parseFloat(btn.getAttribute('data-speed'));
			var active = Math.abs(ps - s) < 0.005;
			btn.classList.toggle('is-active', active);
			if (active) matched = true;
		});
		// If no preset matches and custom field is empty, populate it
		if (!matched && document.activeElement !== refs.speedCustom && !refs.speedCustom.value) {
			refs.speedCustom.value = formatSpeed(s);
		}
	}

	function syncPreviewPlaybackRate() {
		try { refs.previewVideo.playbackRate = state.speed; } catch (e) { /* some browsers limit playbackRate */ }
	}

	function updateSpeedInfo() {
		if (!state.file) {
			refs.speedInfo.textContent = 'Pick a speed to preview.';
			refs.speedInfo.className = 'vsc-speed-info';
			refs.applyBtn.disabled = true;
			return;
		}
		if (state.file.size > MAX_INPUT_BYTES) {
			refs.speedInfo.textContent = '';
			refs.applyBtn.disabled = true;
			return;
		}
		var s = state.speed;
		if (!isFinite(s) || s < MIN_SPEED || s > MAX_SPEED) {
			refs.speedInfo.textContent = 'Speed must be between ' + MIN_SPEED + '× and ' + MAX_SPEED + '×.';
			refs.speedInfo.className = 'vsc-speed-info is-error';
			refs.applyBtn.disabled = true;
			return;
		}
		if (Math.abs(s - 1) < SPEED_NOOP_EPSILON) {
			refs.speedInfo.textContent = 'Speed change must differ from 1.0× — pick a preset or enter a different value.';
			refs.speedInfo.className = 'vsc-speed-info is-error';
			refs.applyBtn.disabled = true;
			return;
		}
		var stem = getStem(state.file.name);
		refs.speedInfo.textContent = 'Output: ' + stem + '-' + formatSpeed(s) + 'x.mp4 (re-encoded H.264 + AAC).';
		refs.speedInfo.className = 'vsc-speed-info';
		refs.applyBtn.disabled = false;
	}

	function setSpeed(n) {
		var s = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Number(n)));
		state.speed = s;
		syncPresetActiveState();
		syncPreviewPlaybackRate();
		updateSpeedInfo();
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
			refs.speedInfo.textContent = '';
			return;
		}

		if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
		state.previewObjectUrl = URL.createObjectURL(file);
		refs.previewVideo.src = state.previewObjectUrl;
		refs.previewVideo.addEventListener('loadedmetadata', function onMeta() {
			refs.previewVideo.removeEventListener('loadedmetadata', onMeta);
			syncPreviewPlaybackRate();
		});

		// Default speed
		state.speed = DEFAULT_SPEED;
		refs.speedCustom.value = '';
		syncPresetActiveState();
		updateSpeedInfo();
	}

	function clearFile() {
		state.file = null;
		state.speed = DEFAULT_SPEED;
		if (state.outputBlobUrl) { URL.revokeObjectURL(state.outputBlobUrl); state.outputBlobUrl = null; }
		if (state.previewObjectUrl) { URL.revokeObjectURL(state.previewObjectUrl); state.previewObjectUrl = null; }
		refs.fileInput.value = '';
		refs.previewVideo.removeAttribute('src');
		refs.resultsVideo.removeAttribute('src');
		refs.oversizedWarning.hidden = true;
		refs.speedCustom.value = '';
		showSection('idle');
		setLoadingState({ visible: false });
		syncPresetActiveState();
	}

	function doApply() {
		if (!state.file || !window.how7oFfmpeg) return;
		var cmd = buildCommand(state.file.name, state.speed);
		var stem = getStem(state.file.name);
		var outputFilename = sanitizeFilename(stem + '-' + formatSpeed(state.speed) + 'x.mp4');

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Re-encoding video at ' + formatSpeed(state.speed) + '× speed',
				icon: '&#9889;',
				percent: 0,
				hint: 'Re-encoding is slower than trimming. Hang tight.',
				eta: '',
				isError: false,
				showRetry: false
			});
			unsub = window.how7oFfmpeg.onProcessProgress(function (evt) {
				var p = Math.max(0, Math.min(1, evt.progress || 0));
				var elapsed = (Date.now() - processStart) / 1000;
				var eta = p > 0.02 ? Math.max(0, Math.round(elapsed / p - elapsed)) : null;
				setLoadingState({
					visible: true,
					percent: p,
					eta: eta !== null ? '~' + eta + ' seconds remaining' : ''
				});
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
				console.error('[vsc] encode error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				setLoadingState({
					visible: true,
					label: likelyMemory ? 'Video too large for your browser' : 'Couldn\'t change the speed',
					icon: '&#9888;',
					percent: 0,
					hint: likelyMemory
						? 'Your browser ran out of memory. Try a shorter clip or close other tabs.'
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
				console.error('[vsc] FFmpeg load error', err);
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
		a.download = refs.downloadBtn.dataset.filename || 'video-speed.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone         = document.getElementById('vscDropZone');
		refs.fileInput        = document.getElementById('vscFileInput');
		refs.browseBtn        = document.getElementById('vscBrowseBtn');
		refs.controls         = document.getElementById('vscControls');
		refs.fileName         = document.getElementById('vscFileName');
		refs.fileMeta         = document.getElementById('vscFileMeta');
		refs.fileClearBtn     = document.getElementById('vscFileClearBtn');
		refs.oversizedWarning = document.getElementById('vscOversizedWarning');
		refs.previewVideo     = document.getElementById('vscPreviewVideo');
		refs.presetButtons    = document.querySelectorAll('.vsc-speed-preset');
		refs.speedCustom      = document.getElementById('vscSpeedCustom');
		refs.speedInfo        = document.getElementById('vscSpeedInfo');
		refs.applyBtn         = document.getElementById('vscApplyBtn');
		refs.loadingPanel     = document.getElementById('vscLoadingPanel');
		refs.loadingLabel     = document.getElementById('vscLoadingLabel');
		refs.loadingIcon      = document.getElementById('vscLoadingIcon');
		refs.loadingBar       = document.getElementById('vscLoadingBar');
		refs.loadingBarFill   = document.getElementById('vscLoadingBarFill');
		refs.loadingPercent   = document.getElementById('vscLoadingPercent');
		refs.loadingHint      = document.getElementById('vscLoadingHint');
		refs.loadingEta       = document.getElementById('vscLoadingEta');
		refs.loadingRetry     = document.getElementById('vscLoadingRetry');
		refs.results          = document.getElementById('vscResults');
		refs.resultsMsg       = document.getElementById('vscResultsMsg');
		refs.resultsVideo     = document.getElementById('vscResultsVideo');
		refs.downloadBtn      = document.getElementById('vscDownloadBtn');
		refs.resetBtn         = document.getElementById('vscResetBtn');

		if (!refs.dropZone) return;

		// File input + drop zone
		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#vscBrowseBtn')) return;
			refs.fileInput.click();
		});
		refs.browseBtn.addEventListener('click', function (e) {
			e.stopPropagation();
			refs.fileInput.click();
		});
		refs.fileInput.addEventListener('change', function (e) {
			var f = e.target.files && e.target.files[0];
			if (f) acceptFile(f);
		});

		// Drag-and-drop
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

		// Speed presets
		Array.prototype.forEach.call(refs.presetButtons, function (btn) {
			btn.addEventListener('click', function () {
				var v = parseFloat(btn.getAttribute('data-speed'));
				if (isFinite(v)) {
					refs.speedCustom.value = '';
					setSpeed(v);
				}
			});
		});
		refs.speedCustom.addEventListener('input', function (e) {
			var v = parseFloat(e.target.value);
			if (isFinite(v)) setSpeed(v);
		});
		refs.speedCustom.addEventListener('change', function (e) {
			var v = parseFloat(e.target.value);
			if (isFinite(v)) {
				setSpeed(v);
				e.target.value = formatSpeed(state.speed);
			} else {
				updateSpeedInfo();
			}
		});

		// Controls wiring
		refs.fileClearBtn.addEventListener('click', clearFile);
		refs.applyBtn.addEventListener('click', doApply);
		refs.loadingRetry.addEventListener('click', doApply);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', clearFile);

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.vsc-faq-item').forEach(function (item) {
			var btn = item.querySelector('.vsc-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('vsc-faq-touched');
				item.classList.toggle('vsc-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
