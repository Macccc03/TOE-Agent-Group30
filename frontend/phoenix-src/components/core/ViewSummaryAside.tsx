import type { PropsWithChildren } from "react";

import { Flex } from "@phoenix/components/core/layout/Flex";
import type { ViewProps } from "@phoenix/components/core/view/View";
import { View } from "@phoenix/components/core/view/View";

type ViewSummaryAsideProps = PropsWithChildren<{
  width?: ViewProps["width"];
}>;
/**
 * A summary that's displayed on the right side of a view that shows a summary of the view's content.
 * E.x. a statistic
 */
export function ViewSummaryAside(props: ViewSummaryAsideProps) {
  const { width = "size-1250" } = props;
  return (
    <View
      width={width}
      borderStartWidth="thin"
      borderStartColor="default"
      padding="size-200"
      flex="none"
    >
      <Flex
        direction="column"
        alignItems="end"
        justifyContent="center"
        height="100%"
      >
        {props.children}
      </Flex>
    </View>
  );
}
