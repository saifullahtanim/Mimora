const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
// Serve files from project root
const SITE_DIR = __dirname;
const PROJECT_ROOT = __dirname;

const EMAILJS_CONFIG = {
    serviceId: 'service_d2y76qb',
    templateId: 'template_fpbe8ou', // Default / Contact template
    authTemplateId: process.env.EMAILJS_AUTH_TEMPLATE_ID || 'template_fpbe8ou', // Dedicated auth template if created
    publicKey: 'yedoVHGrrTtcTISdh',
    privateKey: '48NYaZzBTrc1VUN9GG5m_'
};

function getBaseUrl(req) {
    if (!req) return `http://localhost:${PORT}`;
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
}

function sendEmailViaEmailJS({ toEmail, toName, message, link, type = 'activation', req }) {
    return new Promise((resolve) => {
        const originUrl = getBaseUrl(req);
        const recipientName = toName || toEmail.split('@')[0];

        let emailSubject = 'New Contact Message - Mimora';
        let emailTitle = 'New Contact Message';
        let fullMessage = message || '';

        if (type === 'activation') {
            emailSubject = 'Activate Your Mimora Account - Confirmation Link';
            emailTitle = 'Activate Your Account';
            if (link && !fullMessage.includes(link)) {
                fullMessage = `${message}\n\nPlease click the link below to activate your account:\n${link}`;
            }
        } else if (type === 'reset') {
            emailSubject = 'Reset Your Mimora Password - Reset Link';
            emailTitle = 'Reset Your Password';
            if (link && !fullMessage.includes(link)) {
                fullMessage = `${message}\n\nPlease click the link below to reset your password:\n${link}`;
            }
        }

        const chosenTemplateId = (type === 'contact_message')
            ? EMAILJS_CONFIG.templateId
            : (EMAILJS_CONFIG.authTemplateId || EMAILJS_CONFIG.templateId);

        const payload = JSON.stringify({
            service_id: EMAILJS_CONFIG.serviceId,
            template_id: chosenTemplateId,
            user_id: EMAILJS_CONFIG.publicKey,
            accessToken: EMAILJS_CONFIG.privateKey,
            template_params: {
                to_email: toEmail,
                email: toEmail,
                user_email: toEmail,
                recipient_email: toEmail,
                recipient: toEmail,
                to: toEmail,
                send_to: toEmail,
                reply_to: toEmail,
                to_name: recipientName,
                user_name: recipientName,
                name: recipientName,
                subject: emailSubject,
                title: emailTitle,
                heading: emailTitle,
                message: fullMessage,
                link: link || '',
                confirmation_link: link || '',
                verify_link: link || '',
                reset_link: link || '',
                action_url: link || '',
                url: link || '',
                button_text: type === 'reset' ? 'Reset Password' : 'Activate Account',
                type: type
            }
        });

        console.log(`[EmailJS Sending] To: ${toEmail} | Type: ${type} | Link: ${link}`);

        const reqHttp = https.request('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Origin': originUrl,
                'Referer': `${originUrl}/`
            }
        }, res => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`[EmailJS SUCCESS 200] Sent to: ${toEmail} | Response: ${resBody}`);
                    resolve({ success: true, status: res.statusCode, data: resBody });
                } else {
                    console.error(`[EmailJS FAILED ${res.statusCode}] To: ${toEmail} | Error: ${resBody}`);
                    resolve({ success: false, status: res.statusCode, error: resBody });
                }
            });
        });

        reqHttp.on('error', err => {
            console.error('[EmailJS REQUEST ERROR]', err.message);
            resolve({ success: false, error: err.message });
        });

        reqHttp.write(payload);
        reqHttp.end();
    });
}

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'text/javascript; charset=UTF-8',
    '.mjs': 'text/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.wasm': 'application/wasm',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=UTF-8'
};

function resolveFilePath(reqUrl) {
    let pathname = decodeURIComponent(new URL(reqUrl, `http://localhost:${PORT}`).pathname);

    // If request starts with /www.how7o.com/, strip it
    if (pathname.startsWith('/www.how7o.com/')) {
        pathname = pathname.substring('/www.how7o.com'.length);
    } else if (pathname === '/www.how7o.com') {
        pathname = '/';
    }

    // Try in SITE_DIR first
    let candidate = path.join(SITE_DIR, pathname);
    if (fs.existsSync(candidate)) {
        if (fs.statSync(candidate).isDirectory()) {
            const indexHtml = path.join(candidate, 'index.html');
            if (fs.existsSync(indexHtml)) return indexHtml;
        } else {
            return candidate;
        }
    }

    // Check with .html extension if not found
    if (fs.existsSync(candidate + '.html')) {
        return candidate + '.html';
    }

    // Try in PROJECT_ROOT
    let rootCandidate = path.join(PROJECT_ROOT, pathname);
    if (fs.existsSync(rootCandidate) && !fs.statSync(rootCandidate).isDirectory()) {
        return rootCandidate;
    }

    return null;
}

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function ensureUsersFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
}

