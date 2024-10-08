﻿using System.IO;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class LocalDevice : DeviceBase, ILocalDevice
{
    public override event EventHandler<EventArgs>? Disconnected;

    public LocalDevice(
        MMDevice mmDevice,
        string name,
        bool measure)
        : base(
            (DeviceId)mmDevice.ID,
            mmDevice.DataFlow,
            name,
            mmDevice.FriendlyName)
    {
        MmDevice = mmDevice.AddTo(CompositeDisposable);
        Measure = measure;

        using var waveIn = CreateWaveIn();
        WaveFormat = waveIn.WaveFormat;
        if (WaveFormat.SampleRate == 44_100)
        {
            // TODO: 44.1kHzの場合、現状の実装だとなぜかWaveFileReaderから正しく読み取れないため
            // 一時的に48kHzに変換する
            WaveFormat = new WaveFormat(48_000, WaveFormat.BitsPerSample, WaveFormat.Channels);
        }

        if (Measure)
        {
            StartMeasure();
        }
    }

    public static WaveStream PlaybackStream { get; } = new LoopStream(new WaveFileReader(Properties.Resources.吾輩は猫である));

    private CompositeDisposable CompositeDisposable { get; } = [];
    private MMDevice MmDevice { get; }

    public override bool Connectable => true;

    /// <summary>
    /// 入出力レベル
    /// </summary>
    public override VolumeLevel VolumeLevel
    {
        get => (VolumeLevel)MmDevice.AudioEndpointVolume.MasterVolumeLevelScalar;
        set
        {
            MmDevice.AudioEndpointVolume.MasterVolumeLevelScalar = (float)value;
            OnPropertyChanged();
        }
    }


    private RemoteDeviceClient? RemoteDeviceClient { get; set; }

    public Task ConnectAsync(string address)
    {
        RemoteDeviceClient = new RemoteDeviceClient(this).AddTo(CompositeDisposable);
        RemoteDeviceClient
            .RemoteCommandObservable
            .Subscribe(
                onNext: OnReceiveRemoteCommand,
                onCompleted: Disconnect)
            .AddTo(CompositeDisposable);
        IsConnected = true;
        return RemoteDeviceClient.ConnectAsync(address, AudioInterface.RemotePort);
    }

    private void OnReceiveRemoteCommand(RemoteCommand command)
    {
        switch (command)
        {
            case RemoteCommand.StartPlayLooping:
                StartPlayback();
                break;
            case RemoteCommand.StopPlayLooping:
                StopPlayback();
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(command), command, null);
        }
    }

    public override void Disconnect()
    {
        RemoteDeviceClient?.Disconnect();
        IsConnected = false;
        Disconnected?.Invoke(this, EventArgs.Empty);
    }

    public sealed override void StartMeasure()
    {
        var waveIn = CreateWaveIn();
        waveIn.WaveFormat = WaveFormat;
        StartMeasure(waveIn);
    }

    private WasapiCapture CreateWaveIn()
        => (MmDevice.DataFlow == DataFlow.Capture
                ? new WasapiCapture(MmDevice)
                : new WasapiLoopbackCapture(MmDevice))
            .AddTo(CompositeDisposable);

    public override void StopMeasure()
    {
        Disconnect();
        base.StopMeasure();
    }

    protected override void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            RemoteDeviceClient?.Write(e.Buffer, 0, e.BytesRecorded);
        }
        catch
        {
            // ignore
        }

        base.OnDataAvailable(sender, e);
    }


    private WasapiOut? WavePlayer { get; set; }

    /// <summary>
    /// 停止されるまでループ再生する。
    /// </summary>
    /// <returns></returns>
    public override void StartPlayback()
    {
        // スピーカーからNAudioで再生するためのプレイヤーを生成する。
        using var enumerator = new MMDeviceEnumerator();
        using var mmDevice = enumerator.GetDevice(Id.AsPrimitive());
        WavePlayer = new WasapiOut(mmDevice, AudioClientShareMode.Shared, false, 0);

        // ループ音源を作成する。
        PlaybackStream.Seek(0, SeekOrigin.Begin);

        // 出力に入力を接続して再生を開始する。
        WavePlayer.Init(PlaybackStream);
        WavePlayer.Play();
    }

    public override void StopPlayback()
    {
        // リソースを開放する。
        WavePlayer?.Stop();
        WavePlayer?.Dispose();
    }

    public override void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}