using NAudio.Wave;

namespace Spector.Model;

public class CaptureDevice : IDisposable
{
    public CaptureDevice()
    {
        WaveIn = new WaveInEvent();
        WaveIn.WaveFormat = new WaveFormat(44100, 1);
        var sampleProvider = new WaveInProvider(WaveIn).ToSampleProvider();
        AWeightingFilter = new AWeightingFilter(sampleProvider);

        WaveIn.DataAvailable += WaveInOnDataAvailable;
    }

    private WaveInEvent WaveIn { get; }
    private AWeightingFilter AWeightingFilter { get; }
    public Decibel Level { get; private set; } = (Decibel)0;

    public void StartRecording()
    {
        WaveIn.StartRecording();
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
        
        var level = (Decibel)(20 * Math.Log10(rms));
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