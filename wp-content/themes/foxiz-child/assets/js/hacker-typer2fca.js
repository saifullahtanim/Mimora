/**
 * Hacker Typer — reveals pre-written "hacker code" character by character
 * as the user presses any key.
 */
(function () {
	'use strict';

	var launchBtn = document.getElementById('htyperLaunch');
	var overlay   = document.getElementById('htyperOverlay');
	var outputEl  = document.getElementById('htyperOutput');

	if (!launchBtn || !overlay || !outputEl) return;

	// Realistic-looking fake code (Linux kernel-esque mix of C, shell, network traces)
	var FAKE_CODE = [
		'root@matrix:~# ssh -p 22 admin@192.168.1.1\n',
		'Password: ********\n',
		'Linux kernel 5.15.0-generic x86_64\n',
		'Last login: Tue Mar 14 02:33:17 2025 from 10.0.0.42\n',
		'\n',
		'[+] Scanning network 192.168.0.0/16...\n',
		'[+] Found 147 active hosts\n',
		'[+] Fingerprinting services...\n',
		'\n',
		'static int __init init_module(void) {\n',
		'    struct cipher_payload *p;\n',
		'    u64 entropy_pool[4096];\n',
		'    int ret = -EINVAL;\n',
		'\n',
		'    p = kmalloc(sizeof(*p), GFP_KERNEL);\n',
		'    if (!p)\n',
		'        return -ENOMEM;\n',
		'\n',
		'    get_random_bytes(entropy_pool, sizeof(entropy_pool));\n',
		'    p->nonce = entropy_pool[0] ^ jiffies;\n',
		'    p->key_schedule = derive_schedule(master_key);\n',
		'\n',
		'    ret = register_netdevice_notifier(&intercept_nb);\n',
		'    if (ret < 0)\n',
		'        goto err_notifier;\n',
		'\n',
		'    ret = create_netlink_socket(NETLINK_USERSOCK);\n',
		'    if (ret < 0)\n',
		'        goto err_socket;\n',
		'\n',
		'    pr_info("payload loaded: %llx\\n", p->nonce);\n',
		'    return 0;\n',
		'\n',
		'err_socket:\n',
		'    unregister_netdevice_notifier(&intercept_nb);\n',
		'err_notifier:\n',
		'    kfree(p);\n',
		'    return ret;\n',
		'}\n',
		'\n',
		'[+] Establishing reverse shell on port 4444...\n',
		'[+] Bypassing firewall via ICMP tunneling\n',
		'[+] Injecting shellcode into kernel space... OK\n',
		'[+] Privilege escalation: uid=0 (root)\n',
		'[+] Dumping /etc/shadow...\n',
		'root:$6$xS4Ypv8g$KzP4/0jFnJl...\n',
		'daemon:*:19325:0:99999:7:::\n',
		'bin:*:19325:0:99999:7:::\n',
		'\n',
		'def exploit_target(host, port):\n',
		'    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n',
		'    s.settimeout(5)\n',
		'    try:\n',
		'        s.connect((host, port))\n',
		'        payload = b"\\x90" * 128 + shellcode\n',
		'        s.send(struct.pack(">I", len(payload)) + payload)\n',
		'        response = s.recv(4096)\n',
		'        if b"ROOT" in response:\n',
		'            print(f"[+] {host}:{port} - exploited")\n',
		'            return True\n',
		'    except (socket.timeout, ConnectionRefusedError):\n',
		'        pass\n',
		'    finally:\n',
		'        s.close()\n',
		'    return False\n',
		'\n',
		'[+] 47 targets compromised\n',
		'[+] Deploying persistence module...\n',
		'[+] Clearing logs: /var/log/auth.log /var/log/syslog\n',
		'[+] Connection secure. Handover complete.\n',
	].join('');

	var pos = 0;

	function revealChunk() {
		// Reveal 3–5 characters per keypress
		var n = 3 + Math.floor(Math.random() * 3);
		var chunk = FAKE_CODE.substr(pos, n);
		pos += n;
		if (pos >= FAKE_CODE.length) {
			pos = 0;
			outputEl.textContent = '';
		}
		outputEl.textContent += chunk;

		// Auto-scroll to bottom
		overlay.scrollTop = overlay.scrollHeight;
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') return; // let shared helper handle exit
		// Ignore modifier-only presses
		if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
		revealChunk();
	}

	launchBtn.addEventListener('click', function () {
		pos = 0;
		outputEl.textContent = '';
		document.addEventListener('keydown', onKeyDown);
		window.How7oPrank.launch(overlay, {
			onExit: function () {
				document.removeEventListener('keydown', onKeyDown);
			},
		});
	});

})();
