using Kamishibai;
using Spector.ViewModel.AnalysisTab;
using Spector.ViewModel.Measure;
using AnalysisTabViewModel = Spector.ViewModel.Analysis.AnalysisTabViewModel;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}