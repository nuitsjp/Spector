using Kamishibai;
using Spector.ViewModel.Calibration;
using Spector.ViewModel.Measure;

namespace Spector.ViewModel;

[Navigate]
public class LoadingPageViewModel(
    [Inject] AudioInterfaceViewModel audioInterfaceViewModel,
    [Inject] RecorderViewModel recorderViewModel,
    [Inject] CalibrationTabViewModel calibrationTabViewModel,
    [Inject] IPresentationService presentationService) : INavigatedAsyncAware
{
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await audioInterfaceViewModel.ActivateAsync();
        await recorderViewModel.ActivateAsync();
        calibrationTabViewModel.Activate();
        await presentationService.NavigateToMainPageAsync();
    }
}