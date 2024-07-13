using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Drawing;
using System.Windows;
using Reactive.Bindings.Extensions;
using ScottPlot;
using Spector.Model;
using Spector.ViewModel;
using Spector.ViewModel.Analysis;
using Spector.ViewModel.Measure;

namespace Spector.View.Analysis;

/// <summary>
/// AudioInterfacesChart.xaml の相互作用ロジック
/// </summary>
public partial class AnalysisChart : IPlot
{
    private static readonly TimeSpan DisplayWidth = TimeSpan.FromSeconds(20);

    public static readonly DependencyProperty AnalysisDevicesProperty = DependencyProperty.Register(
        nameof(AnalysisDevices), typeof(ObservableCollection<AnalysisDeviceViewModel>), typeof(AnalysisChart), new PropertyMetadata(default(ObservableCollection<AnalysisDeviceViewModel>), AnalysisDevicesOnChanged));

    public ObservableCollection<AnalysisDeviceViewModel> AnalysisDevices
    {
        get => (ObservableCollection<AnalysisDeviceViewModel>)GetValue(AnalysisDevicesProperty);
        set => SetValue(AnalysisDevicesProperty, value);
    }

    public WpfPlot WpfPlot => AnalysisPlot;

    public AnalysisChart()
    {
        InitializeComponent();
    }


    private static void AnalysisDevicesOnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (e.NewValue is null) return;

        var analysisDevices = (ObservableCollection<AnalysisDeviceViewModel>)e.NewValue;
        var analysisChart = (AnalysisChart)d;
        analysisDevices.CollectionChanged += (_, _) =>
        {
            analysisChart.DevicesOnChanged(null);
        };
        analysisChart.DevicesOnChanged(null);
    }

    private void DevicesOnChanged(NotifyCollectionChangedEventArgs? _)
    {
        AnalysisPlot.Plot.Clear();

        foreach (var device in AnalysisDevices)
        {
            AnalysisPlot
                .Plot
                .AddSignal(device.InputLevels.Select(x => x.AsPrimitive()).ToArray(), label: device.Device);
        }

        var config = RecordingConfig.Default;
        var xMax = AnalysisDevices.Any()
            ? AnalysisDevices.Max(x => x.InputLevels.Count)
            : 10;
        AnalysisPlot.Plot.SetAxisLimits(
            xMin: 0, xMax: xMax,
            yMin: -90, yMax: 0);
        AnalysisPlot.Plot.XAxis.SetBoundary(0, xMax);
        AnalysisPlot.Plot.YAxis.SetBoundary(-90, 0);
        AnalysisPlot.Plot.XAxis.TickLabelFormat(x => $"{x * config.RefreshRate.Interval.TotalMilliseconds / 1000d:#0.0[s]}");
        AnalysisPlot.Configuration.LockVerticalAxis = true;
        AnalysisPlot.Plot.Legend(location: Alignment.UpperLeft);
        AnalysisPlot.Refresh();
    }

    public Bitmap Render()
    {
        return AnalysisPlot.Plot.Render();
    }
}