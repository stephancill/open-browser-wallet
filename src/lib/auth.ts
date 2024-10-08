import { Lucia } from "lucia";
import { UserRow } from "../types/db";
import { getAuthAdapter } from "./db";
import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "./errors";

const adapter = getAuthAdapter();

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      // set to `true` when using HTTPS
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      ...attributes,
    };
  },
});

export type UserRouteHandler<T extends Record<string, string> = {}> = (
  req: NextRequest,
  user: NonNullable<Awaited<ReturnType<typeof lucia.validateSession>>["user"]>,
  params: T
) => Promise<Response>;

export function withAuth<T extends Record<string, string> = {}>(
  handler: UserRouteHandler<T>
) {
  return async (
    req: NextRequest,
    context: { params: T }
  ): Promise<Response> => {
    try {
      const authorizationHeader = req.headers.get("Authorization");
      const token = lucia.readBearerToken(authorizationHeader ?? "");

      const result = await lucia.validateSession(token ?? "");
      if (!result.session) {
        throw new AuthError("Invalid session");
      }

      return handler(req, result.user, context.params);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      console.error("Unexpected error in withAuth:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: UserRow;
  }
}
