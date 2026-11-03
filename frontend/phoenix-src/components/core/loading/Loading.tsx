import { css } from "@emotion/react";
import type { ComponentProps } from "react";

import { Text } from "@phoenix/components/core/content/Text";
import { ProgressCircle } from "@phoenix/components/core/progress/ProgressCircle";

type LoadingProps = {
  message?: string;
  size?: ComponentProps<typeof ProgressCircle>["size"];
  className?: string;
};

export const Loading = ({ message, size, className }: LoadingProps) => {
  return (
    <div
      className={className}
      css={css`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        gap: var(--global-dimension-size-100);
      `}
    >
      <ProgressCircle isIndeterminate aria-label="loading" size={size} />
      {message != null ? <Text>{message}</Text> : null}
    </div>
  );
};
