export const JWT_SECRET = process.env.JWT_SECRET!;

// fail at boot, not per request. every route that signs or verifies a token reaches
// for this, and jsonwebtoken only complains once it is handed an undefined secret —
// which turns a missing secret into a 500 on signup and a 401 on every authed call.
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
