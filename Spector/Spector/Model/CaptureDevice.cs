using NAudio.Wave;

namespace Spector.Model;

public class CaptureDevice : IDisposable
{
    public CaptureDevice()
    {
        WaveIn = new WaveInEvent();
        WaveIn.WaveFormat = RecordingConfig.Default.WaveFormat;
        var sampleProvider = new WaveInProvider(WaveIn).ToSampleProvider();
        AWeightingFilter = new AWeightingFilter(sampleProvider);
        FastResponse = new();

        WaveIn.DataAvailable += WaveInOnDataAvailable;
    }

    private WaveInEvent WaveIn { get; }
    private AWeightingFilter AWeightingFilter { get; }
    private FastResponse FastResponse { get; }
    public Decibel Level { get; private set; } = (Decibel)0;

    public void StartRecording()
    {
        WaveIn.StartRecording();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        // Convert the byte array to an array of floats
        int bytesPerSample = 2; // 16-bit audio
        int sampleCount = e.Buffer.Length / bytesPerSample;
        float max = 0;

        // 音量計算（RMS値）
        for (int i = 0; i < sampleCount; i++)
        {
            short sample = BitConverter.ToInt16(e.Buffer, i * bytesPerSample);
            float sample32 = sample / 32768f; // Convert to float
            if (sample32 < 0) sample32 = -sample32; // Take absolute value
            if (sample32 > max) max = sample32; // Track maximum sample value
        }

        // Convert to decibels
        double db = 20 * Math.Log10(max);
        var level = (Decibel)db;
        Level = Decibel.Minimum <= level
            ? level
            : Decibel.Minimum;
    }

    private void WaveInOnDataAvailable(object? sender, WaveInEventArgs e)
    {
        var buffer = new float[e.BytesRecorded / 2];
        var samplesRead = AWeightingFilter.Read(buffer, 0, buffer.Length);

        // 音量計算（RMS値）
        double sum = 0;
        for (var i = 0; i < samplesRead; i++)
        {
            sum += buffer[i] * buffer[i];
        }
        var rms = Math.Sqrt(sum / samplesRead);
        
        var level =  (Decibel)(20 * Math.Log10(rms));
        Level = Decibel.Minimum <= level
            ? level
            : Decibel.Minimum;

        Console.WriteLine($"A-weighted Volume: {Level} dB");
    }

    public void Dispose()
    {
        WaveIn.StopRecording();
        WaveIn.Dispose();
    }
}