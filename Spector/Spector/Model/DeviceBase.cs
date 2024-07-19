using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Spector.Model;

public abstract partial class DeviceBase(
    DeviceId id, 
    DataFlow dataFlow, 
    string name, 
    string systemName)
    : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public abstract event EventHandler<EventArgs>? Disconnected;

    public DeviceId Id { get; } = id;
    public DataFlow DataFlow { get; } = dataFlow;
    [ObservableProperty] private WaveFormat _waveFormat = default!;
    [ObservableProperty] private string _name = name;
    public string SystemName { get; } = systemName;
    [ObservableProperty] private bool _measure;
    public abstract bool Connectable { get; }
    public bool IsConnected { get; protected set; }
    public abstract VolumeLevel VolumeLevel { get; set; }
    public Decibel Level { get; private set; } = Decibel.Minimum;

    private IWaveIn? WaveIn { get; set; }
    private AWeightingFilter? Filter { get; set; }
    private int BytesPerSample { get; set; }

    public abstract void Disconnect();

    protected void StartMeasure(IWaveIn waveIn)
    {
        // WaveInがすでに設定されている場合は、すでに開始済みとして例外をスローする
        if (WaveIn is not null)
        {
            throw new InvalidOperationException("Already started.");
        }

        WaveIn = waveIn;
        BytesPerSample = WaveIn.WaveFormat.BitsPerSample / 8;

        var sampleProvider = new WaveInProvider(waveIn).ToSampleProvider();
        Filter = new AWeightingFilter(sampleProvider);

        WaveIn.DataAvailable += OnDataAvailable;
        WaveIn.RecordingStopped += (_, _) => StopMeasure();
        WaveIn.StartRecording();

        Measure = true;
    }


    protected virtual void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        // WaveInがnullの場合、すれ違いで停止されているため、処理を中断する。
        if (WaveIn is null) return;

        if (Filter is null) throw new InvalidOperationException($"{nameof(Filter)} is not initialized.");

        if (e.BytesRecorded == 0) return;

        DataAvailable?.Invoke(sender, e);

        float[] buffer = new float[e.BytesRecorded / BytesPerSample];
        int samplesRead = Filter.Read(buffer, 0, buffer.Length);

        // 音量計算（RMS値）
        double sum = 0;
        int validSamples = 0;
        for (int i = 0; i < samplesRead; i++)
        {
            if (!float.IsNaN(buffer[i]) && !float.IsInfinity(buffer[i]))
            {
                sum += buffer[i] * buffer[i];
                validSamples++;
            }
        }
        double rms = (validSamples > 0) ? Math.Sqrt(sum / validSamples) : 0;
        var level = (Decibel)((rms > 0) ? 20 * Math.Log10(rms) : -100);

        Level = Decibel.Minimum <= level ? level : Decibel.Minimum;
    }

    public abstract void StartMeasure();

    public virtual void StopMeasure()
    {
        if (WaveIn is null) return;

        var waveIn = WaveIn;
        WaveIn = null;


        waveIn.DataAvailable -= OnDataAvailable;
        waveIn.StopRecording();
        waveIn.Dispose();
        Filter = null;
        // 停止したあとLevelが更新されなくなる。計測を停止しているため最小音量で更新しておく。
        Level = Decibel.Minimum;
        Measure = false;
    }

    public abstract void PlayLooping(CancellationToken token);
    public virtual void Dispose()
    {
        if(WaveIn is not null)
        {
            StopMeasure();
        }
        GC.SuppressFinalize(this);
    }


    private void ConvertToFloat(byte[] input, float[] output, int bytesRecorded)
    {
        var outputIndex = 0;

        for (var inputIndex = 0; inputIndex < bytesRecorded; inputIndex += BytesPerSample)
        {
            float sample = 0;

            switch (BytesPerSample)
            {
                case 1: // 8-bit PCM
                    sample = (input[inputIndex] - 128) / 128f;
                    break;
                case 2: // 16-bit PCM
                    sample = BitConverter.ToInt16(input, inputIndex) / 32768f;
                    break;
                case 3: // 24-bit PCM
                    var sample24 = (input[inputIndex + 2] << 16) | (input[inputIndex + 1] << 8) | input[inputIndex];
                    if ((sample24 & 0x800000) != 0) sample24 |= ~0xFFFFFF; // Sign extend
                    sample = sample24 / 8388608f;
                    break;
                case 4: // 32-bit PCM or 32-bit IEEE float
                    if (WaveFormat.Encoding == WaveFormatEncoding.IeeeFloat)
                    {
                        sample = BitConverter.ToSingle(input, inputIndex);
                    }
                    else
                    {
                        sample = BitConverter.ToInt32(input, inputIndex) / 2147483648f;
                    }
                    break;
            }

            output[outputIndex++] = sample;
        }
    }
}