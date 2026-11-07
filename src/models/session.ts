import { User } from "./user.js";

export interface Session {
  id: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
}

export interface CreateSessionInput {
  id: string;
  user_id: string;
  expires_at: Date;
}

export interface SessionWithUser extends Session {
  user: User;
}
