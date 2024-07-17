using NAudio.Wave;

namespace Spector.Model;

public static class WaveFileAnalyzer
{
    public static IEnumerable<Decibel> Analyze(string filePath)
    {
        using var reader = new WaveFileReader(filePath);
        var waveFormat = reader.WaveFormat;
        var aWeightingFilter = new AWeightingFilter(reader.ToSampleProvider());

        var samplesPerWindow = (int)(waveFormat.SampleRate * RecordingConfig.Default.RefreshRate.Interval.TotalSeconds);
        var buffer = new float[samplesPerWindow];

        while (true)
        {
            var samplesRead = aWeightingFilter.Read(buffer, 0, buffer.Length);
            if (samplesRead == 0) break;

            var rms = Math.Sqrt(buffer.Take(samplesRead).Select(s => s * s).Average());
            var db = 20 * Math.Log10(rms);

            var level = Math.Max(db, Decibel.MinimumValue);
            yield return (Decibel)level;
        }
    }
}