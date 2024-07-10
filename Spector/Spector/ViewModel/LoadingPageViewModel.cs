using Kamishibai;
using Spector.ViewModel.MeasureTab;

namespace Spector.ViewModel;

[Navigate]
public class LoadingPageViewModel(
    [Inject] AudioInterfaceViewModel audioInterfaceViewModel,
    [Inject] MeasureTab.RecorderViewModel recorderViewModel,
    [Inject] IPresentationService presentationService) : INavigatedAsyncAware
{
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await audioInterfaceViewModel.ActivateAsync();
        await recorderViewModel.ActivateAsync();
        await presentationService.NavigateToMainPageAsync();
    }
}