using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.IO;
using System.Net.Sockets;
using System.Net;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;

namespace Spector.Model;

public partial class LocalDevice : ObservableObject, ILocalDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;

    public LocalDevice(
        MMDevice mmDevice,
        string name,
        bool measure)
    {
        Id = (DeviceId)mmDevice.ID;
        MmDevice = mmDevice.AddTo(CompositeDisposable);
        DataFlow = mmDevice.DataFlow;
        Name = name;
        SystemName = mmDevice.FriendlyName;
        Measure = measure;

        AvailableWaveFormats = GetAvailableWaveFormats().ToList();
        WaveFormat = GetAvailableWageFormat(mmDevice.AudioClient.MixFormat);

        WasapiCapture = 
            (MmDevice.DataFlow == DataFlow.Capture
                ? new WasapiCapture(mmDevice)
                : new WasapiLoopbackCapture(mmDevice))
            .AddTo(CompositeDisposable);
                
        WasapiCapture.WaveFormat = WaveFormat;

        LevelMeter = new AudioLevelMeter(WasapiCapture);
        WasapiCapture.DataAvailable += OnDataAvailable;
        WasapiCapture.DataAvailable += (_, args) => DataAvailable?.Invoke(this, args);

        if (Measure) StartMeasure();
    }

    private CompositeDisposable CompositeDisposable { get; } = [];
    private MMDevice MmDevice { get; }
    public DeviceId Id { get; }

    public DataFlow DataFlow { get; }

    public IReadOnlyList<WaveFormat> AvailableWaveFormats { get; }

    [ObservableProperty] private WaveFormat _waveFormat;

    /// <summary>
    /// デバイス名。利用者が変更可能な名称。
    /// </summary>
    [ObservableProperty] private string _name;

    /// <summary>
    /// デバイス名。OSで設定されている名称。
    /// </summary>
    public string SystemName { get; }

    /// <summary>
    /// 計測するかどうかを表す
    /// </summary>
    [ObservableProperty] private bool _measure;

    public bool Connectable => true;

    /// <summary>
    /// 入出力レベル
    /// </summary>
    public VolumeLevel VolumeLevel
    {
        get => (VolumeLevel)MmDevice.AudioEndpointVolume.MasterVolumeLevelScalar;
        set
        {
            MmDevice.AudioEndpointVolume.MasterVolumeLevelScalar = (float)value;
            OnPropertyChanged();
        }
    }

    /// <summary>
    /// 音量レベル
    /// </summary>
    public Decibel Level { get; private set; } = Decibel.Minimum;

    private AudioLevelMeter LevelMeter { get; }
    private readonly List<Decibel> _levels = [];
    public IReadOnlyList<Decibel> Levels => _levels;

    private WasapiCapture WasapiCapture { get; }
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
        else if (closestMatch != null)
        {
            return closestMatch;
        }
        else
        {
            return MmDevice.AudioClient.MixFormat;
        }
    }

    public Task DisconnectAsync()
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

    public void StartMeasure()
    {
        _levels.Clear();
        WasapiCapture.StartRecording();
        Measure = true;
    }

    public void StopMeasure()
    {
        WasapiCapture.StopRecording();
        Measure = false;
        // 停止したあとLevelが更新されなくなる。計測を停止しているため最小音量で更新しておく。
        Level = Decibel.Minimum;

        DisconnectAsync();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            if(NetworkStream is not null)
            {
                NetworkStream.Write(e.Buffer, 0, e.BytesRecorded);
            }
        }
        catch
        {
            // ignore
        }

        Level = e.BytesRecorded == 0
            ? Decibel.Minimum
            : LevelMeter.CalculateLevel(e.Buffer, e.BytesRecorded);
        _levels.Add(Level);
    }

    /// <summary>
    /// キャンセルされるまでループ再生する。
    /// </summary>
    /// <param name="token"></param>
    /// <returns></returns>
    public void PlayLooping(CancellationToken token)
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

    public void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}