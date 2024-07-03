using CommunityToolkit.Mvvm.ComponentModel;
using LiveChartsCore.Defaults;
using LiveChartsCore.SkiaSharpView.Painting;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore;
using SkiaSharp;
using System.Collections.ObjectModel;
using Kamishibai;
using Reactive.Bindings;
using Spector.Model;

namespace Spector.ViewModel;

public partial class MainWindowViewModel : ObservableObject, INavigatedAsyncAware, IDisposable
{
    public MainWindowViewModel()
    {
    }

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