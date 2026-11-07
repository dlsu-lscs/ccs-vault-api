import { CourseWithResourceCount } from "../models/course.js";
import * as courseRepository from "../repositories/course-repository.js";

export async function getCoursesWithPublishedResourceCount(): Promise<
  CourseWithResourceCount[]
> {
  return courseRepository.findAllCoursesWithPublishedResourceCount();
}
