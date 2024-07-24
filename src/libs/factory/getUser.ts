import { Address, Hex } from "viem";

export type User = { id: string; pubKey: Hex; account: Address; balance: bigint };

export async function getUser(pubKey: Hex): Promise<User> {
  const response = await fetch(`/api/users/${pubKey}`, {
    method: "GET",
  });

  const user = await response.json();
  return {
    id: user.id,
    pubKey: user.pubKey,
    account: user.account,
    balance: user.balance,
  };
}
