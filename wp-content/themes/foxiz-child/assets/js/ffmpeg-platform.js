/*
 * FFmpeg.wasm platform — shared across all client-side video tools.
 *
 * Exposes window.how7oFfmpeg with:
 *   load(onProgress)                          -> Promise<FFmpeg>  (cached)
 *   isLoaded()                                -> boolean
 *   instance()                                -> FFmpeg | null
 *   onProcessProgress(callback)               -> unsubscribe()
 *   exec(args, inputFile, outName)            -> Promise<Uint8Array>
 *   execMulti(args, files, outName)           -> Promise<Uint8Array>
 *
 * Requires (loaded as script-tag deps before this module):
 *   - vendor/ffmpeg/ffmpeg.min.js  (provides window.FFmpegWASM)
 *
 * Internally fetches:
 *   - vendor/ffmpeg/ffmpeg-core.js   (text/javascript)
 *   - vendor/ffmpeg/ffmpeg-core.wasm (application/wasm)
 *
 * All paths same-origin — no COEP/COOP required.
 */
(function (global) {
	'use strict';

	if (global.how7oFfmpeg) return; // already loaded

	var CORE_BASE = '/wp-content/themes/foxiz-child/assets/js/vendor/ffmpeg';

	var state = {
		ffmpeg: null,
		loadPromise: null,
		processProgressListeners: []
	};

	/**
	 * Fetch a vendor file and return a blob URL (FFmpeg.wasm needs blob URLs
	 * for its core scripts because it instantiates them as workers internally).
	 * onProgress is called with a fraction 0..1 of bytes received.
	 */
	function toBlobURL(url, mimeType, onProgress) {
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', url, true);
			xhr.responseType = 'arraybuffer';
			xhr.onprogress = function (e) {
				if (onProgress && e.lengthComputable) {
					onProgress(e.loaded / e.total);
				}
			};
			xhr.onload = function () {
				if (xhr.status >= 200 && xhr.status < 300) {
					var blob = new Blob([xhr.response], { type: mimeType });
					resolve(URL.createObjectURL(blob));
				} else {
					reject(new Error('HTTP ' + xhr.status + ' for ' + url));
				}
			};
			xhr.onerror = function () { reject(new Error('Network error loading ' + url)); };
			xhr.send();
		});
	}

	/**
	 * Lazy-load FFmpeg. Safe to call multiple times — returns the same promise.
	 * onProgress receives a fraction 0..1 representing the COMBINED progress of
	 * core.js (small) + core.wasm (large).
	 */
	function load(onProgress) {
		if (state.loadPromise) return state.loadPromise;

		state.loadPromise = (function () {
			if (!global.FFmpegWASM || !global.FFmpegWASM.FFmpeg) {
				return Promise.reject(new Error(
					'FFmpegWASM global not found — make sure vendor/ffmpeg/ffmpeg.min.js is loaded first'
				));
			}

			var ffmpeg = new global.FFmpegWASM.FFmpeg();

			// Wire process progress events
			ffmpeg.on('progress', function (evt) {
				for (var i = 0; i < state.processProgressListeners.length; i++) {
					try { state.processProgressListeners[i](evt); } catch (e) { /* swallow */ }
				}
			});

			// Track combined fetch progress
			var coreJsBytes = 0;
			var wasmBytes = 0;
			var WASM_WEIGHT = 0.97; // wasm is ~98% of the bytes
			var CORE_JS_WEIGHT = 1 - WASM_WEIGHT;
			function emit() {
				if (onProgress) {
					onProgress(coreJsBytes * CORE_JS_WEIGHT + wasmBytes * WASM_WEIGHT);
				}
			}

			return Promise.all([
				toBlobURL(CORE_BASE + '/ffmpeg-core.js', 'text/javascript',
					function (p) { coreJsBytes = p; emit(); }),
				toBlobURL(CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm',
					function (p) { wasmBytes = p; emit(); })
			]).then(function (urls) {
				return ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1] });
			}).then(function () {
				state.ffmpeg = ffmpeg;
				if (onProgress) onProgress(1);
				return ffmpeg;
			});
		})();

		// On rejection, clear the cached promise so a retry can re-attempt
		state.loadPromise.catch(function () { state.loadPromise = null; });

		return state.loadPromise;
	}

	function isLoaded() { return !!state.ffmpeg; }
	function instance() { return state.ffmpeg; }

	function onProcessProgress(callback) {
		state.processProgressListeners.push(callback);
		return function unsubscribe() {
			var idx = state.processProgressListeners.indexOf(callback);
			if (idx !== -1) state.processProgressListeners.splice(idx, 1);
		};
	}

	/**
	 * Mount inputFile via WORKERFS (lazy-reads from the File without ever
	 * loading the whole thing into RAM), run `args` (a string array of FFmpeg
	 * CLI args — should reference 'input' and outName), and read the resulting
	 * outName as a Uint8Array.
	 *
	 * WORKERFS avoids the File.arrayBuffer() memory limit (~2 GB on Chrome),
	 * so multi-GB videos work as long as the OUTPUT fits in memory — which it
	 * always does for audio extraction.
	 */
	function exec(args, inputFile, outName) {
		if (!state.ffmpeg) return Promise.reject(new Error('FFmpeg not loaded — call load() first'));
		var ffmpeg = state.ffmpeg;
		var mountPoint = '/mnt';
		var inputPath = mountPoint + '/' + inputFile.name;

		function unmountSafe() {
			try { return ffmpeg.unmount(mountPoint); } catch (e) {}
		}
		function deleteOutSafe() {
			try { ffmpeg.deleteFile(outName); } catch (e) {}
		}

		// Ensure mount point exists. createDir throws if it already exists — swallow.
		return Promise.resolve(ffmpeg.createDir(mountPoint)).catch(function () {})
			.then(function () {
				return ffmpeg.mount('WORKERFS', { files: [inputFile] }, mountPoint);
			})
			.then(function () {
				var resolved = args.map(function (a) { return a === 'input' ? inputPath : a; });
				return ffmpeg.exec(resolved);
			})
			.then(function () {
				return ffmpeg.readFile(outName);
			})
			.then(function (data) {
				unmountSafe();
				deleteOutSafe();
				return data;
			})
			.catch(function (err) {
				unmountSafe();
				deleteOutSafe();
				throw err;
			});
	}

	/**
	 * Multi-input variant of exec(). Mounts ALL files in WORKERFS at /mnt
	 * and substitutes 'input0', 'input1', ... in args with their full paths.
	 *
	 * Use 'inputN' (where N is the zero-based index into files) in the args
	 * array; this function will replace each occurrence with the mounted path.
	 *
	 * Optional `extras` parameter (object: { 'filename.txt': 'string content' })
	 * writes auxiliary text files into FFmpeg's MEMFS root before exec, with
	 * the same 'inputN' substitution applied to their contents. Useful for
	 * the concat demuxer's list file. Extras are cleaned up after exec.
	 */
	function execMulti(args, files, outName, extras) {
		if (!state.ffmpeg) return Promise.reject(new Error('FFmpeg not loaded — call load() first'));
		if (!files || files.length < 1) return Promise.reject(new Error('execMulti needs at least one file'));
		var ffmpeg = state.ffmpeg;
		var mountPoint = '/mnt';

		// Build the input-path map: index → full /mnt/{name} path. Filenames
		// must be unique within the mount, so prepend index if collisions exist.
		var seen = {};
		var paths = [];
		var mountFiles = [];
		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			var name = f.name;
			if (seen[name]) {
				// Prefix with index to avoid collision.
				name = i + '_' + name;
			}
			seen[name] = 1;
			if (name === f.name) {
				mountFiles.push(f);
			} else {
				try {
					mountFiles.push(new File([f], name, { type: f.type, lastModified: f.lastModified }));
				} catch (e) {
					// File constructor unavailable — fall back to original name.
					mountFiles.push(f);
				}
			}
			paths.push(mountPoint + '/' + name);
		}

		function substituteInputs(s) {
			return String(s).replace(/input(\d+)/g, function (match, idxStr) {
				var idx = parseInt(idxStr, 10);
				if (idx >= 0 && idx < paths.length) return paths[idx];
				return match;
			});
		}

		var extraNames = extras ? Object.keys(extras) : [];

		function unmountSafe() { try { return ffmpeg.unmount(mountPoint); } catch (e) {} }
		function deleteOutSafe() { try { ffmpeg.deleteFile(outName); } catch (e) {} }
		function deleteExtrasSafe() {
			for (var i = 0; i < extraNames.length; i++) {
				try { ffmpeg.deleteFile(extraNames[i]); } catch (e) {}
			}
		}

		return Promise.resolve(ffmpeg.createDir(mountPoint)).catch(function () {})
			.then(function () {
				return ffmpeg.mount('WORKERFS', { files: mountFiles }, mountPoint);
			})
			.then(function () {
				// Write any auxiliary text files (e.g., concat.txt) with input substitution applied.
				var writes = extraNames.map(function (name) {
					var content = substituteInputs(extras[name]);
					var bytes = new TextEncoder().encode(content);
					return ffmpeg.writeFile(name, bytes);
				});
				return Promise.all(writes);
			})
			.then(function () {
				var resolved = args.map(function (a) {
					if (typeof a === 'string' && /^input\d+$/.test(a)) {
						var idx = parseInt(a.slice(5), 10);
						if (idx >= 0 && idx < paths.length) return paths[idx];
					}
					return a;
				});
				return ffmpeg.exec(resolved);
			})
			.then(function () { return ffmpeg.readFile(outName); })
			.then(function (data) { unmountSafe(); deleteOutSafe(); deleteExtrasSafe(); return data; })
			.catch(function (err) { unmountSafe(); deleteOutSafe(); deleteExtrasSafe(); throw err; });
	}

	// One-time cleanup: a previous version of this module registered a
	// Service Worker (foxiz-child/sw-ffmpeg-stream.js) for streaming output.
	// That approach was reverted. Unregister any leftover registrations so
	// they don't accumulate or interfere with future page loads.
	if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
		navigator.serviceWorker.getRegistrations().then(function (regs) {
			regs.forEach(function (reg) {
				if (reg && reg.scope && reg.scope.indexOf('../../wp-content/themes/foxiz-child/index.html') !== -1) {
					reg.unregister().catch(function () {});
				}
			});
		}).catch(function () {});
	}

	global.how7oFfmpeg = {
		load: load,
		isLoaded: isLoaded,
		instance: instance,
		onProcessProgress: onProcessProgress,
		exec: exec,
		execMulti: execMulti
	};

})(typeof window !== 'undefined' ? window : this);

// ---------------------------------------------------------------
// Inline contract tests (Node-runnable; no-op in browser)
// ---------------------------------------------------------------
(function () {
	if (typeof window !== 'undefined') return;
	var mod = (typeof global !== 'undefined' ? global : this).how7oFfmpeg;
	if (!mod) { console.error('[ffmpeg-platform] global how7oFfmpeg not attached'); return; }
	var keys = ['load', 'isLoaded', 'instance', 'onProcessProgress', 'exec', 'execMulti'];
	var missing = keys.filter(function (k) { return typeof mod[k] !== 'function'; });
	if (missing.length) {
		console.error('[ffmpeg-platform] missing API methods:', missing);
	} else {
		console.log('[ffmpeg-platform] API surface: OK (6 methods)');
	}
})();
