using CommunityToolkit.Mvvm.ComponentModel;
using Kamishibai;

namespace Spector.ViewModel;

public partial class MainWindowViewModel : ObservableObject, INavigatedAsyncAware, IDisposable
{
    public AudioInterfaceViewModel AudioInterface { get; } = new();

    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await AudioInterface.ActivateAsync();
    }

    public void Dispose()
    {
        // TODO release managed resources here
    }
}