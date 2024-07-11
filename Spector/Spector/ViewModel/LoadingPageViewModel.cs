using Kamishibai;
using Spector.ViewModel.Measure;

namespace Spector.ViewModel;

[Navigate]
public class LoadingPageViewModel(
    [Inject] AudioInterfaceViewModel audioInterfaceViewModel,
    [Inject] RecorderViewModel recorderViewModel,
    [Inject] IPresentationService presentationService) : INavigatedAsyncAware
{
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await audioInterfaceViewModel.ActivateAsync();
        await recorderViewModel.ActivateAsync();
        await presentationService.NavigateToMainPageAsync();
    }
}