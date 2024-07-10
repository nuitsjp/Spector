using Kamishibai;
using Spector.ViewModel.MeasureTab;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTab.AnalysisTabViewModel analysisTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;

    public AnalysisTab.AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}