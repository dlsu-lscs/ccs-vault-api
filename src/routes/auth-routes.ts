import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getCurrentUser, signIn, signOut } from "../controllers/auth-controller.js";
import { requireAuth } from "../middleware/auth-middleware.js";

const router = Router();

// Limit sign-in attempts to 10 per 15-minute window per IP to prevent brute-force attacks.
const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many sign-in attempts. Please try again later.",
    },
  },
});

router.post("/sign-in", signInLimiter, signIn);
router.post("/sign-out", signOut);
router.get("/me", requireAuth, getCurrentUser);

export default router;
