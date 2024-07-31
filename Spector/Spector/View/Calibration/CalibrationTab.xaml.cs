using ScottPlot;
using Spector.Model;
using Spector.View.Measure;
using Spector.ViewModel.Measure;
using System.Collections.Specialized;
using System.Windows;
using System.Windows.Controls;
using Reactive.Bindings.Extensions;
using System.Windows.Threading;
using static Microsoft.WindowsAPICodePack.Shell.PropertySystem.SystemProperties.System;

namespace Spector.View.Calibration
{
    /// <summary>
    /// CalibrationTab.xaml の相互作用ロジック
    /// </summary>
    public partial class CalibrationTab
    {
        private static readonly TimeSpan DisplayWidth = TimeSpan.FromSeconds(20);

        private DispatcherTimer DispatcherTimer { get; }

        public CalibrationTab()
        {
            InitializeComponent();

            // 定期的にデータを更新する
            DispatcherTimer = new DispatcherTimer
            {
                Interval = RecordingConfig.Default.RefreshRate.Interval
            };
            DispatcherTimer.Tick += Render;
            DispatcherTimer.Start();
        }

        void Render(object? sender, EventArgs e)
        {
            AudioInterfacePlot.Refresh();
        }

        private DeviceViewModel? SelectedPlaybackDevice { get; set; }

        private void SelectedPlaybackDevice_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if(e.AddedItems.Count == 0)
            {
                return;
            }

            SelectedPlaybackDevice = (DeviceViewModel)e.AddedItems[0]!;

            AudioInterfacePlot.Plot.Clear();
            AudioInterfacePlot
                .Plot
                .AddSignal(SelectedPlaybackDevice.LiveData, label: SelectedPlaybackDevice.Name);

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
}
