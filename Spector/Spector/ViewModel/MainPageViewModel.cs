using Kamishibai;
using Spector.ViewModel.Analysis;
using Spector.ViewModel.Measure;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}