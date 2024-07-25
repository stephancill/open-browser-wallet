import { Address, Hex, encodePacked, keccak256, encodeAbiParameters, concat } from "viem";

const MESSAGE_TYPEHASH = keccak256(
  encodePacked(["string"], ["CoinbaseSmartWalletMessage(bytes32 hash)"]),
);

const DOMAIN_TYPEHASH = keccak256(
  encodePacked(
    ["string"],
    ["EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"],
  ),
);

function calculateReplaySafeHash(
  originalHash: Hex,
  chainId: bigint,
  contractAddress: Address,
): Hex {
  const domainSeparator = calculateDomainSeparator(chainId, contractAddress);
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [MESSAGE_TYPEHASH, originalHash],
    ),
  );

  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

function calculateDomainSeparator(chainId: bigint, contractAddress: Address): Hex {
  const name = "Coinbase Smart Wallet";
  const version = "1";

  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        DOMAIN_TYPEHASH,
        keccak256(encodePacked(["string"], [name])),
        keccak256(encodePacked(["string"], [version])),
        chainId,
        contractAddress,
      ],
    ),
  );
}

export { calculateReplaySafeHash };
