using CommunityToolkit.Mvvm.ComponentModel;
using Kamishibai;

namespace Spector.ViewModel;

public class MainWindowViewModel(AudioInterfaceViewModel audioInterface)
    : ObservableObject, INavigatedAsyncAware, IDisposable
{
    public AudioInterfaceViewModel AudioInterface { get; } = audioInterface;

    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await AudioInterface.ActivateAsync();
    }

    public void Dispose()
    {
        AudioInterface.Dispose();
    }
}