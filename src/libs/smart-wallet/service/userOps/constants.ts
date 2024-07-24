import { UserOperation } from "@/libs/smart-wallet/service/userOps/types";
import { bytesToHex, encodeAbiParameters, parseAbiParameters, toHex, zeroAddress } from "viem";

export const DEFAULT_CALL_GAS_LIMIT = BigInt(200_000);
export const DEFAULT_VERIFICATION_GAS_LIMIT = BigInt(2_000_000); // 2M
export const DEFAULT_PRE_VERIFICATION_GAS = BigInt(80_000); //65000

const dummySignature = encodeAbiParameters(
  [
    {
      type: "tuple",
      name: "credentials",
      components: [
        {
          name: "authenticatorData",
          type: "bytes",
        },
        {
          name: "clientDataJSON",
          type: "string",
        },
        {
          name: "challengeLocation",
          type: "uint256",
        },
        {
          name: "responseTypeLocation",
          type: "uint256",
        },
        {
          name: "r",
          type: "bytes32",
        },
        {
          name: "s",
          type: "bytes32",
        },
      ],
    },
  ],
  [
    {
      authenticatorData: bytesToHex(new Uint8Array(0)),
      clientDataJSON: JSON.stringify({}),
      challengeLocation: BigInt(23),
      responseTypeLocation: BigInt(1),
      r: bytesToHex(new Uint8Array(32)),
      s: bytesToHex(new Uint8Array(32)),
    },
  ],
);

export const DEFAULT_USER_OP: UserOperation = {
  sender: zeroAddress,
  nonce: BigInt(0),
  initCode: toHex(new Uint8Array(0)),
  callData: toHex(new Uint8Array(0)),
  callGasLimit: DEFAULT_CALL_GAS_LIMIT,
  verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
  preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
  maxFeePerGas: BigInt(3_000_000_000),
  maxPriorityFeePerGas: BigInt(1_000_000_000),
  paymasterAndData: toHex(new Uint8Array(0)),
  signature: encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { type: "uint256", name: "ownerIndex" },
          { type: "bytes", name: "signatureData" },
        ],
      },
    ],
    [
      {
        ownerIndex: BigInt(0), // Using BigInt for uint256
        signatureData: dummySignature, // Example bytes value
      },
    ],
  ), //"0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c",
};

export const emptyHex = toHex(new Uint8Array(0));
