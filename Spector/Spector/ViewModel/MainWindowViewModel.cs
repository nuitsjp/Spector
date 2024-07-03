using CommunityToolkit.Mvvm.ComponentModel;
using Kamishibai;

namespace Spector.ViewModel;

public partial class MainWindowViewModel(AudioInterfaceViewModel audioInterface)
    : ObservableObject, INavigatedAsyncAware, IDisposable
{
    public AudioInterfaceViewModel AudioInterface { get; } = audioInterface;

    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await AudioInterface.ActivateAsync();
    }

    public void Dispose()
    {
        // TODO release managed resources here
    }
}