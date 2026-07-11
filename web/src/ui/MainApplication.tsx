import { AnalysisScreen } from './AnalysisScreen';
import { CalibrationScreen } from './CalibrationScreen';
import { MeasureScreen } from './MeasureScreen';
import { Onboarding } from './Onboarding';
import { SettingsScreen } from './SettingsScreen';
import { TabBar } from './TabBar';
import { useSpector } from './SpectorContext';

export function MainApplication() {
  const { state, actions } = useSpector();

  if (state.activation !== 'ready') return <Onboarding />;

  return (
    <div className="application-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Spector</h1>
            <p>ブラウザー音響計測</p>
          </div>
        </div>
        <div className="header-summary">
          <span>
            {state.sources.filter((source) => source.state === 'active').length}
            入力
          </span>
          <span>{state.recordings.length}記録</span>
          <span>端末内保存</span>
        </div>
      </header>

      <TabBar selected={state.selectedTab} onSelect={actions.selectTab} />

      <div
        className={`global-status ${state.statusTone}`}
        role={state.statusTone === 'error' ? 'alert' : 'status'}
        aria-live={state.statusTone === 'error' ? 'assertive' : 'polite'}
      >
        {state.statusMessage}
      </div>

      <main className="app-content">
        {state.selectedTab === 'measure' && (
          <section
            id="panel-measure"
            role="tabpanel"
            aria-labelledby="tab-measure"
            tabIndex={0}
          >
            <MeasureScreen />
          </section>
        )}
        {state.selectedTab === 'analysis' && (
          <section
            id="panel-analysis"
            role="tabpanel"
            aria-labelledby="tab-analysis"
            tabIndex={0}
          >
            <AnalysisScreen />
          </section>
        )}
        {state.selectedTab === 'calibration' && (
          <section
            id="panel-calibration"
            role="tabpanel"
            aria-labelledby="tab-calibration"
            tabIndex={0}
          >
            <CalibrationScreen />
          </section>
        )}
        {state.selectedTab === 'settings' && (
          <section
            id="panel-settings"
            role="tabpanel"
            aria-labelledby="tab-settings"
            tabIndex={0}
          >
            <SettingsScreen />
          </section>
        )}
      </main>
    </div>
  );
}
