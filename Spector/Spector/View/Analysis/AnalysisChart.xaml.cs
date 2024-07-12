using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows;
using Reactive.Bindings.Extensions;
using ScottPlot;
using Spector.Model;
using Spector.ViewModel.Analysis;
using Spector.ViewModel.Measure;

namespace Spector.View.Analysis;

/// <summary>
/// AudioInterfacesChart.xaml の相互作用ロジック
/// </summary>
public partial class AnalysisChart
{
    private static readonly TimeSpan DisplayWidth = TimeSpan.FromSeconds(20);

    public static readonly DependencyProperty AnalysisDevicesProperty = DependencyProperty.Register(
        nameof(AnalysisDevices), typeof(ObservableCollection<AnalysisDeviceViewModel>), typeof(AnalysisChart), new PropertyMetadata(default(ObservableCollection<AnalysisDeviceViewModel>), AnalysisDevicesOnChanged));

    public ObservableCollection<AnalysisDeviceViewModel> AnalysisDevices
    {
        get => (ObservableCollection<AnalysisDeviceViewModel>)GetValue(AnalysisDevicesProperty);
        set => SetValue(AnalysisDevicesProperty, value);
    }

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
        AudioInterfacePlot.Plot.Clear();

        foreach (var device in AnalysisDevices)
        {
            AudioInterfacePlot
                .Plot
                .AddSignal(device.InputLevels.Select(x => x.AsPrimitive()).ToArray(), label: device.Device);
        }

        var config = RecordingConfig.Default;
        // データの全長から、デフォルトの表示幅分を引いた値をデフォルトのx軸の最小値とする
        var xMin =
            // データの全長
            config.RecordingLength
            // 表示時間を表示間隔で割ることで、表示幅を計算する
            - (int)(DisplayWidth / config.RefreshRate.Interval);
        AudioInterfacePlot.Plot.SetAxisLimits(
            xMin: xMin, xMax: config.RecordingLength,
            yMin: -90, yMax: 0);
        AudioInterfacePlot.Plot.XAxis.SetBoundary(0, config.RecordingLength);
        AudioInterfacePlot.Plot.YAxis.SetBoundary(-90, 0);
        AudioInterfacePlot.Plot.XAxis.TickLabelFormat(x => $"{(((config.RecordingLength - x) * -1 * config.RefreshRate.Interval.TotalMilliseconds) / 1000d):#0.0[s]}");
        AudioInterfacePlot.Configuration.LockVerticalAxis = true;
        AudioInterfacePlot.Plot.Legend(location: Alignment.UpperLeft);
        AudioInterfacePlot.Refresh();
    }
}