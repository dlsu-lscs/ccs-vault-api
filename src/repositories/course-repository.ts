import pool from "../config/db.js";
import { Course, CourseWithResourceCount } from "../models/course.js";

export async function findAllCoursesWithPublishedResourceCount(): Promise<
  CourseWithResourceCount[]
> {
  const query = `
    SELECT
      c.id,
      c.code,
      c.name,
      COALESCE(COUNT(r.id), 0)::int AS published_resource_count
    FROM courses c
    LEFT JOIN resources r ON c.id = r.course_id AND r.published = true
    GROUP BY c.id, c.code, c.name
    ORDER BY lower(c.code) ASC;
  `;

  const result = await pool.query<CourseWithResourceCount>(query);
  return result.rows;
}

export async function findCourseById(id: string): Promise<Course | null> {
  const query = `
    SELECT id, code, name, created_at
    FROM courses
    WHERE id = $1;
  `;

  const result = await pool.query<Course>(query, [id]);
  return result.rows[0] ?? null;
}

export async function findCourseByCode(code: string): Promise<Course | null> {
  const query = `
    SELECT id, code, name, created_at
    FROM courses
    WHERE lower(code) = lower($1);
  `;

  const result = await pool.query<Course>(query, [code]);
  return result.rows[0] ?? null;
}
