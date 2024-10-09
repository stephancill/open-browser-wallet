import { AUTH_SESSION_COOKIE_NAME } from "../../../lib/constants";

export async function POST() {
  return new Response(null, {
    status: 200,
    headers: {
      // Clear the cookie by setting its expiration to a past date
      "Set-Cookie": `${AUTH_SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}
