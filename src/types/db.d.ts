import { Generated } from "kysely";
import { Address, Hex } from "viem";

export type UserRow = {
  id: Generated<string>;
  walletAddress: Address;
  passkeyId: string;
  passkeyPublicKey: Hex;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  phoneNumber: string;
  verifiedAt: Date | null;
};

export interface UserSessionTable {
  id: string;
  userId: string;
  expiresAt: Date;
}

export type Tables = {
  users: UserRow;
  userSession: UserSessionTable;
};
