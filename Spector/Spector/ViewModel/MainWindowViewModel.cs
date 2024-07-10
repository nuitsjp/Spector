using Kamishibai;

namespace Spector.ViewModel;

public class MainWindowViewModel(IPresentationService presentationService) : INavigatedAsyncAware
{
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await presentationService.NavigateToLoadingPageAsync();
    }
}