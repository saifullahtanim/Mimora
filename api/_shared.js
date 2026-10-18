const fs = require('fs');
const path = require('path');
const https = require('https');

const EMAILJS_CONFIG = {
    serviceId: 'service_d2y76qb',
    templateId: 'template_fpbe8ou', // Default / Contact template
    authTemplateId: process.env.EMAILJS_AUTH_TEMPLATE_ID || 'template_fpbe8ou', // Dedicated auth template
    publicKey: 'yedoVHGrrTtcTISdh',
    privateKey: '48NYaZzBTrc1VUN9GG5m_'
};

// On Vercel, /tmp is the only writable directory. Locally, use ./data
const isVercel = process.env.VERCEL || process.env.NOW_REGION;
const DATA_DIR = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function ensureUsersFile() {
    if (!fs.existsSync(DATA_DIR)) {
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
    }
    if (!fs.existsSync(USERS_FILE)) {
        // If on Vercel, try to seed from bundled data/users.json if available
        let initialData = [];
        try {
            const bundledPath = path.join(process.cwd(), 'data', 'users.json');
            if (fs.existsSync(bundledPath)) {
                initialData = JSON.parse(fs.readFileSync(bundledPath, 'utf-8')) || [];
            }
        } catch (e) {}
        try { fs.writeFileSync(USERS_FILE, JSON.stringify(initialData, null, 2), 'utf-8'); } catch (e) {}
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
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (e) {}
}

function ensureMessagesFile() {
    if (!fs.existsSync(DATA_DIR)) {
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
    }
    if (!fs.existsSync(MESSAGES_FILE)) {
        try { fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2), 'utf-8'); } catch (e) {}
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
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8');
    } catch (e) {}
}

function getBaseUrl(req) {
    if (req && req.headers) {
        const forwardedHost = req.headers['x-forwarded-host'];
        if (forwardedHost) {
            const proto = req.headers['x-forwarded-proto'] || 'https';
            return `${proto}://${forwardedHost}`;
        }
        if (req.headers.host) {
            const host = req.headers.host;
            const proto = (host.includes('localhost') || host.includes('127.0.0.1')) ? 'http' : 'https';
            return `${proto}://${host}`;
        }
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return 'http://localhost:3000';
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

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = {
    readUsers,
    saveUsers,
    readMessages,
    saveMessages,
    getBaseUrl,
    sendEmailViaEmailJS,
    setCors
};
