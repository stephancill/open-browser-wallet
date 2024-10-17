import { Generated } from "kysely";
import { Address, Hex } from "viem";
import { UserOperation } from "viem/account-abstraction";

export type UserRow = {
  id: Generated<string>;
  walletAddress: Address;
  passkeyId: string;
  passkeyPublicKey: Hex;
  importedAccountData: {
    initCode: Hex;
    replayableUserOps?: Hex[];
    addOwnerTransactions: {
      transactionHash: Hex;
      owner: Hex;
      userOp?: any;
    }[];
  } | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  username: string | null;
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
