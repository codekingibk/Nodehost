const getAdminIds = () => {
    const raw = process.env.ADMIN_USER_IDS || '';
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const getAdminEmails = () => {
    const raw = process.env.ADMIN_EMAILS || '';
    return raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
};

const isAdminUser = ({ userId, email } = {}) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const byId = userId ? getAdminIds().includes(userId) : false;
    const byEmail = normalizedEmail ? getAdminEmails().includes(normalizedEmail) : false;
    return byId || byEmail;
};

module.exports = {
    getAdminIds,
    getAdminEmails,
    isAdminUser
};