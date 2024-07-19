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

        AvailableWaveFormats = GetAvailableWaveFormats().ToList();
        using var waveIn = CreateWaveIn();
        WaveFormat = waveIn.WaveFormat;

        if (Measure)
        {
            StartMeasure();
        }
    }

    private CompositeDisposable CompositeDisposable { get; } = [];
    private MMDevice MmDevice { get; }

    public sealed override IReadOnlyList<WaveFormat> AvailableWaveFormats { get; }


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

    private CancellationTokenSource PlayLoopingCancellationTokenSource { get; set; } = new();

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
                PlayLoopingCancellationTokenSource = new CancellationTokenSource();
                PlayLooping(PlayLoopingCancellationTokenSource.Token);
                break;
            case RemoteCommand.StopPlayLooping:
                PlayLoopingCancellationTokenSource.Cancel();
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(command), command, null);
        }
    }

    /// <summary>
    /// 有効はWaveFormatを取得する。
    /// </summary>
    /// <returns></returns>
    public IEnumerable<WaveFormat> GetAvailableWaveFormats()
    {
        // 一般的なサンプルレートとビット深度の組み合わせをチェック
        int[] sampleRates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000];
        int[] bitDepths = [8, 16, 24, 32];
        int[] channels = [1, 2];

        using var audioClient = MmDevice.AudioClient;
        foreach (var sampleRate in sampleRates)
        {
            foreach (var bitDepth in bitDepths)
            {
                foreach (var channel in channels)
                {
                    var format = new WaveFormat(sampleRate, bitDepth, channel);

                    // AudioClientを使用してフォーマットがサポートされているかチェック
                    if (audioClient.IsFormatSupported(AudioClientShareMode.Shared, format, out _))
                    {
                        yield return format;
                    }
                }
            }
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

    /// <summary>
    /// キャンセルされるまでループ再生する。
    /// </summary>
    /// <param name="token"></param>
    /// <returns></returns>
    public override void PlayLooping(CancellationToken token)
    {
        // スピーカーからNAudioで再生するためのプレイヤーを生成する。
        using var enumerator = new MMDeviceEnumerator();
        var mmDevice = enumerator.GetDevice(Id.AsPrimitive());
        var wavePlayer = new WasapiOut(mmDevice, AudioClientShareMode.Shared, false, 0);

        // ループ音源を作成する。
        WaveStream waveStream = new LoopStream(new WaveFileReader(Properties.Resources.吾輩は猫である));

        // 終了処理を登録する。
        token.Register(() =>
        {
            // リソースを開放する。
            wavePlayer.Stop();
            wavePlayer.Dispose();
            mmDevice.Dispose();
            waveStream.Dispose();
        });

        // 出力に入力を接続して再生を開始する。
        wavePlayer.Init(waveStream);
        wavePlayer.Play();
    }

    public override void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}