using Kamishibai;

namespace Spector.ViewModel;

[Navigate]
public class MainPageViewModel(
    [Inject] AudioInterfaceViewModel audioInterfaceViewModel,
    [Inject] RecorderViewModel recorderViewModel,
    [Inject] AnalysisTabViewModel analysisTabViewModel)
{
    public AudioInterfaceViewModel AudioInterfaceViewModel { get; } = audioInterfaceViewModel;
    public RecorderViewModel RecorderViewModel { get; } = recorderViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;


}