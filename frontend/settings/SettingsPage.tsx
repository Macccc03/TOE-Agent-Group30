import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@phoenix/components/core/segmentedControl";
import { useTheme } from "@phoenix/contexts/ThemeContext";

import "./settings.css";

export function SettingsPage() {
  const { theme, setThemeMode } = useTheme();
  const isLight = theme === "light";

  return (
    <main className="settings-page">
      <div className="settings-shell">
        <header className="settings-header">
          <p className="settings-eyebrow">Workspace / Preferences</p>
          <h1>设置</h1>
          <p className="settings-subtitle">
            调整界面外观与本地偏好。设置只保存在当前浏览器。
          </p>
        </header>

        <div className="settings-grid">
          <section className="settings-card" aria-labelledby="appearance-title">
            <div className="settings-card__head">
              <div>
                <h2 id="appearance-title">外观</h2>
                <p>主题会立即应用到所有页面，并保存在当前浏览器。</p>
              </div>
              <span className="settings-card__icon" aria-hidden="true">
                ◐
              </span>
            </div>

            <SegmentedControl
              aria-label="界面主题"
              selectedKey={theme}
              isJustified
              onSelectionChange={(key) => {
                if (key === "light" || key === "dark") setThemeMode(key);
              }}
            >
              <SegmentedControlItem id="light">
                <Icon svg={<Icons.Sun />} />
                <span className="theme-option__text">
                  <strong>浅色</strong>
                  <em>明亮、纸感</em>
                </span>
              </SegmentedControlItem>
              <SegmentedControlItem id="dark">
                <Icon svg={<Icons.Moon />} />
                <span className="theme-option__text">
                  <strong>深色</strong>
                  <em>专注、低光</em>
                </span>
              </SegmentedControlItem>
            </SegmentedControl>

            <div className="settings-notes">
              <p>
                <span>01</span>立即生效，无需刷新页面。
              </p>
              <p>
                <span>02</span>偏好写入当前浏览器，换设备不会同步。
              </p>
              <p>
                <span>03</span>看板、表格与图表会一起切换到对应配色。
              </p>
            </div>

            <div className="settings-tokens" aria-hidden="true">
              <span>
                <i
                  style={{
                    background: "var(--global-background-color-default)",
                  }}
                />
                背景
              </span>
              <span>
                <i style={{ background: "var(--global-color-gray-100)" }} />
                表面
              </span>
              <span>
                <i style={{ background: "var(--global-text-color-900)" }} />
                文本
              </span>
              <span>
                <i style={{ background: "var(--toe-accent)" }} />
                强调
              </span>
              <span>
                <i style={{ background: "var(--toe-danger)" }} />
                危险
              </span>
            </div>

            <p className="settings-current">
              <span className="settings-current__dot" aria-hidden="true" />
              当前：{isLight ? "浅色" : "深色"} · 已保存到当前浏览器
            </p>
          </section>

          <section className="settings-preview" aria-label="主题预览">
            <div className="settings-preview__head">
              <span>预览 / Preview</span>
              <span>{isLight ? "Light" : "Dark"}</span>
            </div>
            <div className="theme-preview" aria-hidden="true">
              <div className="theme-preview__bar">
                <i />
                <i />
                <i />
              </div>
              <div className="theme-preview__body">
                <div className="theme-preview__side">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="theme-preview__main">
                  <div className="theme-preview__title" />
                  <div className="theme-preview__tiles">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="theme-preview__chart">
                    <svg
                      viewBox="0 0 100 40"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <polyline
                        points="0,31 14,25 28,28 42,15 56,20 70,9 84,14 100,4"
                        fill="none"
                        stroke="var(--toe-accent)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            <p className="settings-preview__note">
              切换主题，预览会同步变化。看板与 Tracing 页面会一起更新。
            </p>
          </section>
        </div>

        <section className="settings-about" aria-label="关于">
          <span>Phoenix Tracing</span>
          <p>精简前端 · v{window.Config.platformVersion}</p>
          <p>页面读取当前配置的本地追踪服务。</p>
        </section>
      </div>
    </main>
  );
}
