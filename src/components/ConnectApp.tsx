import { useEffect, useState } from "react";
import {
  IWCReactSession,
  useWalletConnect,
} from "../providers/WalletConnectProvider";

export function ConnectApp() {
  const [input, setInput] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [pairingTopic, setPairingTopic] = useState<string | null>("");
  const [wcReactSession, setWcReactSession] = useState<IWCReactSession | null>(
    null
  );
  const { pairSession, pairingStates, sessions } = useWalletConnect();

  function handlePair(data: string | null) {
    if (data?.startsWith("wc:")) {
      setIsLoading(true);
      pairSession({
        uri: data,
        onStart: (pairingTopic) => {
          setPairingTopic(pairingTopic);
        },
        onSuccess: (pairingTopic) => {},
        onError: (error) => {
          setPairingTopic(null);
          setIsLoading(false);
          setSuccess(false);
          setError(error);
        },
      });
    } else {
      if (!data) {
        setError({
          message: "Please add a valid Wallet Connect code ",
        } as Error);
      }
      setError({ message: "Invalid Wallet Connect QR code" } as Error);
    }
  }

  function handleScan(data: string | null) {
    if (data) {
      handlePair(data);
      if (data.startsWith("0x")) {
        console.log("TODO: handle ethereum address");
      }
    }
  }

  useEffect(() => {
    if (!pairingTopic) return;
    const pairingState = pairingStates[pairingTopic];

    setIsLoading(pairingState?.isLoading || false);

    const session = Object.values(sessions)?.find(
      (el: IWCReactSession) => el?.session?.pairingTopic === pairingTopic
    );
    if (session) {
      setWcReactSession(session);
      setSuccess(true);
    }
  }, [sessions, pairingTopic, pairingStates, close]);

  if (success && wcReactSession) {
    const { name, icons, url } = wcReactSession.session.peer.metadata;
    return (
      <div>
        <img src={icons[0]} alt={name} />
        <div>
          <h2>{name}</h2>
          <a href={url}>{url?.split("https://")[1] ?? "Unknown"}</a>
        </div>
        <div>✓</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div>
        <input
          type="text"
          placeholder="wc:…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          onClick={() => {
            setError(null);
            handlePair(input);
          }}
        >
          {isLoading ? "Connecting..." : "Connect"}
        </button>
      </div>

      {error && (
        <div role="alert">
          <p>
            {(error as Error)?.message ??
              "An error occurred, please try again later."}
          </p>
        </div>
      )}
    </div>
  );
}
