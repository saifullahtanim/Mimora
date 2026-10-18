const crypto = require('crypto');
const { readUsers, saveUsers, getBaseUrl, sendEmailViaEmailJS, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        const { name, username, email, password } = typeof body === 'string' ? JSON.parse(body || '{}') : body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide username, email, and password.' });
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
            return res.status(409).json({ success: false, message });
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

        return res.status(201).json({
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
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
