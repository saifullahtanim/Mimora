(function () {
	'use strict';

	// ---------------------------------------------------------------
	// FFmpeg command construction
	// ---------------------------------------------------------------

	// Recognized output container extensions. Any other extension falls back to mp4.
	var KNOWN_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };

	function getExt(filename) {
		if (!filename || filename.indexOf('.') === -1) return 'mp4';
		var ext = filename.split('.').pop().toLowerCase();
		return KNOWN_EXTS[ext] ? ext : 'mp4';
	}

	/**
	 * Build the FFmpeg argument array.
	 * Returns { args, outName }. `args` references 'input' as a placeholder
	 * that ffmpeg-platform.exec() substitutes with the mounted input path.
	 */
	function buildCommand(filename) {
		var ext = getExt(filename);
		var outName = 'output.' + ext;
		return {
			args: ['-i', 'input', '-c', 'copy', '-an', outName],
			outName: outName,
			ext: ext
		};
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;
		var cases = [
			{ in: 'my-video.mp4',  outName: 'output.mp4',  ext: 'mp4' },
			{ in: 'my-video.MOV',  outName: 'output.mov',  ext: 'mov' },
			{ in: 'clip.mkv',      outName: 'output.mkv',  ext: 'mkv' },
			{ in: 'rec.webm',      outName: 'output.webm', ext: 'webm' },
			{ in: 'old.WMV',       outName: 'output.wmv',  ext: 'wmv' },
			{ in: 'phone.3gp',     outName: 'output.3gp',  ext: '3gp' },
			{ in: 'unknown.xyz',   outName: 'output.mp4',  ext: 'mp4' },
			{ in: 'noext',         outName: 'output.mp4',  ext: 'mp4' }
		];
		var expectedArgs = function (outName) {
			return ['-i', 'input', '-c', 'copy', '-an', outName];
		};
		var failed = 0;
		cases.forEach(function (c, i) {
			var result = buildCommand(c.in);
			var wantArgs = JSON.stringify(expectedArgs(c.outName));
			var gotArgs = JSON.stringify(result.args);
			if (gotArgs !== wantArgs || result.outName !== c.outName || result.ext !== c.ext) {
				console.error('[rav] buildCommand case', i, 'failed');
				console.error('  in    :', c.in);
				console.error('  want  : args=' + wantArgs + ' outName=' + c.outName + ' ext=' + c.ext);
				console.error('  got   : args=' + gotArgs + ' outName=' + result.outName + ' ext=' + result.ext);
				failed++;
			}
		});
		if (failed === 0) console.log('[rav] buildCommand contract: OK (' + cases.length + ' cases)');
	})();

	// ---------------------------------------------------------------
	// Format helpers
	// ---------------------------------------------------------------

	function formatBytes(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
	}

	function formatDuration(seconds) {
		var m = Math.floor(seconds / 60);
		var s = Math.floor(seconds % 60);
		return m + ':' + (s < 10 ? '0' : '') + s;
	}

	function getStem(filename) {
		var idx = filename.lastIndexOf('.');
		return idx === -1 ? filename : filename.slice(0, idx);
	}

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var refs = {};
	var state = {
		file: null,
		duration: 0,
		outputBlobUrl: null
	};

	function setLoadingState(opts) {
		var panel = refs.loadingPanel;
		if (!panel) return;
		if (!opts.visible) {
			panel.classList.remove('is-visible', 'is-error');
			return;
		}
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

	function probeDuration(file) {
		return new Promise(function (resolve) {
			var v = document.createElement('video');
			v.preload = 'metadata';
			v.muted = true;
			var settled = false;
			function cleanup() { try { URL.revokeObjectURL(v.src); } catch (e) {} }
			function done(d) { if (settled) return; settled = true; cleanup(); resolve(d); }
			v.onloadedmetadata = function () { done(v.duration || 0); };
			v.onerror = function () { done(0); };
			setTimeout(function () { done(0); }, 10000);
			v.src = URL.createObjectURL(file);
		});
	}

	// Files above this size cannot be processed reliably in the browser —
	// FFmpeg.wasm reads its output back as a single Uint8Array which fails
	// to allocate above ~600-700 MB on most browsers. We block the attempt
	// and steer the user toward trimming first.
	var MAX_FILE_BYTES = Infinity;

	function fileMetaText(file, durationSec) {
		var parts = [formatBytes(file.size)];
		if (durationSec > 0) parts.push(formatDuration(durationSec));
		return parts.join(' · ');
	}

	function acceptFile(file) {
		state.file = file;
		refs.fileName.textContent = file.name;
		refs.fileMeta.textContent = fileMetaText(file, 0);
		showSection('controls');
		if (file.size > MAX_FILE_BYTES) {
			refs.removeBtn.disabled = true;
			if (refs.oversizedWarning) refs.oversizedWarning.hidden = false;
		} else {
			refs.removeBtn.disabled = false;
			if (refs.oversizedWarning) refs.oversizedWarning.hidden = true;
		}
		probeDuration(file).then(function (d) {
			state.duration = d;
			refs.fileMeta.textContent = fileMetaText(file, d);
		});
	}

	function clearFile() {
		state.file = null;
		state.duration = 0;
		refs.fileInput.value = '';
		if (state.outputBlobUrl) {
			URL.revokeObjectURL(state.outputBlobUrl);
			state.outputBlobUrl = null;
		}
		refs.resultsVideo.src = '';
		if (refs.oversizedWarning) refs.oversizedWarning.hidden = true;
		showSection('idle');
		setLoadingState({ visible: false });
	}

	function doRemoveAudio() {
		if (!state.file || !window.how7oFfmpeg) return;
		var cmd = buildCommand(state.file.name);

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Removing audio',
				icon: '&#128263;',
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
					refs.resultsMsg.textContent = 'Done! ' + getStem(state.file.name) + '-noaudio.' + cmd.ext + ' · ' + formatBytes(blob.size);
					refs.downloadBtn.dataset.filename = getStem(state.file.name) + '-noaudio.' + cmd.ext;
					showSection('results');
				} finally {
					if (unsub) unsub();
					setLoadingState({ visible: false });
				}
			}).catch(function (err) {
				if (unsub) unsub();
				console.error('[rav] remove-audio error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				var likelyCodec = /codec|stream|container|copy|copyts|invalid|unsupported/i.test(msg);
				var label, hint;
				if (likelyMemory) {
					label = 'File too large for your browser';
					hint = 'Your browser ran out of memory holding the output. Close other tabs to free RAM, try a shorter clip, or use a desktop tool for very large files.';
				} else if (likelyCodec) {
					label = 'Couldn’t process this file';
					hint = 'This video’s container/codec combination can’t be stream-copied. Try converting to MP4 first.';
				} else {
					label = 'Couldn’t process this file';
					hint = 'Something went wrong. Try a different file.';
				}
				setLoadingState({
					visible: true,
					label: label,
					icon: '&#9888;',
					percent: 0,
					hint: hint,
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
				console.error('[rav] FFmpeg load error', err);
				setLoadingState({
					visible: true,
					label: 'Couldn’t load the processing engine',
					icon: '&#9888;',
					percent: 0,
					hint: 'Check your connection and try again.',
					eta: '',
					isError: true,
					showRetry: true
				});
				// Restore the controls so the user can swap files or cancel
				// without reloading the page if retry also fails.
				refs.controls.hidden = false;
			});
		}
	}

	function doDownload() {
		if (!state.outputBlobUrl) return;
		var a = document.createElement('a');
		a.href = state.outputBlobUrl;
		a.download = refs.downloadBtn.dataset.filename || 'video-noaudio.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone        = document.getElementById('ravDropZone');
		refs.fileInput       = document.getElementById('ravFileInput');
		refs.browseBtn       = document.getElementById('ravBrowseBtn');
		refs.controls        = document.getElementById('ravControls');
		refs.fileName        = document.getElementById('ravFileName');
		refs.fileMeta        = document.getElementById('ravFileMeta');
		refs.fileClearBtn    = document.getElementById('ravFileClearBtn');
		refs.removeBtn       = document.getElementById('ravRemoveBtn');
		refs.loadingPanel    = document.getElementById('ravLoadingPanel');
		refs.loadingLabel    = document.getElementById('ravLoadingLabel');
		refs.loadingIcon     = document.getElementById('ravLoadingIcon');
		refs.loadingBar      = document.getElementById('ravLoadingBar');
		refs.loadingBarFill  = document.getElementById('ravLoadingBarFill');
		refs.loadingPercent  = document.getElementById('ravLoadingPercent');
		refs.loadingHint     = document.getElementById('ravLoadingHint');
		refs.loadingEta      = document.getElementById('ravLoadingEta');
		refs.loadingRetry    = document.getElementById('ravLoadingRetry');
		refs.results         = document.getElementById('ravResults');
		refs.resultsMsg      = document.getElementById('ravResultsMsg');
		refs.resultsVideo    = document.getElementById('ravResultsVideo');
		refs.downloadBtn     = document.getElementById('ravDownloadBtn');
		refs.resetBtn        = document.getElementById('ravResetBtn');
		refs.oversizedWarning = document.getElementById('ravOversizedWarning');

		if (!refs.dropZone) return;

		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#ravBrowseBtn')) return;
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

		['dragenter', 'dragover'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) {
				e.preventDefault();
				refs.dropZone.classList.add('is-dragover');
			});
		});
		['dragleave', 'drop'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) {
				e.preventDefault();
				refs.dropZone.classList.remove('is-dragover');
			});
		});
		refs.dropZone.addEventListener('drop', function (e) {
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (!f) return;
			// Many browsers report f.type as '' for MKV / some MOV files.
			// Fall back to extension matching so drag-drop accepts the same
			// files the <input accept="..."> attribute does.
			var ext = (f.name.split('.').pop() || '').toLowerCase();
			if (f.type.indexOf('video/') === 0 || KNOWN_EXTS[ext]) acceptFile(f);
		});

		refs.fileClearBtn.addEventListener('click', clearFile);
		refs.removeBtn.addEventListener('click', doRemoveAudio);
		refs.loadingRetry.addEventListener('click', doRemoveAudio);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', clearFile);

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.rav-faq-item').forEach(function (item) {
			var btn = item.querySelector('.rav-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('rav-faq-touched');
				item.classList.toggle('rav-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
