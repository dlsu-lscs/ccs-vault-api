export interface Course {
  id: string;
  code: string;
  name: string;
  created_at: Date;
}

export interface CourseWithResourceCount {
  id: string;
  code: string;
  name: string;
  published_resource_count: number;
}
