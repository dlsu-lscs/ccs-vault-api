import { User } from "../models/user.js";
import * as userRepository from "../repositories/user-repository.js";

export interface GoogleProfile {
  google_sub: string;
  email: string;
  name: string;
}

export async function getOrCreateUserFromGoogle(
  profile: GoogleProfile
): Promise<User> {
  if (
    !profile.google_sub ||
    typeof profile.google_sub !== "string" ||
    !profile.google_sub.trim()
  ) {
    throw new Error("Invalid profile: google_sub is required");
  }

  if (
    !profile.email ||
    typeof profile.email !== "string" ||
    !profile.email.trim()
  ) {
    throw new Error("Invalid profile: email is required");
  }

  if (
    !profile.name ||
    typeof profile.name !== "string" ||
    !profile.name.trim()
  ) {
    throw new Error("Invalid profile: name is required");
  }

  const normalizedProfile: GoogleProfile = {
    google_sub: profile.google_sub.trim(),
    email: profile.email.trim().toLowerCase(),
    name: profile.name.trim(),
  };

  return userRepository.upsertUser(normalizedProfile);
}

export async function getUserById(id: string): Promise<User | null> {
  if (!id || typeof id !== "string") {
    return null;
  }
  return userRepository.findById(id);
}

export async function getUserByGoogleSub(
  googleSub: string
): Promise<User | null> {
  if (!googleSub || typeof googleSub !== "string") {
    return null;
  }
  return userRepository.findByGoogleSub(googleSub);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  if (!email || typeof email !== "string") {
    return null;
  }
  return userRepository.findByEmail(email.trim().toLowerCase());
}
