import { ENTRYPOINT_ABI, ENTRYPOINT_ADDRESS } from "@/constants";
import { CSW_FACTORY_ABI } from "@/constants/abi/CoinbaseSmartWalletFactory";
import { smartWallet } from "@/libs/smart-wallet";
import { DEFAULT_USER_OP } from "@/libs/smart-wallet/service/userOps/constants";
import { Call, UserOperation, UserOperationAsHex } from "@/libs/smart-wallet/service/userOps/types";
import { getMessageHash, recoverPublicKeyWithCache } from "@/utils/crypto";
import { calculateReplaySafeHash } from "@/utils/replaySafeHash";
import { getSmartWalletAddress } from "@/utils/smartWalletUtils";
import {
  Address,
  Chain,
  GetContractReturnType,
  Hex,
  PublicClient,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getContract,
  http,
  pad,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import { serializeErc6492Signature } from "viem/experimental";
import { parseSignature, sign } from "webauthn-p256";

export class UserOpBuilder {
  public entryPoint: Hex = ENTRYPOINT_ADDRESS;
  public chain: Chain;
  public publicClient: PublicClient;
  public factoryContract: GetContractReturnType<typeof CSW_FACTORY_ABI>;

  constructor(chain: Chain) {
    this.chain = chain;
    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // @ts-ignore -- types are weird TODO: fix
    this.factoryContract = getContract({
      address: process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ADDRESS as Hex,
      abi: CSW_FACTORY_ABI,
      // @ts-ignore
      publicClient: this.publicClient,
    });
  }

  // reference: https://ethereum.stackexchange.com/questions/150796/how-to-create-a-raw-erc-4337-useroperation-from-scratch-and-then-send-it-to-bund
  async buildUserOp({
    calls,
    maxFeePerGas,
    maxPriorityFeePerGas,
    pubKey,
    keyId,
  }: {
    calls: Call[];
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    pubKey: Hex;
    keyId?: string;
  }): Promise<UserOperationAsHex> {
    // calculate smart wallet address via Factory contract to know the sender
    const account = await getSmartWalletAddress({ pubKey }); // the keyId is the id tied to the user's public key

    // get bytecode
    const bytecode = await this.publicClient.getBytecode({
      address: account,
    });

    let initCode = toHex(new Uint8Array(0));
    let initCodeGas = BigInt(0);
    if (bytecode === undefined) {
      // smart wallet does NOT already exists
      // calculate initCode and initCodeGas
      ({ initCode, initCodeGas } = await this.createInitCodeEstimateGas(pubKey));
    }

    // calculate nonce
    const nonce = await this._getNonce(account);

    // create callData
    const callData = this._addCallData(calls);

    // create user operation
    const userOp: UserOperation = {
      ...DEFAULT_USER_OP,
      sender: account,
      nonce,
      initCode,
      callData,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    // estimate gas for this partial user operation
    // real good article about the subject can be found here:
    // https://www.alchemy.com/blog/erc-4337-gas-estimation
    const { callGasLimit, verificationGasLimit, preVerificationGas } =
      await smartWallet.estimateUserOperationGas({
        userOp: this.toParams(userOp),
      });

    userOp.signature = "0x";

    // set gas limits with the estimated values + some extra gas for safety
    userOp.callGasLimit = BigInt(callGasLimit);
    userOp.preVerificationGas = BigInt(preVerificationGas) * BigInt(10);
    userOp.verificationGasLimit =
      BigInt(verificationGasLimit) + BigInt(150_000) + BigInt(initCodeGas) + BigInt(1_000_000);

    // get userOp hash (with signature == 0x) by calling the entry point contract
    const userOpHash = await this._getUserOpHash(userOp);

    // get signature from webauthn
    const signature = await this.getOpSignature(userOpHash, keyId);

    return this.toParams({ ...userOp, signature });
  }

  public toParams(op: UserOperation): UserOperationAsHex {
    return {
      sender: op.sender,
      nonce: toHex(op.nonce),
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: toHex(op.callGasLimit),
      verificationGasLimit: toHex(op.verificationGasLimit),
      preVerificationGas: toHex(op.preVerificationGas),
      maxFeePerGas: toHex(op.maxFeePerGas),
      maxPriorityFeePerGas: toHex(op.maxPriorityFeePerGas),
      paymasterAndData: op.paymasterAndData === zeroAddress ? "0x" : op.paymasterAndData,
      signature: op.signature,
    };
  }

  private encodeSignature({ signature, webauthn }: Awaited<ReturnType<typeof sign>>): Hex {
    const signaturePoint = parseSignature(signature);
    return encodeAbiParameters(
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
          authenticatorData: webauthn.authenticatorData,
          clientDataJSON: webauthn.clientDataJSON,
          challengeLocation: BigInt(webauthn.challengeIndex),
          responseTypeLocation: BigInt(webauthn.typeIndex),
          r: pad(toHex(signaturePoint.r)),
          s: pad(toHex(signaturePoint.s)),
        },
      ],
    );
  }

  wrapSignature(signature: Hex): Hex {
    return encodeAbiParameters(
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
          ownerIndex: BigInt(0), // TODO: Look up the owner index
          signatureData: signature,
        },
      ],
    );
  }

  public async getSignature(msgToSign: Hex, address: Address, keyId?: string): Promise<Hex> {
    const replaySafeHash = calculateReplaySafeHash(msgToSign, BigInt(this.chain.id), address);

    // const credentials: P256Credential = (await WebAuthn.get(replaySafeHash)) as P256Credential;
    const credentials = await sign({
      hash: replaySafeHash,
      credentialId: keyId,
    });

    // if (keyId && credentials.rawId !== keyId) {
    //   throw new Error(
    //     "Incorrect passkeys used for tx signing. Please sign the transaction with the correct logged-in account",
    //   );
    // }

    const wrappedSignature = this.wrapSignature(this.encodeSignature(credentials));

    const code = await this.publicClient.getBytecode({
      address: address,
    });

    if (!code) {
      // Contract not deployed yet, generate ERC-6492 signature
      console.log("Contract not deployed yet, generating ERC-6492 signature");
      const messageHash = await getMessageHash(credentials.webauthn);
      console.log("messageHash", messageHash);
      const publicKey = await recoverPublicKeyWithCache({
        messageHash,
        signatureHex: credentials.signature,
      });
      if (!publicKey) {
        throw new Error("Invalid signature");
      }
      const data = this.getCreateAccountTx(publicKey);

      const erc6492Signature = serializeErc6492Signature({
        address: this.factoryContract.address,
        data,
        signature: wrappedSignature,
      });

      return erc6492Signature;
    }

    return wrappedSignature;
  }

  public async getOpSignature(msgToSign: Hex, keyId?: string): Promise<Hex> {
    const credentials = await sign({
      hash: msgToSign,
      credentialId: keyId,
    });

    const signature = this.wrapSignature(this.encodeSignature(credentials));
    return signature;
  }

  private getCreateAccountTx(pubKey: Hex): Hex {
    const createAccountTx = encodeFunctionData({
      abi: CSW_FACTORY_ABI,
      functionName: "createAccount",
      args: [[pubKey], BigInt(0)],
    });
    return createAccountTx;
  }

  private createInitCode(pubKey: Hex): Hex {
    let createAccountTx = this.getCreateAccountTx(pubKey);

    let initCode = encodePacked(
      ["address", "bytes"], // types
      [this.factoryContract.address, createAccountTx], // values
    );

    return initCode;
  }

  private async createInitCodeEstimateGas(
    pubKey: Hex,
  ): Promise<{ initCode: Hex; initCodeGas: bigint }> {
    let createAccountTx = this.getCreateAccountTx(pubKey);
    let initCode = this.createInitCode(pubKey);

    let initCodeGas = await this.publicClient.estimateGas({
      account: zeroAddress,
      to: this.factoryContract.address,
      data: createAccountTx,
    });

    return {
      initCode,
      initCodeGas,
    };
  }

  private _addCallData(calls: Call[]): Hex {
    return encodeFunctionData({
      abi: [
        {
          inputs: [
            {
              components: [
                {
                  internalType: "address",
                  name: "dest",
                  type: "address",
                },
                {
                  internalType: "uint256",
                  name: "value",
                  type: "uint256",
                },
                {
                  internalType: "bytes",
                  name: "data",
                  type: "bytes",
                },
              ],
              internalType: "struct Call[]",
              name: "calls",
              type: "tuple[]",
            },
          ],
          name: "executeBatch",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "executeBatch",
      args: [calls],
    });
  }

  private async _getNonce(smartWalletAddress: Hex): Promise<bigint> {
    const nonce: bigint = await this.publicClient.readContract({
      address: this.entryPoint,
      abi: parseAbi(["function getNonce(address, uint192) view returns (uint256)"]),
      functionName: "getNonce",
      args: [smartWalletAddress, BigInt(0)],
    });
    return nonce;
  }

  private async _getUserOpHash(userOp: UserOperation): Promise<Hex> {
    const userOpHash = await this.publicClient.readContract({
      address: this.entryPoint,
      abi: ENTRYPOINT_ABI,
      functionName: "getUserOpHash",
      args: [userOp],
    });

    return userOpHash;
  }
}
