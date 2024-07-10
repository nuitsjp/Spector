using Kamishibai;
using Spector.ViewModel.AnalysisTab;
using Spector.ViewModel.MeasureTab;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] MeasureTabViewModel measureTabViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel)
{
    public MeasureTabViewModel MeasureTabViewModel { get; } = measureTabViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}