import { useRef, type KeyboardEvent } from 'react';

import type { MainTab } from './model';

interface TabDefinition {
  readonly id: MainTab;
  readonly label: string;
}

const tabs: readonly TabDefinition[] = [
  { id: 'measure', label: '計測' },
  { id: 'analysis', label: '解析' },
  { id: 'calibration', label: 'スピーカー校正' },
  { id: 'settings', label: '設定' },
];

interface TabBarProps {
  readonly selected: MainTab;
  readonly onSelect: (tab: MainTab) => void;
}

export function TabBar({ selected, onSelect }: TabBarProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (nextIndex: number): void => {
    const tab = tabs[nextIndex];
    if (tab === undefined) return;
    onSelect(tab.id);
    buttonRefs.current[nextIndex]?.focus();
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move((index + 1) % tabs.length);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move((index - 1 + tabs.length) % tabs.length);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(tabs.length - 1);
        break;
    }
  };

  return (
    <nav className="tab-navigation" aria-label="Spectorの機能">
      <div role="tablist" aria-label="メイン画面">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected === tab.id ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
