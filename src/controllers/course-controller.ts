import { Request, Response } from "express";
import * as courseService from "../services/course-service.js";

export async function getCourses(
  _req: Request,
  res: Response
): Promise<void> {
  const courses = await courseService.getCoursesWithPublishedResourceCount();
  res.status(200).json(courses);
}
