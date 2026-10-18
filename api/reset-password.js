const { readUsers, saveUsers, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // If accessed via GET, redirect cleanly to frontend page
    if (req.method === 'GET') {
        const token = req.query ? req.query.token : '';
        const email = req.query ? req.query.email : '';
        const qs = new URLSearchParams();
        if (token) qs.set('token', token);
        if (email) qs.set('email', email);
        return res.redirect(302, `/reset-password/${qs.toString() ? '?' + qs.toString() : ''}`);
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        let payload = req.body || {};
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch (e) {
                const params = new URLSearchParams(payload);
                payload = Object.fromEntries(params.entries());
            }
        }

        const token = payload.token || (req.query && req.query.token);
        const email = payload.email || (req.query && req.query.email);
        const newPassword = payload.newPassword || payload['new-password'] || payload.password;
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

        if (!token || !newPassword) {
            if (acceptsHtml) {
                return res.redirect(302, '/reset-password/?error=missing');
            }
            return res.status(400).json({ success: false, message: 'Missing token or new password.' });
        }

        const users = readUsers();
        const lowerEmail = email ? String(email).trim().toLowerCase() : '';
        const user = users.find(u => 
            u.resetToken === token && (!lowerEmail || (u.email && u.email.toLowerCase() === lowerEmail))
        );

        if (!user) {
            if (acceptsHtml) {
                return res.redirect(302, '/reset-password/?error=invalid');
            }
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
        }

        if (user.resetExpires && Date.now() > user.resetExpires) {
            if (acceptsHtml) {
                return res.redirect(302, '/reset-password/?error=expired');
            }
            return res.status(400).json({ success: false, message: 'This password reset link has expired. Please request a new one.' });
        }

        user.password = String(newPassword);
        delete user.resetToken;
        delete user.resetExpires;
        saveUsers(users);

        if (acceptsHtml) {
            return res.redirect(302, `/?reset_success=1&email=${encodeURIComponent(user.email)}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Password has been reset successfully! You can now log in.',
            email: user.email
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};

