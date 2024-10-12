import { useQuery, useMutation } from "@tanstack/react-query";
import React, { useState } from "react";
import { Address, erc20Abi, formatUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { Button } from "./Button";
import { Sheet } from "react-modal-sheet";
import { useSession } from "../providers/SessionProvider";

type Product = {
  id: string;
  model_name: string;
  partner_id: number;
  enabled: boolean;
  name: string;
  description: string;
  price_currency_code: string;
  price_min: number;
  price_max: number;
  return_type: string;
  image: string;
  redemption_instructions: string | null;
  terms_and_conditions: string;
  created_at: string;
  updated_at: string;
  product_variants: {
    data: {
      id: number;
      model_name: string;
      product_id: number;
      enabled: boolean;
      name: string | null;
      type: string;
      price: number;
      created_at: string;
      updated_at: string;
    }[];
  };
  partner: {
    id: number;
    model_name: string;
    name: string;
    image: string;
  };
};

type ProductsResponse = {
  products: Product[];
};

const fetchProducts = async (): Promise<ProductsResponse> => {
  const response = await fetch("/api/merchant/products");
  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }
  return response.json();
};

export type Quote = {
  id: string;
  tokenQuote: {
    address: Address;
    decimals: number;
    chainId: number;
    amount: string;
    symbol: string;
  };
  paymentDestination: Address;
  expiresAt: string;
  metadata: Record<string, string>;
  productId: string;
  quantity: number;
  status: "PENDING" | "PAYMENT_RECEIVED" | "COMPLETED" | "FULFILLMENT_ERROR";
};

type QuoteResponse = {
  quote: Quote;
  signatureParameters: {
    messagePartial: {
      quoteId: string;
    };
    types: any;
    domain: any;
  };
  product: Product;
};

const fetchQuote = async (
  productId: string,
  quantity: number = 1,
  metadata: Record<string, string> = {}
): Promise<QuoteResponse> => {
  const response = await fetch("/api/merchant/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId, quantity, metadata }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch quote");
  }
  return response.json();
};

const fulfillOrder = async ({
  quoteId,
  transactionHash,
  signer,
}: {
  quoteId: string;
  transactionHash: string;
  signer: Address;
}): Promise<void> => {
  const response = await fetch("/api/merchant/fulfill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteId,
      transactionHash,
      signature: "0x123",
      signer,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to fulfill order");
  }
};

export function ShopView() {
  const { writeContractAsync, isPending: isWriteContractPending } =
    useWriteContract();
  const { address } = useAccount();
  const [isOpen, setOpen] = useState(false);
  const { user } = useSession();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  const {
    data: productsData,
    isLoading,
    error,
  } = useQuery<ProductsResponse, Error>({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const quoteMutation = useMutation<
    QuoteResponse,
    Error,
    { productId: string; quantity: number }
  >({
    mutationFn: ({ productId, quantity }) => {
      if (!user?.phoneNumber) throw new Error("Missing phone number");

      return fetchQuote(productId, quantity, {
        phoneNumber: user.phoneNumber,
      });
    },
    onSuccess: () => setOpen(true),
  });

  const fulfillMutation = useMutation<
    void,
    Error,
    { quoteId: string; transactionHash: string }
  >({
    mutationFn: ({ quoteId, transactionHash }) => {
      if (!address) throw new Error("Missing address");
      return fulfillOrder({ quoteId, transactionHash, signer: address });
    },
  });

  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  const handleGetQuote = (product: Product) => {
    setSelectedProduct(product);
    quoteMutation.mutate({ productId: product.id, quantity });
  };

  const handleClearQuote = () => {
    quoteMutation.reset();
    setSelectedProduct(null);
    setQuantity(1);
    setOpen(false);
  };

  const handleBuy = async () => {
    if (!quoteMutation.data) return;

    const { quote } = quoteMutation.data;
    try {
      // Execute the payment transaction
      const hash = await writeContractAsync({
        address: quote.tokenQuote.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [quote.paymentDestination, BigInt(quote.tokenQuote.amount)],
      });

      // Send the transaction hash to the fulfill endpoint
      await fulfillMutation.mutateAsync({
        quoteId: quote.id,
        transactionHash: hash,
      });

      // Set purchase success state
      setPurchaseSuccess(true);
    } catch (error) {
      console.error("Error during purchase:", error);
      // alert("Purchase failed. Please try again.");
    }
  };

  const handleBackFromSuccess = () => {
    setPurchaseSuccess(false);
    handleClearQuote();
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-2xl ml-4">Shop</div>
      <div className="flex flex-row overflow-x-scroll gap-4 ">
        {productsData?.products.map((product, i) => (
          <div key={product.id} className={i === 0 ? "ml-4" : ""}>
            <button
              key={product.id}
              className="w-[150px]"
              onClick={() => handleGetQuote(product)}
            >
              <ProductCard product={product} />
            </button>
          </div>
        ))}
      </div>
      {quoteMutation.isError && (
        <div>Error fetching quote: {quoteMutation.error.message}</div>
      )}

      <Sheet
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        className="max-w-[400px] mx-auto"
        snapPoints={[0.6]}
      >
        <Sheet.Container className="">
          <Sheet.Header />
          <Sheet.Content>
            {quoteMutation.isSuccess && !purchaseSuccess && (
              <div className="p-4 gap-8 flex flex-col h-full">
                <div className="text-2xl">Purchase</div>
                <div className="flex items-center justify-center">
                  <ProductCard
                    className="w-[150px]"
                    product={quoteMutation.data.product}
                  />
                </div>
                <div className="mt-auto">
                  <div className="flex flex-row gap-2">
                    <Button onClick={handleClearQuote} variant="secondary">
                      Back
                    </Button>
                    <Button
                      onClick={handleBuy}
                      disabled={
                        fulfillMutation.isPending || isWriteContractPending
                      }
                    >
                      {fulfillMutation.isPending || isWriteContractPending
                        ? "Processing..."
                        : `Pay $${formatUnits(
                            BigInt(quoteMutation.data.quote.tokenQuote.amount),
                            quoteMutation.data.quote.tokenQuote.decimals
                          )}`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {purchaseSuccess && (
              <div className="p-4 gap-8 flex flex-col h-full">
                <div className="text-2xl">Purchase Successful!</div>
                <div className="flex items-center justify-center">
                  <ProductCard
                    className="w-[150px]"
                    product={quoteMutation.data!.product}
                  />
                </div>
                <div className="mt-auto">
                  <Button onClick={handleBackFromSuccess}>Back</Button>
                </div>
              </div>
            )}
            {fulfillMutation.isError && (
              <div className="mt-4 text-red-500">
                Error fulfilling order: {fulfillMutation.error.message}
              </div>
            )}
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop />
      </Sheet>
    </div>
  );
}

function ProductCard({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${className ?? ""}`}
    >
      <img
        src={product.image}
        alt={product.name}
        className="w-full rounded-lg border border-gray-300"
      />
      <div>{product.name}</div>
      <div>{product.description}</div>
    </div>
  );
}
