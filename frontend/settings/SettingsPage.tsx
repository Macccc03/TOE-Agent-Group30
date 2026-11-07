import { css } from "@emotion/react";

import { Card } from "@phoenix/components/core/card/Card";
import { Heading } from "@phoenix/components/core/content/Heading";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@phoenix/components/core/segmentedControl";
import { useTheme } from "@phoenix/contexts/ThemeContext";

const settingsPageCSS = css`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--global-dimension-size-300);
`;

const settingsContentCSS = css`
  display: grid;
  gap: var(--global-dimension-size-250);
  max-width: 600px;

  .card__body {
    padding: var(--global-dimension-size-200);
  }

  p {
    margin: 0 0 var(--global-dimension-size-200);
    color: var(--global-text-color-700);
  }
`;

export function SettingsPage() {
  const { theme, setThemeMode } = useTheme();

  return (
    <main css={settingsPageCSS}>
      <div css={settingsContentCSS}>
        <Heading level={1} weight="heavy">
          设置
        </Heading>
        <Card title="外观">
          <p>主题会立即应用到所有页面，并保存在当前浏览器。</p>
          <SegmentedControl
            aria-label="界面主题"
            selectedKey={theme}
            onSelectionChange={(key) => {
              if (key === "light" || key === "dark") setThemeMode(key);
            }}
          >
            <SegmentedControlItem id="light">
              <Icon svg={<Icons.Sun />} />
              浅色
            </SegmentedControlItem>
            <SegmentedControlItem id="dark">
              <Icon svg={<Icons.Moon />} />
              深色
            </SegmentedControlItem>
          </SegmentedControl>
        </Card>
      </div>
    </main>
  );
}
