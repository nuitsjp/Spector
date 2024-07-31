using Kamishibai;
using Spector.View.Settings;
using Spector.ViewModel.Analysis;
using Spector.ViewModel.Calibration;
using Spector.ViewModel.Measure;
using Spector.ViewModel.Settings;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel,
    [Inject] CalibrationTabViewModel calibrationTabViewModel,
    [Inject] SettingsTabViewModel settingsTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;
    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;
    public CalibrationTabViewModel CalibrationTabViewModel { get; } = calibrationTabViewModel;
    public SettingsTabViewModel SettingsTabViewModel { get; } = settingsTabViewModel;
}