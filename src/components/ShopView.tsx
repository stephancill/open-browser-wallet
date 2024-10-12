import { useQuery, useMutation } from "@tanstack/react-query";
import React, { useState } from "react";
import { Address, erc20Abi } from "viem";
import { useAccount, useWriteContract } from "wagmi";

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
  const { writeContractAsync } = useWriteContract();
  const { address } = useAccount();

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
    mutationFn: ({ productId, quantity }) => fetchQuote(productId, quantity),
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

  const handleGetQuote = (product: Product) => {
    setSelectedProduct(product);
    quoteMutation.mutate({ productId: product.id, quantity });
  };

  const handleClearQuote = () => {
    quoteMutation.reset();
    setSelectedProduct(null);
    setQuantity(1);
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

      // Handle successful purchase (e.g., show a success message, reset the form, etc.)
      alert("Purchase successful!");
      handleClearQuote();
    } catch (error) {
      console.error("Error during purchase:", error);
      alert("Purchase failed. Please try again.");
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Merchant Products</h1>
      {!quoteMutation.isSuccess && (
        <div className="flex flex-wrap gap-4">
          {productsData?.products.map((product) => (
            <div key={product.id} className="border border-gray-300 p-4">
              <img src={product.image} alt={product.name} className="w-20" />
              <h2>{product.name}</h2>
              <p>{product.description}</p>
              <p>
                Price: {product.price_min} - {product.price_max}{" "}
                {product.price_currency_code}
              </p>
              <p>Partner: {product.partner.name}</p>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="border border-gray-300 p-1 mt-2"
              />
              <button
                onClick={() => handleGetQuote(product)}
                className="bg-blue-500 text-white px-4 py-2 mt-2"
              >
                Get Quote
              </button>
            </div>
          ))}
        </div>
      )}
      {quoteMutation.isPending && <div>Fetching quote...</div>}
      {quoteMutation.isError && (
        <div>Error fetching quote: {quoteMutation.error.message}</div>
      )}
      {quoteMutation.isSuccess && (
        <div className="mt-4 p-4 border border-gray-300">
          <h2>Quote for {selectedProduct?.name}</h2>
          <p>Quote ID: {quoteMutation.data.quote.id}</p>
          <p>Token Amount: {quoteMutation.data.quote.tokenQuote.amount}</p>
          <p>
            Expires At:{" "}
            {new Date(quoteMutation.data.quote.expiresAt).toLocaleString()}
          </p>
          <p>Status: {quoteMutation.data.quote.status}</p>
          <button
            onClick={handleBuy}
            className="bg-green-500 text-white px-4 py-2 mt-4 mr-2"
            disabled={fulfillMutation.isPending}
          >
            {fulfillMutation.isPending ? "Processing..." : "Buy Now"}
          </button>
          <button
            onClick={handleClearQuote}
            className="bg-gray-500 text-white px-4 py-2 mt-4"
          >
            Back to Products
          </button>
        </div>
      )}
      {fulfillMutation.isError && (
        <div className="mt-4 text-red-500">
          Error fulfilling order: {fulfillMutation.error.message}
        </div>
      )}
    </div>
  );
}
