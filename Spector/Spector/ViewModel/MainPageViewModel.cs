using Kamishibai;
using Spector.ViewModel.MeasureTab;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] AudioInterfaceViewModel audioInterfaceViewModel,
    [Inject] MeasureTab.RecorderViewModel recorderViewModel,
    [Inject] AnalysisTab.AnalysisTabViewModel analysisTabViewModel)
{
    public AudioInterfaceViewModel AudioInterfaceViewModel { get; } = audioInterfaceViewModel;
    public MeasureTab.RecorderViewModel RecorderViewModel { get; } = recorderViewModel;

    public AnalysisTab.AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}