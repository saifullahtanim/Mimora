(function () {
	'use strict';

	// ---------------------------------------------------------------
	// Pure helpers (Node-testable)
	// ---------------------------------------------------------------

	var KNOWN_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };

	function getExt(filename) {
		if (!filename || filename.indexOf('.') === -1) return 'mp4';
		var ext = filename.split('.').pop().toLowerCase();
		return KNOWN_EXTS[ext] ? ext : 'mp4';
	}

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

	function parseTimecode(str) {
		if (typeof str !== 'string') return NaN;
		var parts = str.trim().split(':').map(function (p) { return parseInt(p, 10); });
		if (parts.some(isNaN)) return NaN;
		if (parts.length === 1) return parts[0];
		if (parts.length === 2) return parts[0] * 60 + parts[1];
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		return NaN;
	}

	function sanitizeFilename(name) {
		return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
	}

	/**
	 * Build the FFmpeg argument array.
	 * `-ss` BEFORE `-i` = input-side seek (fast, keyframe-aligned).
	 */
	function buildCommand(filename, startSec, endSec) {
		var ext = getExt(filename);
		var outName = 'output.' + ext;
		var args = [
			'-ss', String(startSec),
			'-to', String(endSec),
			'-i', 'input',
			'-c', 'copy',
			outName
		];
		return { args: args, outName: outName, ext: ext };
	}

	/**
	 * Estimate output bytes from clip duration / total duration / input size.
	 * Heuristic — assumes roughly constant bitrate.
	 */
	function estimateOutputBytes(inputBytes, totalDuration, startSec, endSec) {
		if (!totalDuration || totalDuration <= 0) return 0;
		var clip = Math.max(0, endSec - startSec);
		if (clip <= 0) return 0;
		return Math.round(inputBytes * (clip / totalDuration));
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;

		// parseTimecode + formatDuration roundtrip
		var tcCases = [
			['00:00:00', 0],
			['00:00:30', 30],
			['00:01:30', 90],
			['00:12:30', 750],
			['01:00:00', 3600],
			['02:34:56', 9296],
			['1:30', 90],
			['90', 90],
			['', NaN],
			['abc', NaN]
		];
		var tcFailed = 0;
		tcCases.forEach(function (c, i) {
			var got = parseTimecode(c[0]);
			var want = c[1];
			var ok = (isNaN(want) && isNaN(got)) || got === want;
			if (!ok) { console.error('[vtr] parseTimecode case', i, c[0], '→', got, 'want', want); tcFailed++; }
		});
		if (tcFailed === 0) console.log('[vtr] parseTimecode: OK (' + tcCases.length + ' cases)');

		// formatDuration
		var fdCases = [
			[0, '00:00:00'], [30, '00:00:30'], [90, '00:01:30'],
			[3600, '01:00:00'], [9296, '02:34:56']
		];
		var fdFailed = 0;
		fdCases.forEach(function (c, i) {
			if (formatDuration(c[0]) !== c[1]) { console.error('[vtr] formatDuration case', i, c[0], '→', formatDuration(c[0]), 'want', c[1]); fdFailed++; }
		});
		if (fdFailed === 0) console.log('[vtr] formatDuration: OK (' + fdCases.length + ' cases)');

		// buildCommand
		var bcCases = [
			{ in: ['a.mp4',  0, 30], out: ['-ss', '0',  '-to', '30', '-i', 'input', '-c', 'copy', 'output.mp4'] },
			{ in: ['a.MOV',  10, 60], out: ['-ss', '10', '-to', '60', '-i', 'input', '-c', 'copy', 'output.mov'] },
			{ in: ['a.mkv',  5,  35], out: ['-ss', '5',  '-to', '35', '-i', 'input', '-c', 'copy', 'output.mkv'] },
			{ in: ['weird.xyz', 0, 10], out: ['-ss', '0', '-to', '10', '-i', 'input', '-c', 'copy', 'output.mp4'] }
		];
		var bcFailed = 0;
		bcCases.forEach(function (c, i) {
			var r = buildCommand.apply(null, c.in);
			if (JSON.stringify(r.args) !== JSON.stringify(c.out)) {
				console.error('[vtr] buildCommand case', i, c.in, '→', r.args, 'want', c.out);
				bcFailed++;
			}
		});
		if (bcFailed === 0) console.log('[vtr] buildCommand: OK (' + bcCases.length + ' cases)');

		// estimateOutputBytes
		var eoCases = [
			{ in: [1000000000, 3600, 0, 360],   out: 100000000 },
			{ in: [1000000000, 3600, 0, 0],     out: 0 },
			{ in: [1000000000, 3600, 100, 50],  out: 0 },
			{ in: [1000000000, 0, 0, 30],       out: 0 },
			{ in: [500 * 1024 * 1024, 100, 0, 50], out: Math.round(500 * 1024 * 1024 / 2) }
		];
		var eoFailed = 0;
		eoCases.forEach(function (c, i) {
			var r = estimateOutputBytes.apply(null, c.in);
			if (r !== c.out) { console.error('[vtr] estimateOutputBytes case', i, c.in, '→', r, 'want', c.out); eoFailed++; }
		});
		if (eoFailed === 0) console.log('[vtr] estimateOutputBytes: OK (' + eoCases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var MAX_INPUT_BYTES = Infinity;
	var MAX_OUTPUT_BYTES = Infinity;
	var OUTPUT_WARN_BYTES = Infinity;

	var refs = {};
	var state = {
		file: null,
		duration: 0,
		start: 0,
		end: 0,
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

	function acceptFile(file) {
		state.file = file;
		state.duration = 0;
		state.start = 0;
		state.end = 0;
		refs.fileName.textContent = file.name;
		refs.fileMeta.textContent = formatBytes(file.size);
		showSection('controls');

		if (file.size > MAX_INPUT_BYTES) {
			refs.previewVideo.removeAttribute('src');
			refs.clipInfo.textContent = 'This file is over ' + formatBytes(MAX_INPUT_BYTES) + '. Most browsers can\'t handle inputs that large. Try a smaller file.';
			refs.clipInfo.className = 'vtr-clip-info is-error';
			refs.trimBtn.disabled = true;
			return;
		}

		// Load video into preview.
		if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
		state.previewObjectUrl = URL.createObjectURL(file);
		refs.previewVideo.src = state.previewObjectUrl;
		refs.previewVideo.onloadedmetadata = function () {
			state.duration = refs.previewVideo.duration || 0;
			state.start = 0;
			state.end = state.duration;
			updateSliderMax();
			updateAllControls();
		};
	}

	function clearFile() {
		state.file = null;
		state.duration = 0;
		state.start = 0;
		state.end = 0;
		if (state.outputBlobUrl) { URL.revokeObjectURL(state.outputBlobUrl); state.outputBlobUrl = null; }
		if (state.previewObjectUrl) { URL.revokeObjectURL(state.previewObjectUrl); state.previewObjectUrl = null; }
		refs.fileInput.value = '';
		refs.previewVideo.removeAttribute('src');
		refs.resultsVideo.removeAttribute('src');
		showSection('idle');
		setLoadingState({ visible: false });
	}

	function updateSliderMax() {
		var max = Math.max(1, Math.floor(state.duration));
		refs.rangeStart.max = String(max);
		refs.rangeEnd.max = String(max);
		refs.rangeStart.value = String(Math.floor(state.start));
		refs.rangeEnd.value = String(Math.floor(state.end));
	}

	function updateFillBar() {
		if (state.duration <= 0) {
			refs.rangeFill.style.left = '0%';
			refs.rangeFill.style.width = '0%';
			return;
		}
		var leftPct = (state.start / state.duration) * 100;
		var widthPct = ((state.end - state.start) / state.duration) * 100;
		refs.rangeFill.style.left = leftPct + '%';
		refs.rangeFill.style.width = Math.max(0, widthPct) + '%';
	}

	function updateTimecodeInputs() {
		// Avoid clobbering the user's typing — only set value if the field
		// isn't currently focused, OR if the value differs from what's there.
		if (document.activeElement !== refs.startTimecode) {
			refs.startTimecode.value = formatDuration(state.start);
		}
		if (document.activeElement !== refs.endTimecode) {
			refs.endTimecode.value = formatDuration(state.end);
		}
	}

	function updateClipInfo() {
		if (!state.file || state.duration <= 0) {
			refs.clipInfo.textContent = 'Drop a video to begin.';
			refs.clipInfo.className = 'vtr-clip-info';
			refs.trimBtn.disabled = true;
			return;
		}
		var clip = state.end - state.start;
		if (clip <= 0) {
			refs.clipInfo.textContent = 'End time must be after start time.';
			refs.clipInfo.className = 'vtr-clip-info is-error';
			refs.trimBtn.disabled = true;
			return;
		}
		var est = estimateOutputBytes(state.file.size, state.duration, state.start, state.end);
		var line = 'Clip: ' + formatDuration(clip) + ' · Estimated output: ~' + formatBytes(est);
		if (est > MAX_OUTPUT_BYTES) {
			line += ' — exceeds ' + formatBytes(MAX_OUTPUT_BYTES) + ' browser memory cap';
			refs.clipInfo.textContent = line;
			refs.clipInfo.className = 'vtr-clip-info is-error';
			refs.trimBtn.disabled = true;
		} else if (est > OUTPUT_WARN_BYTES) {
			line += ' ⚠ near memory limit';
			refs.clipInfo.textContent = line;
			refs.clipInfo.className = 'vtr-clip-info is-warn';
			refs.trimBtn.disabled = false;
		} else {
			refs.clipInfo.textContent = line;
			refs.clipInfo.className = 'vtr-clip-info';
			refs.trimBtn.disabled = false;
		}
	}

	function updateAllControls() {
		updateSliderMax();
		updateFillBar();
		updateTimecodeInputs();
		updateClipInfo();
	}

	function setStart(sec) {
		var s = Math.max(0, Math.min(sec, state.duration));
		if (s > state.end) state.end = Math.min(state.duration, s + 1);
		state.start = s;
		updateFillBar(); updateTimecodeInputs(); updateClipInfo();
		refs.rangeStart.value = String(Math.floor(s));
		refs.rangeEnd.value = String(Math.floor(state.end));
	}

	function setEnd(sec) {
		var e = Math.max(0, Math.min(sec, state.duration));
		if (e < state.start) state.start = Math.max(0, e - 1);
		state.end = e;
		updateFillBar(); updateTimecodeInputs(); updateClipInfo();
		refs.rangeStart.value = String(Math.floor(state.start));
		refs.rangeEnd.value = String(Math.floor(e));
	}

	function doTrim() {
		if (!state.file || !window.how7oFfmpeg) return;
		var cmd = buildCommand(state.file.name, state.start, state.end);
		var stem = getStem(state.file.name);
		var outputFilename = sanitizeFilename(stem + '-trimmed.' + cmd.ext);

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Trimming',
				icon: '&#9986;&#65039;', // scissors
				percent: 0,
				hint: '',
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
					var mimeMap = {
						'mp4': 'video/mp4', 'mov': 'video/quicktime', 'mkv': 'video/x-matroska',
						'webm': 'video/webm', 'avi': 'video/x-msvideo', 'm4v': 'video/x-m4v',
						'flv': 'video/x-flv', 'wmv': 'video/x-ms-wmv', '3gp': 'video/3gpp'
					};
					var blob = new Blob([data.buffer], { type: mimeMap[cmd.ext] || 'video/mp4' });
					if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
					state.outputBlobUrl = URL.createObjectURL(blob);
					refs.resultsVideo.src = state.outputBlobUrl;
					refs.resultsMsg.textContent = 'Done! ' + outputFilename + ' · ' + formatBytes(blob.size) + ' · ' + formatDuration(state.end - state.start);
					refs.downloadBtn.dataset.filename = outputFilename;
					showSection('results');
				} finally {
					if (unsub) unsub();
					setLoadingState({ visible: false });
				}
			}).catch(function (err) {
				if (unsub) unsub();
				console.error('[vtr] trim error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				setLoadingState({
					visible: true,
					label: likelyMemory ? 'Clip too large for your browser' : 'Couldn\'t trim this video',
					icon: '&#9888;',
					percent: 0,
					hint: likelyMemory
						? 'Your browser ran out of memory. Try a shorter clip, close other tabs, or use a desktop tool for very large outputs.'
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
				console.error('[vtr] FFmpeg load error', err);
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
		a.download = refs.downloadBtn.dataset.filename || 'video-trimmed.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone        = document.getElementById('vtrDropZone');
		refs.fileInput       = document.getElementById('vtrFileInput');
		refs.browseBtn       = document.getElementById('vtrBrowseBtn');
		refs.controls        = document.getElementById('vtrControls');
		refs.fileName        = document.getElementById('vtrFileName');
		refs.fileMeta        = document.getElementById('vtrFileMeta');
		refs.fileClearBtn    = document.getElementById('vtrFileClearBtn');
		refs.previewVideo    = document.getElementById('vtrPreviewVideo');
		refs.rangeStart      = document.getElementById('vtrRangeStart');
		refs.rangeEnd        = document.getElementById('vtrRangeEnd');
		refs.rangeFill       = document.getElementById('vtrRangeFill');
		refs.startTimecode   = document.getElementById('vtrStartTimecode');
		refs.endTimecode     = document.getElementById('vtrEndTimecode');
		refs.setStartBtn     = document.getElementById('vtrSetStartFromPlayback');
		refs.setEndBtn       = document.getElementById('vtrSetEndFromPlayback');
		refs.clipInfo        = document.getElementById('vtrClipInfo');
		refs.trimBtn         = document.getElementById('vtrTrimBtn');
		refs.loadingPanel    = document.getElementById('vtrLoadingPanel');
		refs.loadingLabel    = document.getElementById('vtrLoadingLabel');
		refs.loadingIcon     = document.getElementById('vtrLoadingIcon');
		refs.loadingBar      = document.getElementById('vtrLoadingBar');
		refs.loadingBarFill  = document.getElementById('vtrLoadingBarFill');
		refs.loadingPercent  = document.getElementById('vtrLoadingPercent');
		refs.loadingHint     = document.getElementById('vtrLoadingHint');
		refs.loadingEta      = document.getElementById('vtrLoadingEta');
		refs.loadingRetry    = document.getElementById('vtrLoadingRetry');
		refs.results         = document.getElementById('vtrResults');
		refs.resultsMsg      = document.getElementById('vtrResultsMsg');
		refs.resultsVideo    = document.getElementById('vtrResultsVideo');
		refs.downloadBtn     = document.getElementById('vtrDownloadBtn');
		refs.resetBtn        = document.getElementById('vtrResetBtn');

		if (!refs.dropZone) return;

		// File input + drop zone
		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#vtrBrowseBtn')) return;
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

		// Range slider
		refs.rangeStart.addEventListener('input', function (e) { setStart(parseInt(e.target.value, 10) || 0); });
		refs.rangeEnd.addEventListener('input',   function (e) { setEnd(parseInt(e.target.value, 10) || 0); });

		// Timecode inputs
		refs.startTimecode.addEventListener('change', function (e) {
			var t = parseTimecode(e.target.value);
			if (!isNaN(t)) setStart(t);
			else updateTimecodeInputs();
		});
		refs.endTimecode.addEventListener('change', function (e) {
			var t = parseTimecode(e.target.value);
			if (!isNaN(t)) setEnd(t);
			else updateTimecodeInputs();
		});

		// Set-to-current buttons
		refs.setStartBtn.addEventListener('click', function () { setStart(refs.previewVideo.currentTime || 0); });
		refs.setEndBtn.addEventListener('click',   function () { setEnd(refs.previewVideo.currentTime || 0); });

		// Controls wiring
		refs.fileClearBtn.addEventListener('click', clearFile);
		refs.trimBtn.addEventListener('click', doTrim);
		refs.loadingRetry.addEventListener('click', doTrim);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', clearFile);

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.vtr-faq-item').forEach(function (item) {
			var btn = item.querySelector('.vtr-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('vtr-faq-touched');
				item.classList.toggle('vtr-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
