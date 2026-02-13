// Simple state for token
let getToken = async () => null;

export const setTokenProvider = (provider) => {
    getToken = provider;
};

// Use window.location.origin in production, fallback to localhost in dev
let BASE_URL = 'http://localhost:10000';
if (typeof window !== 'undefined' && window.location && window.location.origin) {
    BASE_URL = window.location.origin;
}

export const api = {
    get: async (url) => {
        try {
            const token = await getToken();
            const res = await fetch(`${BASE_URL}/api${url}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const txt = await res.text();
                console.error(`API GET ${url} Error:`, res.status, txt);
                throw new Error(`Status ${res.status}: ${txt}`);
            }
            return res.json();
        } catch (e) {
            console.error(e);
            throw e;
        }
    },
    post: async (url, data) => {
        try {
            const token = await getToken();
            const headers = { 'Authorization': `Bearer ${token}` };
            let body;

            if (data instanceof FormData) {
                // Browser sets boundary automatically for FormData
                body = data;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(data);
            }

            const res = await fetch(`${BASE_URL}/api${url}`, {
                method: 'POST',
                headers,
                body
            });
            if (!res.ok) {
                const txt = await res.text();
                console.error(`API POST ${url} Error:`, res.status, txt);
                throw new Error(`Status ${res.status}: ${txt}`);
            }
            return res.json();
        } catch (e) {
            console.error(e);
            throw e;
        }
    },
    delete: async (url) => {
        const token = await getToken();
        const res = await fetch(`${BASE_URL}/api${url}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }
};