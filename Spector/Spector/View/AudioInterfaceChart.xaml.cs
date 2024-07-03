using System.Collections.Specialized;
using ScottPlot;
using Spector.Model;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Reactive.Bindings.Extensions;
using Spector.ViewModel;

namespace Spector.View;

/// <summary>
/// AudioInterfacesChart.xaml の相互作用ロジック
/// </summary>
public partial class AudioInterfaceChart : UserControl
{
    private static readonly TimeSpan DisplayWidth = TimeSpan.FromSeconds(20);

    public static readonly DependencyProperty AudioInterfaceProperty = DependencyProperty.Register(
        nameof(AudioInterface), typeof(AudioInterfaceViewModel), typeof(AudioInterfaceChart), new PropertyMetadata(default(AudioInterfaceViewModel), AudioInterfaceOnChanged));

    public AudioInterfaceViewModel AudioInterface
    {
        get => (AudioInterfaceViewModel)GetValue(AudioInterfaceProperty);
        set => SetValue(AudioInterfaceProperty, value);
    }

    public AudioInterfaceChart()
    {
        InitializeComponent();

        var audioInterface = new AudioInterface();
        audioInterface.ActivateAsync().Wait();
    }

    private static void AudioInterfaceOnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (e.NewValue as AudioInterfaceViewModel is { } audioInterface)
        {
            var audioInterfaceChart = (AudioInterfaceChart)d;
            audioInterface.Devices.CollectionChangedAsObservable()
                .Subscribe(audioInterfaceChart.DevicesOnChanged);
            audioInterface.LiveDataUpdated += audioInterfaceChart.Render;
        }
    }

    private void DevicesOnChanged(NotifyCollectionChangedEventArgs obj)
    {
        AudioInterfacePlot.Plot.Clear();

        foreach (var device in AudioInterface.Devices)
        {
            AudioInterfacePlot
                .Plot
                .AddSignal(device.LiveData, label: device.Name);
        }

        RecordingConfig config = RecordingConfig.Default;
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

    void Render(object? sender, EventArgs e)
    {
        AudioInterfacePlot.Refresh();
    }
}