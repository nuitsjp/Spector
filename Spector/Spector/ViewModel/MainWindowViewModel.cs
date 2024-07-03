using CommunityToolkit.Mvvm.ComponentModel;
using LiveChartsCore.Defaults;
using LiveChartsCore.SkiaSharpView.Painting;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore;
using SkiaSharp;
using System.Collections.ObjectModel;

namespace Spector.ViewModel;

public partial class MainWindowViewModel : ObservableObject
{
    public MainWindowViewModel()
    {
    }

    public AudioInterfacesChartViewModel? AudioInterfacesChart { get; } = null;
}