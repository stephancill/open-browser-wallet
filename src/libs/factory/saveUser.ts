import { Hex } from "viem";
import { User } from "./getUser";

export async function saveUser({
  id,
  pubKey,
}: {
  id: string;
  pubKey: Hex;
}): Promise<Omit<User, "balance">> {
  const response = await fetch("/api/users/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, pubKey }),
  });

  const res: Omit<User, "balance"> = await response.json();

  return res;
}
