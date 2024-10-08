import { smartWallet } from "@/libs/smart-wallet";
import { UserOpBuilder } from "@/libs/smart-wallet/service/userOps";
import { useBalance } from "@/providers/BalanceProvider";
import { useMe } from "@/providers/MeProvider";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExternalLinkIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { Button, Callout, Flex, Heading, Link, Text, TextArea } from "@radix-ui/themes";
import { useState } from "react";
import {
  Address,
  Chain,
  Hash,
  Hex,
  WalletRpcSchema,
  hashMessage,
  hashTypedData,
  hexToString,
  zeroAddress,
} from "viem";
import Spinner from "../Spinner";
import EIP712Renderer from "../EIP712Renderer";
import { parseSignature } from "webauthn-p256";

type SignSchemas = WalletRpcSchema[8] | WalletRpcSchema[10];

type Props = {
  schema: Omit<SignSchemas, "ReturnType">;
  origin: string;
  onSuccess: (hash: Hash) => void;
};

export default function WCSignModal({
  schema: { Parameters: params, Method: method },
  origin,
  onSuccess,
}: Props) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [signature, setSignature] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const { me } = useMe();
  const { refreshBalance } = useBalance();

  const sign = async (e: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const builder = new UserOpBuilder(smartWallet.client.chain as Chain);
      let hash: Hex;
      let address: Address;
      if (method === "personal_sign") {
        hash = hashMessage(hexToString(params[0]) as string);
        address = params[1] as Address;
      } else if (method === "eth_signTypedData_v4") {
        hash = hashTypedData(params[1] as any);
        address = params[0] as Address;
      } else {
        throw new Error("Unsupported method");
      }

      const signature = await builder.getSignature(hash, address, me?.keyId);

      setSignature(signature);
      onSuccess(signature);
    } catch (e: any) {
      console.error(e);
      setError(e);
    } finally {
      setIsLoading(false);
      refreshBalance();
    }
  };

  if (isLoading)
    return (
      <Flex direction="column" justify="center" align="center" grow="1" gap="5">
        <Spinner style={{ margin: 0 }} />
        <Text size="2">Signing...</Text>
      </Flex>
    );

  if (signature && !isLoading)
    return (
      <>
        <Flex direction="column" justify="center" align="center" grow="1" gap="5">
          {true ? (
            <>
              <CheckCircledIcon height="32" width="100%" color="var(--teal-11)" />
              <Flex direction="row" gap="2">
                <Text size="2">Message signed</Text>
              </Flex>
            </>
          ) : (
            <>
              <CrossCircledIcon height="32" width="100%" />
              <Flex direction="row" gap="2" style={{ color: "var(--gray-12)" }}>
                <Text size="2">Signature rejected</Text>
                <ExternalLinkIcon style={{ alignSelf: "center" }} />
              </Flex>
            </>
          )}
        </Flex>
      </>
    );

  return (
    <Flex direction="column" style={{ flexGrow: 1, width: "100%" }} gap="5">
      {!signature && !isLoading && (
        <Heading as="h2" size={"8"} style={{ color: "var(--accent-9)" }}>
          {origin}
        </Heading>
      )}
      {!signature && !isLoading && (
        <form
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            flexGrow: 1,
          }}
          onSubmit={async (e) => await sign(e)}
        >
          <Flex direction="column">
            <Flex direction="column">
              <Flex direction="column" gap="3">
                <div>
                  {method === "personal_sign" ? (
                    <div>
                      <Text style={{ color: "var(--accent-10)", marginLeft: "1rem" }}>Data:</Text>
                      <TextArea
                        disabled
                        style={{
                          resize: "none",
                          minHeight: "100px",
                          borderRadius: "20px",
                          padding: ".5rem",
                        }}
                        value={hexToString(params[0])}
                      />
                    </div>
                  ) : (
                    <div>
                      <Text style={{ color: "var(--accent-10)", marginLeft: "1rem" }}>
                        Typed Data:
                      </Text>
                      <EIP712Renderer data={params[1] as any} />
                    </div>
                  )}
                </div>
              </Flex>
            </Flex>
          </Flex>

          <Flex direction={"column"} gap="3">
            {error && error instanceof Error && (
              <Callout.Root
                style={{ maxHeight: "150px", overflowY: "scroll", wordBreak: "break-word" }}
              >
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>{error.message}</Callout.Text>
              </Callout.Root>
            )}
            <Button variant="outline" size="3" type="submit">
              SIGN
            </Button>
          </Flex>
        </form>
      )}
    </Flex>
  );
}
