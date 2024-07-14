using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.IO;
using System.Net.Sockets;
using System.Net;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class LocalDevice : DeviceBase, ILocalDevice
{
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
        WaveFormat = GetAvailableWageFormat(mmDevice.AudioClient.MixFormat);

        if (Measure)
        {
            StartMeasure(CreateWaveIn());
        }
    }

    private CompositeDisposable CompositeDisposable { get; } = [];
    private MMDevice MmDevice { get; }

    public override IReadOnlyList<WaveFormat> AvailableWaveFormats { get; }


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


    private TcpClient? TcpClient { get; set; }
    private Stream? NetworkStream { get; set; }

    private CancellationTokenSource PlayLoopingCancellationTokenSource { get; set; } = new();

    public Task ConnectAsync(string address)
    {
        return Task.Run(() =>
        {
            TcpClient = new TcpClient().AddTo(CompositeDisposable);
            TcpClient.Connect(address, AudioInterface.RemotePort);

            NetworkStream = new BufferedStream(TcpClient.GetStream()).AddTo(CompositeDisposable);
            var writer = new BinaryWriter(NetworkStream).AddTo(CompositeDisposable);

            // デバイス情報を送信
            writer.Write((int)DataFlow);
            writer.Write(WaveFormat.SampleRate);
            writer.Write((ushort)WaveFormat.Encoding);
            writer.Write(WaveFormat.BitsPerSample);
            writer.Write(WaveFormat.Channels);
            writer.Write(@$"{Name} - {Dns.GetHostName()}");
            writer.Flush();
            var reader = new BinaryReader(NetworkStream).AddTo(CompositeDisposable);

            try
            {
                while (TcpClient is not null)
                {
                    var command = (RemoteCommand)reader.ReadInt32();
                    if (command == RemoteCommand.StartPlayLooping)
                    {
                        PlayLoopingCancellationTokenSource = new CancellationTokenSource();
                        PlayLooping(PlayLoopingCancellationTokenSource.Token);
                    }
                    else if (command == RemoteCommand.StopPlayLooping)
                    {
                        PlayLoopingCancellationTokenSource.Cancel();
                    }
                }
            }
            catch (IOException)
            {
                // リモート接続が切断された場合
            }
        });
    }

    public IEnumerable<WaveFormat> GetAvailableWaveFormats()
    {
        // 一般的なサンプルレートとビット深度の組み合わせをチェック
        int[] sampleRates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000];
        int[] bitDepths = [8, 16, 24, 32];

        foreach (var sampleRate in sampleRates)
        {
            foreach (var bitDepth in bitDepths)
            {
                var format = new WaveFormat(sampleRate, bitDepth, MmDevice.AudioClient.MixFormat.Channels);

                // AudioClientを使用してフォーマットがサポートされているかチェック
                using var audioClient = MmDevice.AudioClient;
                var isSupported = audioClient.IsFormatSupported(AudioClientShareMode.Shared, format, out var closestMatch);
                if (isSupported)
                {
                    yield return format;
                }
                else if (closestMatch != null)
                {
                    yield return format;
                }
            }
        }
    }

    public WaveFormat GetAvailableWageFormat(WaveFormat format)
    {
        var isSupported = MmDevice.AudioClient.IsFormatSupported(AudioClientShareMode.Shared, format, out var closestMatch);
        if (isSupported)
        {
            return format;
        }

        return closestMatch ?? MmDevice.AudioClient.MixFormat;
    }

    public override Task DisconnectAsync()
    {
        if (NetworkStream is not null)
        {
            CompositeDisposable.Remove(NetworkStream);
            NetworkStream.Dispose();
            NetworkStream = null;
        }

        if (TcpClient is not null)
        {
            CompositeDisposable.Remove(TcpClient);
            TcpClient.Dispose();
            TcpClient = null;
        }
        return Task.CompletedTask;
    }

    public override void StartMeasure()
    {
        StartMeasure(CreateWaveIn());
        Measure = true;
    }

    public override void StopMeasure()
    {
        Measure = false;
        // 停止したあとLevelが更新されなくなる。計測を停止しているため最小音量で更新しておく。
        Level = Decibel.Minimum;

        DisconnectAsync();
        base.StopMeasure();
    }

    protected override void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            NetworkStream?.Write(e.Buffer, 0, e.BytesRecorded);
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

    private WasapiCapture CreateWaveIn()
    {
        var waveIn =
            (MmDevice.DataFlow == DataFlow.Capture
                ? new WasapiCapture(MmDevice)
                : new WasapiLoopbackCapture(MmDevice))
            .AddTo(CompositeDisposable);

        waveIn.WaveFormat = WaveFormat;
        return waveIn;
    }

    public override void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}