function readUsers() {
    ensureUsersFile();
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(raw) || [];
    } catch (e) {
        return [];
    }
}

function saveUsers(users) {
    ensureUsersFile();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function ensureMessagesFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(MESSAGES_FILE)) {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
}

function readMessages() {
    ensureMessagesFile();
    try {
        const raw = fs.readFileSync(MESSAGES_FILE, 'utf-8');
        return JSON.parse(raw) || [];
    } catch (e) {
        return [];
    }
}

function saveMessages(messages) {
    ensureMessagesFile();
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8');
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API: Signup / Create Account
    if (req.url === '/api/signup' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const { name, username, email, password } = payload;

                if (!username || !email || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Please provide username, email, and password.' }));
                    return;
                }

                const users = readUsers();
                const lowerEmail = String(email).trim().toLowerCase();
                const lowerUser = String(username).trim().toLowerCase();

                const existing = users.find(u => 
                    (u.email && u.email.toLowerCase() === lowerEmail) || 
                    (u.username && u.username.toLowerCase() === lowerUser)
                );

                if (existing) {
                    const message = (existing.email && existing.email.toLowerCase() === lowerEmail)
                        ? 'This email address is already registered.'
                        : 'This username is already taken.';
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message }));
                    return;
                }

                const verifyToken = crypto.randomBytes(24).toString('hex');
                const newUser = {
                    id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
                    name: (name || username).trim(),
                    username: lowerUser,
                    email: lowerEmail,
                    password: String(password),
                    verified: false,
                    verifyToken: verifyToken,
                    createdAt: new Date().toISOString()
                };

                users.push(newUser);
                saveUsers(users);

                // Send Email Confirmation via EmailJS
                const baseUrl = getBaseUrl(req);
                const verifyLink = `${baseUrl}/verify-email/?token=${verifyToken}&email=${encodeURIComponent(lowerEmail)}`;
                await sendEmailViaEmailJS({
                    toEmail: lowerEmail,
                    toName: newUser.name,
                    message: 'Please activate your Mimora account by clicking the confirmation link below.',
                    link: verifyLink,
                    type: 'activation',
                    req
                });

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    requireConfirmation: true,
                    email: newUser.email,
                    message: `We sent the email to ${newUser.email}. Check your inbox to activate the account.`,
                    user: {
                        id: newUser.id,
                        name: newUser.name,
                        username: newUser.username,
                        email: newUser.email,
                        createdAt: newUser.createdAt
                    }
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Resend Email
    if (req.url === '/api/resend-email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { email, type } = JSON.parse(body || '{}');
                const users = readUsers();
                const lowerEmail = String(email || '').trim().toLowerCase();
                const user = users.find(u => u.email && u.email.toLowerCase() === lowerEmail);

                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'No account found with this email.' }));
                    return;
                }

                const baseUrl = getBaseUrl(req);
                if (type === 'reset') {
                    const resetToken = crypto.randomBytes(24).toString('hex');
                    user.resetToken = resetToken;
                    user.resetExpires = Date.now() + 3600000;
                    saveUsers(users);
                    const resetLink = `${baseUrl}/reset-password/?token=${resetToken}&email=${encodeURIComponent(lowerEmail)}`;
                    await sendEmailViaEmailJS({
                        toEmail: lowerEmail,
                        toName: user.name,
                        message: 'Click the link below to reset your Mimora password.',
                        link: resetLink,
                        type: 'reset',
                        req
                    });
                } else {
                    if (!user.verifyToken) {
                        user.verifyToken = crypto.randomBytes(24).toString('hex');
                        saveUsers(users);
                    }
                    const verifyLink = `${baseUrl}/verify-email/?token=${user.verifyToken}&email=${encodeURIComponent(lowerEmail)}`;
                    await sendEmailViaEmailJS({
                        toEmail: lowerEmail,
                        toName: user.name,
                        message: 'Please activate your Mimora account by clicking the confirmation link below.',
                        link: verifyLink,
                        type: 'activation',
                        req
                    });
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Email has been resent to ${lowerEmail}. Please check your inbox and spam folder.`
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Forgot Password
    if (req.url === '/api/forgot-password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { email } = JSON.parse(body || '{}');
                const users = readUsers();
                const lowerEmail = String(email || '').trim().toLowerCase();
                const user = users.find(u => u.email && u.email.toLowerCase() === lowerEmail);

                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'No account registered with this email address.' }));
                    return;
                }

                const resetToken = crypto.randomBytes(24).toString('hex');
                user.resetToken = resetToken;
                user.resetExpires = Date.now() + 3600000; // 1 hour
                saveUsers(users);

                const baseUrl = getBaseUrl(req);
                const resetLink = `${baseUrl}/reset-password/?token=${resetToken}&email=${encodeURIComponent(lowerEmail)}`;
                await sendEmailViaEmailJS({
                    toEmail: lowerEmail,
                    toName: user.name,
                    message: 'Click the link below to reset your Mimora account password.',
                    link: resetLink,
                    type: 'reset',
                    req
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    email: lowerEmail,
                    message: `We sent the password reset link to ${lowerEmail}. Check your inbox or spam.`
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // Verify Email (Auto-verifies & redirects instantly to homepage login popup)
    const isVerifyEmail = req.method === 'GET' && (
        req.url.startsWith('/verify-email') || 
        req.url.startsWith('/api/verify-email')
    );

    if (isVerifyEmail) {
        const urlObj = new URL(req.url, `http://localhost:${PORT}`);
        const token = urlObj.searchParams.get('token');
        const email = urlObj.searchParams.get('email');
        const isApi = req.url.startsWith('/api/');
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

        const users = readUsers();
        let user = null;

        if (token) {
            user = users.find(u => u.verifyToken === token || (email && u.email && u.email.toLowerCase() === email.toLowerCase() && u.verifyToken === token));
        }

        if (user) {
            user.verified = true;
            delete user.verifyToken;
            saveUsers(users);

            if (!isApi || acceptsHtml) {
                // Instant 0ms 302 redirect directly to homepage to open login popup!
                res.writeHead(302, { Location: `/?verified=1&email=${encodeURIComponent(user.email)}` });
                res.end();
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Account activated successfully! You can now log in.', email: user.email }));
            return;
        }

        // If user is already verified
        if (email) {
            const alreadyUser = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.verified);
            if (alreadyUser) {
                if (!isApi || acceptsHtml) {
                    res.writeHead(302, { Location: `/?verified=1&email=${encodeURIComponent(alreadyUser.email)}` });
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Account already activated. You can log in.', email: alreadyUser.email }));
                return;
            }
        }

        // Invalid or expired token
        if (!isApi || acceptsHtml) {
            res.writeHead(302, { Location: '/?verified_error=1' });
            res.end();
            return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid or expired confirmation link.' }));
        return;
    }

    // Reset Password Handler (Handles AJAX JSON & Browser Form POST)
    const isResetPasswordPost = req.method === 'POST' && (
        req.url === '/api/reset-password' ||
        req.url === '/reset-password' ||
        req.url === '/reset-password/' ||
        req.url.startsWith('/reset-password?')
    );

    if (isResetPasswordPost) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                let payload = {};
                try {
                    payload = JSON.parse(body || '{}');
                } catch (e) {
                    const params = new URLSearchParams(body);
                    payload = Object.fromEntries(params.entries());
                }

                const urlObj = new URL(req.url, `http://localhost:${PORT}`);
                const token = payload.token || urlObj.searchParams.get('token');
                const newPassword = payload.newPassword || payload['new-password'] || payload.password;
                const isApi = req.url.startsWith('/api/');
                const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

                const users = readUsers();
                const user = users.find(u => u.resetToken === token && u.resetExpires && u.resetExpires > Date.now());

                if (!user) {
                    if (!isApi && acceptsHtml) {
                        res.writeHead(302, { Location: '/reset-password/?error=invalid' });
                        res.end();
                        return;
                    }
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid or expired password reset link.' }));
                    return;
                }

                user.password = String(newPassword);
                delete user.resetToken;
                delete user.resetExpires;
                saveUsers(users);

                if (!isApi && acceptsHtml) {
                    res.writeHead(302, { Location: `/?reset_success=1&email=${encodeURIComponent(user.email)}` });
                    res.end();
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Password has been reset successfully! You can now log in.',
                    email: user.email
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Log In
    if (req.url === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const { log, pwd } = payload;
                const users = readUsers();
                const query = String(log || '').trim().toLowerCase();
                const user = users.find(u => 
                    (u.email && u.email.toLowerCase() === query) || 
                    (u.username && u.username.toLowerCase() === query)
                );

                if (!user || user.password !== String(pwd)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid username/email or password.' }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Login successful!',
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        email: user.email,
                        avatar: user.avatar || '',
                        verified: !!user.verified
                    }
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Update Profile (Name, Email, Avatar)
    if (req.url === '/api/update-profile' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { id, username, email, name, avatar } = JSON.parse(body || '{}');
                const users = readUsers();
                const user = users.find(u => (id && u.id === id) || (username && u.username === username));

                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'User not found.' }));
                    return;
                }

                // If email changed, check for collision
                const lowerNewEmail = String(email || '').trim().toLowerCase();
                if (lowerNewEmail && lowerNewEmail !== user.email.toLowerCase()) {
                    const conflict = users.find(u => u.id !== user.id && u.email && u.email.toLowerCase() === lowerNewEmail);
                    if (conflict) {
                        res.writeHead(409, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'This email is already taken by another account.' }));
                        return;
                    }
                    user.email = lowerNewEmail;
                }

                if (name !== undefined) user.name = String(name).trim();
                if (avatar !== undefined) user.avatar = avatar; // base64 or URL

                saveUsers(users);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Profile updated successfully!',
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        email: user.email,
                        avatar: user.avatar || '',
                        verified: !!user.verified
                    }
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Change Password
    if (req.url === '/api/change-password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { id, username, currentPassword, newPassword } = JSON.parse(body || '{}');
                const users = readUsers();
                const user = users.find(u => (id && u.id === id) || (username && u.username === username));

                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'User not found.' }));
                    return;
                }

                if (user.password !== String(currentPassword)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Current password does not match.' }));
                    return;
                }

                if (!newPassword || String(newPassword).length < 6) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'New password must be at least 6 characters long.' }));
                    return;
                }

                user.password = String(newPassword);
                saveUsers(users);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Password updated successfully!' }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: Contact Message Submission (Instant save + async EmailJS notification)
    const isContactPost = req.method === 'POST' && (
        req.url === '/api/contact' || 
        req.url === '/contact/' || 
        req.url === '/contact' || 
        req.url.startsWith('/contact?') || 
        req.url.startsWith('/contact/#')
    );

    if (isContactPost) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                let payload = {};
                try {
                    payload = JSON.parse(body || '{}');
                } catch (e) {
                    const params = new URLSearchParams(body);
                    payload = Object.fromEntries(params.entries());
                }

                const name = String(payload.name || payload['your-name'] || '').trim();
                const email = String(payload.email || payload['your-email'] || '').trim();
                const subject = String(payload.subject || payload['your-subject'] || 'Website Inquiry').trim();
                const message = String(payload.message || payload['your-message'] || '').trim();

                if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Please provide your name.' }));
                    return;
                }
                if (!email || !email.includes('@')) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Please provide a valid email address.' }));
                    return;
                }
                if (!message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Please write your message.' }));
                    return;
                }

                const messages = readMessages();
                const newMsg = {
                    id: 'msg_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
                    name,
                    email,
                    subject,
                    message,
                    createdAt: new Date().toISOString(),
                    status: 'unread'
                };
                messages.unshift(newMsg);
                saveMessages(messages);

                const baseUrl = getBaseUrl(req);
                // Send EmailJS notification in background asynchronously without blocking the client response
                sendEmailViaEmailJS({
                    toEmail: 'nimpataaaa@gmail.com',
                    toName: 'Mimora Team',
                    message: `New message from: ${name} (${email})\nSubject: ${subject}\n\nMessage:\n${message}`,
                    link: `${baseUrl}/contact/`,
                    type: 'contact_message',
                    req
                }).then(emailRes => {
                    console.log('EmailJS contact notification sent:', emailRes && emailRes.status ? emailRes.status : 'OK');
                }).catch(err => {
                    console.error('EmailJS contact error (non-fatal):', err.message);
                });

                // Respond immediately so user experiences zero latency
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Thank you! Your message has been sent successfully.',
                    id: newMsg.id
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
            }
        });
        return;
    }

    // API: List Messages
    if (req.url === '/api/messages' && req.method === 'GET') {
        const messages = readMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: messages.length, messages }));
        return;
    }

    // API: List users (public info)
    if (req.url === '/api/users' && req.method === 'GET') {
        const users = readUsers().map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email, verified: !!u.verified, createdAt: u.createdAt }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: users.length, users }));
        return;
    }

    const filePath = resolveFilePath(req.url);

    if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(`<!DOCTYPE html><html><head><title>404 Not Found</title><style>body{font-family:sans-serif;padding:40px;text-align:center;background:#0c1015;color:#fff;}a{color:#488cbf;}</style></head><body><h1>404 - Page Not Found</h1><p>The requested URL was not found.</p><p><a href="/">Back to Homepage</a></p></body></html>`);
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error: ' + err.message);
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': data.length
        });
        if (req.method === 'HEAD') {
            res.end();
        } else {
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n==================================================`);
    console.log(`  Local server is running!`);
    console.log(`  Access your project at: \x1b[36m${url}\x1b[0m`);
    console.log(`  Press Ctrl + C to stop`);
    console.log(`==================================================\n`);

    // Auto open browser on Windows
    exec(`start ${url}`);
});
