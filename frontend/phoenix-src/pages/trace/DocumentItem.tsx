import { DocumentAttributePostfixes } from "@arizeai/openinference-semantic-conventions";

import { Card } from "@phoenix/components/core/card/Card";
import { Heading } from "@phoenix/components/core/content/Heading";
import { CopyToClipboardButton } from "@phoenix/components/core/copy/CopyToClipboardButton";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { Flex } from "@phoenix/components/core/layout/Flex";
import type { TokenProps } from "@phoenix/components/core/token/Token";
import { Token } from "@phoenix/components/core/token/Token";
import type { ViewProps } from "@phoenix/components/core/view/View";
import { View } from "@phoenix/components/core/view/View";
import { ConnectedMarkdownBlock } from "@phoenix/components/markdown/MarkdownBlock";
import type { AttributeDocument } from "@phoenix/openInference/tracing/types";
import { numberFormatter } from "@phoenix/utils/numberFormatUtils";

import type { DocumentAnnotation } from "./DocumentAnnotationItem";
import { ReadonlyJSONBlock } from "./ReadonlyJSONBlock";

export function DocumentItem({
  document,
  documentAnnotations,
  backgroundColor,
  borderColor = "default",
  tokenColor,
  spanNodeId,
  documentPosition,
}: {
  document: AttributeDocument;
  documentAnnotations?: DocumentAnnotation[] | null;
  backgroundColor?: ViewProps["backgroundColor"];
  borderColor?: ViewProps["borderColor"];
  tokenColor?: TokenProps["color"];
  spanNodeId?: string;
  documentPosition?: number;
}) {
  const metadata = document[DocumentAttributePostfixes.metadata];
  const documentContent = document[DocumentAttributePostfixes.content];
  const canAnnotate = spanNodeId != null && documentPosition != null;
  const showAnnotationsSection = canAnnotate;
  return (
    <Card
      backgroundColor={backgroundColor}
      borderColor={borderColor}
      collapsible
      title={
        <Flex direction="row" gap="size-50" alignItems="center">
          <Icon svg={<Icons.File />} />
          <Heading level={4}>
            document {document[DocumentAttributePostfixes.id]}
          </Heading>
        </Flex>
      }
      extra={
        <Flex direction="row" gap="size-100" alignItems="center">
          {typeof document[DocumentAttributePostfixes.score] === "number" && (
            <Token color={tokenColor}>
              {`score ${numberFormatter(
                document[DocumentAttributePostfixes.score]
              )}`}
            </Token>
          )}
          {/* the content is what a reader reaches for; the whole document is
              the fallback for a document that recorded none */}
          <CopyToClipboardButton
            text={
              documentContent != null
                ? documentContent
                : JSON.stringify(document, null, 2)
            }
          />
        </Flex>
      }
    >
      <Flex direction="column">
        {documentContent && (
          <ConnectedMarkdownBlock>{documentContent}</ConnectedMarkdownBlock>
        )}
        {metadata && (
          <>
            <View borderColor={borderColor} borderTopWidth="thin">
              <View
                paddingX="size-200"
                paddingY="size-100"
                borderColor={borderColor}
                borderBottomWidth="thin"
              >
                <Heading level={4}>Document Metadata</Heading>
              </View>
              <ReadonlyJSONBlock basicSetup={{ lineNumbers: false }}>
                {JSON.stringify(metadata)}
              </ReadonlyJSONBlock>
            </View>
          </>
        )}
      </Flex>
    </Card>
  );
}
