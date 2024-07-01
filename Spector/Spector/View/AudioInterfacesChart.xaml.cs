﻿using ScottPlot;
using Spector.Model;
using System;
using System.Collections.Generic;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace Spector.View
{
    /// <summary>
    /// AudioInterfacesChart.xaml の相互作用ロジック
    /// </summary>
    public partial class AudioInterfacesChart : UserControl
    {
        Random rand = new();
        private double[] LiveData { get; }
        private CaptureDevice CaptureDevice { get; } = new();

        DataGen.Electrocardiogram ecg = new();
        Stopwatch sw = Stopwatch.StartNew();

        private Timer _updateDataTimer;
        private DispatcherTimer _renderTimer;

        public AudioInterfacesChart()
        {
            InitializeComponent();

            wpfPlot1.Plot.AxisAutoX(margin: 0);

            RecordingConfig config = ViewModel.RecordingConfig;
            // データの全長から、デフォルトの表示幅分を引いた値をデフォルトのx軸の最小値とする
            var xMin =
                // データの全長
                config.RecordingLength
                // 表示時間を表示間隔で割ることで、表示幅を計算する
                - (int)(DisplayWidth / ViewModel.RecordingConfig.RefreshRate.Interval);
            wpfPlot1.Plot.SetAxisLimits(
                xMin: xMin, xMax: config.RecordingLength,
                yMin: -90, yMax: 0);
            wpfPlot1.Plot.XAxis.SetBoundary(0, config.RecordingLength);
            wpfPlot1.Plot.YAxis.SetBoundary(-90, 0);
            wpfPlot1.Plot.XAxis.TickLabelFormat(x => $"{(((config.RecordingLength - x) * -1 * ViewModel.RecordingConfig.RefreshRate.Interval.TotalMilliseconds) / 1000d):#0.0[s]}");
            wpfPlot1.Configuration.LockVerticalAxis = true;
            wpfPlot1.Plot.Legend(location: Alignment.UpperLeft);
            wpfPlot1.Refresh();


            LiveData = new double[4800];
            Array.Fill(LiveData, Decibel.Minimum.AsPrimitive());

            CaptureDevice.StartRecording();

            // create a traditional timer to update the data
            _updateDataTimer = new Timer(_ => UpdateData(), null, 0, 5);

            // create a separate timer to update the GUI
            _renderTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(10)
            };
            _renderTimer.Tick += Render;
            _renderTimer.Start();
        }

        void UpdateData()
        {
            // "scroll" the whole chart to the left
            Array.Copy(LiveData, 1, LiveData, 0, LiveData.Length - 1);

            // place the newest data point at the end
            LiveData[^1] = CaptureDevice.Level.AsPrimitive();
        }

        void Render(object? sender, EventArgs e)
        {
            wpfPlot1.Refresh();
        }
    }
}
