using CommunityToolkit.Mvvm.ComponentModel;
using LiveChartsCore.Defaults;
using LiveChartsCore.SkiaSharpView.Painting;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore;
using SkiaSharp;
using System.Collections.ObjectModel;
using Kamishibai;

namespace Spector.ViewModel;

public partial class MainWindowViewModel : ObservableObject, INavigatedAsyncAware
{
    public MainWindowViewModel()
    {
    }

    public AudioInterfacesChartViewModel? AudioInterfacesChart { get; } = null;
    public async Task OnNavigatedAsync(PostForwardEventArgs args)
    {
    }
}