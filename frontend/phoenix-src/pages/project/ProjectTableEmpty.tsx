import { EmptyState } from "@phoenix/components/core/empty/EmptyState";
import { EmptyStateGraphic } from "@phoenix/components/core/empty/EmptyStateGraphic";
import { TableEmptyWrap } from "@phoenix/components/table/TableEmptyWrap";

export function ProjectTableEmpty() {
  return (
    <TableEmptyWrap>
      <EmptyState
        graphic={<EmptyStateGraphic variant="trace" />}
        description="No traces found that match the selected filters"
      />
    </TableEmptyWrap>
  );
}
