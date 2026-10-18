/**
 * ASS/SSA -> SRT subtitle converter (client-side).
 *
 * Pipeline per file: read bytes -> resolve encoding (auto-detect via jschardet
 * or manual override) -> TextDecoder -> parse [Events] using the Format line ->
 * convert timestamps, strip override tags + drawing commands, apply line-keep
 * choice -> optional OpenCC Chinese conversion -> emit UTF-8 SRT.
 *
 * Deps (enqueued separately): window.jschardet, window.OpenCC, JSZip, saveAs.
 */
(function () {
	'use strict';

	/* ---------------------------------------------------------------------- *
	 * Lazy vendor loading
	 *
	 * jschardet (~334KB) and OpenCC (~1.07MB) are NOT statically enqueued —
	 * they are fetched on demand the first time a conversion actually needs
	 * them (auto-detect / Chinese conversion), keeping ~1.4MB off the default
	 * page load. Mirrors the loadScript pattern in image-upscaler.js.
	 * ---------------------------------------------------------------------- */
	var ASSET_BASE = (typeof window !== 'undefined' && window.A2S_ASSET_BASE) || '';
	var vendorPromises = {};

	function loadScript(src) {
		return new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = src;
			s.onload = function () { resolve(); };
			s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
			document.head.appendChild(s);
		});
	}

	function loadVendor(key, src) {
		if (!vendorPromises[key]) vendorPromises[key] = loadScript(src);
		return vendorPromises[key];
	}

	/* ---------------------------------------------------------------------- *
	 * Encoding
	 * ---------------------------------------------------------------------- */

	// Build a binary ("latin1") string from bytes for jschardet, chunked to
	// stay clear of the argument-count limit on String.fromCharCode.apply.
	function bytesToBinaryString(bytes) {
		var out = '';
		var CHUNK = 0x8000;
		for (var i = 0; i < bytes.length; i += CHUNK) {
			out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
		}
		return out;
	}

	// Map a detector/label name onto a label TextDecoder understands.
	function normalizeLabel(label) {
		var l = String(label || '').toLowerCase().trim();
		if (l === 'ascii' || l === 'us-ascii') return 'utf-8';
		if (l === 'gb2312') return 'gbk';
		return l;
	}

	function detectEncoding(bytes) {
		// Trust a BOM before anything statistical.
		if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
		if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
		if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
		if (window.jschardet) {
			try {
				var r = window.jschardet.detect(bytesToBinaryString(bytes));
				if (r && r.encoding) return normalizeLabel(r.encoding);
			} catch (e) { /* fall through */ }
		}
		return null;
	}

	// Returns { text, encoding }. Non-fatal decode: bad bytes become U+FFFD
	// rather than throwing, so a wrong guess is recoverable via the override.
	function decodeBytes(bytes, choice) {
		var label = choice;
		if (choice === 'auto') {
			label = detectEncoding(bytes) || 'utf-8';
		}
		try {
			return { text: new TextDecoder(label, { fatal: false }).decode(bytes), encoding: label };
		} catch (e) {
			return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
		}
	}

	/* ---------------------------------------------------------------------- *
	 * Time
	 * ---------------------------------------------------------------------- */

	// ASS time is H:MM:SS.cc (centiseconds). Tolerate comma decimals and any
	// fractional-digit count by treating the fraction as a decimal of a second.
	function assTimeToMs(t) {
		var m = /^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/.exec(String(t).trim());
		if (!m) return null;
		var h = +m[1], mi = +m[2], s = +m[3];
		var ms = m[4] ? Math.round(parseFloat('0.' + m[4]) * 1000) : 0;
		return (((h * 60 + mi) * 60 + s) * 1000) + ms;
	}

	function pad(n, width) {
		n = String(n);
		while (n.length < width) n = '0' + n;
		return n;
	}

	function msToSrt(ms) {
		if (ms < 0) ms = 0;
		var h = Math.floor(ms / 3600000); ms -= h * 3600000;
		var mi = Math.floor(ms / 60000); ms -= mi * 60000;
		var s = Math.floor(ms / 1000); var mm = ms - s * 1000;
		return pad(h, 2) + ':' + pad(mi, 2) + ':' + pad(s, 2) + ',' + pad(mm, 3);
	}

	/* ---------------------------------------------------------------------- *
	 * Text cleanup
	 * ---------------------------------------------------------------------- */

	// Strip {\...} override blocks and drop \p drawing-mode command runs, then
	// resolve \N / \n line breaks and \h hard spaces. Returns the cue text with
	// the chosen line(s) kept ('all' | 'first' | 'last').
	function cleanText(raw, lineMode) {
		var result = '';
		var drawing = false;
		var i = 0;
		while (i < raw.length) {
			if (raw[i] === '{') {
				var close = raw.indexOf('}', i);
				if (close < 0) { // unmatched brace: keep remainder as plain text
					if (!drawing) result += raw.slice(i);
					break;
				}
				var tag = raw.slice(i + 1, close);
				var pm = /\\p(\d+)/.exec(tag);
				if (pm) drawing = (+pm[1]) > 0; // \p1.. enters drawing mode, \p0 leaves
				i = close + 1;
				continue;
			}
			var next = raw.indexOf('{', i);
			if (next < 0) next = raw.length;
			if (!drawing) result += raw.slice(i, next);
			i = next;
		}

		result = result.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ');

		var parts = result.split('\n').map(function (s) { return s.trim(); })
			.filter(function (s) { return s.length > 0; });
		if (parts.length === 0) return '';
		if (lineMode === 'first') parts = [parts[0]];
		else if (lineMode === 'last') parts = [parts[parts.length - 1]];
		return parts.join('\n');
	}

	/* ---------------------------------------------------------------------- *
	 * ASS -> SRT
	 * ---------------------------------------------------------------------- */

	function convertAssToSrt(text, opts) {
		var lines = text.split(/\r\n|\r|\n/);
		var inEvents = false;
		var idxStart = -1, idxEnd = -1, idxText = -1, fieldCount = 0;
		var cues = [];

		for (var li = 0; li < lines.length; li++) {
			var line = lines[li].trim();
			if (!line) continue;
			if (line.charAt(0) === '[') { inEvents = /^\[events\]/i.test(line); continue; }
			if (!inEvents) continue;

			var ci = line.indexOf(':');
			if (ci < 0) continue;
			var key = line.slice(0, ci).trim().toLowerCase();
			var val = line.slice(ci + 1);

			if (key === 'format') {
				var fmt = val.split(',').map(function (s) { return s.trim().toLowerCase(); });
				fieldCount = fmt.length;
				idxStart = fmt.indexOf('start');
				idxEnd = fmt.indexOf('end');
				idxText = fmt.indexOf('text');
				continue;
			}

			if (key === 'dialogue') {
				if (idxStart < 0 || idxEnd < 0 || idxText < 0) continue;
				var parts = val.split(',');
				if (parts.length < fieldCount) continue; // malformed row
				var startMs = assTimeToMs(parts[idxStart]);
				var endMs = assTimeToMs(parts[idxEnd]);
				if (startMs === null || endMs === null) continue;
				// Text is the last field and may itself contain commas.
				var cueText = cleanText(parts.slice(idxText).join(','), opts.lineMode);
				if (!cueText) continue;
				cues.push({ startMs: startMs, endMs: endMs, text: cueText });
			}
		}

		if (cues.length === 0) {
			throw new Error('No subtitle events found — is this a valid ASS/SSA file?');
		}

		cues.sort(function (a, b) { return (a.startMs - b.startMs) || (a.endMs - b.endMs); });

		if (opts.converter) {
			for (var c = 0; c < cues.length; c++) cues[c].text = opts.converter(cues[c].text);
		}

		var out = [];
		for (var k = 0; k < cues.length; k++) {
			out.push(String(k + 1));
			out.push(msToSrt(cues[k].startMs) + ' --> ' + msToSrt(cues[k].endMs));
			out.push(cues[k].text);
			out.push('');
		}
		return out.join('\n');
	}

	function makeConverter(value) {
		if (!value || value === 'none' || !window.OpenCC) return null;
		var pair = value.split(':');
		try { return window.OpenCC.Converter({ from: pair[0], to: pair[1] }); }
		catch (e) { return null; }
	}

	function srtName(name) {
		return name.replace(/\.(ass|ssa)$/i, '') + '.srt';
	}

	/* ---------------------------------------------------------------------- *
	 * UI
	 * ---------------------------------------------------------------------- */

	document.addEventListener('DOMContentLoaded', function () {
		var root = document.querySelector('.a2s-main');
		if (!root) return;

		var dropZone = document.getElementById('a2sDropZone');
		var fileInput = document.getElementById('a2sFileInput');
		var browseBtn = document.getElementById('a2sBrowseBtn');
		var queueEl = document.getElementById('a2sQueue');
		var encSel = document.getElementById('a2sEncoding');
		var zhSel = document.getElementById('a2sChinese');
		var lineSel = document.getElementById('a2sLines');
		var convertBtn = document.getElementById('a2sConvertBtn');
		var clearBtn = document.getElementById('a2sClearBtn');
		var resultsWrap = document.getElementById('a2sResults');
		var resultsList = document.getElementById('a2sResultsList');
		var downloadAllBtn = document.getElementById('a2sDownloadAll');
		var toastWrap = document.getElementById('a2sToasts');

		var queue = [];          // File[]
		var lastResults = [];    // { name, srt }[] (successes only)

		function toast(msg, type) {
			var t = document.createElement('div');
			t.className = 'a2s-toast' + (type ? ' a2s-toast-' + type : '');
			t.textContent = msg;
			toastWrap.appendChild(t);
			setTimeout(function () { t.classList.add('a2s-toast-out'); }, 2600);
			setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
		}

		function isSubtitle(file) {
			return /\.(ass|ssa)$/i.test(file.name);
		}

		function addFiles(fileList) {
			var added = 0;
			for (var i = 0; i < fileList.length; i++) {
				var f = fileList[i];
				if (!isSubtitle(f)) continue;
				var dup = queue.some(function (q) { return q.name === f.name && q.size === f.size; });
				if (dup) continue;
				queue.push(f);
				added++;
			}
			if (added === 0 && fileList.length > 0) {
				toast('Please choose .ass or .ssa files.', 'error');
			}
			renderQueue();
		}

		function renderQueue() {
			queueEl.innerHTML = '';
			if (queue.length === 0) {
				convertBtn.disabled = true;
				clearBtn.disabled = true;
				return;
			}
			convertBtn.disabled = false;
			clearBtn.disabled = false;
			queue.forEach(function (f, idx) {
				var row = document.createElement('div');
				row.className = 'a2s-queue-item';

				var name = document.createElement('span');
				name.className = 'a2s-queue-name';
				name.textContent = f.name;

				var size = document.createElement('span');
				size.className = 'a2s-queue-size';
				size.textContent = (f.size < 1024) ? (f.size + ' B') : (Math.round(f.size / 1024) + ' KB');

				var rm = document.createElement('button');
				rm.type = 'button';
				rm.className = 'a2s-queue-remove';
				rm.setAttribute('aria-label', 'Remove ' + f.name);
				rm.innerHTML = '&times;';
				rm.addEventListener('click', function () { queue.splice(idx, 1); renderQueue(); });

				row.appendChild(name);
				row.appendChild(size);
				row.appendChild(rm);
				queueEl.appendChild(row);
			});
		}

		function readBytes(file) {
			if (file.arrayBuffer) {
				return file.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
			}
			return new Promise(function (resolve, reject) {
				var fr = new FileReader();
				fr.onload = function () { resolve(new Uint8Array(fr.result)); };
				fr.onerror = function () { reject(new Error('Could not read file')); };
				fr.readAsArrayBuffer(file);
			});
		}

		function renderResults(results) {
			resultsList.innerHTML = '';
			var successes = results.filter(function (r) { return !r.error; });
			// Use outName (.srt) so downloaded files and ZIP entries are named correctly.
			lastResults = successes.map(function (r) { return { name: r.outName, srt: r.srt }; });

			results.forEach(function (r) {
				var row = document.createElement('div');
				row.className = 'a2s-result-item' + (r.error ? ' is-error' : '');

				var info = document.createElement('div');
				info.className = 'a2s-result-info';

				var nm = document.createElement('span');
				nm.className = 'a2s-result-name';
				nm.textContent = r.outName || r.name;
				info.appendChild(nm);

				var status = document.createElement('span');
				status.className = 'a2s-result-status';
				status.textContent = r.error ? ('Failed: ' + r.error)
					: (r.cues + ' lines · ' + r.encoding.toUpperCase());
				info.appendChild(status);

				row.appendChild(info);

				if (!r.error) {
					var dl = document.createElement('button');
					dl.type = 'button';
					dl.className = 'a2s-btn a2s-btn-ghost a2s-result-dl';
					dl.textContent = 'Download .srt';
					dl.addEventListener('click', function () {
						saveAs(new Blob([r.srt], { type: 'text/srt;charset=utf-8' }), r.outName);
					});
					row.appendChild(dl);
				}

				resultsList.appendChild(row);
			});

			downloadAllBtn.style.display = (successes.length > 1) ? '' : 'none';
			resultsWrap.style.display = results.length ? '' : 'none';
		}

		// Fetch only the vendor libs this run actually needs.
		function ensureDeps() {
			var jobs = [];
			if (encSel.value === 'auto' && !window.jschardet) {
				// Non-fatal: detectEncoding() falls back to UTF-8 if this never loads.
				jobs.push(loadVendor('jschardet', ASSET_BASE + '/assets/js/vendor/jschardet.min.js').catch(function () {}));
			}
			if (zhSel.value !== 'none' && !window.OpenCC) {
				// Fatal if it fails — the user explicitly asked for Chinese conversion.
				jobs.push(loadVendor('opencc', ASSET_BASE + '/assets/js/vendor/opencc-js/full.js'));
			}
			return Promise.all(jobs);
		}

		function convert() {
			if (queue.length === 0) return;
			convertBtn.disabled = true;
			convertBtn.classList.add('is-busy');

			ensureDeps().then(function () {
				var converter = makeConverter(zhSel.value);
				var opts = { lineMode: lineSel.value, converter: converter };

				var tasks = queue.map(function (file) {
					return readBytes(file).then(function (bytes) {
						var dec = decodeBytes(bytes, encSel.value);
						var srt = convertAssToSrt(dec.text, opts);
						var cues = (srt.match(/-->/g) || []).length;
						return { name: file.name, outName: srtName(file.name), srt: srt, encoding: dec.encoding, cues: cues };
					}).catch(function (err) {
						return { name: file.name, outName: srtName(file.name), error: err.message || 'Conversion failed' };
					});
				});

				return Promise.all(tasks);
			}).then(function (results) {
				renderResults(results);
				convertBtn.disabled = false;
				convertBtn.classList.remove('is-busy');
				var ok = results.filter(function (r) { return !r.error; }).length;
				var bad = results.length - ok;
				if (ok && !bad) toast(ok === 1 ? 'Converted 1 file.' : ('Converted ' + ok + ' files.'), 'success');
				else if (ok && bad) toast(ok + ' converted, ' + bad + ' failed.', 'error');
				else toast('Conversion failed. Try a different encoding.', 'error');
			}).catch(function () {
				convertBtn.disabled = false;
				convertBtn.classList.remove('is-busy');
				toast('Could not load conversion components. Check your connection and try again.', 'error');
			});
		}

		function downloadAll() {
			if (lastResults.length === 0) return;
			if (lastResults.length === 1) {
				saveAs(new Blob([lastResults[0].srt], { type: 'text/srt;charset=utf-8' }), lastResults[0].name);
				return;
			}
			var zip = new JSZip();
			lastResults.forEach(function (r) { zip.file(r.name, r.srt); });
			zip.generateAsync({ type: 'blob' }).then(function (blob) {
				saveAs(blob, 'subtitles.zip');
			});
		}

		/* Events */
		browseBtn.addEventListener('click', function () { fileInput.click(); });
		fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });

		dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('is-drag'); });
		dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('is-drag'); });
		dropZone.addEventListener('drop', function (e) {
			e.preventDefault();
			dropZone.classList.remove('is-drag');
			if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
		});

		convertBtn.addEventListener('click', convert);
		clearBtn.addEventListener('click', function () {
			queue = [];
			lastResults = [];
			renderQueue();
			resultsList.innerHTML = '';
			resultsWrap.style.display = 'none';
		});
		downloadAllBtn.addEventListener('click', downloadAll);

		renderQueue();
	});

	// Inert in the browser (no CommonJS `module`); used only by the Node test harness.
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = { assTimeToMs: assTimeToMs, msToSrt: msToSrt, cleanText: cleanText, convertAssToSrt: convertAssToSrt, srtName: srtName, normalizeLabel: normalizeLabel };
	}
})();
