(function () {
	'use strict';

	// ---------------------------------------------------------------
	// FFmpeg command construction
	// ---------------------------------------------------------------

	// OGG quality scale derived from the bitrate dropdown
	var OGG_QUALITY_MAP = { 96: 2, 128: 4, 192: 6, 256: 8, 320: 9 };

	/**
	 * Build the FFmpeg argument array for a given format + options.
	 * Returns { args, outName }. `args` references 'input' as a placeholder
	 * that ffmpeg-platform.exec() will substitute with the real input name.
	 */
	function buildCommand(format, bitrate, startSec, endSec) {
		var args = [];

		// -ss before -i = input-side seek (faster)
		if (startSec > 0) { args.push('-ss', String(startSec)); }
		if (endSec > 0 && endSec > startSec) { args.push('-to', String(endSec)); }

		args.push('-i', 'input', '-vn');

		var outName;
		switch (format) {
			case 'mp3':
				args.push('-c:a', 'libmp3lame', '-b:a', bitrate + 'k');
				outName = 'output.mp3';
				break;
			case 'wav':
				args.push('-c:a', 'pcm_s16le');
				outName = 'output.wav';
				break;
			case 'aac':
				args.push('-c:a', 'aac', '-b:a', bitrate + 'k');
				outName = 'output.aac';
				break;
			case 'flac':
				args.push('-c:a', 'flac');
				outName = 'output.flac';
				break;
			case 'ogg':
				args.push('-c:a', 'libvorbis', '-q:a', String(OGG_QUALITY_MAP[bitrate] || 6));
				outName = 'output.ogg';
				break;
			default:
				throw new Error('Unknown format: ' + format);
		}
		args.push(outName);
		return { args: args, outName: outName };
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;
		var cases = [
			{
				input:  { format: 'mp3',  bitrate: 192, start: 0,  end: 0 },
				expect: ['-i', 'input', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'output.mp3']
			},
			{
				input:  { format: 'mp3',  bitrate: 192, start: 30, end: 90 },
				expect: ['-ss', '30', '-to', '90', '-i', 'input', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'output.mp3']
			},
			{
				input:  { format: 'wav',  bitrate: 192, start: 0,  end: 0 },
				expect: ['-i', 'input', '-vn', '-c:a', 'pcm_s16le', 'output.wav']
			},
			{
				input:  { format: 'flac', bitrate: 192, start: 0,  end: 0 },
				expect: ['-i', 'input', '-vn', '-c:a', 'flac', 'output.flac']
			},
			{
				input:  { format: 'ogg',  bitrate: 320, start: 0,  end: 0 },
				expect: ['-i', 'input', '-vn', '-c:a', 'libvorbis', '-q:a', '9', 'output.ogg']
			},
			{
				input:  { format: 'aac',  bitrate: 256, start: 0,  end: 0 },
				expect: ['-i', 'input', '-vn', '-c:a', 'aac', '-b:a', '256k', 'output.aac']
			},
			{
				// invalid range (end <= start): should drop -to entirely
				input:  { format: 'mp3',  bitrate: 192, start: 30, end: 20 },
				expect: ['-ss', '30', '-i', 'input', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'output.mp3']
			}
		];
		var failed = 0;
		cases.forEach(function (c, i) {
			var result = buildCommand(c.input.format, c.input.bitrate, c.input.start, c.input.end);
			var got = JSON.stringify(result.args);
			var want = JSON.stringify(c.expect);
			if (got !== want) {
				console.error('[vta] buildCommand case', i, 'failed');
				console.error('  input :', JSON.stringify(c.input));
				console.error('  want  :', want);
				console.error('  got   :', got);
				failed++;
			}
		});
		if (failed === 0) console.log('[vta] buildCommand contract: OK (' + cases.length + ' cases)');
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

	// Returns the part of the filename before the last dot (the basename
	// without extension). Misnamed historically as "getExtension" — kept
	// the new name to make intent obvious to future maintainers.
	function getStem(filename) {
		var idx = filename.lastIndexOf('.');
		return idx === -1 ? filename : filename.slice(0, idx);
	}

	// ---------------------------------------------------------------
	// DOM setup (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var refs = {};
	var state = {
		file: null,
		duration: 0,
		outputBlobUrl: null
	};

	function setLoadingState(opts) {
		// opts: { visible, label, icon, percent (0..1 or null), hint, eta, isError, showRetry, indeterminate }
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
		refs.dropZone.hidden  = (name !== 'idle');
		refs.controls.hidden  = (name !== 'controls');
		refs.results.hidden   = (name !== 'results');
		if (name === 'loading') {
			refs.controls.hidden = true;
		}
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
			// 10-second timeout: malformed videos that fire neither event leak the blob URL otherwise.
			setTimeout(function () { done(0); }, 10000);
			v.src = URL.createObjectURL(file);
		});
	}

	function acceptFile(file) {
		state.file = file;
		refs.fileName.textContent = file.name;
		refs.fileMeta.textContent = formatBytes(file.size);
		showSection('controls');
		updateConvertLabel();
		updateConvertEnabled();
		probeDuration(file).then(function (d) {
			state.duration = d;
			if (d > 0) {
				refs.fileMeta.textContent = formatBytes(file.size) + ' · ' + formatDuration(d);
			}
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
		showSection('idle');
		setLoadingState({ visible: false });
	}

	function updateConvertLabel() {
		var fmt = refs.format.value.toUpperCase();
		refs.convertLabel.textContent = 'Convert to ' + fmt;
		// Hide bitrate when WAV or FLAC (uncompressed/lossless — bitrate is moot)
		var fmtVal = refs.format.value;
		refs.bitrateField.style.display = (fmtVal === 'wav' || fmtVal === 'flac') ? 'none' : '';
	}

	function rangeSecondsToInt(min, sec) {
		var m = parseInt(min, 10) || 0;
		var s = parseInt(sec, 10) || 0;
		return m * 60 + s;
	}

	function updateConvertEnabled() {
		var disabled = !state.file;
		if (state.file) {
			var startSec = rangeSecondsToInt(refs.startMin.value, refs.startSec.value);
			var endSec   = rangeSecondsToInt(refs.endMin.value,   refs.endSec.value);
			if (endSec > 0 && endSec <= startSec) {
				disabled = true;
				refs.rangeHint.textContent = 'End time must be greater than start time.';
				refs.rangeHint.style.color = '#991b1b';
			} else if (startSec === 0 && endSec === 0) {
				refs.rangeHint.textContent = 'Leave both at 0:00 to convert the whole video.';
				refs.rangeHint.style.color = '';
			} else {
				refs.rangeHint.textContent = 'Converting ' + formatDuration(startSec) + ' to ' + (endSec ? formatDuration(endSec) : 'end') + '.';
				refs.rangeHint.style.color = '';
			}
		}
		refs.convertBtn.disabled = disabled;
	}

	function toggleRange() {
		var expanded = refs.rangeToggle.getAttribute('aria-expanded') === 'true';
		refs.rangeToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
		refs.range.hidden = expanded;
	}

	function doConvert() {
		if (!state.file || !window.how7oFfmpeg) return;
		var format    = refs.format.value;
		var bitrate   = parseInt(refs.bitrate.value, 10) || 192;
		var startSec  = rangeSecondsToInt(refs.startMin.value, refs.startSec.value);
		var endSec    = rangeSecondsToInt(refs.endMin.value,   refs.endSec.value);

		var cmd;
		try { cmd = buildCommand(format, bitrate, startSec, endSec); }
		catch (e) { alert('Format error: ' + e.message); return; }

		showSection('loading');
		var processStart = 0;
		var unsub = null;

		function startProcess() {
			processStart = Date.now();
			setLoadingState({
				visible: true,
				label: 'Converting to ' + format.toUpperCase(),
				icon: '&#127925;', // music note
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
						'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'aac': 'audio/aac',
						'flac': 'audio/flac', 'ogg': 'audio/ogg'
					};
					var blob = new Blob([data.buffer], { type: mimeMap[format] || 'application/octet-stream' });
					if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
					state.outputBlobUrl = URL.createObjectURL(blob);
					refs.resultsAudio.src = state.outputBlobUrl;
					refs.resultsMsg.textContent = 'Done! ' + (getStem(state.file.name) || 'audio') + '.' + format + ' · ' + formatBytes(blob.size);
					refs.downloadBtn.dataset.filename = (getStem(state.file.name) || 'audio') + '.' + format;
					showSection('results');
				} finally {
					if (unsub) unsub();
					setLoadingState({ visible: false });
				}
			}).catch(function (err) {
				if (unsub) unsub();
				console.error('[vta] convert error', err);
				var msg = String(err && err.message || err);
				var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
				setLoadingState({
					visible: true,
					label: likelyMemory ? 'File too large for your browser' : 'Conversion failed',
					icon: '&#9888;', // warning sign
					percent: 0,
					hint: likelyMemory
						? 'Your browser ran out of memory. Close other tabs to free RAM, try a shorter clip with the time-range option, or use a desktop tool for very large files.'
						: 'The video may be corrupted or use an unsupported codec. Try a different file or output format.',
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
				icon: '&#9881;', // gear
				percent: 0,
				hint: 'One-time download. Future visits start instantly.',
				eta: '',
				isError: false,
				showRetry: false
			});
			window.how7oFfmpeg.load(function (frac) {
				setLoadingState({ visible: true, percent: frac });
			}).then(function () {
				// Brief "Initializing..." indeterminate beat
				setLoadingState({
					visible: true,
					label: 'Initializing',
					percent: null,
					hint: ''
				});
				return new Promise(function (r) { setTimeout(r, 250); });
			}).then(startProcess).catch(function (err) {
				console.error('[vta] FFmpeg load error', err);
				setLoadingState({
					visible: true,
					label: "Couldn't load the processing engine",
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
		a.download = refs.downloadBtn.dataset.filename || 'audio.mp3';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone        = document.getElementById('vtaDropZone');
		refs.fileInput       = document.getElementById('vtaFileInput');
		refs.browseBtn       = document.getElementById('vtaBrowseBtn');
		refs.controls        = document.getElementById('vtaControls');
		refs.fileName        = document.getElementById('vtaFileName');
		refs.fileMeta        = document.getElementById('vtaFileMeta');
		refs.fileClearBtn    = document.getElementById('vtaFileClearBtn');
		refs.format          = document.getElementById('vtaFormat');
		refs.bitrate         = document.getElementById('vtaBitrate');
		refs.bitrateField    = document.getElementById('vtaBitrateField');
		refs.rangeToggle     = document.getElementById('vtaRangeToggle');
		refs.range           = document.getElementById('vtaRange');
		refs.rangeHint       = document.getElementById('vtaRangeHint');
		refs.startMin        = document.getElementById('vtaStartMin');
		refs.startSec        = document.getElementById('vtaStartSec');
		refs.endMin          = document.getElementById('vtaEndMin');
		refs.endSec          = document.getElementById('vtaEndSec');
		refs.convertBtn      = document.getElementById('vtaConvertBtn');
		refs.convertLabel    = document.getElementById('vtaConvertLabel');
		refs.loadingPanel    = document.getElementById('vtaLoadingPanel');
		refs.loadingLabel    = document.getElementById('vtaLoadingLabel');
		refs.loadingIcon     = document.getElementById('vtaLoadingIcon');
		refs.loadingBar      = document.getElementById('vtaLoadingBar');
		refs.loadingBarFill  = document.getElementById('vtaLoadingBarFill');
		refs.loadingPercent  = document.getElementById('vtaLoadingPercent');
		refs.loadingHint     = document.getElementById('vtaLoadingHint');
		refs.loadingEta      = document.getElementById('vtaLoadingEta');
		refs.loadingRetry    = document.getElementById('vtaLoadingRetry');
		refs.results         = document.getElementById('vtaResults');
		refs.resultsMsg      = document.getElementById('vtaResultsMsg');
		refs.resultsAudio    = document.getElementById('vtaResultsAudio');
		refs.downloadBtn     = document.getElementById('vtaDownloadBtn');
		refs.resetBtn        = document.getElementById('vtaResetBtn');

		if (!refs.dropZone) return; // not on this page

		// File input + drop zone
		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#vtaBrowseBtn')) return;
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
			var VIDEO_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };
			var ext = (f.name.split('.').pop() || '').toLowerCase();
			if (f.type.indexOf('video/') === 0 || VIDEO_EXTS[ext]) acceptFile(f);
		});

		// Controls wiring
		refs.fileClearBtn.addEventListener('click', clearFile);
		refs.format.addEventListener('change', updateConvertLabel);
		refs.rangeToggle.addEventListener('click', toggleRange);
		['input', 'change'].forEach(function (ev) {
			refs.startMin.addEventListener(ev, updateConvertEnabled);
			refs.startSec.addEventListener(ev, updateConvertEnabled);
			refs.endMin.addEventListener(ev, updateConvertEnabled);
			refs.endSec.addEventListener(ev, updateConvertEnabled);
		});
		refs.convertBtn.addEventListener('click', doConvert);
		refs.loadingRetry.addEventListener('click', doConvert);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', clearFile);

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.vta-faq-item').forEach(function (item) {
			var btn = item.querySelector('.vta-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('vta-faq-touched');
				item.classList.toggle('vta-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
