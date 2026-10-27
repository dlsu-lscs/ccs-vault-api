export type UserRole = "Student" | "Admin";

export interface User {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: Date;
}
