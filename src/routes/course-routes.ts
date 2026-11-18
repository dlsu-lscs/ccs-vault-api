import { Router } from "express";
import { getCourses } from "../controllers/course-controller.js";
import { requireAuth } from "../middleware/auth-middleware.js";

const router = Router();

router.get("/", requireAuth, getCourses);

export default router;
