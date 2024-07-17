import React from "react";
import { Theme, Box, Heading, ScrollArea, Text } from "@radix-ui/themes";

interface EIP712Data {
  domain: Record<string, any>;
  message: Record<string, any>;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
}

const EIP712Renderer: React.FC<{ data: EIP712Data }> = ({ data }) => {
  const renderValue = (value: any, depth = 0): JSX.Element => {
    if (typeof value !== "object" || value === null) {
      return <Text>{JSON.stringify(value)}</Text>;
    }

    return (
      <Box style={{ paddingLeft: `${depth * 8}px` }}>
        {Object.entries(value).map(([key, val]) => (
          <Box key={key}>
            <Text weight="bold">{key}:</Text> {renderValue(val, depth + 1)}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Theme>
      <ScrollArea style={{ height: "300px", width: "100%" }}>
        <Box p="4">
          <Box>
            <Heading size="3">Domain</Heading>
            {renderValue(data.domain)}
          </Box>
          <Box mt="4">
            <Heading size="3">Message</Heading>
            {renderValue(data.message)}
          </Box>
        </Box>
      </ScrollArea>
    </Theme>
  );
};

export default EIP712Renderer;
