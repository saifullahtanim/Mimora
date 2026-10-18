/**
 * Fake Disk Format.
 *
 * DOS skin: types `format <drive>: /q` into a black console, prints the real
 * MS-DOS "ALL DATA ... WILL BE LOST" warning, optionally waits on the Y/N
 * prompt (the walk-away setup), then formats — a percent counter rewritten in
 * place plus a live head/cylinder/sector readout — and finishes with the full
 * completion report and a blinking prompt.
 *
 * Windows skin: a "Formatting Local Disk (C:)" dialog whose progress bar fills
 * at the chosen speed and whose Cancel button refuses to cancel.
 *
 * Nothing is formatted or touched: every byte count, sector and percentage is
 * generated here. Fullscreen / ESC / exit-bar come from the shared How7oPrank
 * controller. No vendor JS, no audio.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('fdfLaunch');
	var overlay   = document.getElementById('fdfOverlay');
	var screenEl  = document.getElementById('fdfScreen');
	var consoleEl = document.getElementById('fdfConsole');

	var dlgTitle  = document.getElementById('fdfDialogTitle');
	var dlgStatus = document.getElementById('fdfDialogStatus');
	var dlgSub    = document.getElementById('fdfDialogSub');
	var dlgFill   = document.getElementById('fdfDialogFill');
	var dlgBox    = document.getElementById('fdfDialog');
	var cancelBtn = document.getElementById('fdfCancel');
	var errorBox  = document.getElementById('fdfError');
	var errorOk   = document.getElementById('fdfErrorOk');
	var warnBox   = document.getElementById('fdfWarn');
	var warnText  = document.getElementById('fdfWarnText');
	var warnYes   = document.getElementById('fdfWarnYes');
	var warnNo    = document.getElementById('fdfWarnCancel');

	var skinSel   = document.getElementById('fdfSkin');
	var driveSel  = document.getElementById('fdfDrive');
	var speedSel  = document.getElementById('fdfSpeed');
	var promptChk = document.getElementById('fdfPrompt');
	var crtChk    = document.getElementById('fdfCrt');

	if (!launchBtn || !overlay || !screenEl || !consoleEl) return;

	var DURATIONS = { slow: 120000, normal: 45000, fast: 15000 };
	var TYPE_MS = 55;

	// One plausible ~40 GB disk, quoted consistently across both report styles
	// so the numbers hold up to a second look.
	var DISK_GB    = '40.0 GB';
	var DISK_FREE  = '39.9 GB';
	var DISK_MB    = '40,005.62M';
	var DISK_BYTES = '41,913,368,576';
	var ALLOC_UNIT = '4,096';
	var ALLOC_FREE = '10,232,756';

	// Real cmd.exe opens with this banner and prompts from the user's profile
	// directory — the two details that most say "this is a Windows terminal".
	var WIN_BANNER = 'Microsoft Windows [Version 10.0.19045.4046]\n' +
	                 '(c) Microsoft Corporation. All rights reserved.\n\n';

	var timers   = [];
	var raf      = null;
	var running  = false;
	var startAt  = 0;
	var duration = DURATIONS.normal;
	var drive    = 'C';
	var skin     = 'dos';
	var retro    = false;   // CRT / MS-DOS flavour instead of modern cmd.exe
	var statics  = '';      // console text already committed
	var keyHook  = null;

	function promptStr() {
		return retro ? drive + ':\\>' : drive + ':\\Users\\User>';
	}

	function every(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }
	function after(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

	function clearTimers() {
		timers.forEach(function (id) { clearInterval(id); clearTimeout(id); });
		timers = [];
		if (raf) { cancelAnimationFrame(raf); raf = null; }
	}

	function detachKeys() {
		if (keyHook) {
			document.removeEventListener('keydown', keyHook);
			keyHook = null;
		}
	}

	/* ---------- Console rendering ---------- */
	function esc(s) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function render(dynamic, caret) {
		var html = esc(statics + (dynamic || ''));
		if (caret) html += '<span class="fdf-caret"></span>';
		consoleEl.innerHTML = html;
	}

	function commit(text) {
		statics += text;
		render('', false);
	}

	function pad(n, width) {
		var s = String(n);
		while (s.length < width) s = ' ' + s;
		return s;
	}

	/* ---------- DOS: type the command, then the warning ---------- */
	function typeCommand(done) {
		var cmd = 'format ' + drive.toLowerCase() + ':';
		var i = 0;
		statics = (retro ? '' : WIN_BANNER) + promptStr();
		render('', true);

		var id = every(function () {
			i++;
			render(cmd.slice(0, i), true);
			if (i >= cmd.length) {
				clearInterval(id);
				statics += cmd;
				after(done, 420);
			}
		}, TYPE_MS);
	}

	function showWarning(waitForKey) {
		commit(
			'\n' + (retro ? '' : 'The type of the file system is NTFS.\n') +
			'\nWARNING, ALL DATA ON NON-REMOVABLE DISK\n' +
			'DRIVE ' + drive + ': WILL BE LOST!\n' +
			'Proceed with Format (Y/N)?'
		);
		render('', true);

		if (!waitForKey) {
			after(function () { answer('y'); }, 900);
			return;
		}

		keyHook = function (e) {
			if (e.key === 'Escape') return;   // ESC belongs to the shared controller
			e.preventDefault();
			detachKeys();
			answer(e.key === 'n' || e.key === 'N' ? 'n' : 'y');
		};
		document.addEventListener('keydown', keyHook);
	}

	function answer(ch) {
		commit(ch);

		// Saying no does NOT get you out of it — that is the prank. The refusal
		// beat mirrors the Windows skin's Cancel button, which also refuses.
		if (ch === 'n') {
			after(function () {
				commit('\n\nThe format operation cannot be aborted at this stage.');
				after(startFormatting, 1100);
			}, 420);
			return;
		}

		after(startFormatting, 500);
	}

	/* ---------- DOS: the format itself ---------- */
	function startFormatting() {
		commit('\n\nFormatting ' + (retro ? DISK_MB : DISK_GB) + '\n');
		running = true;
		startAt = Date.now();
		raf = requestAnimationFrame(dosFrame);
	}

	function dosFrame() {
		if (!running) return;

		var pct = Math.min(100, ((Date.now() - startAt) / duration) * 100);
		var line = pad(Math.floor(pct), 2) + ' percent completed.';

		// The head/cylinder/sector readout is an MS-DOS-era detail — cmd.exe
		// only prints the percentage, so it belongs to the retro flavour.
		if (retro) {
			line += '\n\nHead: ' + Math.floor(pct / 100 * 15) +
				'   Cylinder: ' + Math.floor(pct / 100 * 16383) +
				'   Sector: ' + (1 + Math.floor(Math.random() * 63));
		}

		render(line, false);

		if (pct >= 100) {
			running = false;
			commit('100 percent completed.\n');
			after(finishDos, 500);
			return;
		}

		raf = requestAnimationFrame(dosFrame);
	}

	function finishDos() {
		// Modern format.com is terse; MS-DOS printed the full FAT report.
		var report = retro ? [
			'\nFormat complete.\n',
			'\nWriting out file allocation table',
			'\nComplete.',
			'\nCalculating free space (this may take several minutes)...',
			'\nComplete.\n',
			'\nVolume Serial Number is 1A2B-3C4D\n',
			'\n  ' + DISK_BYTES + ' bytes total disk space',
			'\n  ' + DISK_BYTES + ' bytes available on disk\n',
			'\n' + pad(ALLOC_UNIT, 16) + ' bytes in each allocation unit.',
			'\n' + pad(ALLOC_FREE, 16) + ' allocation units available on disk.\n',
			'\n' + promptStr()
		] : [
			'\nCreating file system structures.',
			'\nFormat complete.\n',
			'\n  ' + DISK_GB + ' total disk space.',
			'\n  ' + DISK_FREE + ' are available.\n',
			'\nVolume Serial Number is 1A2B-3C4D\n',
			'\n' + promptStr()
		];

		var i = 0;
		var id = every(function () {
			commit(report[i]);
			i++;
			if (i >= report.length) {
				clearInterval(id);
				render('', true);   // leave a blinking prompt behind
			}
		}, 260);
	}

	/* ---------- Windows dialog ---------- */
	/* Confirmation step. Like the DOS Y/N prompt, BOTH buttons format the drive:
	 * "Format drive" starts it, Cancel is told the drive is unusable until it
	 * has been formatted and it starts anyway. */
	function showWindowsWarning() {
		if (!warnBox) { startWindows(); return; }

		if (warnText) {
			warnText.innerHTML =
				'<strong>Windows has detected a problem with Local Disk (' + drive + ':).</strong><br>' +
				'The drive must be formatted before it can be used again. ' +
				'All data on this drive will be permanently erased.';
		}
		if (warnYes) warnYes.disabled = false;
		if (warnNo) warnNo.disabled = false;
		warnBox.hidden = false;
		if (dlgBox) dlgBox.hidden = true;
	}

	function refuseAndFormat() {
		if (warnText) {
			warnText.innerHTML =
				'<strong>This operation cannot be postponed.</strong><br>' +
				'Local Disk (' + drive + ':) is unusable in its current state. ' +
				'Windows will format the drive now.';
		}
		if (warnYes) warnYes.disabled = true;
		if (warnNo) warnNo.disabled = true;
		after(function () {
			if (warnBox) warnBox.hidden = true;
			startWindows();
		}, 1600);
	}

	if (warnYes) {
		warnYes.addEventListener('click', function () {
			if (warnBox) warnBox.hidden = true;
			startWindows();
		});
	}

	if (warnNo) {
		warnNo.addEventListener('click', refuseAndFormat);
	}

	function startWindows() {
		if (warnBox) warnBox.hidden = true;
		if (dlgTitle) dlgTitle.textContent = 'Formatting Local Disk (' + drive + ':)';
		if (dlgStatus) dlgStatus.textContent = 'Formatting...';
		if (dlgSub) dlgSub.textContent = 'Do not close this window or turn off your computer.';
		if (dlgFill) dlgFill.style.width = '0%';
		if (cancelBtn) cancelBtn.textContent = 'Cancel';
		if (dlgBox) dlgBox.hidden = false;
		if (errorBox) errorBox.hidden = true;

		running = true;
		startAt = Date.now();
		raf = requestAnimationFrame(winFrame);
	}

	function winFrame() {
		if (!running) return;

		var pct = Math.min(100, ((Date.now() - startAt) / duration) * 100);
		if (dlgFill) dlgFill.style.width = pct.toFixed(1) + '%';
		if (dlgStatus) dlgStatus.textContent = 'Formatting... ' + Math.floor(pct) + '%';

		if (pct >= 100) {
			running = false;
			if (dlgTitle) dlgTitle.textContent = 'Format Local Disk (' + drive + ':)';
			if (dlgStatus) dlgStatus.textContent = 'Format Complete.';
			if (dlgSub) dlgSub.textContent = 'Windows successfully formatted the drive.';
			if (cancelBtn) cancelBtn.textContent = 'Close';
			return;
		}

		raf = requestAnimationFrame(winFrame);
	}

	if (cancelBtn) {
		cancelBtn.addEventListener('click', function () {
			// While formatting, Cancel refuses. Once complete, "Close" dismisses
			// the dialog and leaves an apparently wiped desktop behind.
			if (running) {
				if (errorBox) errorBox.hidden = false;
			} else if (dlgBox) {
				dlgBox.hidden = true;
			}
		});
	}

	if (errorOk) {
		errorOk.addEventListener('click', function () {
			if (errorBox) errorBox.hidden = true;
		});
	}

	/* ---------- Reset / exit ---------- */
	function reset() {
		clearTimers();
		detachKeys();
		running = false;
		statics = '';
		consoleEl.innerHTML = '';
		if (dlgFill) dlgFill.style.width = '0%';
		if (dlgBox) dlgBox.hidden = false;
		if (errorBox) errorBox.hidden = true;
		if (warnBox) warnBox.hidden = true;
	}

	function onExit() {
		clearTimers();
		detachKeys();
		running = false;
	}

	/* ---------- Launch ---------- */
	launchBtn.addEventListener('click', function () {
		reset();

		skin = (skinSel && skinSel.value === 'windows') ? 'windows' : 'dos';
		drive = (driveSel && /^[CDE]$/.test(driveSel.value)) ? driveSel.value : 'C';
		duration = DURATIONS[speedSel ? speedSel.value : 'normal'] || DURATIONS.normal;
		retro = !!(crtChk && crtChk.checked);

		screenEl.setAttribute('data-skin', skin);
		screenEl.setAttribute('data-crt', retro ? 'on' : 'off');

		window.How7oPrank.launch(overlay, { onExit: onExit });

		if (skin === 'windows') {
			if (promptChk ? promptChk.checked : true) {
				showWindowsWarning();
			} else {
				startWindows();
			}
		} else {
			typeCommand(function () {
				showWarning(promptChk ? promptChk.checked : true);
			});
		}
	});

})();
