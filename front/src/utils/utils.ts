import * as chains from "viem/chains";

export function chainById(id: number): chains.Chain | undefined {
  const chain = Object.values(chains).find((chain) => chain.id === id);
  return chain;
}
