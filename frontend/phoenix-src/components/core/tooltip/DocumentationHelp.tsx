import { css } from "@emotion/react";
import type { PropsWithChildren } from "react";

import { Text } from "@phoenix/components/core/content/Text";
import {
  DOCUMENTATION_TOPICS,
  type DocumentationTopic,
} from "@phoenix/constants/docsConstants";

import { ExternalLink } from "../ExternalLink";
import { ContextualHelp } from "./ContextualHelp";

const documentationFooterCSS = css`
  margin-top: var(--global-dimension-size-100);
`;

export type DocumentationHelpProps = PropsWithChildren<{
  topic: DocumentationTopic;
}>;

/**
 * Contextual help that links to a registered Phoenix documentation topic.
 */
export function DocumentationHelp({ children, topic }: DocumentationHelpProps) {
  const { href, label } = DOCUMENTATION_TOPICS[topic];

  return (
    <ContextualHelp
      href={href}
      variant="info"
      triggerAriaLabel={`Learn more about ${label}`}
    >
      <Text size="S">{children}</Text>
      <footer css={documentationFooterCSS}>
        <ExternalLink href={href}>View documentation</ExternalLink>
      </footer>
    </ContextualHelp>
  );
}
