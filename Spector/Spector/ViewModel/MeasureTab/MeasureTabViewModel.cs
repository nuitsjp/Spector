namespace Spector.ViewModel.MeasureTab;

public class MeasureTabViewModel(
    AudioInterfaceViewModel audioInterfaceViewModel,
    ViewModel.RecorderViewModel recorderViewModel)
{
    public AudioInterfaceViewModel AudioInterfaceViewModel { get; } = audioInterfaceViewModel;
    public ViewModel.RecorderViewModel RecorderViewModel { get; } = recorderViewModel;
}