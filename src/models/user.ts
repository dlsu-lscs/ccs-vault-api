export type UserRole = "Student" | "Admin";

export interface User {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: Date;
}

/** Safe user object that can be returned in API responses. Excludes `google_sub`. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    created_at: user.created_at,
  };
}
