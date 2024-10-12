import { useEffect } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";

const trackedTokens = [
  {
    name: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    decimals: 6,
  },
] as const;

export function WalletView() {
  const account = useAccount();
  const {
    data: tokenBalances,
    isLoading: isLoadingBalances,
    error: errorBalances,
  } = useReadContracts({
    allowFailure: false,
    contracts: trackedTokens.map((token) => ({
      address: token.address,
      chainId: token.chainId,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    })),
  });
  const { data: nativeBalance, error: errorNativeBalance } = useBalance();

  useEffect(() => {
    if (errorNativeBalance || errorBalances) {
      console.error("errorNativeBalance", errorNativeBalance);
      console.error("errorBalances", errorBalances);
    }
  }, [errorNativeBalance, errorBalances]);

  return (
    <div>
      <h1>Wallet</h1>
      <div>{account.address}</div>
      {tokenBalances ? (
        <div>
          Native: {formatUnits(nativeBalance?.value ?? BigInt(0), 18)}
          {tokenBalances?.map((balance, index) => (
            <div key={index}>
              {trackedTokens[index].name}:{" "}
              {formatUnits(BigInt(balance), trackedTokens[index].decimals)}
            </div>
          ))}
        </div>
      ) : isLoadingBalances ? (
        <div>Loading...</div>
      ) : (
        <div>Error: {errorBalances?.message}</div>
      )}
    </div>
  );
}
