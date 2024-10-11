import { withAuth } from "@/lib/auth";

export const GET = withAuth(
  async (req, user) => {
    return Response.json({ user });
  },
  { requireVerified: false }
);
