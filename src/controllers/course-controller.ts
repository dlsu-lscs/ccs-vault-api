import { Request, Response } from "express";
import * as courseService from "../services/course-service.js";

export async function getCourses(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const courses = await courseService.getCoursesWithPublishedResourceCount();
    res.status(200).json(courses);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred while retrieving courses",
      },
    });
  }
}
