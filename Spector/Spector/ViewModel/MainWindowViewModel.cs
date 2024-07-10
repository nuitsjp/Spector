using CommunityToolkit.Mvvm.ComponentModel;
using Kamishibai;
using Spector.View;

namespace Spector.ViewModel;

public class MainWindowViewModel(IPresentationService presentationService) : INavigatedAsyncAware
{
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await presentationService.NavigateToLoadingPageAsync();
    }
}