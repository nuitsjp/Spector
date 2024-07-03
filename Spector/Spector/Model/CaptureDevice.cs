using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Spector.Model;

public class CaptureDevice : IDevice
{
    public CaptureDevice(
        MMDevice mmDevice,
        bool measure,
        WaveFormat waveFormat)
    {
        Id = (DeviceId)mmDevice.ID;
        MmDevice = mmDevice;
        Measure = measure;

        WasapiCapture = new WasapiCapture(mmDevice);
        WasapiCapture.WaveFormat = waveFormat;

        BufferedWaveProvider = new BufferedWaveProvider(WasapiCapture.WaveFormat);
        AWeightingFilter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());

        WasapiCapture.DataAvailable += OnDataAvailable;

        if(Measure) StartMeasure();
    }

    private MMDevice MmDevice { get; }
    private WasapiCapture WasapiCapture { get; }
    private BufferedWaveProvider BufferedWaveProvider { get; }

    public DeviceId Id { get; }

    public DataFlow DataFlow => MmDevice.DataFlow;

    public string Name => MmDevice.FriendlyName;
    public bool Measure { get; private set; }

    private AWeightingFilter AWeightingFilter { get; }
    public Decibel Level { get; private set; } = Decibel.Minimum;

    public void StartMeasure()
    {
        WasapiCapture.StartRecording();
    }

    public void StopMeasure()
    {
        WasapiCapture.StopRecording();
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