(function () {
	'use strict';

	// ---------------------------------------------------------------
	// Pure helpers (Node-testable)
	// ---------------------------------------------------------------

	var KNOWN_EXTS = { mp4: 1, mov: 1, mkv: 1, webm: 1, avi: 1, m4v: 1, flv: 1, wmv: 1, '3gp': 1 };

	var MAX_FILES = Infinity;
	var MIN_FILES = 2;
	var MAX_PER_FILE_BYTES = Infinity;
	var MAX_TOTAL_BYTES = Infinity;

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
	 * Build the filter_complex chain for N clips with target resolution W×H.
	 * Each input is scaled (preserve aspect) and padded to W×H, then all are
	 * concatenated with their audio streams.
	 */
	function buildScalePadConcat(n, w, h) {
		var parts = [];
		var concat = [];
		for (var i = 0; i < n; i++) {
			parts.push('[' + i + ':v]scale=' + w + ':' + h + ':force_original_aspect_ratio=decrease,pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1[v' + i + ']');
			concat.push('[v' + i + '][' + i + ':a]');
		}
		parts.push(concat.join('') + 'concat=n=' + n + ':v=1:a=1[v][a]');
		return parts.join(';');
	}

	/**
	 * Build the FFmpeg argument array. Inputs are referenced as 'input0', 'input1', …
	 * which the platform's execMulti() will substitute with mounted file paths.
	 */
	function buildCommand(filenames, w, h) {
		var n = filenames.length;
		var args = [];
		for (var i = 0; i < n; i++) {
			args.push('-i', 'input' + i);
		}
		args.push('-filter_complex', buildScalePadConcat(n, w, h));
		args.push('-map', '[v]');
		args.push('-map', '[a]');
		args.push('-c:v', 'libx264');
		args.push('-preset', 'veryfast');
		args.push('-crf', '23');
		args.push('-c:a', 'aac');
		args.push('-b:a', '128k');
		args.push('-movflags', '+faststart');
		args.push('output.mp4');
		return { args: args, outName: 'output.mp4' };
	}

	/**
	 * Build the concat demuxer list file content. Each line references one input
	 * by its 'inputN' placeholder, which the platform's execMulti() will
	 * substitute with the actual mounted path before writing the file.
	 *   buildConcatListContent(2) → "file 'input0'\nfile 'input1'\n"
	 */
	function buildConcatListContent(n) {
		var lines = [];
		for (var i = 0; i < n; i++) {
			lines.push("file 'input" + i + "'");
		}
		return lines.join('\n') + '\n';
	}

	/**
	 * Build the FFmpeg argument array for the FAST (stream-copy) path. Uses
	 * the concat demuxer which only works when all inputs share the same
	 * codec, resolution, framerate, and audio params. If they don't, FFmpeg
	 * errors and the caller falls back to buildCommand() (re-encode).
	 */
	function buildFastCommand(n) {
		var args = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4'];
		return { args: args, outName: 'output.mp4', extras: { 'concat.txt': buildConcatListContent(n) } };
	}

	// ---------------------------------------------------------------
	// Inline contract tests (Node-runnable; no-op in browser)
	// ---------------------------------------------------------------
	(function runTests() {
		if (typeof window !== 'undefined') return;

		// buildScalePadConcat
		var spCases = [
			[ 2, 1280, 720, '[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]' ],
			[ 3, 640,  480, '[0:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];[1:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];[2:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1[v2];[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[v][a]' ]
		];
		var spFailed = 0;
		spCases.forEach(function (c, i) {
			var got = buildScalePadConcat(c[0], c[1], c[2]);
			if (got !== c[3]) { console.error('[vmg] buildScalePadConcat case', i, '→', got, 'want', c[3]); spFailed++; }
		});
		if (spFailed === 0) console.log('[vmg] buildScalePadConcat: OK (' + spCases.length + ' cases)');

		// buildCommand
		var bcCases = [
			{ files: ['a.mp4', 'b.mkv'],         w: 1280, h: 720, n: 2 },
			{ files: ['a.mp4', 'b.mov', 'c.webm'], w: 640, h: 480, n: 3 }
		];
		var bcFailed = 0;
		bcCases.forEach(function (c, i) {
			var r = buildCommand(c.files, c.w, c.h);
			var inputCount = 0;
			for (var j = 0; j < r.args.length - 1; j++) {
				if (r.args[j] === '-i' && /^input\d+$/.test(r.args[j+1])) inputCount++;
			}
			if (inputCount !== c.n) { console.error('[vmg] buildCommand case', i, '-i count =', inputCount, 'want', c.n); bcFailed++; }
			if (r.outName !== 'output.mp4') { console.error('[vmg] buildCommand case', i, 'outName =', r.outName); bcFailed++; }
		});
		if (bcFailed === 0) console.log('[vmg] buildCommand: OK (' + bcCases.length + ' cases)');

		// buildConcatListContent
		var clCases = [
			[ 2, "file 'input0'\nfile 'input1'\n" ],
			[ 3, "file 'input0'\nfile 'input1'\nfile 'input2'\n" ],
			[ 1, "file 'input0'\n" ]
		];
		var clFailed = 0;
		clCases.forEach(function (c, i) {
			var got = buildConcatListContent(c[0]);
			if (got !== c[1]) { console.error('[vmg] buildConcatListContent case', i, '→', JSON.stringify(got), 'want', JSON.stringify(c[1])); clFailed++; }
		});
		if (clFailed === 0) console.log('[vmg] buildConcatListContent: OK (' + clCases.length + ' cases)');

		// buildFastCommand
		var fcCases = [ 2, 3, 5 ];
		var fcFailed = 0;
		fcCases.forEach(function (n) {
			var r = buildFastCommand(n);
			var expectedArgs = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4'];
			if (JSON.stringify(r.args) !== JSON.stringify(expectedArgs)) {
				console.error('[vmg] buildFastCommand n=' + n, 'args =', r.args, 'want', expectedArgs);
				fcFailed++;
			}
			if (!r.extras || !r.extras['concat.txt']) {
				console.error('[vmg] buildFastCommand n=' + n, 'missing concat.txt extra');
				fcFailed++;
			}
		});
		if (fcFailed === 0) console.log('[vmg] buildFastCommand: OK (' + fcCases.length + ' cases)');

		// formatBytes sanity
		if (formatBytes(0) !== '0 B' || formatBytes(1024) !== '1.0 KB' || formatBytes(1048576) !== '1.0 MB') {
			console.error('[vmg] formatBytes: FAIL');
		} else {
			console.log('[vmg] formatBytes: OK');
		}
	})();

	// ---------------------------------------------------------------
	// DOM (browser only)
	// ---------------------------------------------------------------

	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	var refs = {};
	var state = {
		clips: [],          // array of { file, duration, width, height, hasAudio, thumbUrl }
		outputBlobUrl: null
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

	function probeClip(file) {
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(file);
			var v = document.createElement('video');
			v.preload = 'metadata';
			v.muted = true;
			var done = false;
			function finish(result) {
				if (done) return;
				done = true;
				resolve(Object.assign({ file: file, thumbUrl: url }, result));
			}
			v.onloadedmetadata = function () {
				// No reliable way to detect audio-track presence from metadata alone.
				// webkitAudioDecodedByteCount is 0 until audio actually decodes; audioTracks
				// is non-standard and unavailable in Chrome. Default to true and let FFmpeg
				// surface a clear error during merge if a clip is genuinely silent.
				finish({ duration: v.duration || 0, width: v.videoWidth || 0, height: v.videoHeight || 0, hasAudio: true });
			};
			v.onerror = function () { finish({ duration: 0, width: 0, height: 0, hasAudio: true }); };
			setTimeout(function () { finish({ duration: 0, width: 0, height: 0, hasAudio: true }); }, 10000);
			v.src = url;
		});
	}

	function escapeHtml(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
		});
	}

	function renderList() {
		refs.list.innerHTML = '';
		state.clips.forEach(function (clip, idx) {
			var li = document.createElement('li');
			li.className = 'vmg-list-item';
			li.innerHTML = ''
				+ '<span class="vmg-list-num">' + (idx + 1) + '</span>'
				+ '<video class="vmg-list-thumb" muted preload="metadata" src="' + escapeHtml(clip.thumbUrl) + '"></video>'
				+ '<div class="vmg-list-name-row">'
					+ '<div class="vmg-list-name">' + escapeHtml(clip.file.name) + '</div>'
					+ '<div class="vmg-list-meta">' + formatBytes(clip.file.size) + ' · ' + formatDuration(clip.duration) + ' · ' + (clip.width || '?') + '×' + (clip.height || '?') + '</div>'
				+ '</div>'
				+ '<button type="button" class="vmg-list-action" data-action="up" data-idx="' + idx + '" aria-label="Move up"' + (idx === 0 ? ' disabled' : '') + '>↑</button>'
				+ '<button type="button" class="vmg-list-action" data-action="down" data-idx="' + idx + '" aria-label="Move down"' + (idx === state.clips.length - 1 ? ' disabled' : '') + '>↓</button>'
				+ '<button type="button" class="vmg-list-action vmg-list-remove" data-action="remove" data-idx="' + idx + '" aria-label="Remove">×</button>';
			refs.list.appendChild(li);
		});
		updateMergeInfo();
	}

	function totalBytes() {
		return state.clips.reduce(function (s, c) { return s + c.file.size; }, 0);
	}

	function updateMergeInfo() {
		var n = state.clips.length;
		refs.clipCount.textContent = n + (n === 1 ? ' clip' : ' clips');
		if (n === 0) {
			refs.mergeInfo.textContent = 'Drop video files to begin.';
			refs.mergeInfo.className = 'vmg-merge-info';
			refs.mergeBtn.disabled = true;
			return;
		}
		if (n < MIN_FILES) {
			refs.mergeInfo.textContent = 'Add at least ' + MIN_FILES + ' clips to enable merge.';
			refs.mergeInfo.className = 'vmg-merge-info';
			refs.mergeBtn.disabled = true;
			return;
		}
		var noAudio = null;
		for (var i = 0; i < state.clips.length; i++) {
			if (!state.clips[i].hasAudio) { noAudio = state.clips[i]; break; }
		}
		if (noAudio) {
			refs.mergeInfo.textContent = '"' + noAudio.file.name + '" has no detectable audio track. All clips must have audio.';
			refs.mergeInfo.className = 'vmg-merge-info is-error';
			refs.mergeBtn.disabled = true;
			return;
		}
		var total = totalBytes();
		var totalDur = state.clips.reduce(function (s, c) { return s + (c.duration || 0); }, 0);
		var first = state.clips[0];
		refs.mergeInfo.textContent = 'Combined: ' + formatBytes(total) + ' · ' + formatDuration(totalDur) + ' · output @ ' + (first.width || '?') + '×' + (first.height || '?');
		refs.mergeInfo.className = 'vmg-merge-info';
		refs.mergeBtn.disabled = false;
	}

	function addFiles(filesLike) {
		var files = Array.prototype.slice.call(filesLike || []);
		if (!files.length) return;
		var accepted = files;

		var probes = [];
		for (var i = 0; i < accepted.length; i++) {
			var f = accepted[i];
			var ext = (f.name.split('.').pop() || '').toLowerCase();
			if (f.type.indexOf('video/') === 0 || KNOWN_EXTS[ext]) {
				probes.push(probeClip(f));
			}
		}

		if (!probes.length) return;

		Promise.all(probes).then(function (results) {
			results.forEach(function (r) { state.clips.push(r); });
			showSection('controls');
			renderList();
		});
	}

	function moveClip(idx, dir) {
		var to = idx + dir;
		if (to < 0 || to >= state.clips.length) return;
		var tmp = state.clips[idx];
		state.clips[idx] = state.clips[to];
		state.clips[to] = tmp;
		renderList();
	}

	function removeClip(idx) {
		var clip = state.clips.splice(idx, 1)[0];
		if (clip && clip.thumbUrl) URL.revokeObjectURL(clip.thumbUrl);
		if (state.clips.length === 0) {
			showSection('idle');
		} else {
			renderList();
		}
	}

	function resetList() {
		state.clips.forEach(function (c) { if (c.thumbUrl) URL.revokeObjectURL(c.thumbUrl); });
		state.clips = [];
		refs.fileInput.value = '';
		showSection('idle');
	}

	function doMerge() {
		if (!window.how7oFfmpeg || !window.how7oFfmpeg.execMulti) return;
		if (state.clips.length < MIN_FILES) return;

		var first = state.clips[0];
		var w = first.width || 1280;
		var h = first.height || 720;
		var filenames = state.clips.map(function (c) { return c.file.name; });
		var files = state.clips.map(function (c) { return c.file; });
		var outputFilename = sanitizeFilename('merged-video.mp4');

		showSection('loading');
		var unsub = null;

		function onSuccess(data) {
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
		}

		function onError(err) {
			if (unsub) unsub();
			console.error('[vmg] merge error', err);
			var msg = String(err && err.message || err);
			var likelyMemory = err instanceof RangeError || /allocation|out of memory|range/i.test(msg);
			setLoadingState({
				visible: true,
				label: likelyMemory ? 'Videos too large for your browser' : 'Couldn\'t merge these videos',
				icon: '&#9888;',
				percent: 0,
				hint: likelyMemory
					? 'Your browser ran out of memory. Try smaller clips or fewer clips.'
					: 'One of the clips may use an unsupported codec, or may be missing an audio track. Try different files.',
				eta: '',
				isError: true,
				showRetry: false
			});
			refs.controls.hidden = false;
		}

		function runEncode(useFastPath) {
			var processStart = Date.now();
			var cmd = useFastPath
				? buildFastCommand(state.clips.length)
				: buildCommand(filenames, w, h);

			setLoadingState({
				visible: true,
				label: useFastPath
					? 'Trying fast merge (lossless stream-copy)'
					: 'Merging ' + state.clips.length + ' videos (re-encoding)',
				icon: '&#9881;',
				percent: 0,
				hint: useFastPath
					? 'Checking if inputs are stream-copy compatible…'
					: 'Re-encoding all clips. This is slower than trimming.',
				eta: '',
				isError: false,
				showRetry: false
			});

			if (unsub) unsub();
			unsub = window.how7oFfmpeg.onProcessProgress(function (evt) {
				var p = Math.max(0, Math.min(1, evt.progress || 0));
				var elapsed = (Date.now() - processStart) / 1000;
				var eta = p > 0.02 ? Math.max(0, Math.round(elapsed / p - elapsed)) : null;
				setLoadingState({ visible: true, percent: p, eta: eta !== null ? '~' + eta + ' seconds remaining' : '' });
			});

			window.how7oFfmpeg.execMulti(cmd.args, files, cmd.outName, cmd.extras).then(onSuccess).catch(function (err) {
				if (useFastPath) {
					console.log('[vmg] fast path failed, falling back to re-encode:', err && err.message);
					runEncode(false);
				} else {
					onError(err);
				}
			});
		}

		if (window.how7oFfmpeg.isLoaded()) {
			runEncode(true);
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
			}).then(function () { runEncode(true); }).catch(function (err) {
				console.error('[vmg] FFmpeg load error', err);
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
		a.download = refs.downloadBtn.dataset.filename || 'merged-video.mp4';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function init() {
		refs.dropZone        = document.getElementById('vmgDropZone');
		refs.fileInput       = document.getElementById('vmgFileInput');
		refs.browseBtn       = document.getElementById('vmgBrowseBtn');
		refs.controls        = document.getElementById('vmgControls');
		refs.list            = document.getElementById('vmgList');
		refs.clipCount       = document.getElementById('vmgClipCount');
		refs.addMoreBtn      = document.getElementById('vmgAddMoreBtn');
		refs.resetListBtn    = document.getElementById('vmgResetListBtn');
		refs.mergeInfo       = document.getElementById('vmgMergeInfo');
		refs.mergeBtn        = document.getElementById('vmgMergeBtn');
		refs.loadingPanel    = document.getElementById('vmgLoadingPanel');
		refs.loadingLabel    = document.getElementById('vmgLoadingLabel');
		refs.loadingIcon     = document.getElementById('vmgLoadingIcon');
		refs.loadingBar      = document.getElementById('vmgLoadingBar');
		refs.loadingBarFill  = document.getElementById('vmgLoadingBarFill');
		refs.loadingPercent  = document.getElementById('vmgLoadingPercent');
		refs.loadingHint     = document.getElementById('vmgLoadingHint');
		refs.loadingEta      = document.getElementById('vmgLoadingEta');
		refs.loadingRetry    = document.getElementById('vmgLoadingRetry');
		refs.results         = document.getElementById('vmgResults');
		refs.resultsMsg      = document.getElementById('vmgResultsMsg');
		refs.resultsVideo    = document.getElementById('vmgResultsVideo');
		refs.downloadBtn     = document.getElementById('vmgDownloadBtn');
		refs.resetBtn        = document.getElementById('vmgResetBtn');

		if (!refs.dropZone) return;

		refs.dropZone.addEventListener('click', function (e) {
			if (e.target === refs.browseBtn || e.target.closest('#vmgBrowseBtn')) return;
			refs.fileInput.click();
		});
		refs.browseBtn.addEventListener('click', function (e) { e.stopPropagation(); refs.fileInput.click(); });
		refs.fileInput.addEventListener('change', function (e) {
			addFiles(e.target.files);
			e.target.value = '';
		});

		['dragenter', 'dragover'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.add('is-dragover'); });
		});
		['dragleave', 'drop'].forEach(function (ev) {
			refs.dropZone.addEventListener(ev, function (e) { e.preventDefault(); refs.dropZone.classList.remove('is-dragover'); });
		});
		refs.dropZone.addEventListener('drop', function (e) {
			if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
		});

		refs.list.addEventListener('click', function (e) {
			var btn = e.target.closest('.vmg-list-action');
			if (!btn) return;
			var idx = parseInt(btn.getAttribute('data-idx'), 10);
			var action = btn.getAttribute('data-action');
			if (action === 'up') moveClip(idx, -1);
			else if (action === 'down') moveClip(idx, 1);
			else if (action === 'remove') removeClip(idx);
		});

		refs.addMoreBtn.addEventListener('click', function () {
			refs.fileInput.click();
		});
		refs.resetListBtn.addEventListener('click', resetList);

		refs.mergeBtn.addEventListener('click', doMerge);
		refs.loadingRetry.addEventListener('click', doMerge);
		refs.downloadBtn.addEventListener('click', doDownload);
		refs.resetBtn.addEventListener('click', resetList);

		// FAQ accordion (matches the pattern used across other tool pages)
		document.querySelectorAll('.vmg-faq-item').forEach(function (item) {
			var btn = item.querySelector('.vmg-faq-question');
			if (!btn) return;
			btn.addEventListener('click', function () {
				item.classList.add('vmg-faq-touched');
				item.classList.toggle('vmg-faq-open');
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})();
