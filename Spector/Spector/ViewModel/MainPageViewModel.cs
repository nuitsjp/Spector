using Kamishibai;
using Spector.View.Settings;
using Spector.ViewModel.Analysis;
using Spector.ViewModel.Measure;
using Spector.ViewModel.Settings;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel,
    [Inject] SettingsTabViewModel settingsTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;
    public SettingsTabViewModel SettingsTabViewModel { get; } = settingsTabViewModel;
}