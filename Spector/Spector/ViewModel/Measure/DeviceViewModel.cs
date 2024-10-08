﻿using System.Reactive.Disposables;
using System.Reactive.Linq;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel.Measure;

public partial class DeviceViewModel : ObservableObject, IDisposable
{
    public DeviceViewModel(IDevice device)
    {
        Device = device;
        WaveFormat = device.WaveFormat;
        CompositeDisposable.Add(Device);

        // デバイス名を同期する
        Name = Device.Name;
        this.ObserveProperty<DeviceViewModel, string>(x => x.Name)
            .Skip(1) // 上記の「Name = Device.Name;」の変更をスキップする。
            .Subscribe(name => Device.Name = name)
            .AddTo(CompositeDisposable);

        // 計測状態を同期する
        Measure = Device.Measure;
        this.ObserveProperty(x => x.Measure)
            .Skip(1) // 上記の「Measure = Device.Measure;」の変更をスキップする。
            .Subscribe(measure =>
            {
                if (measure)
                {
                    Device.StartMeasure();
                }
                else
                {
                    Device.StopMeasure();
                    Connect = false;
                }
            })
            .AddTo(CompositeDisposable);

        // DisconnectedイベントをObservable.FromEventでObservableに変換、購読してConnectをfalseにする
        Observable.FromEvent<EventHandler<EventArgs>, EventArgs>(
            h => (_, e) => h(e),
            h => Device.Disconnected += h,
            h => Device.Disconnected -= h)
            .Subscribe(_ => Connect = false)
            .AddTo(CompositeDisposable);


        device.ObserveProperty(x => x.IsConnected)
            .Subscribe(x => Connect = x)
            .AddTo(CompositeDisposable);

        // 入出力レベルを同期する
        VolumeLevel = Device.VolumeLevel.AsPrimitive() * 100;
        this.ObserveProperty(x => x.VolumeLevel)
            .Skip(1) // 上記の「VolumeLevel = Device.VolumeLevel;」の変更をスキップする。
            .Subscribe(volumeLevel =>
            {
                Device.VolumeLevel = volumeLevel switch
                {
                    < 0 => Model.VolumeLevel.Minimum,
                    > 100 => Model.VolumeLevel.Maximum,
                    _ => new VolumeLevel(volumeLevel / 100)
                };
            })
            .AddTo(CompositeDisposable);

        // Connectを同期する
        this.ObserveProperty(x => x.Connect)
            .Subscribe(ConnectOnUpdated)
            .AddTo(CompositeDisposable);
    }

    private void ConnectOnUpdated(bool connect)
    {
        if (Device is not ILocalDevice localDevice) return;

        if (connect)
        {
            localDevice.ConnectAsync(RecorderViewModel.RemoteHost);
        }
        else
        {
            localDevice.Disconnect();
        }
    }

    public IDevice Device { get; }

    public DataFlow DataFlow => Device.DataFlow;

    [ObservableProperty] private string _name;
    public string SystemName => Device.SystemName;

    [ObservableProperty] private bool _measure;

    public WaveFormat WaveFormat { get; }

    [ObservableProperty] private double _volumeLevel;
    [ObservableProperty] private bool _connect;

    public Visibility VisibleConnect => Device.Connectable 
        ? Visibility.Visible 
        : Visibility.Collapsed;

    public double[] LiveData { get; } = CreateEmptyData();

    private CompositeDisposable CompositeDisposable { get; } = [];

    private static double[] CreateEmptyData()
    {
        var liveData = new double[4800];
        Array.Fill(liveData, Decibel.Minimum.AsPrimitive());
        return liveData;
    }

    public void UpdateLiveData()
    {
        // "scroll" the whole chart to the left
        Array.Copy(LiveData, 1, LiveData, 0, LiveData.Length - 1);

        // place the newest data point at the end
        LiveData[^1] = Device.Level.AsPrimitive();
    }

    public void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}