const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

const DEBUG_BYPASS = String(process.env.AUTH_DEBUG_BYPASS || 'false').toLowerCase() === 'true';

const requireAuth = (req, res, next) => {
  if (DEBUG_BYPASS) {
      console.warn("!! AUTH BYPASSED FOR DEBUGGING !!");
      req.auth = { 
          userId: 'user_debug_123',
          sessionId: 'sess_debug',
          claims: { email: 'debug@example.com' } 
      };
      return next();
  }

  if (!process.env.CLERK_SECRET_KEY) {
    console.error("FATAL: CLERK_SECRET_KEY is missing in env");
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Use WithAuth to hydrate req.auth from Clerk token
  ClerkExpressWithAuth()(req, res, (err) => {
    if (err) {
      console.error("Clerk Middleware Error:", err);
      return res.status(500).json({ error: 'Auth System Error', details: err.message });
    }

    // Inspect the resulting auth object
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    next();
  });
};

module.exports = { requireAuth };