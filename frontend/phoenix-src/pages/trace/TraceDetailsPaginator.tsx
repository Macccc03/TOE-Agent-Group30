import { css } from "@emotion/react";
import { startTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@phoenix/components/core/button/Button";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { KeyboardToken } from "@phoenix/components/core/KeyboardToken";
import { Flex } from "@phoenix/components/core/layout/Flex";
import { Tooltip } from "@phoenix/components/core/tooltip/Tooltip";
import { TooltipArrow } from "@phoenix/components/core/tooltip/TooltipArrow";
import { TooltipTrigger } from "@phoenix/components/index";
import {
  getNeighbors,
  useTracePagination,
} from "@phoenix/pages/trace/TracePaginationContext";

export const NEXT_TRACE_HOTKEY = "j";
export const PREVIOUS_TRACE_HOTKEY = "k";

export const TraceDetailsPaginator = ({
  currentId,
}: {
  currentId?: string;
}) => {
  const pagination = useTracePagination();

  useHotkeys(NEXT_TRACE_HOTKEY, () => {
    if (pagination) {
      pagination.next(currentId);
    }
  });

  useHotkeys(PREVIOUS_TRACE_HOTKEY, () => {
    if (pagination) {
      pagination.previous(currentId);
    }
  });

  if (!pagination || !pagination.traceSequence.length) {
    return null;
  }

  const { previous, next, traceSequence } = pagination;
  const { nextTraceId, previousTraceId } = getNeighbors(
    traceSequence,
    currentId
  );
  const hasPrevious = !!previousTraceId;
  const hasNext = !!nextTraceId;

  return (
    <Flex
      gap="size-50"
      css={css`
        button {
          // either the icons or the trigger wrap are making the buttons slightly too small
          // so just spot adjust the min height here
          min-height: 31px;
        }
      `}
    >
      <Flex direction="row" gap="size-50" alignItems="center">
        <TooltipTrigger delay={100}>
          <Button
            size="S"
            id="next"
            leadingVisual={<Icon svg={<Icons.ArrowDown />} />}
            aria-label="Next trace"
            isDisabled={!hasNext}
            onPress={() => {
              startTransition(() => {
                next(currentId);
              });
            }}
          />
          <Tooltip offset={4}>
            <TooltipArrow />
            <Flex direction="row" gap="size-100" alignItems="center">
              <span>Next trace</span>
              <KeyboardToken>{NEXT_TRACE_HOTKEY}</KeyboardToken>
            </Flex>
          </Tooltip>
        </TooltipTrigger>
        <TooltipTrigger delay={100}>
          <Button
            size="S"
            id="previous"
            leadingVisual={<Icon svg={<Icons.ArrowUp />} />}
            aria-label="Previous trace"
            isDisabled={!hasPrevious}
            onPress={() => {
              startTransition(() => {
                previous(currentId);
              });
            }}
          />
          <Tooltip offset={4}>
            <TooltipArrow />
            <Flex direction="row" gap="size-100" alignItems="center">
              <span>Previous trace</span>
              <KeyboardToken>{PREVIOUS_TRACE_HOTKEY}</KeyboardToken>
            </Flex>
          </Tooltip>
        </TooltipTrigger>
      </Flex>
    </Flex>
  );
};
