using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Spector.Model;

public partial class CaptureDevice : ObservableObject, IDevice
{
    public CaptureDevice(
        MMDevice mmDevice,
        string name,
        bool measure,
        WaveFormat waveFormat)
    {
        Id = (DeviceId)mmDevice.ID;
        MmDevice = mmDevice;
        Name = name;
        Measure = measure;

        WasapiCapture = new WasapiCapture(mmDevice);
        WasapiCapture.WaveFormat = waveFormat;

        BufferedWaveProvider = new BufferedWaveProvider(WasapiCapture.WaveFormat);
        AWeightingFilter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());

        WasapiCapture.DataAvailable += OnDataAvailable;

        if(Measure) StartMeasure();
    }

    private MMDevice MmDevice { get; }
    public DeviceId Id { get; }

    public DataFlow DataFlow => MmDevice.DataFlow;

    /// <summary>
    /// デバイス名。利用者が変更可能な名称。
    /// </summary>
    [ObservableProperty] private string _name;

    /// <summary>
    /// デバイス名。OSで設定されている名称。
    /// </summary>
    public string SystemName => MmDevice.FriendlyName;

    /// <summary>
    /// 計測するかどうかを表す
    /// </summary>
    [ObservableProperty] private bool _measure;

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

        float[] buffer = new float[e.BytesRecorded / 2];
        int samplesRead = AWeightingFilter.Read(buffer, 0, buffer.Length);

        // 音量計算（RMS値）
        double sum = 0;
        for (int i = 0; i < samplesRead; i++)
        {
            sum += buffer[i] * buffer[i];
        }
        double rms = Math.Sqrt(sum / samplesRead);
        double db = 20 * Math.Log10(rms);

        var level = (Decibel)db;
        Level = Decibel.Minimum <= level
            ? level
            : Decibel.Minimum;
    }

    public void Dispose()
    {
        MmDevice.Dispose();
        WasapiCapture.Dispose();
    }
}