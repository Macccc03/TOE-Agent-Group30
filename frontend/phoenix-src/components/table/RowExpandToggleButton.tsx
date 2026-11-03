import { Button } from "@phoenix/components/core/button/Button";
import { type ButtonProps } from "@phoenix/components/core/button/types";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { Tooltip } from "@phoenix/components/core/tooltip/Tooltip";
import { TooltipTrigger } from "@phoenix/components/index";

/**
 * Toggles how much of a row a table shows: a single clipped line each, so the
 * rows can be scanned down an even grid, or the wrapped content, so a value
 * can be read where it sits.
 */
export function RowExpandToggleButton({
  isExpanded,
  onChange,
  size = "M",
}: {
  isExpanded: boolean;
  onChange: (isExpanded: boolean) => void;
  size?: ButtonProps["size"];
}) {
  // Phrased as what it does to each row rather than as "expand rows", which
  // TracesTable already spends on its unrelated span-tree control.
  const label = isExpanded
    ? "Clip each row to a single line"
    : "Wrap each row over as many lines as it needs";
  return (
    <TooltipTrigger>
      <Button
        size={size}
        variant="default"
        aria-label={label}
        aria-pressed={isExpanded}
        leadingVisual={
          <Icon
            svg={isExpanded ? <Icons.RowCollapse /> : <Icons.RowExpand />}
          />
        }
        onPress={() => onChange(!isExpanded)}
      />
      <Tooltip offset={1}>{label}</Tooltip>
    </TooltipTrigger>
  );
}
