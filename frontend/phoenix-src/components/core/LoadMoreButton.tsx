import { css } from "@emotion/react";

import { Button } from "@phoenix/components/core/button/Button";
import type { ButtonProps } from "@phoenix/components/core/button/types";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";

export type LoadMoreButtonProps = {
  onLoadMore: () => void;
  isLoadingNext: boolean;
  buttonProps?: ButtonProps;
};

const buttonCSS = css`
  border-radius: 16px;
  padding: var(--global-dimension-size-50) var(--global-dimension-size-200) !important;
`;

export const LoadMoreButton = ({
  onLoadMore,
  isLoadingNext,
  buttonProps,
}: LoadMoreButtonProps) => {
  return (
    <Button
      onPress={() => {
        onLoadMore();
      }}
      size="S"
      css={buttonCSS}
      isDisabled={isLoadingNext}
      leadingVisual={
        isLoadingNext ? <Icon svg={<Icons.Loading />} /> : undefined
      }
      {...buttonProps}
    >
      {isLoadingNext ? "Loading..." : "Load More"}
    </Button>
  );
};
