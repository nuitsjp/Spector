using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Spector.Model;

public partial class Device : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;

    public Device(
        MMDevice mmDevice,
        string name,
        bool measure,
        bool connect,
        WaveFormat waveFormat)
    {
        Id = (DeviceId)mmDevice.ID;
        MmDevice = mmDevice;
        DataFlow = mmDevice.DataFlow;
        Name = name;
        SystemName = mmDevice.FriendlyName;
        Measure = measure;
        Connect = connect;

        WasapiCapture = 
            MmDevice.DataFlow == DataFlow.Capture
                ? new WasapiCapture(mmDevice)
                : new WasapiLoopbackCapture(mmDevice);
                
        WasapiCapture.WaveFormat = waveFormat;

        BufferedWaveProvider = new BufferedWaveProvider(WasapiCapture.WaveFormat);
        AWeightingFilter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());

        WasapiCapture.DataAvailable += OnDataAvailable;
        WasapiCapture.DataAvailable += (sender, args) => DataAvailable?.Invoke(this, args);

        if (Measure) StartMeasure();
    }

    private MMDevice MmDevice { get; }
    public DeviceId Id { get; }

    public DataFlow DataFlow { get; }
    public WaveFormat WaveFormat => WasapiCapture.WaveFormat;

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

    [ObservableProperty] private bool _connect;

    public bool Connectable { get; } = true;

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
    [ObservableProperty] private Decibel _level = Decibel.Minimum;

    private WasapiCapture WasapiCapture { get; }
    private BufferedWaveProvider BufferedWaveProvider { get; }

    private AWeightingFilter AWeightingFilter { get; }

    public void StartMeasure()
    {
        WasapiCapture.StartRecording();
        Measure = true;
    }

    public void StopMeasure()
    {
        WasapiCapture.StopRecording();
        Measure = false;
        // 停止したあとLevelが更新されなくなる。計測を停止しているため最小音量で更新しておく。
        Level = Decibel.Minimum;
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        BufferedWaveProvider.AddSamples(e.Buffer, 0, e.BytesRecorded);

        var buffer = new float[e.BytesRecorded / 2];
        var samplesRead = AWeightingFilter.Read(buffer, 0, buffer.Length);

        // 音量計算（RMS値）
        double sum = 0;
        for (var i = 0; i < samplesRead; i++)
        {
            sum += buffer[i] * buffer[i];
        }
        var rms = Math.Sqrt(sum / samplesRead);
        var db = 20 * Math.Log10(rms);

        var level = (Decibel)db;
        Level = Decibel.Minimum <= level
            ? level
            : Decibel.Minimum;
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
        IWavePlayer wavePlayer = new WasapiOut(mmDevice, AudioClientShareMode.Shared, false, 0);

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
        MmDevice.Dispose();
        WasapiCapture.Dispose();
    }
}