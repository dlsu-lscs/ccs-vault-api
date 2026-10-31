import { Router } from "express";
import { getCurrentUser, signIn, signOut } from "../controllers/auth-controller.js";
import { requireAuth } from "../middleware/auth-middleware.js";

const router = Router();

router.post("/sign-in", signIn);
router.post("/sign-out", signOut);
router.get("/me", requireAuth, getCurrentUser);

export default router;
