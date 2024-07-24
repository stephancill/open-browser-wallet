export const CSW_FACTORY_ABI = [
  {
    inputs: [{ internalType: "address", name: "implementation_", type: "address" }],
    stateMutability: "payable",
    type: "constructor",
  },
  { inputs: [], name: "OwnerRequired", type: "error" },
  {
    inputs: [
      { internalType: "bytes[]", name: "owners", type: "bytes[]" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
    ],
    name: "createAccount",
    outputs: [{ internalType: "contract CoinbaseSmartWallet", name: "account", type: "address" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes[]", name: "owners", type: "bytes[]" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
    ],
    name: "getAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "implementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "initCodeHash",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
