namespace Spector.ViewModel.MeasureTab;

public class MeasureTabViewModel(
    AudioInterfaceViewModel audioInterfaceViewModel,
    RecorderViewModel recorderViewModel)
{
    public AudioInterfaceViewModel AudioInterfaceViewModel { get; } = audioInterfaceViewModel;
    public RecorderViewModel RecorderViewModel { get; } = recorderViewModel;
}