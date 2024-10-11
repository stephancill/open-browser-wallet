import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

const TWILIO_VERIFY_URL = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}`;

export const POST = withAuth(
  async (request, user) => {
    try {
      const response = await fetch(`${TWILIO_VERIFY_URL}/Verifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          To: user.phoneNumber,
          Channel: "sms",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return Response.json({ status: data.status });
      } else {
        return Response.json(
          { error: data.message },
          { status: response.status }
        );
      }
    } catch (error) {
      console.error("Error sending verification code:", error);
      return Response.json(
        { error: "Failed to send verification code" },
        { status: 500 }
      );
    }
  },
  { requireVerified: false }
);

export const PUT = withAuth(
  async (request, user) => {
    const { code } = await request.json();

    if (!code) {
      return Response.json(
        { error: "Phone number and code are required" },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(`${TWILIO_VERIFY_URL}/VerificationCheck`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          To: user.phoneNumber,
          Code: code,
        }),
      });

      const data = await response.json();

      console.log({ code, data });

      if (response.ok) {
        const valid = data.status === "approved" && data.valid;
        if (valid) {
          await db
            .updateTable("users")
            .set({
              verifiedAt: new Date(),
            })
            .where("users.id", "=", user.id)
            .execute();
        }

        return Response.json(
          { status: data.status, valid: data.valid },
          { status: valid ? 200 : 400 }
        );
      } else {
        return Response.json(
          { error: data.message },
          { status: response.status }
        );
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      return Response.json({ error: "Failed to verify code" }, { status: 500 });
    }
  },
  { requireVerified: false }
);
