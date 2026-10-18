const { readUsers, setCors } = require('./_shared');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    try {
        const body = req.body || {};
        const { log, pwd } = typeof body === 'string' ? JSON.parse(body || '{}') : body;
        const users = readUsers();
        const query = String(log || '').trim().toLowerCase();
        const user = users.find(u => 
            (u.email && u.email.toLowerCase() === query) || 
            (u.username && u.username.toLowerCase() === query)
        );

        if (!user || user.password !== String(pwd)) {
            return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                verified: !!user.verified
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
};
