using CommunityToolkit.Mvvm.ComponentModel;
using Kamishibai;

namespace Spector.ViewModel;

public class MainWindowViewModel(
    AudioInterfaceViewModel audioInterfaceViewModel, 
    RecorderViewModel recorderViewModel,
    AnalysisTabViewModel analysisTabViewModel) : ObservableObject, INavigatedAsyncAware, IDisposable
{
    public AudioInterfaceViewModel AudioInterfaceViewModel { get; } = audioInterfaceViewModel;
    public RecorderViewModel RecorderViewModel { get; } = recorderViewModel;

    public AnalysisTabViewModel AnalysisTabViewModel { get; } = analysisTabViewModel;

    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
        await AudioInterfaceViewModel.ActivateAsync();
        await RecorderViewModel.ActivateAsync();
    }

    public void Dispose()
    {
        AudioInterfaceViewModel.Dispose();
    }
}