import { Heading } from "react-aria-components";

import { IconButton } from "@phoenix/components/core/button/IconButton";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";

/**
 * Month navigation header shared by Calendar and RangeCalendar. The previous /
 * next buttons and the heading are wired up automatically through the
 * surrounding calendar's context via their slots.
 */
export function CalendarNavigation() {
  return (
    <header className="calendar__header">
      <IconButton slot="previous" size="S">
        <Icon svg={<Icons.ChevronLeftSmall />} />
      </IconButton>
      <Heading className="calendar__heading" />
      <IconButton slot="next" size="S">
        <Icon svg={<Icons.ChevronRightSmall />} />
      </IconButton>
    </header>
  );
}
