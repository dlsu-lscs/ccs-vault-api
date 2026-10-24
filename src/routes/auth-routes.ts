import { Router } from "express";
import { signOut } from "../controllers/auth-controller.js";

const router = Router();

router.post("/sign-out", signOut);
router.post("/logout", signOut);

export default router;
