import { Card } from "@phoenix/components/core/card/Card";
import { CopyToClipboardButton } from "@phoenix/components/core/copy/CopyToClipboardButton";
import { Flex } from "@phoenix/components/core/layout/Flex";
import { MarkdownDisplayProvider } from "@phoenix/components/markdown/MarkdownDisplayContext";
import { ConnectedMarkdownModeSelect } from "@phoenix/components/markdown/MarkdownModeSelect";

import { useSpanInfoCardProps } from "../SpanInfoCardsContext";
import { defaultCardProps } from "./constants";
import { MimeTypeCodeBlock } from "./MimeTypeCodeBlock";
import type { SpanIOValue } from "./types";

/**
 * A card displaying the input (query) of a retriever span.
 */
export function RetrieverInput({ value, mimeType }: SpanIOValue) {
  const isText = mimeType === "text";
  const cardProps = useSpanInfoCardProps("input");
  return (
    <MarkdownDisplayProvider>
      <Card
        title="Input"
        {...defaultCardProps}
        {...cardProps}
        extra={
          <Flex direction="row" gap="size-100" alignItems="center">
            {isText ? <ConnectedMarkdownModeSelect /> : null}
            <CopyToClipboardButton text={value} />
          </Flex>
        }
      >
        <MimeTypeCodeBlock value={value} mimeType={mimeType} />
      </Card>
    </MarkdownDisplayProvider>
  );
}
